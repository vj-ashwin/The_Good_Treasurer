# Goldfish Review Report

**Target:** `docs/designs/PRD.md` (Lines 1-349)

## Reviewer Status

| Reviewer | Status |
| --- | --- |
| `egm-design` | completed |
| `egm-structural` | completed |
| `egm-style` | completed |

## Prioritized Findings (Blockers -> Major -> Nits)

### Firestore Data Model: Expenses Nested Under Trips Creates Query Bottleneck - Severity: 🔴 Blocker
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 210-240 (Data Model section)
* **Discrepancy Description**: The data model nests expenses under trips at `/users/{uid}/trips/{tripId}/expenses/{expenseId}`, but the security rules (lines 281-296) and query patterns don't account for how users will actually query "all expenses across all trips" for features like global search, cross-trip category totals, or export. A collection group query would be needed, but collection group queries require a composite index per field and are slower/more expensive than single-collection queries.
* **Rationale & Recommendation**: Either (a) add a top-level `/users/{uid}/expenses` collection with `tripId` field for cross-trip queries, or (b) explicitly document that cross-trip queries are out of scope for v1 and will require a data migration. The current design silently assumes trip-scoped queries only, which contradicts "permanent trip list" and "anytime export" goals.

### Offline LWW Conflict Resolution: No Strategy for Concurrent Multi-Device Edits - Severity: 🔴 Blocker
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 273-277 (Offline Strategy), Lines 101-105 (CUJ 8)
* **Discrepancy Description**: The LWW + user confirmation model assumes a single device. If the organizer uses two devices offline (e.g., phone and laptop), both make edits, and both come online, the "client UUID for idempotency" only prevents duplicate writes of the *same* edit — it doesn't resolve *different* edits to the same document from different devices. The prompt shows "both versions" but there could be three versions (local A, local B, remote).
* **Rationale & Recommendation**: Explicitly scope offline to single-device or add a vector clock / last-write-wins timestamp field to the document schema. At minimum, document this limitation: "Offline edits on multiple devices simultaneously may lose data; use one device at a time offline."

### Security Rules: History Subcollection Write Rule Allows Arbitrary Field Writes - Severity: 🟡 Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 291-294 (Security Rules)
* **Discrepancy Description**: The history write rule `allow write: if request.auth != null && request.auth.uid == uid;` permits writing any fields to history documents. A malicious or buggy client could inject arbitrary `before`/`after` values, corrupting the audit trail. History should be append-only with server-enforced schema.
* **Rationale & Recommendation**: Restrict history writes to specific fields via `request.resource.data.keys()` validation, or move history writes to a Cloud Function / Firebase Extensions trigger so clients cannot directly write history. At minimum, add `allow create: if ...` only (no update/delete) and validate required fields.

### Settlement Algorithm: Greedy Minimal Transfers Not Proven Optimal for All Cases - Severity: 🟡 Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 261-265 (Key Algorithms), Line 48 (OQ3)
* **Discrepancy Description**: The greedy algorithm (largest debtor ↔ largest creditor) minimizes transaction *count* but not necessarily total *transfer amount* or user-preferred pairings. For example, with debts {A: -100, B: -50} and credits {C: 80, D: 70}, greedy gives A→C 80, A→D 20, B→D 50 (3 transfers). But A→D 70, B→C 50, A→C 30 is also 3 transfers. The tie-break by person ID is deterministic but arbitrary.
* **Rationale & Recommendation**: Document that greedy minimizes transfer count only. If users expect "simplest" settlements (e.g., fewer people involved), consider the "subset sum" optimal algorithm. Add a test case showing greedy vs optimal divergence.

