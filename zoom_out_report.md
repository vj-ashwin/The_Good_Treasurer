# Zoom-Out Review Report

**Target:** `docs/designs/PRD.md` (full document)

---

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| zoom-out | completed |

---

## Prioritized Findings (Blockers → Major → Nits)

### 1. Over-Engineered Offline Sync Architecture — Severity: 🔴 Blocker
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 273–278 (Offline Strategy), Lines 387–398 (syncEngine, useOfflineQueue, OfflineMergePrompt)
* **Discrepancy Description**: The PRD specifies a full custom offline sync engine with IndexedDB-backed write queue, client UUID generation, LWW conflict detection, exponential backoff retry, and a dedicated conflict resolution UI modal. This is a massive amount of infrastructure for a single-organizer personal app on the Spark free tier.
* **Rationale & Recommendation**: 
  - Firestore SDK already provides offline persistence (enableIndexedDbPersistence) and automatic queueing of writes when offline.
  - LWW conflict resolution can be handled by Firestore's built-in `serverTimestamp()` + simple timestamp comparison on read, without a custom engine.
  - The "user confirmation prompt showing both versions" requirement adds significant UX complexity for an edge case that is extremely rare in single-user, single-device scenarios.
  - **Recommendation**: Drop the custom sync engine. Use Firestore's native offline persistence. On reconnect, if a write fails due to version conflict, show a simple toast "Sync conflict — please refresh" and let the user re-enter. This eliminates ~5 files and hundreds of lines of custom code.

---

### 2. Separate History Subcollection Adds Unnecessary Complexity — Severity: 🔴 Blocker
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 241–250 (Data Model), Line 419–422 (ExpenseHistory component), Line 291–294 (Security Rules)
* **Discrepancy Description**: History is modeled as a separate subcollection `/expenses/{id}/history/` with its own document structure, security rules, and dedicated UI component. This requires composite indexes, separate queries, and additional read/write costs.
* **Rationale & Recommendation**: 
  - For a personal app with ~200 expenses/trip, an embedded `history: HistoryEntry[]` array on the expense document stays well under the 1 MiB limit (each history entry ~200 bytes; 50 edits = 10 KB).
  - Embedded history enables atomic reads/writes, no extra indexes, and simpler queries (single document fetch).
  - The PRD's justification ("avoids 1 MiB doc limit, supports pagination") is premature optimization — pagination is unnecessary for per-expense audit trails.
  - **Recommendation**: Embed history array on the expense document. Remove the history subcollection, ExpenseHistory component becomes a simple array map, security rules simplify to one rule.

---

### 3. Per-Line-Item GST/SC Calculation Over-Specifies the Model — Severity: 🟡 Major
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 21–22, 47–48, 225–236, 267–271, CUJ 2, 4
* **Discrepancy Description**: The PRD mandates GST and service charge calculated per line item in integer paise/basis points, with per-line-item tax fields stored in Firestore (`gstAmountPaise`, `serviceChargeAmountPaise` on each LineItem). This bloats the data model and complicates the split logic.
* **Rationale & Recommendation**: 
  - In Indian context, GST is typically on the total bill, not per line item. Service charge is also usually on the total.
  - Storing tax per line item adds 2 extra integer fields per line item × N line items.
  - The "per-line-item" requirement appears to be a solution in search of a problem — the user said "tax calculated per line item" but the actual need is "totals add up cleanly."
  - **Recommendation**: Calculate tax on the expense total (baseAmountPaise × gstBps / 10000). Store `gstAmountPaise` and `serviceChargeAmountPaise` once on the expense. Split the total (base + tax) using the unified shares map. This removes per-line-item tax fields and simplifies `calculateTax` to a single call per expense.

---

### 4. Settlement Algorithm in `split.ts` Violates Separation of Concerns — Severity: 🟡 Major
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Line 369 (Implementation Plan), Line 261–265 (Key Algorithms)
* **Discrepancy Description**: The PRD places `calculateSettlement` (minimal transfers / greedy algorithm) inside `src/lib/money/split.ts` alongside split calculation functions. Settlement is a *reporting* concern, not a *money arithmetic* concern.
* **Rationale & Recommendation**: 
  - `src/lib/money/` purity guard forbids React/Firebase imports. Settlement is pure, but it belongs in a reporting/settlement module, not a split module.
  - Mixing split calculation (how much each person owes for an expense) with settlement (who pays whom to net out) conflates two distinct domains.
  - **Recommendation**: Move `calculateSettlement` to `src/lib/report/settlement.ts` (new module). Keep `split.ts` focused on split modes only. This maintains the purity boundary and improves module cohesion.

---

