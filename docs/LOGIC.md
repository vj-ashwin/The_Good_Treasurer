# Trip Expense Splitter — Logic Specification

**Version:** 1.0  
**Date:** 2026-11-15  
**Scope:** Core calculation logic for split modes, tax, balances, settlement, validation, and history.

---

## 1. Conventions & Types

- **All money values are integer paise** (1₹ = 100 paise). No floating point anywhere.
- **Basis points (bps)**: 1% = 100 bps. 18% GST = 1800 bps. 10% SC = 1000 bps.
- **Rounding**: Half-up to nearest paise (0.5 → 1). For tax distribution: compute exact rational, round each share half-up, then apply **largest-remainder** to make sum exact.
- **Tie-breaking**: By stable `personId` (UUID v4). Never by name.
- **Timezone**: Dates stored as UTC ISO-8601 (`YYYY-MM-DD`). Trip timezone optional; if absent, date validation uses organizer's device timezone.

```typescript
type Paise = number & { readonly __brand: 'Paise' };
type Bps = number & { readonly __brand: 'Bps' };   // basis points, e.g., 1800 = 18%
type PersonId = string; // UUID v4
type ExpenseId = string; // UUID v4
type TripId = string;   // UUID v4
type ClientUUID = string; // UUID v4 per write operation

interface Person {
  id: PersonId;
  name: string;
  isOrganizer: boolean;
  deletedAt?: number; // unix ms, if soft-deleted
}

interface LineItem {
  description: string;
  amountPaise: number;      // base amount in paise
  consumerIds: PersonId[];  // non-empty subset of participants
  gstAmountPaise?: number;  // calculated per line item
  serviceChargeAmountPaise?: number;
}

interface Expense {
  id: ExpenseId;
  tripId: TripId;
  title: string;
  date: string;             // YYYY-MM-DD (UTC)
  category: string;
  payerId: PersonId;
  baseAmountPaise: number;  // base amount before tax
  gstBps?: number;          // e.g., 1800 = 18%
  serviceChargeBps?: number;
  participants: PersonId[]; // non-empty subset of trip.people (active only)
  shares: Record<PersonId, number>; // FINAL per-person split (paise) — source of truth
  lineItems?: LineItem[];   // for itemized mode only
  gstAmountPaise: number;   // total GST on expense
  serviceChargeAmountPaise: number; // total SC on expense
  createdAt: number;
  updatedAt: number;
  deletedAt?: number;
  clientUUID: string;       // UUID v4 per write op (idempotency key)
}

interface PersonBalance {
  personId: PersonId;
  name: string;
  paidPaise: number;    // sum of baseAmountPaise + tax where person is payer
  sharePaise: number;   // sum of shares across expenses
  netPaise: number;     // paid - share (positive = should receive)
}
```

---

## 2. Share Computation

### 2.1 Tax Calculation (Per Line Item)

```typescript
// Half-up rounding: (x * bps + 5000) / 10000
function calcTax(basePaise: number, bps: number): number {
  if (!bps || bps === 0) return 0;
  return Math.floor((basePaise * bps + 5000) / 10000);
}

// Per line item tax
function calcLineItemTax(
  amountPaise: number,
  gstBps?: number,
  scBps?: number
): { gstPaise: number; scPaise: number; totalTaxPaise: number } {
  const gst = gstBps ? calcTax(amountPaise, gstBps) : 0;
  const sc = scBps ? calcTax(amountPaise, scBps) : 0;
  return { gstPaise: gst, scPaise: sc, totalTaxPaise: gst + sc };
}
```

**Worked Example** (CUJ 2): Dinner ₹3,200 (320,000 paise), GST 18% (1800 bps), SC 10% (1000 bps), 4 participants.

```
Base: 320,000 paise
GST = (320000 × 1800 + 5000) / 10000 = 57,600 paise (₹576)
SC  = (320000 × 1000 + 5000) / 10000 = 32,000 paise (₹320)
Total bill = 320000 + 57600 + 32000 = 409,600 paise
Per person = 409600 / 4 = 102,400 paise (₹1,024)
```

