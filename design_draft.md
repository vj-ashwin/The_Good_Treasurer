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
*   **G2: Flexible split modes** — Equal, Exact amounts (validated sum), and Itemized (line items with per-item consumers; shared items split among those who had them).
*   **G3: Tax & service charge handling** — GST and service charge entered per bill, split equally among that bill's participants.
*   **G4: Full change history** — Every expense edit shows who/what/when, before/after values, with soft delete and restore.
*   **G5: Clear settlement report** — Trip total, average per head, each person's total share / total paid / net send/receive, minimal-transfer who-pays-whom, per-person expense breakdown, category totals. Exportable as image/PDF.
*   **G6: Trip lifecycle** — "Finalize trip" locks editing; reopen is possible and logged.
*   **G7: Offline-tolerant entry** — Organizer can add/edit expenses offline; changes sync when online.
*   **G8: Permanent trip list** — Sidebar shows all trips newest-first, never auto-deleted.

## Non-Goals

*   Multi-user collaboration (no invites, no shared editing, no real-time sync between users)
*   AI features (no auto-categorization, no smart suggestions, no chat)
*   Multi-currency (INR only; amounts stored as integer paise)
*   Payment links / settlement collection (no UPI, Razorpay, Stripe integration)
*   Recurring expenses or templates
*   Receipt image upload/OCR
*   Group chat or comments on expenses

## Open Questions

