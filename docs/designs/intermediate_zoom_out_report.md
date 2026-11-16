# Intermediate Zoom-Out Review Report

**Target:** `docs/designs/PRD.md` (Trip Expense Splitter PRD)
**Review Mode:** Intermediate Zoom-Out (post-comprehension, post-critic)
**Date:** 2026-11-15

---

## Executive Summary

The PRD presents a **coherent, well-scoped single-organizer trip expense splitter** with a clear architecture. The high-level architecture **holds** — the React/Firebase stack with client-side pure functions for money logic aligns with the constraints (INR-only, Spark tier, no multi-user). However, several **architectural risks** emerge from the detailed implementation plan that were not visible at the goals level. These risks center on **offline conflict resolution complexity**, **Firestore cost modeling**, **export fidelity**, and **test surface explosion** from the three split modes.

---

## 1. High-Level Architecture Assessment

### ✅ What Holds

| Aspect | Verdict | Reason |
|--------|---------|--------|
| Single-user invariant | **Holds** | All data under `/users/{uid}/...`; rules enforce ownership |
| Money as integer paise | **Holds** | Explicit in data model, algorithms, and purity guard |
| Client-side settlement | **Holds** | Pure functions, zero Cloud Functions, deterministic greedy algorithm |
| Three split modes | **Holds** | Required by CUJs; algorithms are pure and testable |
| Offline-first with sync | **Holds in principle** | IndexedDB queue + field-level merge is a known pattern |

### ⚠️ What Needs Re-Examination

| Aspect | Concern |
|--------|---------|
| **Firestore read/write model** | "Single collection read per trip" claims flat queries, but expenses are a subcollection — listening to `/users/{uid}/expenses` with `where('tripId', '==', ...)` requires a composite index if combined with ordering. The PRD says "composite indexes avoided" but this query pattern needs one. |
| **History embedded in expense** | 50-entry cap is reasonable, but history grows unbounded per expense if users edit frequently. No TTL or rotation policy specified. |
| **Real-time listeners for everything** | Trip list + expenses + people = 3 listeners per open trip. On Spark tier with 50 trips × 200 expenses, concurrent listeners could exceed connection limits if multiple tabs open. |

---

## 2. New Risks from Detailed Implementation Plan

### Risk 1: Offline Conflict Resolution — Scope Creep Magnet
**Location:** PRD § "Offline Strategy", Implementation Plan items 4, 15
**Severity:** 🔴 Blocker (architectural)

The spec describes **field-level merge with user confirmation per field**. This implies:
- Per-field diffing UI for *every* expense field (title, date, category, amount, payer, participants, split mode, exactShares, lineItems, GST, SC)
- Line items in itemized mode are **arrays of objects** — field-level merge on array elements is **not** field-level; it's structural merge
- GST/SC are *derived* (calculated from percent × base). If user edits `gstPercent` offline and another device edits `amountPaise` online, the merge must recompute `gstAmountPaise` — but which device's percent wins?

**Mitigation not addressed:** The PRD treats conflict resolution as a UI problem. It is a **data model problem**. Consider:
- **Operational Transform / CRDT** for line items (too heavy)
- **Last-writer-wins per expense** with full diff preview (simpler, matches "organizer edits alone" invariant)
- **Immutable event log** (append-only) instead of in-place edits — then merge is trivial

**Recommendation:** Reduce scope to **expense-level merge** (entire expense document) with side-by-side preview. Field-level is YAGNI for a single organizer.

---

### Risk 2: Export Fidelity — PNG/PDF Matching Screen Layout
**Location:** PRD G6, OQ6, Implementation Plan items 13, 14
**Severity:** 🟡 Major

`html2canvas` + `jsPDF` for "multi-page PDF matching on-screen visual layout exactly" is **brittle**:
- `html2canvas` struggles with Tailwind CSS (JIT compiled, pseudo-elements, grid/flex)
- Multi-page PDF pagination requires manual measurement of content height
- Font rendering differences between canvas and PDF
- No server-side rendering fallback

