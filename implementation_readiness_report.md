# Goldfish Review Report

**Target:** `docs/designs/PRD.md` (lines 350-488)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `implementation-readiness` | completed |
| `codebase-details` | completed |
| `style` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### Missing Offline Sync Engine Specification — Severity: Blocker
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Lines 387-393 (PRD items 7-8)
* **Discrepancy Description**: The PRD specifies creating `src/lib/offline/syncEngine.ts` and `src/hooks/useOfflineQueue.ts` but provides no concrete specification for: IndexedDB schema (object store names, key paths, indexes), queue entry structure (operation type, payload, timestamp, client UUID, retry count), LWW conflict detection algorithm (how "last write" is determined — server timestamp vs client timestamp vs vector clock), background sync trigger conditions (on reconnect, periodic, manual), exponential backoff parameters (base delay, max delay, jitter, max retries), conflict resolution flow (how `customValue` is typed and validated), and queue persistence across browser sessions.
* **Rationale & Recommendation**: Without these details, the implementer must make critical architectural decisions that affect data integrity. Specify: (1) IndexedDB schema with TypeScript interfaces, (2) `PendingWrite` and `Conflict` type definitions, (3) LWW comparison logic (recommend: server `createdAt` timestamp as authority), (4) backoff config constants (e.g., base=1s, max=60s, jitter=±20%, maxRetries=5), (5) `customValue` as a discriminated union matching the operation type.