*   **OQ1: Itemized split — how are shared items split?** Equally among selected consumers? By custom weights? (Default assumption: equally among ticked consumers for that line item.)
*   **OQ2: GST/service charge — inclusive or exclusive?** Does the entered amount already include GST, or is GST added on top? (Default assumption: exclusive — entered GST % is calculated on the base amount and added.)
*   **OQ3: Minimal-transfer algorithm — any preference?** Standard greedy (max creditor pays max debtor) or a different heuristic? (Default: greedy with tie-breaking by name.)
*   **OQ4: Offline conflict resolution?** Last-write-wins per field? Merge strategy? (Default: last-write-wins per expense document; user can review history.)
*   **OQ5: Trip finalization — what exactly locks?** All expenses? People list? Categories? (Default: all editing locked; only "Reopen" action available.)
*   **OQ6: Export format details?** Image = PNG of report? PDF = multi-page with specific layout? (Default: both; PDF uses same visual layout as screen.)
*   **OQ7: Categories — fixed list or user-defined?** (Default: fixed list matching common trip categories: Food, Transport, Accommodation, Activities, Shopping, Other.)
*   **OQ8: Participant removal — what happens to their splits?** (Default: soft delete participant; their historical shares remain in report; they can't be added to new expenses.)
*   **OQ9: Data retention / export?** GDPR/IT Act compliance? User can request full data export? (Default: yes, JSON export of all trips.)
*   **OQ10: Firestore index costs at scale?** Estimated read/write costs for a user with 50 trips × 200 expenses? (Need to model.)

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
*   **Then**: Sees trip total, average per head, per-person share/paid/net, minimal-transfer who-pays-whom list, per-person expense breakdown, category totals; can click "Export PNG" and "Export PDF"

### CUJ 6: Edit expense and view history

*   **Given**: Existing expense "Dinner ₹3,200"
*   **When**: User changes amount to ₹3,500, saves
*   **Then**: History shows "Amount changed from ₹3,200 to ₹3,500 by [user] at [timestamp]"; can click to restore previous value

### CUJ 7: Finalize and reopen trip

*   **Given**: Trip with expenses, not finalized
*   **When**: User clicks "Finalize Trip", confirms
*   **Then**: All editing disabled; "Reopen Trip" button appears; clicking it re-enables editing and logs the reopen event in history

### CUJ 8: Offline entry and sync

*   **Given**: User is offline, viewing a trip
*   **When**: User adds new expense, edits existing one
*   **Then**: Changes saved locally; when connectivity returns, changes sync to Firestore; conflicts resolved per OQ4 policy

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

### Unknown / Not Observable (Need Decisions)

| # | Unknown | How to Decide |
|---|---------|---------------|
| 1 | Exact GST calculation base (on amount before/after service charge?) | Define in PRD; default: GST on base amount only |
| 2 | Service charge base (on amount before/after GST?) | Define in PRD; default: SC on base amount only |
| 3 | Itemized shared-item split: equal vs weighted | User preference; default equal |
| 4 | Minimal-transfer tie-breaking | Default: alphabetical by name |
| 5 | Offline conflict resolution strategy | Default: last-write-wins per document |
| 6 | Trip finalization scope (what exactly locks) | Default: all editing |
| 7 | Export layout specifics | Default: match screen report |
| 8 | Category list (fixed vs custom) | Default: fixed common categories |
| 9 | Participant soft-delete behavior on historical reports | Default: retain historical shares |
| 10 | Data export format (JSON structure) | Define schema in PRD |
| 11 | Maximum trip/expense/people limits for performance | Define based on Firestore quotas |
| 12 | Real-time sync across devices for same user | Default: yes, via Firestore listeners |
| 13 | PWA/offline support level (Service Worker scope) | Default: cache shell + IndexedDB for writes |
| 14 | Error handling for failed Firestore writes | Default: retry with exponential backoff; show toast |
| 15 | Analytics / telemetry | Default: none (privacy-first) |

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
    - finalized: boolean
    - finalizedAt: timestamp?
    - people: Person[]
    - settings: TripSettings
  expenses/{expenseId}
    - tripId: string
    - title: string
    - date: timestamp
    - category: string
    - payerId: string (ref to person in trip)
    - amountPaise: number (integer paise)
    - gstPercent?: number
    - gstAmountPaise?: number
    - serviceChargePercent?: number
    - serviceChargeAmountPaise?: number
    - splitMode: 'equal' | 'exact' | 'itemized'
    - participants: string[] (person IDs)
    - exactShares?: { [personId]: number }  // paise, for exact mode
    - lineItems?: LineItem[]                // for itemized mode
    - createdAt: timestamp
    - updatedAt: timestamp
    - deletedAt: timestamp?                 // soft delete
    - history: HistoryEntry[]
  history/{historyId}                       // optional separate collection for queryability
    - expenseId: string
    - tripId: string
    - userId: string
    - action: 'create' | 'update' | 'delete' | 'restore' | 'finalize' | 'reopen'
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

**Settlement (Minimal Transfers)**
- Input: `{ [personId]: netPaise }` where positive = creditor, negative = debtor
- Output: `Transfer[]` where `Transfer = { from: personId, to: personId, amountPaise: number }`
- Algorithm: Greedy matching of max creditor with max debtor

**GST/Service Charge**
- `calculateTax(basePaise, percent) → taxPaise` (round half-up to nearest paise)
- Applied per bill, split equally among that bill's participants

### Offline Strategy

- **Read**: Firestore real-time listeners when online; cached data when offline
- **Write**: Optimistic UI updates → IndexedDB queue → background sync to Firestore
- **Conflict**: Last-write-wins per expense document (timestamp-based); history preserves both versions

### Security Rules (Firestore)

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /users/{uid}/trips/{tripId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/expenses/{expenseId} {
      allow read, write: if request.auth != null && request.auth.uid == uid;
    }
    match /users/{uid}/history/{historyId} {
      allow read: if request.auth != null && request.auth.uid == uid;
      allow write: if request.auth != null && request.auth.uid == uid; // only via backend functions
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

### Alternative E: Separate history collection vs embedded history array (chosen: embedded)

*   **Pros (embedded)**: Atomic with expense; simpler queries; no extra index
*   **Pros (separate)**: Easier to query "all history for user"; can paginate independently
*   **Reason for Choice**: Embedded in expense document; history is per-expense and rarely exceeds 50 entries

--------------------------------------------------------------------------------

## Non-Functional Requirements

### Security & Privacy
- Firebase Auth with Google provider only
- Firestore rules enforce `request.auth.uid == uid` on all user data
- No analytics, no third-party scripts, no external API calls except Firebase
- Amounts stored as integer paise (no floating-point)

### Performance & Latency
- Trip list: < 500ms initial load (Firestore listener)
- Expense list: < 300ms (real-time listener, ~200 expenses max per trip)
- Report calculation: < 100ms client-side (pure functions)
- Offline writes: immediate UI update; background sync < 2s when online

### Rollout & Rollback
- Feature flag: `offline_enabled`, `history_enabled`, `export_pdf_enabled`
- Rollback: revert Firestore rules; disable feature flags; no data migration needed for v1

### Accessibility
- WCAG 2.1 AA: semantic HTML, focus management, color contrast, ARIA labels
- Keyboard navigation for all modals and forms

--------------------------------------------------------------------------------

## Detailed Implementation Plan

### Target Files to Create/Modify

#### 1. `src/types/trip.ts` (Create)
*   **Type**: TypeScript type definitions
*   **Proposed Changes**: Define `Trip`, `Person`, `Expense`, `LineItem`, `SplitMode`, `TripSettings`, `HistoryEntry`, `SettlementResult`, `Transfer`, `ReportData` interfaces

#### 2. `src/lib/money/split.ts` (Modify — extend existing)
*   **Type**: Pure money functions
*   **Proposed Changes**: Add `calculateEqualSplit`, `calculateExactSplit`, `calculateItemizedSplit`, `calculateSettlement` (minimal transfers), `calculateTax` functions; all return integer paise

#### 3. `src/lib/money/split.test.ts` / `split.property.test.ts` (Modify)
*   **Type**: Unit + property tests
*   **Proposed Changes**: Test all split modes, settlement algorithm, tax calculations with property-based invariants

#### 4. `src/lib/firebase/firestore.ts` (Create)
*   **Type**: Firestore service layer
*   **Proposed Changes**: CRUD for trips/expenses/history; real-time listeners; offline queue with IndexedDB; sync logic

#### 5. `src/hooks/useTrips.ts` (Create)
*   **Type**: React hook
*   **Proposed Changes**: `useTrips()` — subscribes to user's trips list (newest first); `useTrip(tripId)` — subscribes to single trip with expenses & people

#### 6. `src/hooks/useExpenses.ts` (Create)
*   **Type**: React hook
*   **Proposed Changes**: `useExpenses(tripId)` — CRUD for expenses within a trip; optimistic updates; history tracking

#### 6. `src/components/TripSidebar.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Sidebar listing all trips newest-first; "New Trip" button; click to select; shows trip name, date, finalized badge

#### 7. `src/components/TripHeader.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Trip name, "Finalize"/"Reopen" button, people count, expense count

#### 8. `src/components/PeopleManager.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Add/edit/remove people for current trip; organizer included by default; soft-delete participants

#### 9. `src/components/ExpenseForm.tsx` (Modify — replace existing)
*   **Type**: React component
*   **Proposed Changes**: Multi-mode form: Equal (simple), Exact (dynamic fields per participant with sum validation), Itemized (line item builder with consumer checkboxes); GST/SC inputs; category select; date picker

#### 10. `src/components/ExpenseList.tsx` (Modify — replace existing)
*   **Type**: React component
*   **Proposed Changes**: List expenses with title, date, category, amount, payer, split mode badge; click to edit; swipe/delete with soft-delete; history button

#### 11. `src/components/ExpenseHistory.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Modal/drawer showing chronological changes for an expense; before/after diff; restore button per entry

#### 12. `src/components/ReportView.tsx` (Create)
*   **Type**: React component
*   **Proposed Changes**: Full settlement report: trip total, average per head, per-person cards (share/paid/net), minimal-transfer list, per-person expense breakdown, category totals; Export PNG/PDF buttons

#### 13. `src/lib/export/report.ts` (Create)
*   **Type**: Export utilities
*   **Proposed Changes**: `exportReportAsPNG(reportData)`, `exportReportAsPDF(reportData)` using html2canvas + jsPDF

#### 14. `src/hooks/useOfflineQueue.ts` (Create)
*   **Type**: React hook
*   **Proposed Changes**: IndexedDB-backed write queue; online/offline detection; background sync with retry/backoff

#### 15. `src/App.tsx` (Modify)
*   **Type**: Root component
*   **Proposed Changes**: Route structure: `/` → trip list + sidebar; `/trip/:tripId` → trip detail with tabs (Expenses, People, Report); auth guard

#### 16. `firestore.rules` (Create)
*   **Type**: Security rules
*   **Proposed Changes**: Per-user isolation rules as specified above

#### 17. `netlify.toml` (Create)
*   **Type**: Netlify config
*   **Proposed Changes**: Build command, publish directory, headers for PWA, redirects for SPA

#### 18. `public/manifest.json` (Create)
*   **Type**: PWA manifest
*   **Proposed Changes**: App name, icons, display: standalone, theme color

### Verification Plan

*   **Compilation/Build**: `npm run build` (tsc + vite)
*   **Lint**: `npm run lint` (oxlint)
*   **Unit Tests**: `npm test` (vitest) — target 90%+ coverage on `src/lib/money/`
*   **Property Tests**: `npm test` — all fast-check properties pass
*   **Static Analysis**: TypeScript strict mode, no `any` in money module
*   **E2E/Integration**: Manual testing checklist for all 8 CUJs

--------------------------------------------------------------------------------

*Drafted with EGM*