### 5. `react-router-dom` for 3 Routes Is Overkill — Severity: 🟡 Major
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 435–442 (App.tsx, routes.ts)
* **Discrepancy Description**: The app has exactly 3 routes: `/` (trip list), `/signin`, `/trip/:tripId` (with 3 tabs). The PRD mandates `react-router-dom` v7.
* **Rationale & Recommendation**: 
  - A 3-route SPA with tab-based navigation inside `/trip/:tripId` can use a simple hash-based router or even conditional rendering (`useState` for active tab, `useSearchParams` for tripId).
  - `react-router-dom` adds ~12 KB gzipped, introduces route matching complexity, and requires `<Routes>`/`<Outlet>` patterns that add boilerplate.
  - **Recommendation**: Use a lightweight alternative (e.g., `wouter` ~1.5 KB) or manual routing with `window.location.hash` and a single `TripDetail` component that switches tabs via state. This removes a dependency and reduces bundle size.

---

### 6. PWA Manifest Deferred but Listed in Implementation Plan — Severity: 🟢 Nit
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 459–462 (public/manifest.json)
* **Discrepancy Description**: The implementation plan includes creating `public/manifest.json` with icons and PWA config, but notes "deferred to v2, minimal for now."
* **Rationale & Recommendation**: 
  - If deferred to v2, it should not appear in the v1 implementation plan. Including it creates noise and suggests work that won't be done.
  - **Recommendation**: Remove `public/manifest.json` from the v1 plan. Add a single line in Known Gaps: "PWA support deferred to v2."

---

### 7. Duplicate Type Definitions Across `src/types/trip.ts` and `src/lib/types.ts` — Severity: 🟢 Nit
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Line 365 (src/types/trip.ts)
* **Discrepancy Description**: The plan says "Import and re-export existing `Expense`/`NewExpense`/`ExpenseCategory` from `src/lib/types.ts` rather than redefining" but then defines `Trip`, `Person`, `Expense`, `LineItem`, `SplitMode`, `TripSettings`, `HistoryEntry`, `SettlementResult`, `Transfer`, `ReportData` in a new file.
* **Rationale & Recommendation**: 
  - This creates a split type surface. If `src/lib/types.ts` already has `Expense`, the new file should only define *new* types (`Trip`, `Person`, `LineItem`, etc.) and re-export `Expense` from the existing location.
  - **Recommendation**: Audit `src/lib/types.ts` first. Define only missing types in `src/types/trip.ts` and re-export the rest. Or consolidate all domain types into `src/types/domain.ts` as a single source of truth.

---

### 8. Firestore Indexes File Created Prematurely — Severity: 🟢 Nit
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 451–454 (firestore.indexes.json)
* **Discrepancy Description**: The plan includes creating `firestore.indexes.json` with composite indexes before any queries are written or tested.
* **Rationale & Recommendation**: 
  - Firestore automatically suggests missing indexes in the console when a query fails. Creating indexes upfront is speculative.
  - The only query pattern mentioned is "expenses by trip + date" — this may not need a composite index if using `where('tripId', '==', ...).orderBy('date')` (single-field indexes suffice).
  - **Recommendation**: Remove `firestore.indexes.json` from the plan. Add indexes only when the emulator/deployment errors require them.

---

### 9. Netlify Config Before Any Deploy Exists — Severity: 🟢 Nit
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 455–458 (netlify.toml)
* **Discrepancy Description**: `netlify.toml` is in the implementation plan before the first deploy. The Known Gaps section already notes "No Netlify config" as a gap.
* **Rationale & Recommendation**: 
  - Netlify detects Vite/React automatically. A `netlify.toml` is only needed for custom headers, redirects, or build overrides.
  - SPA fallback can be handled by Netlify's default `/* /index.html 200` redirect rule in the UI.
  - **Recommendation**: Defer `netlify.toml` until a specific need arises (custom headers, preview deploy config). Document the default behavior in README instead.

---

### 10. Trip Settings / Person Soft-Delete Logic Over-Designed — Severity: 🟢 Nit
* **Reviewer Lens:** zoom-out
* **Affected Scope:** Lines 218 (Person.deletedAt), 53–54 (OQ8), 409–410 (PeopleManager)
* **Discrepancy Description**: The PRD specifies `deletedAt` on Person, soft-delete logic with audit retention, disable-delete-if-has-expenses, and recalculation of active splits.
* **Rationale & Recommendation**: 
  - For a personal trip app, participants are typically fixed for the trip duration. Deleting a person mid-trip is an extreme edge case.
  - The "disable delete if has expenses" + "soft delete if none" + "recalculate splits" logic adds significant UI and backend complexity for a rare action.
  - **Recommendation**: Simplify to: participants cannot be removed once the trip has expenses. If the trip has no expenses, allow hard delete. No soft-delete, no `deletedAt`, no recalculation logic. This removes the audit trail requirement for people (expenses already have history).

---

## Summary

| Severity | Count |
| --- | --- |
| 🔴 Blocker | 2 |
| 🟡 Major | 3 |
| 🟢 Nit | 5 |

### Top 3 Actionable Simplifications
1. **Drop custom offline sync engine** — use Firestore native persistence (~5 files removed)
2. **Embed history array on expense** — remove subcollection, component, indexes, rules (~3 files removed)
3. **Move settlement to separate module** — keep `split.ts` pure and focused

These three changes alone would reduce the implementation plan by ~8 files and ~400 lines of infrastructure code, while keeping all user-facing functionality intact.