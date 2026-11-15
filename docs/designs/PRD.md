# Trip Expense Splitter — PRD

*   **Author:** The Good Treasurer Team
*   **Status:** Draft
*   **Date:** 2026-11-15

--------------------------------------------------------------------------------

## Overview

A personal trip expense splitter that lets a single organizer record expenses for a trip, split them among participants using multiple split modes, and generate a clear settlement report showing who pays whom. Built on React + Vite + TypeScript + Tailwind, with Firebase Auth (Google) and Firestore for persistence. Each user sees only their own trips, listed in a sidebar newest-first. Trips are saved permanently.

## The Problem

When traveling with friends or family, tracking who paid for what and figuring out who owes whom is tedious. Existing apps either require all participants to sign up, lack flexible split modes (equal / exact / itemized), don't handle taxes and service charges cleanly, or produce reports that are hard to share with non-technical people. This app solves it for a single organizer who does all the entry and just needs a clear, exportable settlement report.

## Goals

*   **G1: Single-organizer trips** — One Google-signed-in user creates and owns trips; no collaboration, no invites, no multi-user editing.
*   **G2: Flexible split modes** — Equal, Exact amounts (validated sum), and Itemized (line items with per-item consumers; shared items split equally among ticked consumers). All modes save to a unified `shares: { [personId]: number }` map.
*   **G3: Tax & service charge handling** — GST and service charge entered per bill. User can: (a) enter percentage + total bill cost, (b) enter rupee amounts directly for CGST/SGST/IGST, or (c) ignore GST entirely. Tax calculated per line item in integer paise/basis points so every rupee adds up cleanly.
*   **G4: Full change history** — Every expense edit shows who/what/when, before/after values, with soft delete and restore. History stored in separate subcollection `/expenses/{id}/history/`.
*   **G5: Clear settlement report** — Trip total, average per head, each person's total share / total paid / net send/receive, minimal-transfer who-pays-whom (greedy, largest debtor ↔ largest creditor, tie-break by person ID + name display), per-person expense breakdown, category totals. Exportable as multi-page PDF (via `@react-pdf/renderer`, data-driven). PNG export dropped for v1.
*   **G6: Trip lifecycle** — "Generate Report" button produces the settlement report; no locking. Users can edit expenses anytime, even after generating a report.
*   **G7: Offline-tolerant entry** — Organizer can add/edit expenses offline; changes sync when online. Conflict resolution: Last-Write-Wins with user confirmation prompt showing both versions (not field-level merge). Every offline write tagged with client UUID for idempotency.
*   **G8: Permanent trip list** — Sidebar shows all trips newest-first, never auto-deleted. Trip history retained 180 days–1 year in Firestore; anytime export (JSON + PDF).

## Non-Goals

*   Multi-user collaboration (no invites, no shared editing, no real-time sync between users)
*   AI features (no auto-categorization, no smart suggestions, no chat)
*   Multi-currency (INR only; amounts stored as integer paise)
*   Payment links / settlement collection (no UPI, Razorpay, Stripe integration)
*   Recurring expenses or templates
*   Receipt image upload/OCR
*   Group chat or comments on expenses
*   Trip locking/finalization (replaced by "Generate Report" — no editing lock)
*   Fixed category list (categories are user-defined free text)
*   PNG export (v1: PDF only via `@react-pdf/renderer`)
*   Field-level offline merge (replaced by LWW + user confirmation)

## Open Questions — **All Resolved**

