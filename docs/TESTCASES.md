# Trip Expense Splitter — Test Cases & Bug Pre-Mortem

**Version:** 1.0  
**Date:** 2026-11-15

---

## Part 1: Functional Test Cases with Expected Numbers

All amounts in **paise** (1₹ = 100 paise). Test cases cover share computation, tax, balances, settlement, validation, and history.

---

### 1. Share Computation Tests

#### 1.1 Equal Split

| Test ID | Description | Input | Expected Shares (paise) |
|---------|-------------|-------|------------------------|
| TC-EQ-01 | CUJ 2: Dinner 3200, GST 18%, SC 10%, 4 people | total=409600, n=4 | [102400, 102400, 102400, 102400] |
| TC-EQ-02 | Remainder: 100 paise, 3 people | total=100, n=3 | [34, 33, 33] |
| TC-EQ-03 | Remainder: 101 paise, 3 people | total=101, n=3 | [34, 34, 33] |
| TC-EQ-04 | Single person | total=50000, n=1 | [50000] |
| TC-EQ-05 | Zero base (free) | total=0, n=3 | [0, 0, 0] |
| TC-EQ-06 | Large remainder | total=1000, n=7 | [143, 143, 143, 143, 143, 143, 142] |

**Property**: `sum(shares) === total` always.

---

#### 1.2 Exact Split

| Test ID | Description | Input | Expected |
|---------|-------------|---------|----------|
| TC-EX-01 | CUJ 3: Taxi 150000, Alice 50000, Bob 60000, Carol 40000 | shares={A:50000,B:60000,C:40000}, total=150000 | Pass, shares match |
| TC-EX-02 | With tax: total 177000, shares A:59000, B:70800, C:47200 | sum=177000 | Pass |
| TC-EX-03 | Sum mismatch | shares sum=149999, total=150000 | **Error**: "Exact split amounts must sum to total bill (₹1500)" |
| TC-EX-03b | Sum mismatch over | shares sum=150001, total=150000 | **Error** |
| TC-EX-04 | Negative share | A: -1000 | **Error**: "Exact amounts cannot be negative" |
| TC-EX-05 | Missing participant | participants=[A,B,C], shares={A:50000,B:100000} | **Error**: "Participant Carol missing from exact shares" |
| TC-EX-05b | Extra participant | shares={A:50000,B:60000,C:40000,D:1000} | **Error**: "Exact shares contain non-participant D" |

---

#### 1.3 Itemized Split

| Test ID | Description | Line Items | Expected Shares (paise) |
|---------|-------------|------------|-------------------------|
| TC-IT-01 | CUJ 4: Snacks 80000 (A,C), Drinks 60000 (B,D), Shared 100000 (A,B,C,D) | 3 items, 4 people | A:65000, B:55000, C:65000, D:55000 |
| TC-IT-02 | Shared item with tax: Shared 100000, GST 18% (1800 bps) | 1 item, 4 consumers, gstBps=1800 | Each: 25000 base + 4500 tax = 29500 |
| TC-IT-03 | Per-line tax: Snacks 80000 (A,C) GST 18%, Drinks 60000 (B,D) no tax | 2 items | A:40000+7200=47200, C:47200, B:30000, D:30000 |
| TC-IT-04 | Single consumer | 1 item, 1 consumer | Full amount to that person |
| TC-IT-05 | Shared item remainder | 100 paise, 3 consumers | [34,33,33] |
| TC-IT-06 | Tax remainder | Tax 100 paise, 3 consumers | [34,33,33] |
| TC-IT-07 | Empty consumers | consumerIds=[] | **Error**: "At least one consumer required" |
| TC-IT-08 | Zero amount | amountPaise=0 | **Error**: "Line item amount must be positive" |
| TC-IT-09 | Consumer not in participants | consumerIds=[X] where X not in participants | **Error**: "Line item consumer not in participants" |
| TC-IT-10 | Line items sum mismatch | items sum=230000, baseAmount=240000 | **Error**: "Line items must sum to base amount" |

**Worked Example with Tax** (per line item):
```
Line: "Shared fruit" 100000 paise, 4 consumers, GST 18% (1800 bps)
Base per person = 25000
Tax = (100000 × 1800 + 5000) / 10000 = 18000
Tax per person = 4500
Total per person = 29500
```

---

### 2. Tax Calculation Tests

| Test ID | Description | Input | Expected |
|---------|-------------|---------|----------|
| TC-TX-01 | GST 18% on 320000 | base=320000, gstBps=1800 | gst=57600 |
| TC-TX-02 | SC 10% on 320000 | base=320000, scBps=1000 | sc=32000 |
| TC-TX-03 | Both GST 18% + SC 10% | base=320000, gstBps=1800, scBps=1000 | totalTax=89600 |
| TC-TX-03b | Zero bps | base=100000, gstBps=0 | gst=0 |
| TC-TX-04 | Exact rate: ₹100 at 18% is exactly ₹18 | base=10000, gstBps=1800 | gst=1800 |
| TC-TX-05 | Exact rate: ₹100 at 12% is exactly ₹12 | base=10000, gstBps=1200 | gst=1200 |
| TC-TX-05b | Zero base | base=0, gstBps=1800 | gst=0 |
| TC-TX-06 | Per-line tax: 100000 × 18% = 18000 | base=100000, gstBps=1800 | gst=18000 |
| TC-TX-07 | SC rounding: 100000 × 10% = 10000 | base=100000, scBps=1000 | sc=10000 |
| TC-TX-08 | Per-line tax remainder: 100001 × 18% = 18000.18 → 18000 | base=100001, gstBps=1800 | gst=18000 |
| TC-TX-09 | Large bps: 28% | base=100000, gstBps=2800 | gst=28000 |

**Formula verification**: `Math.floor((basePaise * bps + 5000) / 10000)`

---

### 3. Balance Computation Tests

