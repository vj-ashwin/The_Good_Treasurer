# Firestore Structure, Rules & the Atomic Write Contract

**Status:** Proposed — awaiting approval
**Files:** `firestore.rules`, `firestore.indexes.json`, `firebase.json`, `tests/firestore.rules.test.ts`
**Spec this implements:** `docs/designs/PRD.md` (G2, G4, G7, G8), `docs/LOGIC.md` §5–6

---

## 1. Shape

```
users/{uid}/
  trips/{tripId}
    people/{personId}
    expenses/{expenseId}
    history/{historyId}
```

Everything is nested under the owner's `uid`. There is no top-level collection, no shared
trip, and no cross-user read path — by construction, not by filtering.

Every id in the tree is a **client-generated UUID**. This is deliberate:

- **Retrying a write cannot duplicate it.** The same logical expense reuses the same document
  id, so a retry after a lost response is an overwrite of that one document, never a second
  expense. (The PRD's `clientUUID` field is replaced by this: a document id is a stronger
  idempotency key than a field, because it is enforced by the database, not by convention.)
- **Settlement tie-breaking is stable.** OQ3 breaks ties by person id; a UUID is opaque and
  never changes, unlike a name or a Firestore auto-id ordered by creation time.

Rules reject any id that is not UUID-shaped, so the invariant cannot drift.

---

## 2. Documents

### `trips/{tripId}`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | 1–100 chars |
| `createdAt` | timestamp | server timestamp, immutable after create |
| `updatedAt` | timestamp | server timestamp, must equal the write time |

No delete path exists. PRD G8: trips are permanent.

### `people/{personId}`

| Field | Type | Notes |
| --- | --- | --- |
| `name` | string | 1–50 chars |
| `isOrganizer` | bool | immutable after create |
| `createdAt` | timestamp | immutable |
| `updatedAt` | timestamp | must equal the write time |

### `expenses/{expenseId}`

| Field | Type | Notes |
| --- | --- | --- |
| `title` | string | 1–200 chars |
| `date` | string | `YYYY-MM-DD` — a calendar day, not a timestamp |
| `category` | string | 1–50 chars, user-defined free text |
| `payerId` | string | person id, must be in `participants` |
| `participants` | string[] | 1–50 unique person ids |
| `baseAmountPaise` | int | > 0 |
| `gstAmountPaise` | int | ≥ 0 |
| `serviceChargeAmountPaise` | int | ≥ 0 |
| `totalPaise` | int | exactly `base + gst + serviceCharge` |
| `gstBps` | int \| null | 0–10000 basis points, bookkeeping for re-editing |
| `serviceChargeBps` | int \| null | 0–10000 basis points |
| `lineItems` | array \| null | itemized mode only, ≤ 200 items |
| `shares` | map<personId, int> | **the computed split, in integer paise** |
| `createdAt` / `updatedAt` | timestamp | server timestamps |
| `deletedAt` | timestamp \| null | soft delete |
| `lastHistoryId` | string | UUID of the history entry written in the same batch |

Two decisions worth stating explicitly:

**`shares` is stored, not recomputed.** It is written once per create/edit and never derived
on read. A future change to the split algorithm therefore cannot retroactively change a
finished trip; only an explicit edit rewrites it, and that edit is recorded in history.

**`date` is a string, not a timestamp.** A `Timestamp` makes "which day was this?" depend on
the reader's timezone — an expense entered at 00:30 in Tokyo becomes the previous day in
India. A calendar date has no timezone, so it is stored as one.

### `history/{historyId}`

| Field | Type | Notes |
| --- | --- | --- |
| `expenseId` | string | UUID of the expense this entry describes |
| `action` | string | `create` \| `update` \| `delete` \| `restore` |
| `authorId` | string | must equal the signed-in uid |
| `timestamp` | timestamp | server timestamp |
| `changedFields` | string[] | empty for `create`; otherwise the exact field names |
| `before` | map \| null | `null` for `create`; otherwise old values of `changedFields` |
| `after` | map \| null | new values of `changedFields` |

`before`/`after` hold only the changed fields, not the whole document. That keeps entries
small, readable ("amount 320000 → 350000") and avoids copying a full snapshot on every edit.

History is **append-only**: `update` and `delete` are denied outright, so the audit trail
cannot be rewritten or erased.

---

## 3. The atomic write contract

Every expense write is one batch containing **exactly two documents**: the expense and its
history entry, linked to each other.

