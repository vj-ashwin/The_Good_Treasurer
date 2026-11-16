# Consolidated Review Report — Trip Expense Splitter PRD (Updated)

**Target:** `docs/designs/PRD.md` (v2 with user decisions applied)
**Review Mode:** Consolidated Uninterrupted Full Flow
**Date:** 2026-11-15

---

## Executive Summary

The PRD has been updated with user decisions resolving all 10 open questions. Key changes: expenses nested under trips, unified `shares` map, LWW offline conflict, PDF-only export (`@react-pdf/renderer`), per-line-item GST/SC in basis points, client UUID for idempotency, settlement in `split.ts`, `react-router-dom`, history in subcollection.

**Overall Verdict**: The updated PRD is **significantly improved** and addresses most YAGNI violations from the first review. However, **critical implementation blockers remain** — primarily around the split model data model, offline merge UX specification, and hook API contracts. The PRD is **not yet implementation-ready** for the Detailed Implementation Plan.

---

## Stage 5: Initial Zoom-Out Review (Updated PRD)

### 🔴 Blockers — Mostly Resolved

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| 1 | Offline field-level merge prompts | **RESOLVED** | Changed to LWW + user confirmation prompt |
| 2 | Embedded history array | **RESOLVED** | Moved to subcollection `/expenses/{id}/history/` |
| 3 | Dual export (PNG + PDF) | **RESOLVED** | PDF only via `@react-pdf/renderer`, PNG dropped |
| 4 | Spark free tier micro-optimizations | **PARTIAL** | Moved expenses under trips; composite indexes accepted |

### 🟡 Major — Mostly Resolved

| # | Issue | Status | Resolution |
|---|-------|--------|------------|
| 5 | Three split modes distinct storage | **RESOLVED** | Unified `shares: { [personId]: number }` map |
| 6 | People soft-delete logic | **PARTIAL** | Disabled if has expenses; soft-delete if none |
| 7 | Real-time listeners + IndexedDB | **RESOLVED** | Read-once + fire-and-forget; LWW offline |
| 8 | Feature flags | **RESOLVED** | Removed |

### 🟢 Nits — Mostly Resolved

| # | Issue | Resolution |
|---|-------|------------|
| 9 | Category quick-suggestions | Kept as "optional datalist" — clarified |
| 10 | Per-trip retention settings | Removed; global constant |
| 11 | "Chat-style history" sidebar | Clarified as "newest-first list" |
| 12 | PWA manifest + SW | Deferred to v2 |
| 13 | GST/SC storage redundancy | **RESOLVED** — store only `gstBps`/`serviceChargeBps` |
| 14 | `amountPaise` naming | **RESOLVED** — `baseAmountPaise` |
| 15 | Settlement tie-break | **RESOLVED** — person ID + name display |

---

## Stage 6: Comprehension Test (Not Completed)

**Status**: `comprehension_report.md` was not generated. The previous review's comprehension gaps have been largely addressed in the updated PRD:

| Previous Gap | Resolved in Updated PRD? |
|--------------|--------------------------|
| "Generate Report" vs "Finalize" | ✅ — "Finalize" removed, only "Generate Report" |
| Participant soft-delete mechanics | ⚠️ — Partially clarified (excluded from math, kept in audit) |
| Field-level merge prompt UX | ✅ — Changed to LWW with side-by-side diff |
| Retention operational meaning | ⚠️ — Still ambiguous (TTL vs manual cleanup) |
| Category totals tax inclusion | ⚠️ — Not explicitly decided |
| "Quick-suggestions" source | ⚠️ — "optional datalist" still vague |
| "Chat-style history" sidebar | ✅ — Clarified as "newest-first list" |
| Flat queries with separate expenses | ✅ — Expenses now nested under trips |
| Real-time listeners + offline queue | ✅ — Changed to read-once + LWW |
| "Zero serverless CPU" justification | ✅ — Clarified as "client-side settlement" |
| Organizer identity in data model | ⚠️ — `isOrganizer` added to Person, but not used in logic |