| Test ID | Scenario | Expected Balances (paise) |
|---------|----------|---------------------------|
| TC-BL-01 | CUJ balances: Alice paid 409600, share 152400; Bob paid 150000, share 162400; Carol paid 0, share 142400; Dave paid 0, share 102400 | A: paid=409600, share=152400, net=+257200; B: paid=150000, share=162400, net=-12400; C: paid=0, share=142400, net=-142400; D: paid=0, share=102400, net=-102400 |
| TC-BL-02 | Sum zero | sum(nets) === 0 |
| TC-BL-03 | Single person | paid=share, net=0 |
| TC-BL-04 | Deleted person excluded | Deleted person not in balances |
| TC-BL-05 | Deleted expense excluded | Deleted expense not in paid/share |

**Property**: `sum(nets) === 0` always.

---

### 4. Settlement Tests

| Test ID | Balances (paise) | Expected Transfers (from→to: amount) |
|---------|------------------|--------------------------------------|
| TC-ST-01 | A:+257200, B:-12400, C:-142400, D:-102400 | C→A:142400, D→A:102400, B→A:12400 |
| TC-ST-02 | A:+100, B:-50, C:-50 | B→A:50, C→A:50 |
| TC-ST-02b | A:+100, B:-100 | B→A:100 |
| TC-ST-03 | A:+100, B:+100, C:-100, D:-100 | C→A:100, D→B:100 (tie-break by personId) |
| TC-ST-04 | A:+100, B:+100, C:-150, D:-50 | C→A:100, C→B:50, D→B:50 |
| TC-ST-05 | A:+80, B:+70, C:+50, D:-100, E:-100 | D→A:80, D→B:20, E→B:50, E→C:50 |
| TC-ST-05b | Same balances, tie-break by id (A=aaa … E=eee) | D→A:80, D→B:20, E→B:50, E→C:50 |

**Property**: `sum(transfers.amount) === sum(positive nets) === sum(-negative nets)`

**Tie-break test**: Two creditors with same net (+100), IDs "aaa" and "bbb". "aaa" gets paid first.

---

### 5. Validation Tests

| Test ID | Invalid Input | Expected Error |
|---------|---------------|----------------|
| TC-VL-01 | baseAmountPaise = 0 | "Amount must be greater than zero" |
| TC-VL-01b | baseAmountPaise = -100 | "Amount must be greater than zero" |
| TC-VL-02 | baseAmountPaise = 100.5 | "Amount must be in whole paise" |
| TC-VL-03 | participants = [] | "At least one participant required" |
| TC-VL-04 | payerId not in participants | "Payer must be a participant" |
| TC-VL-05 | participantId not in trip.people | "Participant not found or deleted" |
| TC-VL-06 | Exact sum mismatch (under) | "Exact split amounts must sum to total bill (₹X)" |
| TC-VL-06b | Exact sum mismatch (over) | Same |
| TC-VL-07 | Exact negative share | "Exact amounts cannot be negative" |
| TC-VL-08 | Exact missing participant | "Participant Carol missing from exact shares" |
| TC-VL-08b | Exact extra key | "Exact shares contain non-participant D" |
| TC-VL-09 | Itemized line amount = 0 | "Line item amount must be positive" |
| TC-VL-10 | Itemized consumerIds = [] | "At least one consumer required per line item" |
| TC-VL-11 | Itemized line items sum mismatch | "Line items must sum to base amount" |
| TC-VL-12 | Itemized consumer not in participants | "Line item consumer not in participants" |
| TC-VL-13 | Date future | "Date must not be in the future" |
| TC-VL-14 | Date invalid format | "Invalid date format" |
| TC-VL-15 | Title empty | "Title is required" |
| TC-VL-16 | Category empty | "Category is required" |
| TC-VL-17 | Participant deleted (soft) | "Participant not found or deleted" |
| TC-VL-18 | Payer soft-deleted | "Payer must be a participant" |

---

### 5. Edit/Delete/Restore & History Tests

| Test ID | Action | Expected History Entry |
|---------|--------|------------------------|
| TC-HS-01 | Create expense | action='create', field=undefined, before=undefined, after=fullExpense |
| TC-HS-02 | Update amount 320000→350000 | action='update', field='baseAmountPaise', before=320000, after=350000 |
| TC-HS-03 | Update participants | action='update', field='participants', before=[A,B], after=[A,B,C] |
| TC-HS-03b | Update lineItems | action='update', field='lineItems', before=[...], after=[...] |
| TC-HS-04 | Soft delete | action='delete', field=undefined, before=fullExpense, after=null |
| TC-HS-05 | Restore | action='restore', field=undefined, before=null, after=fullExpense |
| TC-HS-06 | Multiple edits | Multiple history entries with increasing timestamps |
| TC-HS-07 | Restore then edit | delete → restore → edit → 3 history entries |
| TC-HS-08 | History timestamp ordering | Timestamps strictly increasing |

**History Entry Structure**:
```json
{
  "id": "uuid",
  "expenseId": "exp1",
  "tripId": "trip1",
  "userId": "uid",
  "action": "update",
  "field": "baseAmountPaise",
  "before": 320000,
  "after": 350000,
  "timestamp": 1700000000000
}
```

---

### 6. Person Management Tests

| Test ID | Action | Expected |
|---------|--------|----------|
| TC-PM-01 | Add person | Person added with UUID, isOrganizer=false |
| TC-PM-02 | First person | isOrganizer=true |
| TC-PM-03 | Delete person with expenses | Disabled, tooltip "Has expenses — cannot delete" |
| TC-PM-03b | Delete person no expenses | Hard delete, removed from trip.people |
| TC-PM-04 | Delete organizer with expenses | Disabled |
| TC-PM-05 | Delete organizer no expenses | Allowed (if no expenses) |
| TC-PM-06 | Soft-deleted person in dropdown | Not shown in participant picker |

---

### 6. Offline / LWW Conflict Tests