### Firestore Data Model Underspecified — Severity: Blocker
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Lines 375-377, 385, 449-453 (PRD items 4, 6, 22-23)
* **Discrepancy Description**: The PRD mentions "nested expenses" and "history subcollection" but does not define: exact collection paths (`users/{uid}/trips/{tripId}/expenses` vs `users/{uid}/expenses`), document ID strategy (auto-generated vs client UUID), field names and types for `Trip`, `Person`, `Expense`, `LineItem`, `HistoryEntry`, `TripSettings`, composite indexes required (line 453 says "e.g., expenses by trip + date" but doesn't list them), and whether `Expense` keeps `amountPaise` or adds `lineItems[]` with per-line GST/SC. The current `src/lib/expenses.ts` uses `users/{uid}/expenses` (flat) but PRD implies trips as top-level.
* **Rationale & Recommendation**: Define the complete Firestore schema in the PRD before implementation. Specify: (1) `users/{uid}/trips/{tripId}` with fields, (2) `users/{uid}/trips/{tripId}/expenses/{expenseId}` with nested `lineItems[]`, (3) `users/{uid}/trips/{tripId}/people/{personId}`, (4) `users/{uid}/trips/{tripId}/history/{historyId}`, (4) all field types matching `src/types/trip.ts`, (5) exact composite indexes for queries (tripId+date, tripId+category, etc.), (6) security rules field-level validation.

### Settlement Algorithm Edge Cases Unaddressed — Severity: Blocker
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Line 369, 425 (PRD items 2, 16)
* **Discrepancy Description**: PRD says "minimal transfers (greedy, largest debtor↔largest creditor, tie-break by person ID)" but does not specify: behavior when net amounts don't sum to zero (rounding drift), handling of participants with zero net (include/exclude from transfer list), whether transfers are computed per-trip or across trips, handling of deleted/soft-deleted participants, precision guarantees (integer paise in/out), and what "minimal" means (minimize transfer count vs minimize total transferred amount — these differ).
* **Rationale & Recommendation**: Add a formal spec for `calculateSettlement` in the PRD: input type `SettlementInput { people: Person[], expenses: Expense[] }`, output type `Transfer[]`, invariants (sum of debtor amounts === sum of creditor amounts === total unsettled, no transfer exceeds debtor/creditor net, zero-net participants omitted, deterministic ordering). Include property test invariants.

### Tax Calculation Specification Incomplete — Severity: Blocker
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Line 369 (PRD item 2)
* **Discrepancy Description**: PRD states "Tax rates as constants (GST_BPS = 1800, SC_BPS = 1000) or passed as args" and `calculateTax(basePaise, gstBps, scBps)` returns `{ gstPaise, scPaise, totalTaxPaise }`. Missing: whether GST is CGST+SGST (intra-state) or IGST (inter-state) — the PRD mentions "per-line-item GST/SC" and "user can enter percentage + total, or rupee amounts for CGST/SGST/IGST" (line 413) but the function signature only takes `gstBps` and `scBps` (two values). No spec for: rounding mode (half-up? banker's? truncate?), whether tax is calculated on base or inclusive, validation that CGST===SGST when both provided, handling of "Ignore GST" toggle.
* **Rationale & Recommendation**: Define `TaxMode = 'cgst_sgst' | 'igst' | 'none'` and `TaxInput = { mode: TaxMode; rateBps?: number; cgstPaise?: number; sgstPaise?: number; igstPaise?: number }`. Specify rounding: `Math.round(basePaise * rateBps / 10000)` for percentage mode. Add property test: `basePaise + totalTaxPaise === inclusiveTotalPaise` round-trip.

### React Hook Return Types and Patterns Undefined — Severity: Major
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Lines 381, 385, 393, 331 (PRD items 5, 6, 8, 18)
* **Discrepancy Description**: PRD says "Match `useAuth` callback pattern" (line 381) but `useAuth` returns `{ user, loading, busy, error, signInWithGoogle, signOutUser }` — a flat object with state + actions. The new hooks (`useTrips`, `useTrip`, `useExpenses`, `useOfflineQueue`) need explicit return type definitions: loading/error states per operation, cache invalidation strategy (refetch on write? optimistic update rollback?), whether they return arrays or maps, and mutation function signatures. `useOfflineQueue` returns `{ queue, conflicts, resolveConflict }` but `queue` and `conflicts` types are not defined.
* **Rationale & Recommendation**: Define TypeScript interfaces for each hook's return type in the PRD. Example: `interface UseTripsReturn { trips: Trip[]; loading: boolean; error: Error | null; refetch: () => Promise<void>; createTrip: (data: NewTrip) => Promise<Trip>; }`. Specify optimistic update pattern: mutate local state immediately, queue write, rollback on conflict/error.

### Missing `react-router-dom` Dependency — Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Line 437 (PRD item 19), `package.json`
* **Discrepancy Description**: PRD item 19 specifies "Uses `react-router-dom`" for routing in `src/App.tsx` and item 20 creates `src/routes.ts`. However, `package.json` dependencies list only `firebase`, `react`, `react-dom`. No `react-router-dom` in dependencies or devDependencies. No routing currently exists in `src/App.tsx` (it conditionally renders `LoginScreen` or `Dashboard`).
* **Rationale & Recommendation**: Add `react-router-dom@^7.x` to `package.json` dependencies before implementation. Update PRD to note this dependency addition.

### Missing `@react-pdf/renderer` Dependency — Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Line 429 (PRD item 17), `package.json`
* **Discrepancy Description**: PRD item 17 specifies `@react-pdf/renderer` for PDF export. Not present in `package.json`.
* **Rationale & Recommendation**: Add `@react-pdf/renderer@^4.x` to `package.json` dependencies. Note: `@react-pdf/renderer` requires a separate font registration step for non-Latin scripts — verify Devanagari support if needed for INR formatting.

### `src/lib/types.ts` Does Not Export `Expense`/`NewExpense`/`ExpenseCategory` as Claimed — Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Line 365 (PRD item 1), `src/lib/types.ts`
* **Discrepancy Description**: PRD line 365 says "Import and re-export existing `Expense`/`NewExpense`/`ExpenseCategory` from `src/lib/types.ts` rather than redefining." The current `src/lib/types.ts` **does** export these three types (lines 2, 23, 26). This is actually correct — but the PRD phrasing "rather than redefining" implies they might be redefined elsewhere. They are not. The finding is that the PRD should confirm this is the single source of truth and that `src/types/trip.ts` will import from `../lib/types`.
* **Rationale & Recommendation**: Clarify in PRD: "Import `Expense`, `NewExpense`, `ExpenseCategory` from `../lib/types` (existing). Define new types (`Trip`, `Person`, `LineItem`, `SplitMode`, `TripSettings`, `HistoryEntry`, `SettlementResult`, `Transfer`, `ReportData`) in `src/types/trip.ts`."

### `src/lib/format.ts` Extension Missing Specifics — Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Line 443-445 (PRD item 21), `src/lib/format.ts`
* **Discrepancy Description**: PRD says "Add `formatTripDateRange`, `formatRelativeTime`, `formatPersonName` (with '(organizer)' badge)." Current `src/lib/format.ts` has `formatDate`, `todayIso`, `isInMonth`, `currentMonthWindow`, `MonthWindow`. The new functions are not present. The PRD does not specify their signatures or behavior (e.g., `formatTripDateRange` input: two ISO dates? `Trip` object? output format?).
* **Rationale & Recommendation**: Define function signatures in PRD: `formatTripDateRange(start: string, end: string): string`, `formatRelativeTime(timestamp: number): string`, `formatPersonName(name: string, isOrganizer: boolean): string`.

### `src/hooks/useAuth.ts` Pattern Mismatch for New Hooks — Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Line 381 (PRD item 5), `src/hooks/useAuth.ts`
* **Discrepancy Description**: PRD says "Match `useAuth` callback pattern." `useAuth` uses a flat state object with `loading`/`busy`/`error` and returns `{ ...state, signInWithGoogle, signOutUser }`. New hooks like `useTrips` need list + detail fetching, optimistic mutations, and cache invalidation — a more complex pattern. The "callback pattern" reference is ambiguous: does it mean the `onChange`/`onError` callbacks in `subscribeToExpenses`? Or the flat return object? The implementer must guess.
* **Rationale & Recommendation**: Define a concrete hook pattern template in the PRD. Example: all data hooks return `{ data, loading, error, refetch, mutate }` where `mutate` is an object of async mutation functions that perform optimistic updates.

### Verification Plan Lacks Concrete Pass/Fail Criteria — Severity: Major
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Lines 467-484 (PRD Verification Plan)
* **Discrepancy Description**: Several verification items are not mechanically verifiable: "Manual testing checklist for all 8 CUJs" — no acceptance criteria per CUJ (what does "pass" look like?). "Spark Tier Load Test: assert < 50K reads / 20K writes daily" — measured how? Over what time window? Using emulator logs or production? "Target 90%+ coverage on `src/lib/money/`" — coverage of what (lines, branches, functions)? "Zero warnings" from oxlint — but oxlint has no config file; default rules unknown.
* **Rationale & Recommendation**: For each CUJ, define: given/when/then steps with expected UI state. For load test: script the emulator test, define exact query patterns, assert read/write counts per operation. For coverage: `npm test -- --coverage` with `lines: 90, branches: 85, functions: 90`. For lint: add `oxlintrc.json` with explicit rule set.

### Offline Conflict Resolution `customValue` Type Undefined — Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `style`
* **Affected Scope:** Line 393 (PRD item 8)
* **Discrepancy Description**: `resolveConflict(conflictId, resolution: 'local' | 'remote', customValue?): Promise<void>` — `customValue` has no type. Is it `any`? A discriminated union per operation type? The implementer must decide.
* **Rationale & Recommendation**: Type `customValue` as `Partial<PendingWrite['payload']>` or a specific `ConflictResolutionInput` type per conflict kind. Document in PRD.

### ExpenseForm "Datalist Suggestions" Source Undefined — Severity: Major
* **Reviewer Lens:** `implementation-readiness`, `style`
* **Affected Scope:** Line 413 (PRD item 13)
* **Discrepancy Description**: "category & title as free-text inputs with optional datalist suggestions" — suggestions from where? Hardcoded list? User's previous entries? Firestore? The current `ExpenseForm` uses a `<select>` with `EXPENSE_CATEGORIES` constant. The PRD implies changing to free-text with datalist.
* **Rationale & Recommendation**: Specify: suggestions = unique categories/titles from user's existing expenses in current trip (fetched via hook), capped at 10, sorted by frequency.

### PDF Export "Print-Optimized Layout Separate from Screen UI" Undefined — Severity: Major
* **Reviewer Lens:** `style`, `implementation-readiness`
* **Affected Scope:** Line 429 (PRD item 17)
* **Discrepancy Description**: "Print-optimized layout separate from screen UI" — what does this mean concretely? Different component tree? Different styling? `@react-pdf/renderer` uses its own primitives (`View`, `Text`, `Page`) not HTML/CSS. The PRD doesn't specify whether to reuse calculation logic only, or also component structure.
* **Rationale & Recommendation**: Clarify: `exportReportAsPDF` receives `ReportData` (typed) and builds a `@react-pdf/renderer` document from scratch. Screen `ReportView` and PDF share only the `calculateSettlement` / `ReportData` computation. No shared components.

### Missing `.nvmrc` and `netlify.toml` in Codebase — Severity: Major
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Lines 455-465 (PRD items 24, 26), Known Gaps (AGENTS.md line 84)
* **Discrepancy Description**: PRD items 24 and 26 create `netlify.toml` and `.nvmrc`. AGENTS.md Known Gaps confirms these don't exist. This is consistent — but the PRD should reference the Known Gap and note these are net-new files, not modifications.
* **Rationale & Recommendation**: No action needed on PRD; this is correctly identified as new work. Ensure implementation creates both.

### Purity Guard Must Pass for New `split.ts` Functions — Severity: Major
* **Reviewer Lens:** `codebase-details`, `implementation-readiness`
* **Affected Scope:** Line 371-373 (PRD items 2-3), `src/lib/money/purity.test.ts`
* **Discrepancy Description**: PRD correctly notes "Purity guard must still pass." The new functions in `split.ts` (`calculateEqualSplit`, `calculateExactSplit`, `calculateItemizedSplit`, `calculateSettlement`, `calculateTax`) must not import Firebase, React, `Date.now`, `Math.random`, or `import.meta.env`. This is a hard constraint.
* **Rationale & Recommendation**: Add a checklist item in PRD verification: "Run `npm test` — purity guard passes." Ensure implementer knows this is a blocking gate.

### Inconsistent Terminology: "paise" vs "Paise" — Severity: Nit
* **Reviewer Lens:** `style`
* **Affected Scope:** Throughout PRD lines 350-488
* **Discrepancy Description**: PRD uses "paise" (lowercase, lines 369, 425) and "Paise" (capitalized, AGENTS.md line 10). Codebase uses "paise" in variable names (`amountPaise`, `splitEvenly` returns `number[]` of paise) and "PAISE_PER_RUPEE" constant. The unit is not a proper noun.
* **Rationale & Recommendation**: Standardize on lowercase "paise" everywhere in PRD. Update AGENTS.md if needed.

### "LWW" Used Without Expansion on First Use — Severity: Nit
* **Reviewer Lens:** `style`
* **Affected Scope:** Lines 389, 393, 397 (PRD items 7, 8, 9)
* **Discrepancy Description**: "LWW conflict detection", "LWW conflicts" — first use at line 389 doesn't expand to "Last-Write-Wins". AGENTS.md line 77 uses "LWW offline" without expansion.
* **Rationale & Recommendation**: Expand on first use: "Last-Write-Wins (LWW)".

### "CUJ" Acronym Undefined — Severity: Nit
* **Reviewer Lens:** `style`, `comprehension`
* **Affected Scope:** Line 475 (PRD Verification Plan)
* **Discrepancy Description**: "Manual testing checklist for all 8 CUJs" — CUJ (Critical User Journey) not defined in PRD or AGENTS.md.
* **Rationale & Recommendation**: Define on first use: "Critical User Journeys (CUJs)".

### Redundant "Create" vs "Modify" Labels in Target Files — Severity: Nit
* **Reviewer Lens:** `style`
* **Affected Scope:** Lines 363-466 (PRD items 1-26)
* **Discrepancy Description**: Each item has "* **Type**: ..." and "* **Proposed Changes**: ..." but the "Create"/"Modify" label in the heading (e.g., "`src/types/trip.ts` (Create)") duplicates information. Some say "Modify — extend existing", "Modify — replace existing", "Modify — existing".
* **Rationale & Recommendation**: Standardize heading format: `#### N. \`path\` (New|Extend|Replace|Modify)` with consistent vocabulary.

### `firestore.rules` and `firestore.indexes.json` Not in Repo — Severity: Nit
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Lines 447-453 (PRD items 22-23), AGENTS.md Known Gaps line 87
* **Discrepancy Description**: PRD correctly creates these as new files. AGENTS.md notes "Firestore rules not in repo — live in Firebase console". The PRD should note that these files must be deployed via `firebase deploy --only firestore:rules,firestore:indexes` and the deployment process documented.
* **Rationale & Recommendation**: Add a note in PRD verification plan: "Deploy rules/indexes via Firebase CLI; verify in console."

### Missing Oxlint Config — Severity: Nit
* **Reviewer Lens:** `codebase-details`
* **Affected Scope:** Line 470 (PRD Verification Plan), `package.json`
* **Discrepancy Description**: Verification plan says "`npm run lint` (oxlint) — zero errors; warnings only if suppressed with inline comment and justification". No `oxlintrc.json` or `.oxlintrc` exists in repo. Oxlint will use defaults which may not match project standards.
* **Rationale & Recommendation**: Add `oxlintrc.json` with explicit rules matching TypeScript strict mode and React best practices. Include in PRD as a new file to create.

### "Greedy" Settlement Algorithm Ambiguity — Severity: Nit
* **Reviewer Lens:** `style`
* **Affected Scope:** Line 425 (PRD item 16)
* **Discrepancy Description**: "minimal-transfer list (greedy, largest debtor↔largest creditor, tie-break by person ID)" — "greedy" here means the standard algorithm (sort debtors/creditors, match largest-to-largest). But "greedy" could also mean other heuristics. The parenthetical explains it, but the word "greedy" alone is ambiguous.
* **Rationale & Recommendation**: Replace with "standard optimal settlement algorithm (sort debtors descending, creditors descending, match largest-to-largest, tie-break by person ID)".

### PWA Manifest Deferred to v2 But Listed as Item 25 — Severity: Nit
* **Reviewer Lens:** `implementation-readiness`
* **Affected Scope:** Lines 459-461 (PRD item 25)
* **Discrepancy Description**: Item 25 says "PWA manifest (deferred to v2, minimal for now)" but still lists it as a target file. If deferred, it shouldn't be in the v1 implementation plan.
* **Rationale & Recommendation**: Move to a "Post-v1 / Future Work" section or remove from v1 target files.

---

## Summary

| Severity | Count |
| --- | --- |
| 🔴 Blocker | 4 |
| 🟡 Major | 10 |
| 🟢 Nit | 9 |

**Total Findings:** 23

### Critical Path Blockers (Must Resolve Before Implementation)
1. **Offline Sync Engine Specification** — No IndexedDB schema, queue structure, LWW logic, backoff config
2. **Firestore Data Model** — No collection paths, document fields, composite indexes, security rules detail
3. **Settlement Algorithm** — No formal spec, edge cases, invariants, property test definitions
4. **Tax Calculation** — Incomplete function signature, missing CGST/SGST/IGST handling, rounding mode

### High-Priority Gaps (Should Resolve Before Implementation)
5. Hook return types and patterns undefined
6. Missing `react-router-dom` and `@react-pdf/renderer` dependencies
7. `format.ts` extension signatures missing
8. `useAuth` pattern reference ambiguous for new hooks
9. Verification plan lacks mechanical pass/fail criteria
10. `customValue` type in conflict resolution undefined
11. Datalist suggestions source undefined
12. PDF export architecture unclear
13. Purity guard compliance for new functions
14. Oxlint config missing

### Style/Clarity Improvements (Can Resolve During Implementation)
15. "paise" capitalization consistency
16. "LWW" first-use expansion
17. "CUJ" acronym definition
18. Target file heading standardization
19. Firestore rules deployment note
20. "Greedy" algorithm terminology
21. PWA manifest deferred status
22. Redundant phrasing in target file list
23. Minor formatting inconsistencies