| # | Question | Decision |
|---|----------|----------|
| **OQ1** | Itemized split — how are shared items split? | **Equal among ticked consumers** for each line item. User assigns exact amounts per person for food/itemized bills; shared items split equally among selected consumers. |
| **OQ2** | GST/service charge — how are they entered? | **Exclusive** — User can: (a) enter percentage + total bill cost, (b) enter rupee amounts directly for CGST/SGST/IGST, or (c) ignore GST entirely. Calculated per line item in integer paise/basis points so every rupee adds up cleanly. |
| **OQ3** | Minimal-transfer algorithm preference? | **Greedy** — match largest debtor to largest creditor, deterministic tie-break by person ID (stable) with name display. Runs entirely client-side (zero serverless CPU). Minimizes transaction count. |
| **OQ4** | Offline conflict resolution? | **Last-Write-Wins with user confirmation** — on reconnect, show diff prompt highlighting both versions; user chooses which version to keep (not field-level merge). Every offline write tagged with client UUID for idempotency. |
| **OQ5** | Trip finalization — what exactly locks? | **Nothing locks**. "Finalize" replaced by **Generate Report** button. No editing lock; users can edit anytime. |
| **OQ6** | Export format details? | **Multi-page PDF only** (via `@react-pdf/renderer`, data-driven). PNG export dropped for v1. |
| **OQ7** | Categories — fixed list or user-defined? | **Fully user-defined** — free-text category/title entry (optional quick-suggestions). |
| **OQ8** | Participant removal — what happens to their splits? | **Disable delete** if participant has expenses (preserves historical math). If no expenses, **soft delete**: keep for audit, exclude from future, recalculate active splits. |
| **OQ9** | Data retention / export? | **180-day–1-year** Firestore retention; sidebar trip history (chat-style); anytime export: JSON backup + PDF. |
| **OQ10** | Firestore cost & scale constraint? | **100% Spark (free) tier** — expenses nested under trips (`/trips/{tripId}/expenses/`) for single cheap query; local state caching; composite indexes accepted where needed; stay within 50K reads / 20K writes daily. |

## Critical User Journeys (CUJs)

### CUJ 1: Create a trip and add people

*   **Given**: User is signed in with Google, on the home screen with empty trip list
*   **When**: User clicks "New Trip", enters trip name, adds 4 people (including themselves), saves
*   **Then**: Trip appears at top of sidebar; clicking it shows empty expense list and the 4 people in the people section

### CUJ 2: Add an equal-split expense

*   **Given**: User is viewing a trip with 4 people
*   **When**: User adds expense "Dinner", ₹3,200, category Food, payer = self, all 4 participants, split mode = Equal, GST 18%, service charge 10%
*   **Then**: Expense appears in list; each person's share = ₹3,200 + ₹576 GST + ₹320 service = ₹4,096 / 4 = ₹1,024; report updates

### CUJ 3: Add an exact-amount split expense

*   **Given**: User is viewing a trip with 3 people (Alice, Bob, Carol)
*   **When**: User adds expense "Taxi", ₹1,500, payer = Alice, participants = all 3, split mode = Exact, enters Alice ₹500, Bob ₹600, Carol ₹400
*   **Then**: App validates sum = ₹1,500; expense saved; shares match entered amounts exactly

### CUJ 4: Add an itemized expense

*   **Given**: User is viewing a trip with 4 people
*   **When**: User adds expense "Groceries", ₹2,400, payer = Bob, split mode = Itemized, creates line items: "Snacks ₹800 (Alice, Carol)", "Drinks ₹600 (Bob, Dave)", "Shared fruit ₹1,000 (all 4)"
*   **Then**: Each line item's amount split equally among its ticked consumers; totals: Alice ₹800 + ₹250 = ₹1,050, Bob ₹300 + ₹250 = ₹550, Carol ₹800 + ₹250 = ₹1,050, Dave ₹300 + ₹250 = ₹550; sum = ₹2,400

### CUJ 5: View settlement report and export

*   **Given**: Trip with multiple expenses across 4 people
*   **When**: User opens Report tab
*   **Then**: Sees trip total, average per head, per-person share/paid/net, minimal-transfer who-pays-whom list (tie-break shows both name and ID), per-person expense breakdown, category totals; can click "Export PDF" (data-driven, `@react-pdf/renderer`)

### CUJ 6: Edit expense and view history

*   **Given**: Existing expense "Dinner ₹3,200"
*   **When**: User changes amount to ₹3,500, saves
*   **Then**: History shows "Amount changed from ₹3,200 to ₹3,500 by [user] at [timestamp]"; can click to restore previous value

### CUJ 7: Generate report (no lock)