```ts
const expenseId = crypto.randomUUID()
const historyId = crypto.randomUUID()
const batch = writeBatch(db)

batch.set(doc(db, `users/${uid}/trips/${tripId}/expenses/${expenseId}`), {
  ...expenseFields,
  shares,                       // integer paise, sums to totalPaise
  totalPaise,
  createdAt: serverTimestamp(),
  updatedAt: serverTimestamp(),
  deletedAt: null,
  lastHistoryId: historyId,     // ← forward link
})

batch.set(doc(db, `users/${uid}/trips/${tripId}/history/${historyId}`), {
  expenseId,                    // ← back link
  action: 'create',
  authorId: uid,
  timestamp: serverTimestamp(),
  changedFields: [],
  before: null,
  after: { baseAmountPaise: totalPaise },
})

await batch.commit()            // both land, or neither does
```

`writeBatch().commit()` is atomic by Firestore's own contract — both documents land or neither
does. On top of that guarantee, two rules make the pairing binding rather than a convention
the app is merely expected to follow:

1. An expense write is denied unless `existsAfter(history/{lastHistoryId})` — the history entry
   it points at must exist once the batch completes. For a new expense that is only possible if
   the entry is created by the same batch.
2. A history entry is denied unless the expense it names exists after the batch **and** its
   `action` is consistent with the state that expense was in *before* the batch: `create` only
   when the expense did not exist yet, `delete`/`update` only when it was live, `restore` only
   when it was soft-deleted. An entry for an expense that does not exist is rejected, and an
   entry can never claim a transition the expense was not in.

So an expense can never be written without an audit entry, and an entry can never claim a
restore of something that was never deleted. A response lost mid-flight leaves either both
documents or neither — never the audit-less half.

One detail this cannot cover: `lastHistoryId` is only readable *after* the batch, and
`getAfter()` does not work in the Firestore emulator (see §5). So the rules cannot confirm that
the expense points at *this* entry rather than another entry written in the same batch. The
expense still cannot be written without an entry, and no entry can describe a transition that
did not happen; the residual gap is a duplicate, mislabelled entry.

---

## 4. What every rule says, in plain English

### Shared helpers

| Rule | Plain English |
| --- | --- |
| `signedIn()` | The request comes from a signed-in user. |
| `owner(uid)` | The signed-in user's uid matches the `{uid}` in the path being touched. This is the only access-control decision in the app. |
| `isUuid(value)` | The value looks like a UUID. All ids are client-generated UUIDs. |
| `isCalendarDate(value)` | The value is a `YYYY-MM-DD` calendar day, never a timestamp. |
| `isPaise(value)` | The value is a whole number of paise between 0 and ₹100 crore. The upper bound is a corruption guard, not a product limit. |
| `isIdList(value, low, high)` | The value is a list of unique ids of an allowed length. |
| `hasExactKeys(data, keys)` | The document has exactly these fields — no missing field, no extra field. The client always writes the full document, using `null` for absent optionals, so a missing key is a bug and not an absence. |

### `users/{uid}/trips/{tripId}`

| Rule | Plain English |
| --- | --- |
| read (`get`, `list`) | You can read your own trips. Nobody else's, and not while signed out. |
| `create` | You can create a trip with your own uid in the path, a UUID trip id, a name of 1–100 characters, and server-set timestamps. |
| `update` | You can rename a trip. `createdAt` cannot change and `updatedAt` must be the server's current time, so the "last touched" value cannot be back-dated. |
| `delete` | **Never allowed.** Trips are permanent. |

### `.../people/{personId}`

| Rule | Plain English |
| --- | --- |
| read | You can read the people in your own trips. |
| `create` | A UUID person id, a name of 1–50 characters, a boolean organiser flag, and server timestamps. |
| `update` | You can rename a person. `createdAt` is immutable, and `isOrganizer` cannot be flipped by editing a document — who the organiser is cannot be reassigned. |
| `delete` | Allowed for your own trips. The rules cannot check whether an expense still references this person (that needs a query); the People UI blocks the delete first. A bug there leaves a dangling id, which the report shows as "Removed person" — it cannot corrupt an amount. |

### `.../expenses/{expenseId}`