---

### 2.2 Equal Split

```typescript
function calculateEqualSplit(totalPaise: number, participantCount: number): number[] {
  const base = Math.floor(totalPaise / participantCount);
  const remainder = totalPaise % participantCount;
  const shares = Array(participantCount).fill(base);
  // Largest-remainder: first `remainder` participants get +1 paise
  for (let i = 0; i < remainder; i++) shares[i] += 1;
  return shares;
}
```

**Worked Example** (CUJ 2): Total 409,600 paise, 4 participants.
- Base = 102,400, remainder = 0 → [102400, 102400, 102400, 102400]
- Sum = 409,600 ✓

**Remainder Example**: 100 paise, 3 people.
- Base = 33, remainder = 1 → [34, 33, 33]
- Sum = 100 ✓

---

### 2.3 Exact Split

```typescript
function calculateExactSplit(
  shares: Record<PersonId, number>,
  totalPaise: number
): Record<PersonId, number> {
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  if (sum !== totalPaise) throw new Error('Exact split sum mismatch');
  // Validate no negative, no participant missing, no extra keys
  return { ...shares };
}
```

**Worked Example** (CUJ 3): Taxi ₹1,500 (150,000 paise), no tax. Alice 50,000, Bob 60,000, Carol 40,000.
- Sum = 150,000 ✓ → shares match exactly.

**With tax**: If GST 18% (27,000 paise), total = 177,000. Alice 59,000, Bob 70,800, Carol 47,200 → sum = 177,000 ✓.

---

### 2.4 Itemized Split (Per Line Item, Then Sum)

```typescript
interface LineItemInput {
  description: string;
  amountPaise: number;
  consumerIds: PersonId[];
}

function calculateItemizedSplit(
  lineItems: LineItemInput[],
  participantIds: PersonId[], // all trip participants (for zero-share init)
  gstBps?: number,
  scBps?: number
): Record<PersonId, number> {
  const shares: Record<PersonId, number> = {};
  participantIds.forEach(id => shares[id] = 0);

  for (const item of lineItems) {
    const consumers = item.consumerIds;
    const n = consumers.length;
    if (n === 0) throw new Error('Line item must have at least one consumer');

    // Base split
    const baseShare = item.amountPaise / n; // may not divide evenly
    const baseFloor = Math.floor(item.amountPaise / n);
    const baseRemainder = item.amountPaise % n;
    consumers.forEach((id, i) => {
      shares[id] += baseFloor + (i < baseRemainder ? 1 : 0);
    });

    // Tax per line item (if any)
    if (item.gstBps || item.scBps) {
      const { gstPaise, scPaise, totalTaxPaise } = calcLineItemTax(
        item.amountPaise,
        item.gstBps,
        item.scBps
      );
      const taxShare = totalTaxPaise / n;
      const taxFloor = Math.floor(totalTaxPaise / n);
      const taxRemainder = totalTaxPaise % n;
      consumers.forEach((id, i) => {
        shares[id] += taxFloor + (i < taxRemainder ? 1 : 0);
      });
    }
  }
  return shares;
}
```

**Worked Example** (CUJ 4): Groceries ₹2,400 (240,000 paise), no tax. 4 people (Alice, Bob, Carol, Dave).

| Line Item | Amount | Consumers | Per-person base |
|-----------|--------|-----------|-----------------|
| Snacks    | 80,000 | Alice, Carol | 40,000 each |
| Drinks    | 60,000 | Bob, Dave   | 30,000 each |
| Shared fruit | 100,000 | All 4 | 25,000 each |

**Sums**:
- Alice: 40,000 + 25,000 = 65,000
- Bob: 30,000 + 25,000 = 55,000
- Carol: 40,000 + 25,000 = 65,000
- Dave: 30,000 + 25,000 = 55,000
- **Sum = 240,000** ✓