**Remaining Comprehension Gaps** (from updated PRD):
1. **GST/SC input modes** — Three modes (percentage, rupee amounts, ignore) need clearer UX spec
2. **Category totals** — Base vs tax-inclusive still not explicitly decided
3. **History retention** — "180 days–1 year" operational meaning unclear
3. **Organizer role** — `isOrganizer` field exists but no logic specified

---

## Stage 7: Critic Review (Updated PRD)

### 🔴 Blockers (from previous review — check if resolved)

| # | Original Blocker | Resolved in Updated PRD? |
|---|------------------|--------------------------|
| 1 | Embedded history array → 1 MiB limit | ✅ **RESOLVED** — moved to subcollection |
| 2 | Offline field-level merge unimplementable | ✅ **RESOLVED** — changed to LWW + side-by-side diff |
| 3 | "Single collection read" impossible | ✅ **RESOLVED** — expenses nested under trips |
| 4 | Export pixel-perfect trap | ✅ **RESOLVED** — PDF-only via `@react-pdf/renderer` |
| 5 | GST/SC distribution formula underspecified | ⚠️ **PARTIAL** — now per-line-item, but rounding rules not fully specified |
| 6 | Settlement greedy algorithm not optimal | ⚠️ **PARTIAL** — tie-break by person ID, but optimality not addressed |
| 7 | "All Resolved" table false confidence | ✅ **RESOLVED** — decisions now reflect actual decisions |

### Remaining Critic Blockers (from updated PRD review)

| # | Blocker | Detail |
|---|---------|--------|
| 1 | **GST/SC rounding & drift** | Per-line-item tax in integer paise, but no spec for remainder allocation when sum of rounded shares ≠ total tax |
| 2 | **Settlement algorithm proof** | Greedy not proven optimal; tie-break by person ID added but no proof of minimality |
| 3 | **Idempotency key scope** | Client UUID added, but no spec for how it's generated (v4 vs v7), stored, or deduplicated on retry |
| 4 | **Offline merge UX** | LWW + side-by-side diff specified, but no mock/component spec for the prompt |
| 5 | **Security rules history write** | Still allows client writes with comment "only via backend functions" — contradiction |

### Remaining Critic Majors

| # | Issue | Status |
|---|-------|--------|
| Soft delete `deletedAt` conflicts with history | ⚠️ — Partially resolved (history in subcollection) |
| Exact split validation incomplete | ⚠️ — No spec for negative amounts, extra keys |
| Line item referential integrity | ⚠️ — No validation that `consumerIds` exist in trip people |
| Offline queue ordering/deduplication | ⚠️ — Not specified |
| Category totals base vs tax-inclusive | ⚠️ — Still ambiguous |
| Security rules history write hole | ❌ — Still allows client writes |
| Participant soft-delete semantics | ⚠️ — Partially clarified but recalculation rules undefined |
| Date validation timezone | ❌ — No trip timezone, "not future" ambiguous |
| Verification plan manual-only | ❌ — No E2E automation |

---

## Stage 8: Intermediate Zoom-Out Review

### Architecture Assessment (Updated)

| Aspect | Verdict | Reason |
|--------|---------|--------|
| Single-user invariant | ✅ Holds | All data under `/users/{uid}/...` |
| Money as integer paise | ✅ Holds | Explicit everywhere |
| Client-side settlement | ✅ Holds | Pure functions, zero Cloud Functions |
| Three split modes | ✅ Holds | Unified `shares` map |
| Expenses nested under trips | ✅ Holds | Single query per trip |
| History in subcollection | ✅ Holds | No 1 MiB risk |
| Offline LWW + UUID | ✅ Holds | Simpler than field-level merge |
| PDF-only export | ✅ Holds | Data-driven, not DOM capture |

### Remaining Risks

| Risk | Severity | Mitigation |
|------|----------|------------|
| GST/SC rounding drift | 🔴 Blocker | Specify remainder allocation algorithm |
| Settlement optimality proof | 🟡 Major | Document as heuristic or implement cycle-cancellation |
| Category totals tax inclusion | 🟡 Major | Decide and document (base-only recommended) |
| Security rules history write | 🔴 Blocker | Change to `allow write: if false;` |
| Idempotency key generation | 🟡 Major | Specify UUID v4/v7 and deduplication |
| Category explosion | 🟡 Major | Add dedup/normalization spec |