### GST/Service Charge: Per-Line-Item Calculation Contradicts CUJ 2 Example - Severity: 🟡 Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 68-69 (CUJ 2), Lines 267-271 (Key Algorithms), Lines 146-150 (Billzer Calculations)
* **Discrepancy Description**: CUJ 2 shows: "₹3,200 + ₹576 GST + ₹320 service = ₹4,096 / 4 = ₹1,024". This calculates GST on the *total bill* (18% of 3200 = 576, 10% of 3200 = 320). But the Key Algorithms section (line 269) says "Per line item: GST = amountPaise × gstBps / 10000" and line 271 says "Person total share = sum of (lineItemShare + lineItemTaxShare) across all line items." For equal-split (no line items), this is ambiguous — is the "line item" the whole expense? If so, the math matches. But for itemized mode, tax is calculated per line item then split, which can produce different totals due to rounding (paise rounding per line item vs per expense).
* **Rationale & Recommendation**: Clarify whether GST/SC is calculated per-expense (for equal/exact) or per-line-item (for itemized only). If per-line-item universally, the CUJ 2 example should show the per-line-item calculation. Add a property test: "Sum of all person shares equals expense total including tax" for all three split modes.

### Data Retention: "180 Days–1 Year" Is Not a Firestore Feature - Severity: 🟡 Major
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Line 54 (OQ9), Line 26 (G8)
* **Discrepancy Description**: Firestore has no built-in TTL (Time-To-Live) for documents. The PRD states "Trip history retained 180 days–1 year in Firestore" but the security rules and data model have no deletion mechanism. This requires either (a) a scheduled Cloud Function / Cloud Scheduler job, (b) client-side cleanup on app load, or (c) manual deletion. None are specified.
* **Rationale & Recommendation**: Specify the implementation: "TTL enforced via daily Cloud Scheduler + Cloud Function deleting trips where `updatedAt < now() - 180 days`" or "Client-side soft-delete flag; organizer manually purges." Document the cost (Cloud Functions invocations) against Spark tier limits.

### Section Numbering Gap: Missing Section 5 Between 4 and 6 - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** Lines 42, 57 (Section headers)
*   **Discrepancy Description**: The document jumps from "## Open Questions — **All Resolved**" (line 42) to "## Critical User Journeys (CUJs)" (line 57). There is no "## Section 5" header. The Alternatives Considered section starts at line 301 with no number.
*   **Rationale & Recommendation**: Add consistent section numbering or remove numbers entirely. If using numbers: Open Questions = 5, CUJs = 6, Billzer Notes = 7, Technical Plan = 8, Alternatives = 9, Non-Functional = 10, Implementation Plan = 11.

### Inconsistent Heading Hierarchy: CUJs Use ### But Billzer Uses #### - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** Lines 59-106 (CUJs), Lines 115-127 (Billzer Screens)
*   **Discrepancy Description**: CUJ headings use `### CUJ 1: ...` (level 3) while Billzer "Screens/Pages" uses `#### Screens/Pages` (level 4) under `### Observable Features...` (level 3). The hierarchy is inconsistent: CUJs are direct children of `## Critical User Journeys` but Billzer screens are grandchildren of `### Observable Features`.
*   **Rationale & Recommendation**: Make CUJs `#### CUJ 1: ...` under `### CUJ List` or promote Billzer screens to `### Screens/Pages` under `## Billzer.com Black-Box Observation Notes`.

### Data Model Diagram: Missing `clientUUID` Field on Trip Document - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** Lines 213-218 (Trip document), Line 240 (Expense has clientUUID)
*   **Discrepancy Description**: The expense document includes `clientUUID: string` for offline idempotency (line 240), but the trip document (lines 213-218) has no equivalent field. If trips can be created/edited offline, they need the same idempotency key.
*   **Rationale & Recommendation**: Add `clientUUID?: string` to the trip document schema, or explicitly state trips are never edited offline (only expenses).