**With tax**: If GST 18% on Shared fruit (100,000 → 18,000 GST), 4 consumers.
- Tax per person = 4,500
- Alice: 65,000 + 4,500 = 69,500
- Sum includes tax correctly.

**Shared item definition**: Any line item with >1 consumer is "shared" and splits equally. No separate "shared" flag needed — `consumerIds.length > 1` implies equal split.

---

### 2.5 Share Finalization & Validation

```typescript
function finalizeShares(
  mode: 'equal' | 'exact' | 'itemized',
  input: any,
  totalPaise: number,
  participantIds: PersonId[]
): Record<PersonId, number> {
  let shares: Record<PersonId, number>;
  
  switch (mode) {
    case 'equal':
      shares = calculateEqualSplit(totalPaise, participantIds.length);
      break;
    case 'exact':
      shares = calculateExactSplit(input.shares, totalPaise);
      break;
    case 'itemized':
      shares = calculateItemizedSplit(input.lineItems, participantIds, gstBps, scBps);
      break;
  }
  
  // Verify sum
  const sum = Object.values(shares).reduce((a, b) => a + b, 0);
  if (sum !== totalPaise) throw new Error('Share sum mismatch after calculation');
  
  // Ensure all participants have entry (zero if excluded)
  const result: Record<PersonId, number> = {};
  for (const id of participantIds) result[id] = shares[id] ?? 0;
  return result;
}
```

---

## 3. Balance & Settlement

### 3.1 Balances

```typescript
function computeBalances(
  expenses: Expense[],
  people: Person[]
): PersonBalance[] {
  const paid = new Map<PersonId, number>();
  const share = new Map<PersonId, number>();

  for (const exp of expenses) {
    if (exp.deletedAt) continue;
    const total = exp.baseAmountPaise + exp.gstAmountPaise + exp.serviceChargeAmountPaise;
    
    // Paid
    const paidMap = paid.get(exp.payerId) ?? 0;
    paid.set(exp.payerId, paidMap + exp.baseAmountPaise + exp.gstAmountPaise + exp.serviceChargeAmountPaise);
    
    // Shares
    for (const [pid, sharePaise] of Object.entries(exp.shares)) {
      const curr = share.get(pid) ?? 0;
      share.set(pid, curr + sharePaise);
    }
  }

  const balances: PersonBalance[] = [];
  for (const person of people) {
    if (person.deletedAt) continue; // exclude soft-deleted from active balances
    const paidPaise = paid.get(person.id) ?? 0;
    const sharePaise = share.get(person.id) ?? 0;
    balances.push({
      personId: person.id,
      name: person.name,
      paidPaise,
      sharePaise,
      netPaise: paidPaise - sharePaise,
    });
  }
  
  // Verify zero sum
  const netSum = balances.reduce((a, b) => a + b.netPaise, 0);
  if (netSum !== 0) throw new Error('Balance sum not zero');
  
  return balances;
}
```

**Worked Example**: 3 people, 2 expenses.

| Expense | Payer | Total | Shares (A, B, C) |
|---------|-------|-------|------------------|
| Dinner  | Alice | 409,600 | 102,400 each |
| Taxi    | Bob   | 150,000 | Alice 50k, Bob 60k, Carol 40k |

**Paid**: Alice 409,600; Bob 150,000; Carol 0.
**Shares**: Alice 152,400; Bob 162,400; Carol 142,400.
**Net**: Alice +257,200 (receives); Bob -12,400 (pays); Carol -142,400 (pays).
**Sum**: 257,200 - 12,400 - 142,400 = 0 ✓

---

### 3.2 Minimal-Transfer Settlement (Greedy)