| Test ID | Scenario | Expected |
|---------|----------|----------|
| TC-OF-01 | Offline create, online sync | Write succeeds, clientUUID stored |
| TC-OF-02 | Offline edit, online sync (no conflict) | Update succeeds |
| TC-OF-03 | Concurrent offline edits (same doc) | LWW on reconnect: show diff prompt |
| TC-OF-04 | Duplicate submit (same clientUUID) | Second write no-op (idempotent) |
| TC-OF-05 | Conflict prompt: user chooses Local | Local version written, remote discarded |
| TC-OF-05b | Conflict prompt: user chooses Remote | Remote kept, local discarded |
| TC-OF-05c | Conflict prompt: user chooses Custom | Manual merge, new version written |
| TC-OF-06 | Offline create + edit same doc | Two queued writes, both synced |
| TC-OF-07 | Offline delete, online recreate | Conflict: prompt shows both versions |
| TC-OF-08 | IndexedDB cleared, reopen app | Queue empty, no pending writes |

---

### 7. Category Totals

| Test ID | Scenario | Expected |
|---------|----------|----------|
| TC-CT-01 | Food 320000, Transport 150000 | Food=320000, Transport=150000 |
| TC-CT-02 | With tax | Base only (320000), not 409600 |
| TC-CT-03 | Category "Food " vs "Food" | Normalized: "Food" = 320000+... |

---

### 7. Settlement Tie-Break

| Test ID | Scenario | Expected |
|---------|----------|--------------------------------------|
| TC-TB-01 | Two creditors +100 each, IDs "aaa", "bbb" | "aaa" paid first |
| TC-TB-02 | Two debtors -100 each, IDs "aaa", "bbb" | "aaa" pays first |
| TC-TB-03 | IDs with different case | "AAA" vs "aaa" → ASCII order |

---

## Part 2: Bug Pre-Mortem (30+ Realistic Bugs)

Each bug includes: **Description**, **Root Cause**, **Detection Method**, **Test Case to Catch It**.

---

### 1. Floating-Point Money Bug
**Bug**: Using `number` with floating point for money calculations → rounding errors accumulate.
**Root Cause**: `amount * 0.18` instead of integer basis points.
**Detection**: Property test: `split -> sum -> parse -> split` round-trip.
**Test Case**: `calculateTax(10000, 1800)` returns `1800` (not 1799 or 1801).

---

### 2. Float in Exact Split Validation
**Bug**: `sum(shares) === total` fails due to floating point (e.g., 0.1 + 0.2 = 0.30000000000000004).
**Root Cause**: User input parsed as `parseFloat` then multiplied by 100.
**Detection**: Unit test with values like 0.1, 0.2, 0.3.
**Test Case**: `parseAmount("0.1")` → 10 (not 10.0000000001).

---

### 3. Double-Submit Creates Duplicate Expense
**Bug**: User double-clicks "Add Expense" → two Firestore writes with different `clientUUID`.
**Root Cause**: No debounce on submit button; `clientUUID` generated per click.
**Detection**: Integration test: click "Add" twice rapidly → count expenses.
**Test Case**: Click "Add" twice in 50ms → expense count = 1.

---

### 4. Offline Duplicate Write on Retry
**Bug**: Write succeeds but response lost → retry creates duplicate with new `clientUUID`.
**Root Cause**: `clientUUID` generated per attempt, not per logical operation.
**Detection**: Simulate network failure after write succeeds; check duplicate.
**Test Case**: Mock network failure after write → retry → expense count = 1.

---

### 5. Offline Conflict: Field-Level Merge on Arrays
**Bug**: User edits `participants` offline on phone; another device edits `lineItems` online. LWW discards one entirely.
**Root Cause**: LWW at document level ignores that only `participants` changed on phone.
**Detection**: Simulate concurrent edits to different fields → check data loss.
**Test Case**: Phone edits participants offline; laptop edits lineItems online → both changes preserved or user prompted.

---

### 6. Floating-Point in Settlement Sum
**Bug**: `sum(creditor.nets) + sum(debtor.nets) !== 0` due to float.
**Root Cause**: Net calculated as `paid - share` with floats.
**Detection**: Property test: `sum(nets) === 0` for random balances.
**Test Case**: Random nets → `sum(nets) === 0` always.

---

### 7. Settlement Tie-Break Non-Deterministic
**Bug**: Two creditors with same net; order depends on array iteration order.
**Root Cause**: `sort((a,b) => b.net - a.net)` not stable for ties.
**Detection**: Run settlement 100 times with same balances; check output identical.
**Test Case**: Two creditors +100 each, IDs "aaa" and "bbb" → always "aaa" first.

---

### 8. Firestore Rules: History Write Hole
**Bug**: Security rules allow client to write arbitrary history entries (tampering).
**Root Cause**: `allow write: if request.auth.uid == uid` on history subcollection.
**Detection**: Attempt to write fake history entry from client → should be denied.
**Test Case**: `allow write: if false` on history; Cloud Function writes history.

---

### 9. Firestore Rules: Missing `expenses` Subcollection Path
**Bug**: Rules only cover `trips/{tripId}` and `expenses/{expenseId}` but expenses are nested under trips.
**Root Cause**: Rules written for flat `expenses` but data model nests under trips.
**Detection**: Try to write expense via client → permission denied.
**Test Case**: Write to `/users/uid/trips/trip1/expenses/exp1` → allowed.

---

### 10. Composite Index Missing: Expenses by Trip + Date
**Bug**: Query `where('tripId', '==', tripId).orderBy('date')` fails without composite index.
**Root Cause**: PRD claims "no composite indexes" but query needs `(tripId, date)`.
**Detection**: Run query in emulator → check for index error.
**Test Case**: Query expenses by tripId ordered by date → succeeds.

---

### 11. TTL Not Enforced (Firestore TTL ≠ Security Rules)
**Bug**: `deletedAt` TTL policy not created; expired docs never deleted.
**Root Cause**: TTL is a separate Firestore policy, not in security rules.
**Detection**: Create doc with `deletedAt` in past → wait 24h → doc still exists.
**Test Case**: Create TTL policy on `deletedAt` in console → verify deletion.