### Magic Numbers in CUJ Examples Without Explanation - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 68-69 (CUJ 2), Lines 74-75 (CUJ 3), Lines 80-81 (CUJ 4)
*   **Discrepancy Description**: CUJ 2 shows "₹3,200 + ₹576 GST + ₹320 service = ₹4,096 / 4 = ₹1,024" — the 576 (18% of 3200) and 320 (10% of 3200) are magic numbers. CUJ 3 uses ₹500/₹600/₹400 summing to ₹1,500. CUJ 4 uses ₹800/₹600/₹1,000. No explanation of why these specific values.
*   **Rationale & Recommendation**: Add inline comments: "18% GST = ₹576, 10% service = ₹320" or use a simpler example (₹1,000 base, 10% tax = ₹100, total ₹1,100 / 2 = ₹550).

### "Black-Box Observation" Section Claims AI Cannot Browse But Makes Specific Assertions - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Lines 109-113
*   **Discrepancy Description**: The note says "As an AI, I cannot actually browse https://billzer.com/en/... The following is inferred... Items marked with ⚠️ are assumptions that need verification." But no items in the subsequent tables are marked with ⚠️. The disclaimer is misleading.
*   **Rationale & Recommendation**: Either mark specific assumptions with ⚠️, or remove the disclaimer and state "Based on user requirements and competitive analysis."

### Inconsistent Terminology: "paise" vs "Paise" vs "PAISE" - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Throughout (e.g., lines 21, 224, 226, 230, 233, 254, 263, 268)
*   **Discrepancy Description**: The document uses "paise" (lowercase, line 21), "Paise" (capitalized, line 224), and "paise" in code comments. The AGENTS.md rule says "integer paise" consistently lowercase.
*   **Rationale & Recommendation**: Standardize on lowercase "paise" everywhere per the project's money rules.

### Billzer "Calculations" Table: Category Totals Ambiguity Unresolved - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Line 155
*   **Discrepancy Description**: "Category totals: sum of expense amounts (base, not including GST/SC?) per category" — the question mark indicates an unresolved decision in a "Resolved" section.
*   **Rationale & Recommendation**: Resolve and state definitively: "Category totals use base amount only (excludes GST/SC)" or "Category totals use total amount including tax."

### Alternatives Considered: Alternative E Reasoning Mentions "All History for User" Query But No Such Query Exists - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 327-331
*   **Discrepancy Description**: "allows composite indexes for 'all history for user' queries" — but the data model puts history at `/users/{uid}/trips/{tripId}/expenses/{expenseId}/history/`. A user-wide history query would need a collection group query across all trips/expenses, which is expensive and not mentioned elsewhere.
*   **Rationale & Recommendation**: Either remove the "all history for user" justification or add a top-level history collection group index to the `firestore.indexes.json` plan (line 453).

### Non-Functional Requirements: No Feature Flags But Rollback Mentions Reverting Rules - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 350-351
*   **Discrepancy Description**: "No feature flags for core features" but "Rollback: revert Firestore rules; no data migration needed for v1". Reverting rules is a valid rollback, but if a bad deploy includes client code that writes new fields (e.g., `gstAmountPaise`), old rules may reject those writes. The rollback plan should mention coordinating client + rules deploy.
*   **Rationale & Recommendation**: Add: "Rollback requires simultaneous client revert + rules revert; deploy client first with backward-compatible writes, then rules."

### Implementation Plan: `src/lib/types.ts` Referenced But Not In File List - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** Line 365 (Target File 1)
*   **Discrepancy Description**: "Import and re-export existing `Expense`/`NewExpense`/`ExpenseCategory` from `src/lib/types.ts` rather than redefining" — but `src/lib/types.ts` is not in the 26 target files list. If it exists, it should be listed; if not, the comment is stale.
*   **Rationale & Recommendation**: Verify if `src/lib/types.ts` exists. If yes, add to list. If no, remove the reference or create it as file #0.

### Verification Plan: "90%+ Coverage on src/lib/money/" But No Coverage Tool Configured - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Line 471
*   **Discrepancy Description**: Vitest supports coverage via `@vitest/coverage-v8` or `c8`, but neither is in the approved dependencies list (AGENTS.md lists vitest@5.1.0, fast-check@4.10.2 only).
*   **Rationale & Recommendation**: Add coverage dependency to package.json or change to "target high coverage on money module; verify via manual inspection of test file completeness."

