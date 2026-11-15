# AGENTS.md — The_Good_Treasurer

Personal trip expense splitter. One organizer records every expense for a trip and the app
works out how that spending splits across the trip's participants.

This file is the operating contract for any agent working in this repository. Read it before
touching code. When it conflicts with your default habits, this file wins.

---

## 1. Stack and infrastructure

| Layer | Choice |
| --- | --- |
| Framework | React 19 + TypeScript 7 |
| Build | Vite 8 |
| Styling | Tailwind CSS v4 (CSS-first: `@import "tailwindcss"` + `@theme` in `src/index.css`) |
| Backend | Firebase v12 — Auth (Google provider) + Firestore |
| Hosting | Netlify |
| Repository | GitHub — `The_Good_Treasurer` |
| Lint | oxlint |
| Firebase project ID | `the-good-treasurer` |

Current versions: `firebase@12.19.0`, `react@19.3.1`, `vite@8.3.8`, `tailwindcss@4.3.5`,
`typescript@7.0.2`, `oxlint@1.93.0`, `vitest@5.1.0`, `fast-check@4.10.2`.

### Configuration

Firebase config comes **only** from `import.meta.env.VITE_FIREBASE_*`:

```
VITE_FIREBASE_API_KEY
VITE_FIREBASE_AUTH_DOMAIN
VITE_FIREBASE_PROJECT_ID
VITE_FIREBASE_STORAGE_BUCKET
VITE_FIREBASE_MESSAGING_SENDER_ID
VITE_FIREBASE_APP_ID
```

- Never hardcode a config value in source. Never add a second config mechanism.
- Never read, write, edit, or commit any file matching `.env*`. See Rule 5.
- Local env files are git-ignored (`.gitignore` covers `.env*` and `*.local`). Keep it that way.
- Netlify gets these same variables from Site settings → Environment variables.
- `src/vite-env.d.ts` declares the typed `ImportMetaEnv` surface. Add new `VITE_FIREBASE_*`
  variables there too.

### Netlify deploy shape

- Build command: `npm run build`
- Publish directory: `dist`
- Node version: pin via `.nvmrc` before the first deploy — see Known Gaps.

---

## 2. Hard scope boundaries

These are decided. Do not build them, and do not "improve" the app toward them.

**Out of scope — never add:**

- Multi-user anything: sharing, collaboration, team accounts, roles, permissions, invites,
  comments, live co-editing, public links.
- AI features of any kind: generation, categorization by model, chat, assistants, summaries.
- Multi-currency. **INR only.** No currency selector, no exchange rates, no FX conversion.
- Payment links, payment collection, settlement payouts, UPI/razorpay/stripe integrations.
- Invite links, expat settlement screens, or any flow that implies another human logs in.

**In scope:** the single organizer signs in with Google, records trip expenses, and the app
splits those expenses across that trip's participants for the organizer's own review.

The exact split/allocation model is **not yet settled**. Do not invent one. Ask the user
first (Rule 2).

### The single-user invariant

One account = one organizer = all entries belong to that organizer. Firestore data lives
under `users/{uid}/...`; every read and write is scoped to the signed-in user's own path.
If a change would make one account's data visible to another account, it violates this
invariant regardless of how it is presented.

---

## 3. Money rules

**Money is integer paise, everywhere, at all times.**

- 1 rupee = 100 paise. Store `100`, not `1.00`. Store `123456`, not `1234.56`.
- **Never use floating point for money.** No `parseFloat`, no `Number()`, no `toFixed`, no
  arithmetic on decimal amounts, no `amount * 100` round-trips.
- User input is a **string**; convert it to paise by parsing the digits of the decimal part
  directly. Never route a typed amount through a float.
- Rounding happens only where the rule demands it, and the rounding direction must be
  explicit and tested.
- Format for display only, at the last possible moment. The formatted string never round-trips
  back into storage.

### Where money code lives

All money logic lives in **`src/lib/money/`** as **pure functions**:

- Pure: no Firebase imports, no React imports, no `import.meta.env`, no `Date.now()`, no
  `Math.random()`, no I/O, no side effects. Same input → same output, always.
- No module under `src/lib/money/` may import from `firebase/*`, `react`, or any component.
  A dependency direction violation here is a review-blocking bug.
- Every function gets **unit tests** and **property tests** (see Rule 4). Property tests
  cover the invariants that make the arithmetic safe — for example: summing then splitting
  conserves the total to the paise; splitting never produces a negative share; formatting then
  re-parsing round-trips exactly.

### Firestore shape for money

Amounts are persisted as integers. Firestore `Timestamp`/number ambiguity is not allowed:
store paise as a plain integer field and keep the unit obvious in the field name.

---

## 4. Testing rules

- Money logic **must** ship with both unit tests and property tests before it is considered
  done. A money function without property tests is incomplete, not "probably fine".