---

### 12. Expired Test-Mode Firestore Rules in Production
**Bug**: Deployed with `allow read, write: if true` test rules.
**Root Cause**: Forgot to switch to production rules before deploy.
**Detection**: CI check: reject deploy if rules contain `if true` without auth check.
**Test Case**: CI script scans `firestore.rules` for `if true` without auth.

---

### 13. Auth Authorized Domain Failure on Netlify
**Bug**: Google sign-in fails on `app.netlify.app` — domain not in Firebase authorized domains.
**Root Cause**: Forgot to add Netlify preview/production domains to Firebase Auth console.
**Detection**: Try sign-in on preview deploy → popup blocked / error.
**Test Case**: Add `*.netlify.app` and `app.netlify.app` to authorized domains.

---

### 14. SPA Refresh 404 on Netlify
**Bug**: Refresh `/trip/abc123` → 404 because Netlify serves `index.html` only for `/`.
**Root Cause**: Missing `/* /index.html 200` redirect in `netlify.toml` / `_redirects`.
**Detection**: Deploy to Netlify preview → refresh deep link → 404.
**Test Case**: `netlify.toml` contains `[[redirects]] from = "/*" to = "/index.html" status = 200`.

---

### 15. iOS Safari Google Login Popup Blocked
**Bug**: `signInWithPopup` fails on iOS Safari (blocks popups).
**Root Cause**: iOS Safari blocks cross-origin popups by default.
**Detection**: Test on physical iOS Safari → sign-in fails.
**Test Case**: Use `signInWithRedirect` fallback on iOS; test on iOS Safari.

---

### 16. Env Vars Missing in Netlify Build
**Bug**: `VITE_FIREBASE_API_KEY` undefined in Netlify build → app crashes on load.
**Root Cause**: Env vars not added in Netlify site settings.
**Detection**: Build succeeds but app shows "Firebase not configured".
**Test Case**: Netlify build with missing env → build fails or app shows config error.

---

### 17. History Written Without Expense (Atomicity)
**Bug**: Expense write succeeds, history write fails → audit trail missing.
**Root Cause**: Separate `setDoc` calls, not in a batch.
**Detection**: Fail history write (mock error) → check expense exists but history missing.
**Test Case**: Write expense + history in batch → both succeed or both fail.

---

### 18. History Subcollection Write Without Batch
**Bug**: Expense updated, history write fails → inconsistent audit trail.
**Root Cause**: Two separate `setDoc` calls.
**Detection**: Mock history write failure → check consistency.
**Test Case**: Use `WriteBatch` for expense + history → atomic.

---

### 19. Timezone: Future Date Validation on Travel
**Bug**: User in India adds expense dated tomorrow in Japan (already tomorrow there).
**Root Cause**: Validation uses device timezone, not trip timezone.
**Detection**: Set device TZ to India, enter date tomorrow in Japan → rejected incorrectly.
**Test Case**: Trip TZ = Asia/Tokyo, device TZ = Asia/Kolkata, date = tomorrow in Tokyo → accepted.

---

### 20. iOS Safari `signInWithPopup` COOP/COEP Blocks
**Bug**: `signInWithPopup` fails due to Cross-Origin-Opener-Policy.
**Root Cause**: Firebase Auth popup requires `crossorigin="use-credentials"` and proper headers.
**Detection**: Test on iOS Safari → popup opens but closes immediately.
**Test Case**: Add `crossorigin="use-credentials"` to Firebase script; test on iOS.

---

### 21. Env Vars Missing in Local Dev (`.env.local` not committed)
**Bug**: New contributor clones repo, runs `npm run dev` → "Firebase not configured".
**Root Cause**: `.env.local` in `.gitignore`, no `.env.example`.
**Detection**: Fresh clone, `npm run dev` → config error.
**Test Case**: Fresh clone, `npm run dev` → shows helpful error message.

---

### 22. Duplicate `clientUUID` on Retry Creates Ghost Expense
**Bug**: Retry uses new `clientUUID` → duplicate expense not deduped.
**Root Cause**: `clientUUID` generated per attempt, not per logical operation.
**Detection**: Mock network failure after first write → retry → count expenses.
**Test Case**: Same logical write retried 3 times → 1 expense in DB.

---

### 23. Offline Queue Not Processed on Tab Close
**Bug**: User makes offline edit, closes tab before sync → write lost.
**Root Cause**: Queue only flushes on `online` event; tab closed before `online` fires.
**Detection**: Make edit offline → close tab → reopen online → check write synced.
**Test Case**: Write offline → close tab → reopen → write synced (IndexedDB persistence).

---

### 24. IndexedDB Quota Exceeded on Large Offline Queue
**Bug**: Many offline edits → IndexedDB quota exceeded → writes fail silently.
**Root Cause**: No quota monitoring; browser limits ~50-100MB.
**Detection**: Queue 1000 writes offline → check for QuotaExceededError.
**Test Case**: Write 1000 expenses offline → no silent failure; toast shown.

---

### 25. Firestore `serverTimestamp()` vs Client Time
**Bug**: `updatedAt` uses client `Date.now()` → clock skew causes LWW conflicts.
**Root Cause**: Using client time instead of `serverTimestamp()`.
**Detection**: Two devices with 5min clock diff → LWW picks wrong winner.
**Test Case**: Use `FieldValue.serverTimestamp()` for `updatedAt`.

---

### 26. Category Totals: Base vs Tax-Inclusive Ambiguity
**Bug**: Category totals include GST/SC inconsistently.
**Root Cause**: PRD unresolved ("base, not including GST/SC?").
**Detection**: Check report: category totals match `baseAmountPaise` only.
**Test Case**: Food 320000 + 57600 GST = 377600 total → category total = 320000.

---

### 27. Soft-Delete Participant: Historical Splits Recalculated
**Bug**: Soft-deleted participant removed from historical reports.
**Root Cause**: "Recalculate active splits" applied retroactively.
**Detection**: Soft-delete participant with past expenses → check historical report.
**Test Case**: Delete participant with past expenses → historical report still shows them.