*   **Given**: Trip with expenses, not finalized
*   **When**: User clicks "Generate Report"
*   **Then**: Settlement report displayed with all calculations; user can still edit expenses; clicking "Generate Report" again recalculates and shows updated report. Tie-break in settlement shows both person name and ID.

### CUJ 8: Offline entry and sync with LWW + user confirmation

*   **Given**: User is offline, viewing a trip
*   **When**: User adds new expense, edits existing one
*   **Then**: Changes saved locally with client UUID; when connectivity returns, changes sync to Firestore; if a document conflicts with newer cloud data, user sees a prompt showing both versions and chooses which to keep (not field-level merge). Duplicate writes ignored via client UUID.

--------------------------------------------------------------------------------

## Billzer.com Black-Box Observation Notes

### Observable Features, Screens, Inputs, Validations, Calculations

**Note**: As an AI, I cannot actually browse https://billzer.com/en/ or its /my/example/ page. The following is inferred from the user's description of their requirements and general knowledge of expense-splitting apps. Items marked with ⚠️ are assumptions that need verification.

#### Screens/Pages
1. **Landing/Login** — Google sign-in, persistent session
2. **Trip List (Sidebar)** — All trips, newest first, create new trip
3. **Trip Detail** — Tabs: Expenses / People / Report
4. **Expense List** — All expenses for the trip, sortable/filterable
5. **Add/Edit Expense Modal** — Title, date, category, payer, amount, participants, split mode
6. **Split Mode Selectors** — Equal / Exact / Itemized
7. **Itemized Split Builder** — Line items with amount, description, consumer checkboxes
8. **GST/Service Charge Input** — Per bill, percentage or fixed amount
9. **People Management** — Add/remove/edit names per trip
10. **Report/Settlement Screen** — Calculated shares, who-pays-whom, export buttons
11. **Expense History/Changelog** — Per-expense audit trail with restore
12. **Trip Finalize/Reopen** — Lock/unlock with confirmation

#### Inputs & Validations
- Trip name: required, non-empty, max length ~100 chars
- Person names: required, non-empty, unique per trip, max ~50 chars
- Expense title: required, non-empty
- Date: required, valid date, not future (or configurable)
- Category: required, from fixed list
- Payer: required, must be one of trip's people
- Amount: required, positive number, 2 decimal places max (paise precision)
- Participants: at least 1, subset of trip's people
- Split mode: required, one of Equal/Exact/Itemized
- Exact mode: sum of individual amounts must equal bill total (validation error if not)
- Itemized mode: each line item has amount > 0, at least 1 consumer ticked; sum of line items = bill total
- GST: percentage (0-100) or fixed amount; applied per bill
- Service charge: percentage or fixed amount; applied per bill
- Finalize: confirmation dialog, irreversible without explicit reopen

#### Calculations
- **Equal split**: (bill amount + GST + service charge) / participant count
- **Exact split**: use entered amounts directly; validate sum = bill amount
- **Itemized split**: for each line item, amount / consumer count; sum across line items per person
- **GST**: if percentage, (base amount × GST%) / 100; if fixed, use as-is
- **Service charge**: if percentage, (base amount × SC%) / 100; if fixed, use as-is
- **Person share**: sum of their portions across all expenses
- **Person paid**: sum of amounts where they are payer
- **Net**: paid - share (positive = should receive, negative = should pay)
- **Minimal transfers**: greedy algorithm — sort creditors (net > 0) and debtors (net < 0) by absolute value; match max creditor with max debtor; transfer min(|credit|, |debt|); repeat until all settled
- **Category totals**: sum of expense amounts (base, not including GST/SC?) per category

#### Excluded-from-expense handling
- People not in participants list for an expense have share = 0 for that expense
- They don't appear in that expense's split
- In report, their total share excludes that expense

### Unknown / Not Observable (Need Decisions) — **All Resolved in Open Questions Table Above**

