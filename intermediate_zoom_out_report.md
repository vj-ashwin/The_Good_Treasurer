# Intermediate Zoom-Out Review Report — PRD.md

**Target:** `docs/designs/PRD.md` (full document)

**Context:**
- Previous zoom-out report: `zoom_out_report.md` (15 findings, 4 Blockers on over-engineering)
- Critic report: `critic_report.md` (45 findings: 7 Blockers, 10 Major, 28 Nits)
- Comprehension report: Not available

---

## Executive Summary

**Verdict: The high-level architecture does NOT hold.** The 7 Blocker findings from the critic stage invalidate core architectural assumptions in the PRD. The detailed implementation plan (26 files) compounds these issues by baking unimplementable designs into file-level specifications. **Major revision required before implementation begins.**

The PRD currently specifies:
1. An offline merge UX that cannot be built for nested data (arrays, maps, line items)
2. A data model that violates Firestore document size limits and read economics
3. A query pattern ("single collection read per trip") that is impossible with the declared subcollection structure
4. An export requirement ("match on-screen exactly") that requires a headless Chrome service, not client-side jsPDF
5. A settlement algorithm presented as optimal but is a heuristic with arbitrary tie-break
6. A security rule that contradicts its own comment (allows client writes to history)
7. An architectural fork between Firestore's built-in offline persistence and a custom IndexedDB queue

The previous zoom-out report recommended cutting 60% of the proposed surface area. The current PRD **has not incorporated those cuts** — it still contains all the over-engineered subsystems.

---

## A. Architecture Viability Assessment (Per Critic Blocker)

| # | Critic Blocker | Architecture Impact | Verdict |
|---|----------------|---------------------|---------|
| 1 | Embedded history array violates 1 MiB limit & 50K reads/day | **Invalidates data model** (lines 212-240). Every expense read pulls history. Subcollection required. | 🔴 **Architecture invalid** |
| 2 | Field-level merge unimplementable for arrays/maps/lineItems | **Invalidates offline strategy** (lines 264-268, 412). No merge strategy for `participants[]`, `exactShares{}`, `lineItems[]`. | 🔴 **Architecture invalid** |
| 3 | "Single collection read per trip" impossible with subcollections | **Invalidates query strategy** (lines 53, 212-218, 270-287). Firestore cannot query across subcollections in one read. | 🔴 **Architecture invalid** |
| 4 | PDF "match on-screen exactly" requires headless Chrome, not jsPDF | **Invalidates export implementation** (lines 49, 85, 404-408, 443). DOM capture cannot reflow, handle page breaks, or preserve vector text. | 🔴 **Architecture invalid** |
| 5 | GST/SC distribution formula underspecified for edge cases | **Invalidates money correctness** (lines 257-262, 66-67). Division by zero, rounding drift, itemized ambiguity. | 🔴 **Algorithm invalid** |
| 6 | Greedy settlement not optimal; tie-break by name arbitrary | **Invalidates settlement correctness** (lines 46, 251-255, 152). NP-hard problem; greedy is heuristic. Name collation locale-dependent. | 🔴 **Algorithm invalid** |
| 7 | Real-time listeners + custom offline queue = architectural fork | **Invalidates sync strategy** (lines 175, 266-268). Cannot use Firestore offline persistence AND custom field-level merge. Must choose one. | 🔴 **Architecture invalid** |

**Conclusion:** All 7 architectural pillars (data model, offline, queries, export, money math, settlement, sync) have Blocker-level defects. The architecture as specified cannot be implemented.

---

## B. New Risks from Detailed Implementation Plan (Lines 359-485)

The 26-file implementation plan introduces risks that only appear at file granularity:

### 1. Unimplementable Merge UX Propagates Through 4+ Files
| File | Role | Risk |
|------|------|------|
| `src/lib/offline/syncEngine.ts` | Core sync logic | Must implement field-level diff for arrays/maps — no spec exists |
| `src/hooks/useOfflineQueue.ts` | React hook | Exposes `resolveConflict(conflictId, 'local' \| 'remote', customValue?)` — `customValue` for nested objects is undefined |
| `src/components/OfflineMergePrompt.tsx` | UI modal | Must render side-by-side diff for `lineItems[]` (array of objects with dynamic keys) — no component library handles this |
| `src/components/ExpenseForm.tsx` | Input form | Optimistic updates feed the queue; rollback on conflict requires form state reconstruction from merged result |

**Cascade:** If merge UX is downgraded to document-level LWW (as both zoom-out and critic recommend), all 4 files simplify dramatically. Current plan builds the complex version first.