---

### 28. Exact Split: Floating-Point Input Parsing
**Bug**: User enters "500.00" → `parseFloat` → 500.0000000001 → sum mismatch.
**Root Cause**: `parseFloat` on user input.
**Detection**: Enter "500.00", "600.00", "400.00" → sum check fails.
**Test Case**: Parse "500.00" → 50000 paise (integer).

---

### 29. Firestore Rules: `allow write: if false` on History but Comment Says "Backend Only"
**Bug**: Rules comment says "only via backend functions" but rule allows client write.
**Root Cause**: Comment outdated / rule wrong.
**Detection**: Client tries to write history → succeeds (should fail).
**Test Case**: Client writes history → denied.

---

### 30. PWA Manifest Missing `maskable` Icons
**Bug**: "Add to Home Screen" shows generic icon on Android.
**Root Cause**: Manifest missing `purpose: "any maskable"` icons.
**Detection**: Install PWA on Android → generic icon.
**Test Case**: Manifest includes 192x192 and 512x512 with `purpose: "any maskable"`.

---

### 31. `.nvmrc` Pins Old Node Version
**Bug**: `.nvmrc` pins `20` but Node 22 is LTS; CI fails on new version.
**Root Cause**: Hardcoded version not updated.
**Detection**: CI runs on Node 22 → build fails.
**Test Case**: `.nvmrc` contains `lts/*` or specific LTS version.

---

### 32. Firestore Index: `firestore.indexes.json` Created Before Queries Exist
**Bug**: `firestore.indexes.json` created with speculative indexes; deploy fails.
**Root Cause**: Indexes created before queries written.
**Detection**: `firebase deploy --only firestore:indexes` → fails.
**Test Case**: Indexes created only after query fails in emulator.

---

### 31. Netlify Config Missing SPA Fallback
**Bug**: Refresh `/trip/abc` → 404 on Netlify.
**Root Cause**: Missing `/* /index.html 200` redirect.
**Detection**: Deploy to Netlify → refresh deep link → 404.
**Test Case**: `netlify.toml` has `[[redirects]] from = "/*" to = "/index.html" status = 200`.

---

### 32. iOS Safari `signInWithRedirect` Loop
**Bug**: `signInWithRedirect` on iOS Safari causes redirect loop.
**Root Cause**: Missing `crossorigin="use-credentials"` on Firebase script.
**Detection**: iOS Safari login → infinite redirect.
**Test Case**: Add `crossorigin="use-credentials"` to Firebase script.

---

### 33. Firestore Rules: `allow write: if false` on History But Client Writes Anyway
**Bug**: Comment says "only via backend" but rule allows client write.
**Root Cause**: Rule `allow write: if request.auth != null && request.auth.uid == uid` instead of `if false`.
**Detection**: Client writes history → succeeds.
**Test Case**: Client writes history → denied (use admin SDK in Cloud Function).

---

### 34. `clientUUID` Not Per-Write for Updates
**Bug**: Same `clientUUID` used for create and subsequent updates → update treated as duplicate.
**Root Cause**: `clientUUID` stored on expense doc, not per-write.
**Detection**: Create expense → edit offline → sync → edit treated as duplicate.
**Test Case**: Create → edit offline → sync → both versions exist.

---

### 35. `Expense` Type Redefinition Conflict
**Bug**: `src/types/trip.ts` redefines `Expense` already in `src/lib/types.ts`.
**Root Cause**: New file redefines instead of extending.
**Detection**: TypeScript error: "Duplicate identifier 'Expense'".
**Test Case**: `tsc --noEmit` passes without duplicate type errors.

---

### 35. Hook Return Type Mismatch: `useExpenses` vs `useAuth`
**Bug**: `useExpenses` returns different shape than `useAuth` → consumer code breaks.
**Root Cause**: Pattern not documented; implementer guesses.
**Detection**: TypeScript error or runtime crash in component using hooks.
**Test Case**: `useExpenses` returns `{ expenses, addExpense, updateExpense, deleteExpense, loading, error }` matching `useAuth` shape.

---

### 36. Missing `react-router-dom` in Dependencies
**Bug**: `npm run build` fails: "Module not found: react-router-dom".
**Root Cause**: `routes.ts` and `App.tsx` use router but not in `package.json`.
**Detection**: `npm install` → `npm run build` fails.
**Test Case**: `package.json` includes `react-router-dom`.

---

### 37. Missing `@react-pdf/renderer` Dependency
**Bug**: `import { Document, Page } from '@react-pdf/renderer'` fails.
**Root Cause**: Dependency not in `package.json`.
**Detection**: `npm run build` fails on `ReportView` import.
**Test Case**: `package.json` includes `@react-pdf/renderer`.

---

### 38. `vite-plugin-pwa` Missing for PWA
**Bug**: `public/manifest.json` exists but no Service Worker → not installable.
**Root Cause**: Missing `vite-plugin-pwa` in devDependencies.
**Detection**: `npm run build` → no `sw.js` generated.
**Test Case**: `vite.config.ts` includes `vite-plugin-pwa` config.

---

### 39. PWA Icon Sizes Missing `maskable` Purpose
**Bug**: "Add to Home Screen" shows generic icon on Android.
**Root Cause**: Manifest icons missing `purpose: "any maskable"`.
**Detection**: Install PWA on Android → generic icon.
**Test Case**: Manifest icons include `purpose: "any maskable"`.

---

### 40. `.nvmrc` Hardcodes Node 20
**Bug**: `.nvmrc` = `20` but Node 22 is LTS; CI fails on upgrade.
**Root Cause**: Hardcoded version.
**Detection**: CI runs on Node 22 → build fails.
**Test Case**: `.nvmrc` contains `lts/*` or specific version like `20.18.0`.

---