### Accessibility: WCAG 2.1 AA Claimed But No Testing Strategy - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-design`
* **Affected Scope:** Lines 354-355
*   **Discrepancy Description**: "WCAG 2.1 AA: semantic HTML, focus management, color contrast, ARIA labels" listed as NFR but no verification step in the plan (line 467-483). No axe-core, no manual checklist, no CI gate.
*   **Rationale & Recommendation**: Add "npm run test:a11y" script with axe-core/playwright, or add manual a11y checklist to E2E verification.

### Duplicate "LineItems" vs "lineItems" Casing in Data Model - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Line 231 (`lineItems?: LineItem[]`), Line 232 (`- description: string`), Line 257 (`calculateItemizedSplit(lineItems: LineItem[]`)
*   **Discrepancy Description**: The data model uses `lineItems` (camelCase) but the TypeScript interface reference is `LineItem[]` (PascalCase). This is normal TS convention but the diagram shows `lineItems?: LineItem[]` which mixes casing confusingly.
*   **Rationale & Recommendation**: In the ASCII diagram, use `lineItems: LineItem[]` consistently. The interface name `LineItem` is correct PascalCase; the field `lineItems` is correct camelCase.

### Missing `.nvmrc` in Known Gaps But Listed in Implementation Plan - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-structural`
* **Affected Scope:** AGENTS.md Known Gaps (line in AGENTS), Line 463-465 (Implementation Plan)
*   **Discrepancy Description**: AGENTS.md "Known Gaps" table lists "No Netlify config... Node version is unpinned (no `.nvmrc`)" but the Implementation Plan includes "#### 26. `.nvmrc` (Create)" with content `20`. This is a gap being fixed, not a remaining gap.
*   **Rationale & Recommendation**: Update AGENTS.md Known Gaps to remove `.nvmrc` once this PRD is approved, or mark it "Planned in PRD."

### Billzer "Inputs & Validations": Category Says "From Fixed List" But PRD Decides User-Defined - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Line 134 (Billzer), Line 52 (OQ7), Line 38 (Non-Goals)
*   **Discrepancy Description**: Billzer observations say "Category: required, from fixed list" but the PRD explicitly decides "Fully user-defined — free-text category/title entry" (OQ7) and Non-Goals says "Fixed category list (categories are user-defined free text)". The Billzer section wasn't updated after the decision.
*   **Rationale & Recommendation**: Update Billzer line 134 to "Category: required, user-defined free text (optional quick-suggestions from previous entries)".

### Settlement Tie-Break: "Person ID + Name Display" But Person ID Is Internal - Severity: 🟢 Nit
* **Reviewer Lens:** `egm-style`
* **Affected Scope:** Line 23 (G5), Line 48 (OQ3), Line 99 (CUJ 7), Line 264 (Algorithm)
*   **Discrepancy Description**: "tie-break by person ID + name display" — person IDs are Firestore document IDs (opaque strings). Displaying them to users is a UX smell. The tie-break should be deterministic (by ID) but only names shown to users.
*   **Rationale & Recommendation**: Rephrase: "tie-break by person ID (stable, not shown to user); display names in UI."

---

## Summary

| Severity | Count |
| --- | --- |
| 🔴 Blocker | 2 |
| 🟡 Major | 4 |
| 🟢 Nit | 17 |

**Total Findings:** 23

**Key Blockers Requiring Resolution Before Implementation:**
1. Firestore data model query bottleneck for cross-trip operations
2. Offline LWW conflict resolution underspecified for multi-device scenario

**Recommendation:** Address the two blockers in a PRD revision before proceeding to implementation. The Major findings should be resolved or explicitly acknowledged as known tradeoffs. Nits are cleanup items for the final PRD polish.