- Property tests must state the invariants they assert, in the test name or a comment.
- Tests are pure and offline: no network, no Firebase emulator, no clock, no randomness
  unless explicitly seeded by the test.
- Bug fixes require a regression test that fails before the fix and passes after.
- Test files live next to the code they cover. Convention:
  - `foo.test.ts` — unit tests
  - `foo.property.test.ts` — property tests
- The runner is **vitest**, with **fast-check** for property tests. Both are already
  approved dependencies; do not add a third test tool.
- `src/lib/money/purity.test.ts` mechanically enforces the money module's import
  boundary. Keep it passing — do not weaken its assertions to make a change go through.

---

## 5. Secrets rule

- **Never print, request, echo, log, screenshot, or commit a secret.**
- Never read or modify any file matching `.env*`. If a task seems to need an env file, stop
  and ask the user to handle it.
- Never dump `import.meta.env` to the console, even in development. Never put env values in
  error messages, test fixtures, snapshots, screenshots, or commit messages.
- Never commit `.env*`, credentials, or private keys. Verify with `git status` before
  committing.
- The Firebase web config is not a secret, but `.env*` files are off-limits as files
  regardless of content.

---

## 6. Workflow rules

### Before any task

1. **State a plan and wait for approval.** Do not begin editing before the user approves.
2. The plan must name the files you intend to touch and the behaviour that changes.
3. If the task is ambiguous, ask — do not guess at product behaviour.

### Unapproved improvements

Rule 2 of the brief: **reliability over features.**

- Do not add a dependency, a feature, a refactor, or a dependency bump that the user did not
  approve.
- If you spot an improvement — even a good one, even an obvious one — **STOP and ask** with
  pros and cons. Include:
  - what you propose,
  - pros,
  - cons / risks,
  - files touched,
  - new dependencies (if any),
  - what you would *not* change if the answer is no.
- A trivial, obviously-correct fix (typo, broken import, lint error introduced by your own
  change) may be done without asking. Everything else is asked first.
- Silence is not approval.

### Plan mode

**Plan mode = no file edits.** In plan mode you may read files, search, and run read-only
commands. You must not create, edit, move, or delete any file — including scratch files,
config, tests, and documentation. Deliver the plan and stop.

### After any task

Run all three, in order, and report the result of each:

```
npm run lint
npm test
npm run build
```

- All three must pass before a task is considered complete.
- If a command cannot run (for example the test script is not yet wired up), say so
  explicitly — do not silently skip it or report it as passing.
- Report what you changed, what you verified, and what you deliberately did not verify.

---

## 7. Commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server |
| `npm run build` | Type-check (`tsc -b`) and build to `dist/` |
| `npm run preview` | Serve the production build locally |
| `npm run lint` | oxlint |
| `npm test` | Unit + property tests (vitest, single run) |
| `npm run test:watch` | vitest in watch mode |

---

## 8. Definition of done

A change is done when:

- [ ] Plan was stated and approved before editing.
- [ ] No unapproved dependency, feature, or refactor was added.
- [ ] Money is integer paise; no floating point anywhere in the money path.
- [ ] Money logic lives in `src/lib/money/` as pure functions, with unit **and** property tests.
- [ ] No secret was printed, requested, or committed; no `.env*` file was touched.
- [ ] `npm run lint`, `npm test`, and `npm run build` all pass, and the results were reported.
- [ ] Only the single-user invariant holds: no sharing, no collaboration, no AI, no
      multi-currency, no payment links.
- [ ] Plan mode produced no file edits.

---

## 9. Known gaps

These exist today. They are **not** permission to fix them — each needs approval (Rule 2).

| Gap | Detail |
| --- | --- |
| Split model undecided | `src/lib/money/split.ts` provides only the arithmetic primitive (`splitEvenly`). Which expenses count as shared, how participants are weighted, what a "trip" is, and what the organiser sees — all undecided. Ask the product owner before building the feature. |
| Legacy test documents | Documents written before the paise migration store a float `amount` in rupees; new documents store integer `amountPaise`. Legacy records read as ₹0.00. Delete the throwaway test data rather than migrating it. |
| No Netlify config | No `netlify.toml` and no `public/_redirects` SPA fallback. Node version is unpinned (no `.nvmrc`). |
| Firestore rules not in repo | Security rules live in the Firebase console, not here. |
| Authorized domains | `127.0.0.1` is not in the project's Authorized domains list; `localhost` is. Add the real deploy domain before shipping. |

---

## 10. Reference

- GitHub: `The_Good_Treasurer`
- Netlify: hosts `dist/`
- Firebase project ID: `the-good-treasurer`
- Firestore paths: `users/{uid}/...` (expenses live under `users/{uid}/expenses`)