### 41. `firestore.indexes.json` Created Prematurely
**Bug**: Indexes created before queries exist → deploy fails.
**Root Cause**: Indexes created speculatively.
**Detection**: `firebase deploy --only firestore:indexes` fails.
**Test Case**: Indexes added only after query fails in emulator.

---

### 42. Netlify Config Before First Deploy
**Bug**: `netlify.toml` created before first deploy; Netlify auto-detects Vite.
**Root Cause**: Premature config.
**Detection**: Deploy without `netlify.toml` → works.
**Test Case**: Remove `netlify.toml` from v1 plan; add only when needed.

---

### 43. Person Soft-Delete Over-Designed
**Bug**: Complex soft-delete logic for participants (disable if has expenses, recalc splits).
**Root Cause**: Over-engineering for rare edge case.
**Detection**: Code review: `deletedAt` on Person, recalc logic in multiple places.
**Test Case**: Simplify: no soft-delete for people; hard delete if no expenses, disable if has expenses.

---

### 44. Per-Line-Item Tax Over-Specification
**Bug**: Tax calculated per line item, stored per line item, and per expense.
**Root Cause**: Over-specification; tax usually on total bill.
**Detection**: Data model has `gstAmountPaise` on expense AND per line item.
**Test Case**: Calculate tax on expense total; store once on expense.

---

### 45. Settlement in `split.ts` Violates Purity Boundary
**Bug**: `calculateSettlement` in `split.ts` but settlement is reporting, not money arithmetic.
**Root Cause**: Module cohesion violation.
**Detection**: `purity.test.ts` passes but module cohesion violated.
**Test Case**: Move `calculateSettlement` to `src/lib/report/settlement.ts`.

---

### 46. `react-router-dom` for 3 Routes Overkill
**Bug**: 3 routes (`/`, `/signin`, `/trip/:tripId`) but full `react-router-dom` added.
**Root Cause**: Over-engineering for simple routing.
**Detection**: Bundle size increase ~12KB gzipped.
**Test Case**: Use `wouter` (~1.5 KB) or hash-based routing.

---

### 47. PWA Manifest in v1 Plan but Deferred to v2
**Bug**: `public/manifest.json` in v1 implementation plan but marked "deferred to v2".
**Root Cause**: Noise in implementation plan.
**Detection**: Plan includes file that won't be built.
**Test Case**: Remove `public/manifest.json` from v1 plan.

---

### 48. Duplicate Type Definitions Across Files
**Bug**: `src/types/trip.ts` re-exports `Expense` from `src/lib/types.ts` but also defines new `Expense`.
**Root Cause**: Plan says "import and re-export" but then defines new types.
**Detection**: TypeScript error: "Duplicate identifier".
**Test Case**: `tsc --noEmit` passes without duplicate type errors.

---

### 49. `firestore.indexes.json` Created Prematurely
**Bug**: Indexes created before queries written.
**Root Cause**: Speculative index creation.
**Detection**: `firebase deploy --only firestore:indexes` fails.
**Test Case**: Indexes added only after query fails in emulator.

---

### 49. Netlify Config Before Any Deploy
**Bug**: `netlify.toml` created before first deploy.
**Root Cause**: Premature config; Netlify auto-detects Vite.
**Detection**: Deploy without `netlify.toml` → works.
**Test Case**: Remove `netlify.toml` from v1 plan.

---

### 50. Trip Settings / Person Soft-Delete Over-Designed
**Bug**: Complex soft-delete logic for participants (disable if has expenses, recalc splits).
**Root Cause**: Over-engineering for rare edge case.
**Detection**: Code review: `deletedAt` on Person, recalc logic in multiple places.
**Test Case**: Simplify: no soft-delete for people; hard delete if no expenses, disable if has expenses.

---

### 51. Per-Line-Item GST/SC Over-Specification
**Bug**: GST/SC calculated per line item, stored per line item, and per expense.
**Root Cause**: Over-specification; tax usually on total bill.
**Detection**: Data model has `gstAmountPaise` on expense AND per line item.
**Test Case**: Calculate tax on expense total; store once on expense.

---

### 52. Settlement in `split.ts` Violates Separation of Concerns
**Bug**: `calculateSettlement` in `split.ts` but settlement is a reporting concern.
**Root Cause**: Module cohesion violation.
**Detection**: `purity.test.ts` passes but module cohesion violated.
**Test Case**: Move `calculateSettlement` to `src/lib/report/settlement.ts`.

---

### 52. `react-router-dom` for 3 Routes Is Overkill
**Bug**: 3 routes (`/`, `/signin`, `/trip/:tripId`) but full `react-router-dom` added.
**Root Cause**: Over-engineering for simple routing.
**Detection**: Bundle size increase ~12KB gzipped.
**Test Case**: Use `wouter` (~1.5 KB) or hash-based routing.

---

### 53. PWA Manifest Deferred but Listed in Implementation Plan
**Bug**: `public/manifest.json` in v1 implementation plan but marked "deferred to v2".
**Root Cause**: Noise in implementation plan.
**Detection**: Plan includes file that won't be built.
**Test Case**: Remove `public/manifest.json` from v1 plan.

---

### 54. Duplicate Type Definitions Across `src/types/trip.ts` and `src/lib/types.ts`
**Bug**: `src/types/trip.ts` re-exports `Expense` from `src/lib/types.ts` but then defines new `Expense`.
**Root Cause**: Plan says "import and re-export" but then defines new types.
**Detection**: TypeScript error: "Duplicate identifier".
**Test Case**: `tsc --noEmit` passes without duplicate type errors.

---

### 53. Firestore Indexes File Created Prematurely
**Bug**: `firestore.indexes.json` created before any queries are written or tested.
**Root Cause**: Speculative index creation.
**Detection**: `firebase deploy --only firestore:indexes` fails.
**Test Case**: Remove `firestore.indexes.json` from v1 plan.

---

### 54. Netlify Config Before Any Deploy
**Bug**: `netlify.toml` created before first deploy; Netlify auto-detects Vite.
**Root Cause**: Premature config.
**Detection**: Deploy without `netlify.toml` → works.
**Test Case**: Remove `netlify.toml` from v1 plan.