---

## Stage 9: Implementation Readiness Test

### 🔴 Blockers (Must Fix Before Coding)

| # | Blocker | Location | Action Required |
|---|---------|----------|-----------------|
| 1 | **Split model data model not approved** | `src/types/trip.ts`, `split.ts` | Product owner must ratify: equal/exact/itemized definitions, shared item split, people list separate from expenses |
| 2 | **Trip data model invented** | `src/types/trip.ts`, `firestore.ts` | No `Trip`, `Person`, `SplitMode` exist in codebase; flat `expenses` vs nested subcollections |
| 3 | **ExpenseForm underspecified** | `ExpenseForm.tsx` | New `Expense` type with split modes, line items, tax fields needed first |
| 4 | **Offline merge UX unspecified** | `useOfflineQueue.ts`, `OfflineMergePrompt.tsx` | No component spec, state machine, or accessibility requirements |
| 5 | **Export dependencies undeclared** | `package.json` | `html2canvas`/`jsPDF` vs `@react-pdf/renderer` decision needed |
| 6 | **Expense redefinition conflict** | `src/lib/types.ts` | Existing `Expense` used in 5+ files; cannot redefine in `trip.ts` |
| 7 | **Hook API contracts missing** | `useTrips.ts`, `useExpenses.ts` | Return shapes, loading/error states, optimistic update patterns not specified |
| 8 | **Routing missing** | `App.tsx`, `package.json` | `react-router-dom` not in deps; `src/routes.ts` needed |
| 9 | **Settlement in wrong layer** | `ReportView.tsx` vs `split.ts` | Algorithm belongs in pure `split.ts` with property tests |
| 10 | **GST/SC spec incomplete** | `ExpenseForm.tsx`, `split.ts` | CGST/SGST/IGST, inter-state, rounding, per-line vs total |

### 🟡 Majors (Specification Decisions Needed)

| # | Issue | Decision Needed |
|---|-------|-----------------|
| `SplitMode` type not defined | Define `type SplitMode = 'equal' \| 'exact' \| 'itemized'` |
| Settlement algorithm in `ReportView` not `split.ts` | Move to `split.ts` with `Transfer` type |
| GST/SC rounding & inter-state | Specify CGST/SGST/IGST, rounding, per-line vs total |
| Hook patterns must match `useAuth` | Callback-based state object, not RxJS |
| `PeopleManager` soft-delete needs `Person.deletedAt` | Add to `Person` type |
| Routing library missing | Add `react-router-dom` to deps |
| TTL in rules vs console feature | Use Firestore TTL policy, not rules |
| Load test not automatable | Move to post-launch or add script |
| Missing `firestore.rules` in repo | Commit before deploy |
| Missing `netlify.toml` SPA config | Add redirects, headers, build command |
| Missing PWA dependencies | `vite-plugin-pwa`, SW registration |
| History model underspecified | Define `HistoryEntry`, retention, restore semantics |
| "Generate Report" semantics | Live view vs persisted snapshot? |
| Category quick-suggestions source | Define (existing categories + recent) |
| Swipe/delete on web | Replace with context menu or add `react-swipeable` |
| Coverage threshold enforcement | Add `@vitest/coverage-v8` |
| Config updates for new files | `tsconfig.json` paths, `vite.config.ts` |
| Acronyms undefined | Glossary or inline expansion |
| Terminology inconsistency | Standardize "Create/Modify/Rewrite" |
| Verification plan phase gates | Map CUJs to implementation items |
| Migration strategy for flat expenses | Fresh start or migration script? |
| `firestore.ts` overlaps `expenses.ts` | Refactor or deprecate |
| Hook API shapes | Define return types in `trip.ts` |

---

## Cross-Stage Synthesis: Final Consolidated Action Items

### 🔴 Must Resolve Before Implementation (10 items)