| Rule | Plain English |
| --- | --- |
| read | You can read the expenses of your own trips. |
| `create` | A UUID expense id, the full field set, `base > 0`, GST and service charge ≥ 0, `totalPaise` exactly equal to `base + gst + serviceCharge`, a calendar date, 1–50 unique participants, a payer who is one of the participants, an **exactly matching** set of share keys (every participant has one, nobody else does), server timestamps, `deletedAt` empty, and the matching history entry **in the same batch**. |
| `update` | The whole document is re-validated, so an edit cannot smuggle in a bad total or a stray share key. `createdAt` is immutable, `updatedAt` must be the server's time, and `deletedAt` may only be *set to the commit time* (delete) or *cleared* (restore). This freezes soft-deleted expenses: they must be restored before anything else about them can change. The referenced history entry must exist once the batch completes. |
| `delete` | **Never allowed.** Expenses are soft-deleted only, so history and stored shares stay reconstructable. |

### `.../history/{historyId}`

| Rule | Plain English |
| --- | --- |
| read | You can read the change log of your own trips. |
| `create` | A UUID history id, `authorId` equal to the signed-in uid (no impersonation), a server timestamp, a known action, ≤ 50 unique changed fields, and `before`/`after` maps or null. The action must also match what is really happening: `create` only when the expense is new, `update`/`delete` only when it is live, `restore` only when it was soft-deleted, and the expense write itself must be in the same batch. |
| `update` | **Never allowed.** |
| `delete` | **Never allowed.** The audit trail cannot be edited or erased. |

### Catch-all

| Rule | Plain English |
| --- | --- |
| `match /{document=**} { allow read, write: if false }` | Anything not explicitly allowed above is denied. Firestore already denies by default; this states the intent so a future edit cannot quietly open a path. It cannot weaken anything, because a denial is the absence of an allow. |

There is no `allow read, write: if true` anywhere, no test-mode block, and no rules variant
per environment. The emulator suite loads this exact file.

---

## 5. What the rules deliberately do not enforce

Four checks cannot be expressed in the rules language. Each has a compensating control, and
each is documented here so nobody assumes a guarantee the database is not making.

| Gap | Why rules cannot do it | Compensating control |
| --- | --- | --- |
| `sum(shares.values()) === totalPaise` | The rules language has **no loops and no aggregate functions**. `Map` exposes `keys()`, `values()`, `size()`, `get()`, `diff()` — nothing that sums. `List` exposes `hasAll`/`hasOnly`/`toSet`/`join` — also no sum. | The split functions in `src/lib/money/` are pure and property-tested (`shares` sum to the bill). The Firestore read path parses every expense through an invariant check that throws on a non-integer share or a mismatched sum, so corruption is loud instead of silent. |
| Does any expense still reference this person? | Rules cannot run a query, only `get()` a single document. | The People UI checks before deleting. Result of a bug: a dangling id shown as "Removed person", never a wrong amount. |
| Does a participant id exist in this trip's people? | Answering it costs one document read per participant, and rules allow 10 document reads per write (20 per batch). A trip with 11 people would start failing in production. | The expense form only offers real people; the read path renders an unknown participant as "Removed person". |
| Does a history entry belong to the exact expense write that produced it? | That needs the expense's content *after* the batch (`getAfter`). `getAfter()` errors in the Firestore emulator (v1.22.0), so a rule that relied on it could never be covered by the suite, and an untested rule is worse than a documented gap. `existsAfter()` is true for any existing document, so it cannot distinguish "written by this batch" from "already there". The action *is* checked against the pre-write state. | An expense can never be written without a history entry in the same batch, and no entry can describe a transition that did not happen. The residual risk is an extra or duplicate changelog row for the user's own expense — never an unaudited change, and never a wrong amount. |

The emulator suite pins the shares gap and both history-entry gaps down with explicit tests, so
if a future rules language (or emulator) version lifts a limitation, those tests fail and say so.

---

## 6. Indexes

`firestore.indexes.json` is **empty on purpose**.

- Trips: one single-field index on `createdAt` (automatic) for "newest first" — no composite.
- Expenses: read the whole subcollection and sort/filter client-side. With ≤ 200 expenses per
  trip this costs the same number of document reads as a filtered query, and avoids a
  composite index entirely.
- History: query by `expenseId` only (automatic single-field index), then sort by `timestamp`
  in memory. Adding `orderBy('timestamp')` to that query would require a composite index for
  no benefit at this size.

Adding an index before a query exists produces a deploy that fails; indexes are added only
after a query actually needs one.

---

## 7. Running and deploying

```bash
npm run emulators     # Firestore emulator on 127.0.0.1:8088
npm run test:rules    # rules suite against the emulator (needs JDK 21+)
```