### 2. Test Surface Explosion
- 26 files × 8 CUJs = 208 integration points minimum
- Offline merge alone: queue ordering, deduplication, failure recovery, cross-device conflict, IndexedDB persistence = 5+ test dimensions
- History subcollection: pagination, TTL, composite indexes, transaction atomicity
- 3 split modes × GST/SC variations × itemized shared items = combinatorial test matrix
- PDF export: visual regression across page breaks, content lengths, RTL (not needed but layout engine must handle)

**Risk:** No automated E2E/visual regression specified (Critic Major #18). Manual testing cannot catch regressions in merge logic or export fidelity.

### 3. Spark Tier Budget Math Only Works If All Blockers Fixed
Current PRD math (Critic Major #12) assumes:
- No embedded history (Blocker #1) → reads transfer 50x fewer bytes
- Read-once queries, not real-time listeners (Blocker #7) → no persistent connection reads
- No composite indexes forced by "flat query" constraint (Blocker #3)

If implemented as-written: 200 expenses × 50 history entries = 10K history entries/trip. Real-time listener initial sync = 200 reads + 10K history entries transferred. 50 trip opens/day = 10K reads but **500K+ document-equivalents transferred** — likely hits bandwidth/quota limits.

### 4. Security Rule Contradiction Ships to Production
Lines 282-285: `allow write: if request.auth != null && request.auth.uid == uid; // only via backend functions`

This rule **allows any authenticated client to write fake history entries**. The comment is a lie. Fix: `allow write: if false;` + Cloud Functions. But PRD has no Cloud Functions in implementation plan.

### 5. File Coupling Creates Change Amplification
```
ExpenseForm.tsx → useExpenses.ts → firestore.ts → syncEngine.ts → OfflineMergePrompt.tsx
                                          ↓
ExpenseList.tsx → useExpenses.ts (shared)
ReportView.tsx → useTrip.ts → firestore.ts (shared)
```

A change to expense schema (e.g., removing `gstAmountPaise` per Critic Major #4) touches: types, form, list, report, firestore service, sync engine, history, tests. No abstraction layer isolates schema changes.

---

## C. Mitigation Coverage Check

| Previous Zoom-Out Recommendation | Current PRD Status | Gap |
|----------------------------------|-------------------|-----|
| **Separate history subcollection** | ❌ Still embedded array `history: HistoryEntry[]` (line 239) | Blocker #1 unaddressed |
| **Document-level LWW + toast, no field merge** | ❌ Still "field-level merge prompt per field" (line 268) | Blocker #2 unaddressed |
| **PDF only (data-driven, @react-pdf/renderer)** | ❌ Still "PNG + PDF matching on-screen exactly" (lines 49, 404-408) | Blocker #4 unaddressed |
| **Unified `shares` map; 3 UI input helpers** | ❌ Still 3 modes with distinct stored fields (`exactShares`, `lineItems`, `splitMode`) (lines 229-235) | Major #5 unaddressed |
| **Read-once queries, fire-and-forget writes** | ❌ Still "real-time listeners + IndexedDB queue" (lines 196-199, 266-268) | Blocker #7 unaddressed |
| **No feature flags** | ❌ Still 3 flags: `offline_enabled`, `history_enabled`, `export_pdf_enabled` (lines 341-342) | Nit #8 unaddressed |
| **Defer PWA to v2** | ❌ Still `public/manifest.json` + Service Worker in plan (lines 426-428, 459-461) | Nit #12 unaddressed |
| **Hard delete if no expenses; disable if has expenses** | ❌ Still soft-delete with recalculation logic (lines 51, 388) | Major #6 unaddressed |
| **Remove Spark constraints from PRD** | ❌ Still "designed for Spark free tier" as design constraint (lines 53, 270-288, 347) | Blocker #3 context unaddressed |
| **Store `gstBps`/`scBps` only; compute amounts on read** | ❌ Still stores both percent and derived amounts (lines 225-228) | Major #4 unaddressed |
| **Tie-break by personId (UUID), not name** | ❌ Still "alphabetical by name" (lines 46, 254) | Blocker #6 / Nit #17 unaddressed |

**Coverage: 0/12 recommendations addressed.** The PRD has not been updated since the previous zoom-out and critic reviews.

---

## D. Prioritized Action Items (Must Fix Before Implementation)

### 🔴 Blockers — Architecture Invalid, Must Redesign

| # | Action | Files Affected | Effort |
|---|--------|----------------|--------|
| 1 | **Redesign data model**: Move history to subcollection `/expenses/{id}/history/`; remove embedded `history[]`; store only `gstBps`/`serviceChargeBps`; unify to single `shares` map | `src/types/trip.ts`, `src/lib/firebase/firestore.ts`, `src/hooks/useExpenses.ts`, `src/components/ExpenseHistory.tsx`, `firestore.rules`, `firestore.indexes.json` | High |
| 2 | **Redesign offline strategy**: Drop field-level merge. Use Firestore `enablePersistence()` + document-level LWW with server timestamps. Show toast on conflict: "Synced — latest changes applied." Remove `syncEngine.ts`, `useOfflineQueue.ts`, `OfflineMergePrompt.tsx`. | Delete 3 files; modify `src/lib/firebase/firestore.ts`, `src/hooks/useExpenses.ts`, `src/App.tsx` (persistence config) | High |
| 3 | **Fix query strategy**: Accept 2 reads per trip (trip doc + expenses query). Add composite index `(tripId, createdAt)`. Remove "single collection read" claim. | `src/lib/firebase/firestore.ts`, `src/hooks/useTrip.ts`, `firestore.indexes.json` | Medium |
| 4 | **Redefine export**: PDF only via `@react-pdf/renderer` (data-driven, declarative layout). Drop PNG. Drop "match on-screen exactly." | Delete `html2canvas`/`jsPDF` deps; new `src/lib/export/report.ts`; modify `src/components/ReportView.tsx` | Medium |
| 5 | **Specify GST/SC rounding algorithm**: `roundHalfUp(taxTotal * personBaseShare / totalBaseAmount)` + remainder allocation to largest shares. Add property test: `sum(shares) === totalBase + taxTotal`. | `src/lib/money/split.ts`, `src/lib/money/split.property.test.ts` | Medium |
| 6 | **Fix settlement algorithm spec**: Document greedy as heuristic. Tie-break by `personId` (stable). Add property test: `sum(transfers) === sum(positive nets)`. | `src/lib/money/split.ts`, `src/lib/money/split.test.ts` | Low |
| 7 | **Choose sync architecture**: Either (A) Firestore offline persistence + server timestamps (recommended) OR (B) Custom queue (document why). Remove the fork. | `src/lib/firebase/firestore.ts`, `src/App.tsx`, delete `syncEngine.ts` etc. | High |

### 🟡 Majors — Significant Risk, Must Address

| # | Action | Files Affected |
|---|--------|----------------|
| 8 | Fix security rule: `allow write: if false;` for history; add Cloud Functions or move history writes to client with validation | `firestore.rules` |
| 9 | Add referential integrity validation: `consumerIds` ⊆ trip.people.active; `exactShares` keys === participants | `src/lib/firebase/firestore.ts`, `src/components/ExpenseForm.tsx` |
| 10 | Specify category suggestion source: unique categories from all user trips, case-insensitive dedup, frequency sort, max 10 | `src/components/ExpenseForm.tsx`, `src/hooks/useTrips.ts` |
| 11 | Clarify date validation: allow any date ≤ today in user local TZ (document limitation) or add trip timezone | `src/components/ExpenseForm.tsx`, `src/types/trip.ts` |
| 12 | Add automated test plan: Vitest integration + Playwright E2E + visual regression for PDF | New test files, CI config |
| 13 | Unify participant delete: always allow soft delete (`deletedAt`); exclude from future pickers; include in historical reports with "(removed)" | `src/components/PeopleManager.tsx`, `src/hooks/useTrip.ts`, `src/components/ReportView.tsx` |

### 🟢 Nits — Polish, Address During Implementation

| # | Action |
|---|--------|
| 14 | Standardize heading order, bullet styles, code block language tags |
| 15 | Expand GST on first use; use "INR ₹" consistently |
| 16 | Replace "field-level merge" with "scalar field merge" or remove |
| 17 | Move library choices (html2canvas, jsPDF, IndexedDB, fast-check) to Technical Design Doc |
| 18 | Remove "zero serverless CPU" marketing phrasing |
| 19 | Qualify "soft delete" as "expense soft delete (reversible)" vs "participant soft delete (permanent exclusion)" |

---

## Final Assessment

**The PRD is not ready for implementation.** The critic review found 7 Blocker-level architectural defects. The previous zoom-out review recommended cutting 60% of the scope. **Neither set of findings has been incorporated.**

**Recommended path:**
1. **Pause implementation planning.**
2. **Rewrite PRD** incorporating all Blocker fixes above (produce v2).
3. **Re-run critic review** on rewritten PRD.
4. **Only then** proceed to detailed implementation plan.

The current 26-file plan builds on a foundation that cannot support it. Every file in the plan touches at least one Blocker defect.

---

*Compiled by EGM Synthesizer (intermediate zoom-out after critic stage)*