| # | Unknown | Decision |
|---|---------|----------|
| 1 | Exact GST calculation base | Exclusive on base amount only; per line item in integer paise |
| 2 | Service charge base | Exclusive on base amount only; per line item in integer paise |
| 3 | Itemized shared-item split | Equal among ticked consumers |
| 4 | Minimal-transfer tie-breaking | By person ID (stable) with name display |
| 5 | Offline conflict resolution | Last-Write-Wins with user confirmation; client UUID for idempotency |
| 6 | Trip finalization scope | No lock — Generate Report only |
| 7 | Export layout specifics | Multi-page PDF only (data-driven, `@react-pdf/renderer`) |
| 8 | Category list | User-defined free text |
| 9 | Participant soft-delete behavior | Disable delete if has expenses; soft delete if none (excluded from math, kept in audit) |
| 10 | Data export format | JSON backup + PDF anytime |
| 11 | Maximum limits for performance | Designed for Spark free tier; expenses nested under trips |
| 12 | Real-time sync across devices | Read-once on mount; fire-and-forget writes; no real-time listeners |
| 13 | PWA/offline support level | In-memory offline queue + IndexedDB for durability; no Service Worker for v1 |
| 14 | Error handling for failed writes | Retry with exponential backoff; show toast; LWW conflict resolution |
| 15 | Analytics / telemetry | None (privacy-first) |

--------------------------------------------------------------------------------

## Technical Plan (Architecture)

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        React App (Vite)                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Auth      │  │   Trips     │  │   Expenses  │   ...       │
│  │   Context   │  │   Context   │  │   Context   │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                    │
│         ▼                ▼                ▼                    │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Firestore Service Layer                     │   │
│  │  (CRUD + Real-time listeners + Offline queue)           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                            │                                     │
│                            ▼                                     │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              Firebase (Auth + Firestore)                 │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Data Model (Firestore)

```
 /users/{uid}/
   trips/{tripId}
     - name: string
     - createdAt: timestamp
     - updatedAt: timestamp
     - people: Person[]              // { id, name, isOrganizer: boolean, deletedAt? }
   expenses/{expenseId}              // nested under trip: /trips/{tripId}/expenses/{expenseId}
     - title: string                 // user-defined free text
     - date: timestamp
     - category: string              // user-defined free text
     - payerId: string               // ref to person in trip
     - baseAmountPaise: number       // integer paise (base amount)
     - gstBps?: number               // GST in basis points (e.g., 1800 = 18%)
     - gstAmountPaise?: number       // calculated per line item
     - serviceChargeBps?: number     // service charge in basis points
     - serviceChargeAmountPaise?: number // calculated per line item
     - participants: string[]        // person IDs (subset of trip.people)
     - shares: { [personId]: number } // FINAL per-person split (paise) — unified for all modes
     - lineItems?: LineItem[]        // for itemized mode (optional, for re-editing)
       - description: string
       - amountPaise: number
       - consumerIds: string[]       // who had this item
       - gstAmountPaise?: number     // GST calculated per line item
       - serviceChargeAmountPaise?: number // SC calculated per line item
     - createdAt: timestamp
     - updatedAt: timestamp
     - deletedAt: timestamp?         // soft delete
     - clientUUID: string            // for offline idempotency
   history/{historyId}               // separate subcollection: /expenses/{expenseId}/history/{historyId}
     - expenseId: string
     - tripId: string
     - userId: string
     - action: 'create' | 'update' | 'delete' | 'restore'
     - field?: string
     - before?: any
     - after?: any
     - timestamp: timestamp
```

### Key Algorithms

**Split Calculation (Pure Functions in `src/lib/money/`)**
- `calculateEqualSplit(totalPaise, participantCount) → number[]`
- `calculateExactSplit(shares: { [personId]: number }, totalPaise) → { [personId]: number }` (validates sum)
- `calculateItemizedSplit(lineItems: LineItem[], participantIds: string[]) → { [personId]: number }`
  - Each line item split equally among its `consumerIds`
  - GST/SC calculated per line item in integer paise, split equally among that line item's consumers

**Settlement (Minimal Transfers)**
- Input: `{ [personId]: netPaise }` where positive = creditor, negative = debtor
- Output: `Transfer[]` where `Transfer = { from: personId, to: personId, amountPaise: number }`
- Algorithm: Greedy — sort creditors/net>0 and debtors/net<0 by absolute value descending; match max creditor with max debtor; transfer min(|credit|, |debt|); repeat. Tie-break: by person ID (stable), display name shown in UI.
- Runs entirely client-side; zero serverless function CPU.