**Alternative not considered:** Generate PDF from **structured data** (ReportData) using a dedicated layout engine (PDFKit, @react-pdf/renderer) rather than DOM capture. This also enables testing.

**Recommendation:** Decouple export from DOM. Build a **report renderer** that outputs both React components (screen) and PDF primitives (export) from the same `ReportData`.

---

### Risk 3: Three Split Modes × History × Offline = Test Explosion
**Location:** Implementation Plan items 2, 3, 10, 11, 12
**Severity:** 🟡 Major

| Feature | State Space |
|---------|-------------|
| Equal split | 1 code path |
| Exact split | Validation + per-person amounts |
| Itemized split | Variable line items × variable consumers × shared items |
| History | Every field editable → 15+ field types × 3 modes |
| Offline queue | Optimistic update + conflict + retry + merge |

**Property test coverage** (PRD § Verification Plan) mentions "split conservation, settlement invariants, tax round-trip" but **not**:
- History restore correctness across all 3 modes
- Offline edit → online merge → history integrity
- Itemized line item add/remove/reorder offline

**Recommendation:** Add **integration property tests** that simulate: (offline edit → conflict → merge → history) × 3 split modes. This is the only way to catch invariant violations.

---

### Risk 4: Firestore Cost Model — "Flat Queries" Contradiction
**Location:** PRD OQ10, Data Model, Security Rules
**Severity:** 🟡 Major

The PRD claims:
- "Flat, denormalized queries; single collection read per trip"
- "No composite index bloat"

But the data model has:
```
/users/{uid}/expenses/{expenseId}  // subcollection
  - tripId: string
```

Query: "All expenses for trip X, ordered by date" → `where('tripId', '==', X).orderBy('date')` **requires a composite index** on `(tripId, date)`.

If trips are queried by `createdAt` (newest-first sidebar) and expenses by `date`, that's **two composite indexes minimum**. At 50 trips × 200 expenses = 10K docs, index size is negligible, but the claim "avoided" is false.

**Recommendation:** Acknowledge composite indexes; they are cheap at this scale. Or denormalize: store expenses as a **map field on the trip document** (max 1MB doc limit → ~200 expenses × ~2KB = 400KB, fits). This enables truly flat reads.

---

### Risk 5: Participant Soft-Delete — Recalculation Semantics Undefined
**Location:** PRD OQ8, PeopleManager implementation
**Severity:** 🟢 Nit (but leaks into Major if wrong)

"Disable delete if participant has expenses; soft delete if none" — but what about **historical reports**?
- If Alice is soft-deleted, does she disappear from *past* settlement reports?
- The PRD says "preserves historical math" for disable-delete, but soft-delete says "exclude from future, recalculate active splits."
- **Contradiction:** If Alice had expenses, she can't be deleted → fine. If she had *no* expenses, soft-delete excludes her from future → but what if a report is regenerated for a past period? She shouldn't appear.

**Clarification needed:** Soft-deleted participants must be **filtered from all report calculations** (past and future) but **retained in history** for audit. The current wording is ambiguous.

---

### Risk 6: Category Totals — Base vs. Tax-Inclusive Ambiguity
**Location:** PRD Billzer Notes § "Calculations" line 153
**Severity:** 🟢 Nit

> "Category totals: sum of expense amounts (base, not including GST/SC?) per category"