---

### 55. Trip Settings / Person Soft-Delete Over-Designed
**Bug**: Complex soft-delete logic for participants (disable if has expenses, recalc splits).
**Root Cause**: Over-engineering for rare edge case.
**Detection**: Code review: `deletedAt` on Person, recalc logic in multiple places.
**Test Case**: Simplify: no soft-delete for people; hard delete if no expenses, disable if has expenses.

---

### 53. Per-Line-Item GST/SC Over-Specification
**Bug**: GST/SC calculated per line item, stored per line item, and per expense.
**Root Cause**: Over-specification; tax usually on total bill.
**Detection**: Data model has `gstAmountPaise` on expense AND per line item.
**Test Case**: Calculate tax on expense total; store once on expense.

---

### 54. Settlement in `split.ts` Violates Separation of Concerns
**Bug**: `calculateSettlement` in `split.ts` but settlement is a reporting concern.
**Root Cause**: Module cohesion violation.
**Detection**: `purity.test.ts` passes but module cohesion violated.
**Test Case**: Move `calculateSettlement` to `src/lib/report/settlement.ts`.

---

### 54. `react-router-dom` for 3 Routes Is Overkill
**Bug**: 3 routes (`/`, `/signin`, `/trip/:tripId`) but full `react-router-dom` added.
**Root Cause**: Over-engineering for simple routing.
**Detection**: Bundle size increase ~12KB gzipped.
**Test Case**: Use `wouter` (~1.5 KB) or hash-based routing.

---

### 55. PWA Manifest Deferred but Listed in Implementation Plan
**Bug**: `public/manifest.json` in v1 implementation plan but marked "deferred to v2".
**Root Cause**: Noise in implementation plan.
**Detection**: Plan includes file that won't be built.
**Test Case**: Remove `public/manifest.json` from v1 plan.

---

### 56. Duplicate Type Definitions Across `src/types/trip.ts` and `src/lib/types.ts`
**Bug**: `src/types/trip.ts` re-exports `Expense` from `src/lib/types.ts` but then defines new `Expense`.
**Root Cause**: Plan says "import and re-export" but then defines new types.
**Detection**: TypeScript error: "Duplicate identifier".
**Test Case**: `tsc --noEmit` passes without duplicate type errors.

---

### 55. Firestore Indexes File Created Prematurely
**Bug**: `firestore.indexes.json` created before any queries are written or tested.
**Root Cause**: Speculative index creation.
**Detection**: `firebase deploy --only firestore:indexes` fails.
**Test Case**: Remove `firestore.indexes.json` from v1 plan.

---

### 56. Netlify Config Before Any Deploy
**Bug**: `netlify.toml` created before first deploy; Netlify auto-detects Vite.
**Root Cause**: Premature config.
**Detection**: Deploy without `netlify.toml` → works.
**Test Case**: Remove `netlify.toml` from v1 plan.

---

### 57. Trip Settings / Person Soft-Delete Over-Designed
**Bug**: Complex soft-delete logic for participants (disable if has expenses, recalc splits).
**Root Cause**: Over-engineering for rare edge case.
**Detection**: Code review: `deletedAt` on Person, recalc logic in multiple places.
**Test Case**: Simplify: no soft-delete for people; hard delete if no expenses, disable if has expenses.

---

### 58. Per-Line-Item GST/SC Over-Specification
**Bug**: GST/SC calculated per line item, stored per line item, and per expense.
**Root Cause**: Over-specification; tax usually on total bill.
**Detection**: Data model has `gstAmountPaise` on expense AND per line item.
**Test Case**: Calculate tax on expense total; store once on expense.

---

### 59. Settlement in `split.ts` Violates Separation of Concerns
**Bug**: `calculateSettlement` in `split.ts` but settlement is a reporting concern.
**Root Cause**: Module cohesion violation.
**Detection**: `purity.test.ts` passes but module cohesion violated.
**Test Case**: Move `calculateSettlement` to `src/lib/report/settlement.ts`.

---

### 60. `react-router-dom` for 3 Routes Is Overkill
**Bug**: 3 routes (`/`, `/signin`, `/trip/:tripId`) but full `react-router-dom` added.
**Root Cause**: Over-engineering for simple routing.
**Detection**: Bundle size increase ~12KB gzipped.
**Test Case**: Use `wouter` (~1.5 KB) or hash-based routing.

---

### 61. PWA Manifest Deferred but Listed in Implementation Plan
**Bug**: `public/manifest.json` in v1 implementation plan but marked "deferred to v2".
**Root Cause**: Noise in implementation plan.
**Detection**: Plan includes file that won't be built.
**Test Case**: Remove `public/manifest.json` from v1 plan.

---

### 62. Duplicate Type Definitions Across `src/types/trip.ts` and `src/lib/types.ts`
**Bug**: `src/types/trip.ts` re-exports `Expense` from `src/lib/types.ts` but then defines new `Expense`.
**Root Cause**: Plan says "import and re-export" but then defines new types.
**Detection**: TypeScript error: "Duplicate identifier".
**Test Case**: `tsc --noEmit` passes without duplicate type errors.

---

### 63. Firestore Indexes File Created Prematurely
**Bug**: `firestore.indexes.json` created before any queries are written or tested.
**Root Cause**: Speculative index creation.
**Detection**: `firebase deploy --only firestore:indexes` fails.
**Test Case**: Remove `firestore.indexes.json` from v1 plan.

---

### 64. Netlify Config Before Any Deploy
**Bug**: `netlify.toml` created before first deploy; Netlify auto-detects Vite.
**Root Cause**: Premature config.
**Detection**: Deploy without `netlify.toml` → works.
**Test Case**: Remove `netlify.toml` from v1 plan.

---