`npm run test:rules` runs `firebase emulators:exec`, which boots the emulator, runs
`vitest --config vitest.rules.config.ts`, and shuts it down. It is deliberately **not** part of
`npm test`: the normal suite must stay pure and offline, and `npm run build` must never need
the emulator tooling.

`firebase-tools` refuses to start any emulator on a JDK older than 21, so `JAVA_HOME` must point
at a 21+ JDK. Port 8088 is used because 8080 is commonly already taken; change it in
`firebase.json` if that clashes too.

Deploying the rules:

```bash
firebase login
firebase use the-good-treasurer
firebase deploy --only firestore:rules,firestore:indexes
```

Rollback is `firebase deploy` of the previous rules file; no data migration is involved.

---

## 8. Deviations from the PRD (please confirm)

These follow your instructions for this task and differ from the PRD text. The PRD should be
updated to match once you agree.

| # | PRD says | This design says | Why |
| --- | --- | --- | --- |
| 1 | `people` is an array on the trip document | `people` is a subcollection | Your instruction for this task. Subcollection avoids rewriting the whole trip document on every rename and keeps the trip document tiny. |
| 2 | History at `expenses/{expenseId}/history/` | History at `trips/{tripId}/history/` | Your instruction for this task. Gives one changelog per trip in a single query, and history entries survive even if an expense document were ever removed. |
| 3 | A `clientUUID` field on each expense | Client-generated document ids + `lastHistoryId` | A document id is enforced by the database; a field is not. Retrying a write with the same id cannot duplicate it. |
| 4 | `date` is a `timestamp` | `date` is a `YYYY-MM-DD` string | Removes the timezone class of bug entirely (see TESTCASES.md #19). |
| 5 | OQ8: people are soft-deleted when they have no expenses | People are **hard-deleted** when no expense references them | Approved earlier as "hard delete people with no expenses". A soft-deleted person with no expenses is not referenced by anything, so there is nothing to keep. **This contradicts PRD OQ8 and `docs/LOGIC.md` §1/§6, which still mention `deletedAt` on people — please confirm which you want.** |
| 6 | Trip document carries `settings.retentionDays` | No `settings` block | Retention is a Firestore TTL policy configured in the console/CLI, not something a document field can enforce. Adding it as a field would be a value nothing reads. |
| 7 | Draft rules in PRD § Security Rules (`allow write: if request.auth.uid == uid`) | Full field validation, atomicity, append-only history | The PRD's sketch allows any shape of data in any of these paths. |

---

## 9. Test coverage

`tests/firestore.rules.test.ts` covers, against the emulator:

- **Ownership (7):** signed-out reads and writes denied; owner reads trips, people, expenses and
  history; a second signed-in user cannot read, list, or write into the owner's subtree.
- **Trips (8):** valid create; client-forged `createdAt` rejected; empty and over-long names
  rejected; unknown field rejected; non-UUID id rejected; rename allowed but re-dating and
  organiser reassignment rejected; delete always denied.
- **People (6):** valid create; non-UUID id rejected; over-long name rejected; non-boolean
  organiser flag rejected; rename allowed, organiser flag immutable; delete allowed.
- **Expenses (30)** across four groups:
  - *Accepted writes (2):* the CUJ 2 expense created with its history entry; a line-item expense
    with no tax at all.
  - *Atomicity with history (6):* an expense with no history entry rejected; a history entry
    written in a later batch rejected; a restore entry for an expense that is not deleted
    rejected; an update entry in the batch that creates the expense rejected; an expense update
    with no history entry rejected; an update that rewrites shares with its history accepted.
  - *Field validation (18):* zero, negative and fractional amounts rejected; total mismatch
    rejected; out-of-range GST and service-charge rates rejected; empty, duplicated and
    payer-less participant lists rejected; a participant with no share rejected; a share for a
    non-participant rejected; timestamp and badly-formatted dates rejected; empty title/category
    rejected; unknown fields rejected; a missing optional field rejected; non-UUID id rejected.
  - *Lifecycle (4):* soft delete accepted with its history; restore accepted with its history;
    editing a soft-deleted expense rejected; hard delete always denied.
- **History (10):** create accepted; rewrite rejected; delete rejected; impersonated author
  rejected; client timestamp rejected; unknown action rejected; an update entry recorded for a
  create rejected; changed fields on a create rejected; change maps that disagree with
  `changedFields` rejected; entry naming a different expense rejected.
- **Documented gaps (3):** fractional share values are accepted (rules have no aggregate); an
  entry can be appended to an existing expense outside its write; two entries can claim the
  same create. Each test pins the limitation rather than pretending otherwise.