**GST/Service Charge (Exclusive, Per Line Item)**
- `calculateTax(basePaise, gstBps, scBps) → { gstPaise, scPaise, totalTaxPaise }` (round half-up to nearest paise)
- Per line item: GST = amountPaise × gstBps / 10000; SC = amountPaise × scBps / 10000
- Each line item's tax split equally among that line item's consumers
- Person total share = sum of (lineItemShare + lineItemTaxShare) across all line items

### Offline Strategy

- **Read**: Read-once on mount (getDocs) when online; cached data when offline
- **Write**: Optimistic UI updates → in-memory queue + IndexedDB for durability → background sync to Firestore with exponential backoff
- **Conflict**: Last-Write-Wins on reconnect — when a document differs from cloud, show prompt with both versions; user chooses which to keep. Duplicate writes ignored via client UUID.

### Security Rules (Firestore)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/trips/{tripId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/trips/{tripId}/expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/trips/{tripId}/expenses/{expenseId}/history/{historyId} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid;
    }
  }
}
```

--------------------------------------------------------------------------------

## Alternatives Considered

### Alternative A: Multi-user collaborative trips (rejected)

*   **Pros**: Each participant can add their own expenses; real-time sync; less burden on organizer
*   **Cons**: Requires invite system, auth for all users, conflict resolution for concurrent edits, notification system, much higher complexity
*   **Reason for Rejection**: Explicitly out of scope per G1 (single organizer only)

### Alternative B: Client-side only (localStorage, no Firebase) (rejected)

*   **Pros**: No backend cost; fully offline; simpler auth
*   **Cons**: No cross-device sync; data loss on device loss; no permanent cloud backup
*   **Reason for Rejection**: User requirement for permanent trip list and cross-device access

### Alternative C: Single split mode (Equal only) (rejected)

*   **Pros**: Simpler UI, less code, fewer bugs
*   **Cons**: Real trips need exact and itemized splits (e.g., someone didn't drink, shared appetizer)
*   **Reason for Rejection**: User explicitly requires all three modes

### Alternative D: Server-side settlement calculation (Cloud Functions) (rejected)

*   **Pros**: Keeps logic off client; easier to audit
*   **Cons**: Added latency; cold starts; more infrastructure; pure functions are testable client-side
*   **Reason for Rejection**: Settlement math is pure and fast; client-side is fine for INR-only, small datasets

### Alternative E: Separate history collection vs embedded history array (chosen: separate subcollection)

*   **Pros (separate)**: Avoids document size limits (1 MiB), enables independent pagination, allows composite indexes for "all history for user" queries
*   **Pros (embedded)**: Atomic with expense; simpler queries; no extra index
*   **Reason for Choice**: Separate subcollection `/expenses/{id}/history/` — avoids 1 MiB doc limit, supports pagination, clean separation

--------------------------------------------------------------------------------

## Non-Functional Requirements

### Security & Privacy
- Firebase Auth with Google provider only
- Firestore rules enforce `request.auth.uid == uid` on all user data
- No analytics, no third-party scripts, no external API calls except Firebase
- Amounts stored as integer paise (no floating-point)

### Performance & Latency
- Trip list: < 500ms initial load (getDocs, not listeners)
- Expense list: < 300ms (getDocs, ~200 expenses max per trip)
- Report calculation: < 100ms client-side (pure functions)
- Offline writes: immediate UI update; background sync < 2s when online

### Rollout & Rollback
- No feature flags for core features
- Rollback: revert Firestore rules; no data migration needed for v1

### Accessibility
- WCAG 2.1 AA: semantic HTML, focus management, color contrast, ARIA labels
- Keyboard navigation for all modals and forms

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `src/types/trip.ts` (Create)
*   **Type**: TypeScript type definitions
*   **Proposed Changes**: Define `Trip`, `Person`, `Expense`, `LineItem`, `SplitMode`, `TripSettings`, `HistoryEntry`, `SettlementResult`, `Transfer`, `ReportData` interfaces. Import and re-export existing `Expense`/`NewExpense`/`ExpenseCategory` from `src/lib/types.ts` rather than redefining.

#### 2. `src/lib/money/split.ts` (Modify — extend existing)
*   **Type**: Pure money functions
*   **Proposed Changes**: Add `calculateEqualSplit`, `calculateExactSplit`, `calculateItemizedSplit`, `calculateSettlement` (minimal transfers), `calculateTax` functions; all return integer paise. Tax rates as constants (GST_BPS = 1800, SC_BPS = 1000) or passed as args. `calculateTax(basePaise, gstBps, scBps)` returns `{ gstPaise, scPaise, totalTaxPaise }`.

#### 3. `src/lib/money/split.test.ts` / `split.property.test.ts` (Modify)
*   **Type**: Unit + property tests
*   **Proposed Changes**: Test all split modes, settlement algorithm, tax calculations with property-based invariants. Purity guard must still pass.

#### 4. `src/lib/firebase/firestore.ts` (Create)
*   **Type**: Firestore service layer
*   **Proposed Changes**: CRUD for trips/expenses/history; read-once queries (no real-time listeners); simple getDocs/write patterns. No offline queue here.

#### 5. `src/hooks/useTrips.ts` (Create)
*   **Type**: React hook
*   **Proposed Changes**: `useTrips()` — fetches user's trips list (newest first) on mount; `useTrip(tripId)` — fetches single trip with expenses & people. Match `useAuth` callback pattern.

#### 6. `src/hooks/useExpenses.ts` (Create)
*   **Type**: React hook
*   **Proposed Changes**: `useExpenses(tripId)` — CRUD for expenses within a trip; optimistic updates; history tracking via separate history subcollection.

#### 7. `src/lib/offline/syncEngine.ts` (Create)
*   **Type**: Offline sync engine
*   **Proposed Changes**: IndexedDB-backed write queue; client UUID generation; LWW conflict detection; background sync with exponential backoff retry. Separated from data layer.

#### 8. `src/hooks/useOfflineQueue.ts` (Create)
*   **Type**: React hook
*   **Proposed Changes**: Exposes `{ queue: PendingWrite[]; conflicts: Conflict[]; resolveConflict(conflictId, resolution: 'local' | 'remote', customValue?): Promise<void> }`. Triggers `OfflineMergePrompt` component.

#### 9. `src/components/OfflineMergePrompt.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Modal with side-by-side diff for LWW conflicts; shows local vs remote values; user chooses Local / Remote / Custom. Accessible, keyboard-navigable.