| Priority | Action | Owner Decision? |
|----------|--------|-----------------|
| 1 | **Approve Split Model + Trip Data Model** (unified `shares` map, nested expenses, people list, `SplitMode` enum, `Person` with `isOrganizer`/`deletedAt`, `LineItem` with per-item tax) | ✅ Product Owner |
| 2 | **Resolve Expense type conflict** — extend `src/lib/types.ts` rather than new `trip.ts` | ✅ Tech Lead |
| 3 | **Specify Settlement Algorithm** in `split.ts` with `Transfer` type, property tests, tie-break by person ID | ✅ Tech Lead |
| 4 | **Specify GST/SC fully** — CGST/SGST/IGST, per-line-item, basis points, rounding, remainder allocation | ✅ Product Owner |
| 5 | **Define Offline Merge UX** — LWW + side-by-side diff prompt component, client UUID v4/v7, deduplication | ✅ Tech Lead |
| 7 | **Add `react-router-dom` + `src/routes.ts`** | ✅ Tech Lead |
| 8 | **Switch to `@react-pdf/renderer` only** — drop `html2canvas`/`jsPDF` | ✅ Tech Lead |
| 9 | **Fix Security Rules** — `allow write: if false` for history; add `firestore.indexes.json` | ✅ Tech Lead |
| 10 | **Add `react-router-dom`, `@react-pdf/renderer`, `vite-plugin-pwa` to deps** | ✅ Tech Lead |

### 🟡 Specification Decisions (13 items)

| # | Decision | Owner |
|---|----------|-------|
| 1 | Category model: fixed enum + "Custom" vs free-text datalist | Product Owner |
| 2 | Soft-delete semantics: excluded from ALL math, retained in audit | Product Owner |
| 3 | Category totals: base-only (recommended) vs tax-inclusive | Product Owner |
| 4 | Settlement tie-break: person ID + name display | Tech Lead |
| 5 | Category suggestions source: existing enum + user's recent | Tech Lead |
| 6 | Date validation: trip timezone or device timezone | Product Owner |
| 7 | Report semantics: live computed view (no persistence) | Product Owner |
| 8 | Hook API shapes: match `useAuth` pattern exactly | Tech Lead |
| 9 | Migration strategy: fresh start (delete test data) | Product Owner |
| 10 | `firestore.ts` vs `expenses.ts`: refactor `expenses.ts` → `firestore.ts` | Tech Lead |
| 11 | Hook API shapes in `trip.ts` | Tech Lead |
| 12 | Verification plan phase gates | Tech Lead |
| 13 | Acronym glossary in PRD appendix | Tech Lead |

### 🟢 Nits (8 items)

Standardize naming (`baseAmountPaise`, `gstBps`), tie-break by person ID, remove magic numbers, fix heading hierarchy, code block language tags, bullet styles, expand acronyms on first use, add `.nvmrc`.

---

## Final Verdict

**The updated PRD is dramatically better** — it resolves ~80% of the original YAGNI violations and architectural overreach. The core architecture (nested expenses, unified shares, LWW offline, PDF-only, per-line-item tax) is now **sound and implementable**.

**However, the Detailed Implementation Plan is NOT ready for execution** — **10 Blockers and 13 Major specification gaps** must be resolved first. The split model, trip data model, tax calculation, offline UX, and hook APIs are still underspecified.

### Recommended Path Forward

1. **Week 1**: Product Owner ratifies Split Model + Trip Data Model (separate design doc)
2. **Week 1-2**: Tech Lead produces formal specs for: settlement algorithm, tax calculation, offline merge UX, hook APIs, security rules
3. **Week 2**: PRD updated with formal specs; dependency approvals obtained
4. **Week 3**: Implementation begins with Phase 1 (money module extensions, types, Firestore layer)
5. **Ongoing**: Verification plan restructured with phase gates and Playwright E2E

---

*Consolidated from: zoom_out_report.md (updated), critic_report.md (updated), implementation_readiness_report.md (updated), intermediate_zoom_out_report.md (updated)*
*Note: comprehension_report.md was not generated in this review cycle*
*Generated by EGM Review Pipeline*