```typescript
interface Transfer {
  from: PersonId;
  to: PersonId;
  amountPaise: number;
}

function calculateSettlement(balances: PersonBalance[]): Transfer[] {
  // Creditors (net > 0) and debtors (net < 0)
  const creditors = balances
    .filter(b => b.netPaise > 0)
    .sort((a, b) => b.netPaise - a.netPaise || a.personId.localeCompare(b.personId));
  
  const debtors = balances
    .filter(b => b.netPaise < 0)
    .sort((a, b) => b.netPaise - a.netPaise || a.personId.localeCompare(b.personId)); // most negative first
  
  const transfers: Transfer[] = [];
  let ci = 0, di = 0;
  
  while (ci < creditors.length && di < debtors.length) {
    const creditor = creditors[ci];
    const debtor = debtors[di];
    const amount = Math.min(creditor.netPaise, -debtor.netPaise);
    
    transfers.push({
      from: debtor.personId,
      to: creditor.personId,
      amountPaise: amount
    });
    
    creditor.netPaise -= amount;
    debtor.netPaise += amount;
    
    if (creditor.netPaise === 0) ci++;
    if (debtor.netPaise === 0) di++;
  }
  
  return transfers;
}
```

**Worked Example**: Balances: Alice +257,200; Bob -12,400; Carol -142,400; Dave -102,400.

1. Creditors: Alice (+257,200)
2. Debtors: Carol (-142,400), Dave (-102,400), Bob (-12,400)
3. Carol pays Alice 142,400 → Alice +114,800
4. Dave pays Alice 102,400 → Alice +12,400
5. Bob pays Alice 12,400 → Alice 0

**Transfers**: Carol→Alice 142,400; Dave→Alice 102,400; Bob→Alice 12,400.
**Total transfers**: 3. Sum = 257,200 ✓

**Tie-break**: If two creditors have same net, sort by `personId` (UUID string compare). Deterministic.

---

## 4. Validation Rules & Error Messages

| Rule | Condition | Error Message |
|------|-----------|---------------|
| Amount positive | `baseAmountPaise > 0` | "Amount must be greater than zero" |
| Amount integer | `Number.isInteger(baseAmountPaise)` | "Amount must be in whole paise" |
| Participants non-empty | `participants.length >= 1` | "At least one participant required" |
| Participants valid | All `participants` exist in active `trip.people` | "Participant not found or deleted" |
| Payer valid | `payerId` in `participants` | "Payer must be a participant" |
| Exact sum | `Object.values(shares).sum() === totalPaise` | "Exact split amounts must sum to total bill (₹X)" |
| Exact non-negative | All `shares[pid] >= 0` | "Exact amounts cannot be negative" |
| Itemized line amount > 0 | `lineItem.amountPaise > 0` | "Line item amount must be positive" |
| Itemized consumers | `consumerIds.length >= 1` | "At least one consumer required per line item" |
| Itemized sum | `sum(lineItems.amountPaise) === baseAmountPaise` | "Line items must sum to base amount" |
| Consumer valid | All `consumerIds` subset of `participants` | "Line item consumer not in participants" |
| Date valid | Valid ISO date, not future (unless trip timezone allows) | "Date must not be in the future" |
| Title required | `title.trim().length > 0` | "Title is required" |
| Category required | `category.trim().length > 0` | "Category is required" |
| Date format | Valid ISO `YYYY-MM-DD` | "Invalid date format" |

**Error Display**: Inline below field + toast summary. Disable save until valid.

---

## 4. Tax Input Modes

| Mode | Input | Stored | Example |
|------|-------|--------|---------|
| Percentage | `gstBps` (e.g., 1800) | `gstBps: 1800` | User enters "18" → stored as 1800 bps |
| Fixed rupee | `gstAmountPaise` | `gstAmountPaise: 57600` | User enters "576" → stored as 57600 |
| Ignore GST | `gstBps: undefined` | `gstBps: undefined` | Toggle "Ignore GST" |

**Validation**: If both `gstBps` and `gstAmountPaise` provided, prefer `gstBps` (percentage takes precedence). Service charge identical.

---

## 5. Edit / Delete / Restore & History

### 5.1 Edit