#### 10. `src/components/TripSidebar.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Sidebar listing all trips newest-first; "New Trip" button; click to select; shows trip name, date, expense count.

#### 11. `src/components/TripHeader.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Trip name, "Generate Report" button, people count, expense count.

#### 12. `src/components/PeopleManager.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Add/edit/remove people for current trip; organizer included by default (`isOrganizer: true`); delete button disabled if participant has expenses (tooltip "Has expenses — cannot delete"); if no expenses, soft delete (keeps record for audit, excludes from future expenses).

#### 13. `src/components/ExpenseForm.tsx` (Modify — replace existing)
*   **Type**: React component
*   **Proposed Changes**: Multi-mode form: Equal (simple), Exact (dynamic fields per participant with sum validation), Itemized (line item builder: description, amount, consumer checkboxes per person; shared items split equally among ticked consumers); GST/SC inputs: user can enter percentage + total, or rupee amounts for CGST/SGST/IGST, or toggle "Ignore GST"; category & title as free-text inputs with optional datalist suggestions; date picker.

#### 14. `src/components/ExpenseList.tsx` (Modify — replace existing)
*   **Type**: React component
*   **Proposed Changes**: List expenses with title, date, category, amount, payer, split mode badge; click to edit; soft-delete with history button.

#### 15. `src/components/ExpenseHistory.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Modal/drawer showing chronological changes from history subcollection; before/after diff; restore button per entry.