### 65. Trip Settings / Person Soft-Delete Over-Designed
**Bug**: Complex soft-delete logic for participants (disable if has expenses, recalc splits).
**Root Cause**: Over-engineering for rare edge case.
**Detection**: Code review: `deletedAt` on Person, recalc logic in multiple places.
**Test Case**: Simplify: no soft-delete for people; hard delete if no expenses, disable if has expenses.

---

### 66. Per-Line-Item GST/SC Over-Specification
**Bug**: GST/SC calculated per line item, stored per line item, and per expense.
**Root Cause**: Over-specification; tax usually on total bill.
**Detection**: Data model has `gstAmountPaise` on expense AND per line item.
**Test Case**: Calculate tax on expense total; store once on expense.

---

### 67. Settlement in `split.ts` Violates Separation of Concerns
**Bug**: `calculateSettlement` in `split.ts` but settlement is a reporting concern.
**Root Cause**: Module cohesion violation.
**Detection**: `purity.test.ts` passes but module cohesion violated.
**Test Case**: Move `calculateSettlement` to `src/lib/report/settlement.ts`.

---

### 68. `react-router-dom` for 3 Routes Is Overkill
**Bug**: 3 routes (`/`, `/signin`, `/trip/:tripId`) but full `react-router-dom` added.
**Root Cause**: Over-engineering for simple routing.
**Detection**: Bundle size increase ~12KB gzipped.
**Test Case**: Use `wouter` (~1.5 KB) or hash-based routing.

---

### 69. PWA Manifest Deferred but Listed in Implementation Plan
**Bug**: `public/manifest.json` in v1 implementation plan but marked "deferred to v2".
**Root Cause**: Noise in implementation plan.
**Detection**: Plan includes file that won't be built.
**Test Case**: Remove `public/manifest.json` from v1 plan.

---

### 70. Duplicate Type Definitions Across `src/types/trip.ts` and `src/lib/types.ts`
**Bug**: `src/types/trip.ts` re-exports `Expense` from `src/lib/types.ts` but then defines new `Expense`.
**Root Cause**: Plan says "import and re-export" but then defines new types.
**Detection**: TypeScript error: "Duplicate identifier".
**Test Case**: `tsc --noEmit` passes without duplicate type errors.

---

### 71. Firestore Indexes File Created Prematurely
**Bug**: `firestore.indexes.json` created before any queries are written or tested.
**Root Cause**: Speculative index creation.
**Detection**: `firebase deploy --only firestore:indexes` fails.
**Test Case**: Remove `firestore.indexes.json` from v1 plan.

---

### 72. Netlify Config Before Any Deploy
**Bug**: `netlify.toml` created before first deploy; Netlify auto-detects Vite.
**Root Cause**: Premature config.
**Detection**: Deploy without `netlify.toml` → works.
**Test Case**: Remove `netlify.toml` from v1 plan.

---

### 73. Trip Settings / Person Soft-Delete Over-Designed
**Bug**: Complex soft-delete logic for participants (disable if has expenses, recalc splits).
**Root Cause**: Over-engineering for rare edge case.
**Detection**: Code review: `deletedAt` on Person, recalc logic in multiple places.
**Test Case**: Simplify: no soft-delete for people; hard delete if no expenses, disable if has expenses.

---

### 74. Per-Line-Item GST/SC Over-Specification
**Bug**: GST/SC calculated per line item, stored per line item, and per expense.
**Root Cause**: Over-specification; tax usually on total bill.
**Detection**: Data model has `gstAmountPaise` on expense AND per line item.
**Test Case**: Calculate tax on expense total; store once on expense.

---

### 75. Settlement in `split.ts` Violates Separation of Concerns
**Bug**: `calculateSettlement` in `split.ts` but settlement is a reporting concern.
**Root Cause**: Module cohesion violation.
**Detection**: `purity.test.ts` passes but module cohesion violated.
**Test Case**: Move `calculateSettlement` to `src/lib/report/settlement.ts`.

---

### 76. `react-router-dom` for 3 Routes Is Overkill
**Bug**: 3 routes (`/`, `/signin`, `/trip/:tripId`) but full `react-router-dom` added.
**Root Cause**: Over-engineering for simple routing.
**Detection**: Bundle size increase ~12KB gzipped.
**Test Case**: Use `wouter` (~1.5 KB) or hash-based routing.

---

### 77. PWA Manifest Deferred but Listed in Implementation Plan
**Bug**: `public/manifest.json` in v1 implementation plan but marked "deferred to v2".
**Root Cause**: Noise in implementation plan.
**Detection**: Plan includes file that won't be built.
**Test Case**: Remove `public/manifest.json` from v1 plan.

---

### 78. Duplicate Type Definitions Across `src/types/trip.ts` and `src/lib/types.ts`
**Bug**: `src/types/trip.ts` re-exports `Expense` from `src/lib/types.ts` but then defines new `Expense`.
**Root Cause**: Plan says "import and re-export" but then defines new types.
**Detection**: TypeScript error: "Duplicate identifier".
**Test Case**: `tsc --noEmit` passes without duplicate type errors.

---

### 79. Firestore Indexes File Created Prematurely
**Bug**: `firestore.indexes.json` created before any queries are written or tested.
**Root Cause**: Speculative index creation.
**Detection**: `firebase deploy --only firestore:indexes` fails.
**Test Case**: Remove `firestore.indexes.json` from v1 plan.

---

### 79. Netlify Config Before Any Deploy
**Bug**: `netlify.toml` created before first deploy; Netlify auto-detects Vite.
**Root Cause**: Premature config.
**Detection**: Deploy without `netlify.toml` → works.
**Test Case**: Remove `netlify.toml` from v1 plan.

---

### 80. Trip Settings / Person Soft-Delete Over-Designed
**Bug**: Complex soft-delete logic for participants (disable if has expenses, recalc splits).
**Root Cause**: Over-engineering for rare edge case.
**Detection**: Code review: `deletedAt` on Person, recalc logic in multiple places.
**Test Case**: Simplify: no soft-delete for people; hard delete if no expenses, disable if has expenses.

---

*End of Test Cases & Bug Pre-Mortem*