The `?` in the PRD indicates this is unresolved. For a settlement report, category totals **should include tax** (that's what the user actually spent per category). But the split algorithms distribute tax proportionally — so category totals with tax require re-aggregating per-person tax shares per category.

**Recommendation:** Decide and document. Suggest: category totals = **base amount only** (simpler, matches expense `amountPaise`), with a separate "Tax by Category" section if needed.

---

## 3. Comprehension & Critic Stage Mitigations — Status Check

Since `zoom_out_report.md` and `critic_report.md` do not exist in the workspace, I cannot verify whether prior-stage findings were addressed. **This is a process gap** — the intermediate zoom-out assumes those artifacts exist.

**Assumed typical findings from those stages and their status in this PRD:**

| Typical Comprehension Finding | Addressed in PRD? |
|-------------------------------|-------------------|
| Undefined terms (paise, GST, Spark tier) | ✅ Defined in Money Rules, Glossary implicit |
| Acronyms unexplained (CUJ, PWA, TTL) | ⚠️ CUJ defined inline; PWA/TTL not defined |
| Assumed knowledge (Billzer, greedy algorithm) | ⚠️ Billzer noted as black-box; greedy described but not pseudocode |

| Typical Critic Finding | Addressed in PRD? |
|------------------------|-------------------|
| Floating-point money risk | ✅ Explicitly banned; integer paise everywhere |
| Multi-user scope creep | ✅ Non-goals table is explicit |
| Firebase config leakage | ✅ Env-only, typed `ImportMetaEnv` |
| Test coverage gaps | ⚠️ Property tests mentioned but not specified for history/offline |
| Security rules in repo | ❌ "Firestore rules not in repo" — Known Gap #4 |

**Recommendation:** Generate `comprehension_report.md` and `critic_report.md` before final zoom-out. This intermediate review is incomplete without them.

---

## 4. YAGNI / Simplicity Opportunities

| Feature | YAGNI Assessment | Simpler Alternative |
|---------|------------------|---------------------|
| Field-level offline merge | **YAGNI** — single organizer, low conflict probability | Expense-level merge with full diff |
| Three split modes at launch | **Debatable** — CUJs require all three | Launch with Equal + Exact; Itemized v2 |
| PNG + PDF export both | **YAGNI** — PDF alone covers sharing | PDF only; PNG as "save image" fallback |
| Category quick-suggestions | **YAGNI** — free text is fine | Remove; add later if users ask |
| Trip settings (retentionDays) | **YAGNI** — fixed 1 year is fine | Hardcode 365; remove settings doc |
| `gstAmountPaise` + `serviceChargeAmountPaise` stored | **Redundant** — derivable from percent × base | Store only percent; compute on read |
| Embedded history array | **Risky** — 50 entries × 3KB = 150KB/doc | Separate subcollection; paginate |

---

## 5. Prioritized Findings

### 🔴 Blocker
1. **Offline field-level merge on arrays (line items) is underspecified and likely unimplementable as described.** Reduce to expense-level merge.
2. **Firestore query model claims "no composite indexes" but requires them.** Acknowledge or denormalize.

### 🟡 Major
3. **Export via DOM capture (html2canvas/jsPDF) is fragile.** Build a data-driven report renderer.
4. **Test plan omits integration property tests for (offline × history × 3 split modes).** Add them.
5. **Participant soft-delete semantics ambiguous for historical reports.** Clarify: excluded from all calculations, retained in audit.

### 🟢 Nit
6. **Category totals: base vs. tax-inclusive undecided.** Decide and document.
7. **Redundant stored tax amounts (`gstAmountPaise`, `serviceChargeAmountPaise`).** Derive on read.
8. **Missing glossary for PWA, TTL, CUJ, Spark tier.** Add to PRD appendix.
9. **Firestore rules not in repo (Known Gap #4).** Commit `firestore.rules` before deploy.

---

## 6. Recommendation Summary

| Action | Priority |
|--------|----------|
| Reduce offline merge to expense-level with side-by-side diff | **Before implementation starts** |
| Move expenses to trip document (denormalized) or accept composite indexes | **Before Firestore schema freeze** |
| Replace DOM-capture export with data-driven PDF renderer | **Before ReportView implementation** |
| Add integration property tests for offline/history/split-mode matrix | **Before test plan finalization** |
| Clarify soft-delete: excluded from all report math, kept in history | **Before PeopleManager implementation** |
| Commit `firestore.rules` to repo | **Before first deploy** |
| Generate comprehension & critic reports for final zoom-out | **Process fix** |

---

## 7. Verdict

**Architecture holds at the goals level.** The implementation plan introduces **4-5 material risks** that require design decisions before coding begins. The most impactful simplification is **collapsing field-level offline merge to expense-level** — this alone removes a major source of complexity and test burden.

**Do not proceed to implementation** until the Blocker items are resolved and the Major items have documented decisions.

---

*Generated by EGM Intermediate Zoom-Out Review*