#### 16. `src/components/ReportView.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Full settlement report: trip total, average per head, per-person cards (share/paid/net), minimal-transfer list (greedy, largest debtor↔largest creditor, tie-break by person ID, display name + ID), per-person expense breakdown, category totals; "Export PDF" button (`@react-pdf/renderer`, data-driven).

#### 17. `src/lib/export/report.ts` (Create)
*   **Type**: Export utilities
*   **Proposed Changes**: `exportReportAsPDF(reportData: ReportData, options?: { pageSize?: 'a4' | 'letter'; margin?: number }): Promise<Blob>` using `@react-pdf/renderer`. No `html2canvas`/`jsPDF`. Print-optimized layout separate from screen UI.

#### 18. `src/hooks/useAuth.ts` (Modify — existing)
*   **Type**: React hook
*   **Proposed Changes**: Ensure pattern matches new hooks (callback-based state object).

#### 19. `src/App.tsx` (Modify)
*   **Type**: Root component
*   **Proposed Changes**: Route structure: `/` → `TripListPage` (sidebar + empty state or selected trip preview); `/trip/:tripId` → `TripDetailPage` with tabs (`ExpensesTab`, `PeopleTab`, `ReportTab`); auth guard redirects to `/signin` if no user. Uses `react-router-dom`.

#### 20. `src/routes.ts` (Create)
*   **Type**: Route constants
*   **Proposed Changes**: `ROUTES = { HOME: '/', SIGN_IN: '/signin', TRIP: (tripId: string) => `/trip/${tripId}` }`

#### 21. `src/lib/format.ts` (Modify — extend existing)
*   **Type**: Formatting utilities
*   **Proposed Changes**: Add `formatTripDateRange`, `formatRelativeTime`, `formatPersonName` (with "(organizer)" badge).

#### 22. `firestore.rules` (Create)
*   **Type**: Security rules
*   **Proposed Changes**: Per-user isolation rules for trips, expenses (nested), history (nested). No TTL in rules.

#### 23. `firestore.indexes.json` (Create)
*   **Type**: Firestore composite indexes
*   **Proposed Changes**: Define any composite indexes needed (e.g., expenses by trip + date).

#### 24. `netlify.toml` (Create)
*   **Type**: Netlify config
*   **Proposed Changes**: Build command, publish directory, headers for SPA, redirects.

#### 25. `public/manifest.json` (Create)
*   **Type**: PWA manifest (deferred to v2, minimal for now)
*   **Proposed Changes**: App name, icons (192×192, 512×512, maskable), display: standalone, theme color.

#### 26. `.nvmrc` (Create)
*   **Type**: Node version pin
*   **Proposed Changes**: `20` (current LTS)

### Verification Plan

*   **Compilation/Build**: `npm run build` (tsc + vite) — zero errors, zero warnings
*   **Lint**: `npm run lint` (oxlint) — zero errors; warnings only if suppressed with inline comment and justification
*   **Unit Tests**: `npm test` (vitest) — target 90%+ coverage on `src/lib/money/`; all split modes, settlement, tax calculations covered
*   **Property Tests**: `npm test` — all fast-check properties pass (split conservation, settlement invariants, tax round-trip)
*   **Static Analysis**: TypeScript strict mode, no `any` in money module, no Firebase/React imports in money module
*   **Purity Guard**: `src/lib/money/purity.test.ts` passes (no forbidden imports)
*   **E2E/Integration**: Manual testing checklist for all 8 CUJs:
    1. Create trip + add people
    2. Equal-split expense with GST/SC
    3. Exact-split expense with validation
    4. Itemized expense with shared items + per-line-item GST/SC
    5. Report view + PDF export
    6. Edit expense + history restore
    7. Generate report (no lock) + re-generate after edit
    8. Offline add/edit + LWW conflict prompt on reconnect
*   **Spark Tier Load Test**: Manual verification — use Firebase Emulator + script to write 10K expenses across 50 trips; measure reads/writes via emulator logs; assert < 50K reads / 20K writes daily

--------------------------------------------------------------------------------

*Drafted with EGM*