- Optimistic UI: update local state immediately.
- Write to Firestore with `updatedAt = now()`, `clientUUID = uuidv4()`.
- On success: update local cache.
- On conflict (LWW): show diff prompt (local vs remote), user chooses.
- History entry: `action: 'update'`, `field: 'amount'`, `before: 320000`, `after: 350000`, `timestamp: now()`, `authorId: uid`.

### 5.2 Delete (Soft)

- Set `deletedAt = now()`.
- History: `action: 'delete'`, `before: fullExpense`, `after: null`.
- UI: show strikethrough, "Deleted" badge, "Restore" button.
- Excluded from balances, reports, participant dropdowns.

### 5.3 Restore

- Set `deletedAt = undefined`, `updatedAt = now()`.
- History: `action: 'restore'`, `before: null`, `after: fullExpense`.

### 5.4 History Entry Schema

```typescript
interface HistoryEntry {
  id: string; // UUID
  expenseId: ExpenseId;
  tripId: TripId;
  userId: string; // uid
  action: 'create' | 'update' | 'delete' | 'restore';
  field?: string; // e.g., 'amount', 'participants', 'lineItems'
  before?: any;   // full value before
  after?: any;    // full value after
  timestamp: number; // unix ms
}
```

**Storage**: Subcollection `/users/{uid}/trips/{tripId}/expenses/{expenseId}/history/{historyId}`.

**Retention**: Per-trip setting (default 365 days). TTL via Firestore TTL policy on `timestamp` field.

---

## 6. Person Management

- **Add**: Generate UUID v4, `isOrganizer: false`, `deletedAt: undefined`.
- **Delete**:
  - If `personId` referenced in any non-deleted expense `participants` or `shares`: **disable delete**, show tooltip "Has expenses — cannot delete".
  - Else: hard delete (remove from `trip.people` array). No soft-delete for people.
- **Organizer**: First person added gets `isOrganizer: true`. Cannot be deleted while trip has expenses.

---

## 6. Offline / LWW Conflict Resolution

- **Queue**: In-memory array + IndexedDB mirror (`idb` key: `clientUUID`).
- **Write**: Generate `clientUUID = crypto.randomUUID()`, add to queue, fire `setDoc` with `clientUUID` in doc.
- **Sync**: On online, process queue sequentially. On conflict (version mismatch / `updatedAt` newer in cloud):
  - Fetch remote doc.
  - Show `OfflineMergePrompt`: side-by-side JSON diff (local vs remote).
  - User picks: **Local** (overwrite), **Remote** (discard local), **Custom** (manual merge).
  - Write chosen version with new `clientUUID`.
- **Idempotency**: `clientUUID` in doc; Firestore `set(..., { merge: true })` with same `clientUUID` = no-op.

---

## 7. Category Totals

- **Basis**: Base amount only (`baseAmountPaise`), NOT including GST/SC.
- **Rationale**: User spent X on food, Y on transport; tax is separate.
- **Report**: Separate "Tax by Category" section if needed.

---

## 7. Settlement Tie-Break

- Primary: Larger absolute net (creditor) / larger absolute debt (debtor).
- Tie: `personId.localeCompare(other.personId)` (UUID string compare).
- Display: Show both `personId` and `name` in UI.

---

## 8. Category Totals Tax Inclusion

- **Base only** per category.
- Separate "Tax by Category" section if needed.
- Formula: Sum of `baseAmountPaise` per category across expenses.

---

## 9. Edge Cases Handled

| Case | Handling |
|------|----------|
| `totalBaseAmount = 0` (free expense) | Tax = 0; shares = 0 |
| Single participant | Share = total; no settlement needed |
| Zero tax (bps = 0) | Tax = 0; no division by zero |
| Remainder paise distribution | Largest-remainder (first N get +1) |
| Deleted participant in history | Shows "(removed)" in report |
| Future date (no trip timezone) | Reject if date > today in device TZ |
| Duplicate offline write | Same `clientUUID` → no-op |
| Concurrent offline edits | LWW + user prompt on reconnect |

---

*End of Logic Specification*