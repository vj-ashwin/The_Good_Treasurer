# Deploying The Good Treasurer

Production shape: a static Vite build on **Netlify**, backed by **Firebase**
(Authentication + Firestore). There is no server to run.

Two pipelines exist and they are deliberately separate:

| Pipeline | Trigger | What it does |
| --- | --- | --- |
| GitHub Actions (`CI`) | Every push and every pull request | lint, unit/property tests, Firestore-rules tests against the emulator, production build |
| Netlify Git integration | Push to `main`, plus deploy previews for pull requests | runs `npm run build` and publishes `dist/` |

CI **never deploys**. Netlify **never runs the tests**. The gate between them is
GitHub branch protection on `main` (see §6).

Nothing in this repository, and nothing in CI, holds a credential for Firebase.
There is no `FIREBASE_TOKEN`, no service-account JSON and no `firebase deploy`
step in Actions — that is intentional (see §7).

---

## 1. Prerequisites

Local machine:

- Node 20, as pinned in `.nvmrc`.
- JDK 21+ to run the Firestore emulator (`firebase-tools` v15 refuses to start
  on older JDKs). On Windows, point `JAVA_HOME` at a 21+ JDK for the session;
  do not hardcode a path in a committed script.
- `npx firebase login` (browser-based) for the manual rules deploy in §5.

Accounts:

- A Netlify account with access to the GitHub repository.
- Access to the Firebase project `the-good-treasurer`.

---

## 2. Netlify project settings

`netlify.toml` at the repository root is the source of truth:
build command `npm run build`, publish directory `dist`, and the SPA fallback
`/*` → `/index.html` (status 200) so a refresh on `/trip/<id>` does not 404.

In the Netlify UI:

1. **Add new site → Import an existing project → GitHub →** pick the repo.
2. Confirm the build command and publish directory came from `netlify.toml`.
3. Leave the production branch as `main`.
4. Node version comes from `.nvmrc`; no `NODE_VERSION` variable is needed.
5. Add the environment variables from §3, scoped to **All deploy contexts**
   (production, deploy previews, branch deploys). A variable added later only
   takes effect on the next build — use **Deploys → Trigger deploy → Clear
   cache and deploy site**.

`public/_redirects` repeats the same SPA rule. It is redundant with
`netlify.toml` and harmless; keep one of them when you next touch this area.

---

## 3. Environment variables in Netlify

Six variables, all `VITE_FIREBASE_*`. Vite inlines these at build time, which
means a missing or misspelled one produces a build that loads but cannot talk
to Firebase.

| Variable | Value (from the Firebase console) |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | Web API key of the `the-good-treasurer` web app |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project-id>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `the-good-treasurer` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<project-id>.firebasestorage.app` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | Sender id of the web app |
| `VITE_FIREBASE_APP_ID` | App id of the web app |

Where: **Firebase console → Project settings → General → Your apps →**
the Web app **→ SDK setup and configuration → Config**.

Rules for handling them:

- Set them in the Netlify UI (and in a local `.env.local` for development).
  Never commit an env file and never paste values into a document, an issue, a
  screenshot or a commit message.
- Locally `.env.local` is ignored by git (`*.local`). Treat every `.env*` file
  as untouchable by tooling and agents.
- These values are public client identifiers, not secrets. The real security
  boundary is `firestore.rules` plus the authorized-domain list in §4.

If all six are present and the page still breaks, the cause is almost always a
typo in one of the names: Vite only exposes variables with the `VITE_` prefix,
and a blank value is not the same as an absent one.

---

## 4. Firebase: Google sign-in and authorized domains

Do this once per Firebase project, and again whenever the site gets a new
hostname.

1. **Authentication → Sign-in method → Google → Enable**, and set a support
   email.
2. **Authentication → Settings → Authorized domains → Add domain**.
3. Add the exact hostname only — no scheme, no trailing slash, no path, and no
   wildcard (Firebase does not support wildcards):
   - `<your-site>.netlify.app` — the Netlify production URL
   - your custom domain, if you attach one (add it after Netlify issues the
     certificate)
4. `localhost` is authorized by default, which covers `npm run dev` on
   `http://localhost:5173`. `127.0.0.1` is **not** authorized; open
   `localhost` instead.
5. There is no Google Cloud console step: Firebase manages the
   `https://<project-id>.firebaseapp.com/__/auth/handler` redirect URI for the
   Google provider itself.

**Deploy previews.** Each pull request gets a hostname like
`deploy-preview-<number>--<your-site>.netlify.app`. That is a different
hostname every time, so Google sign-in from a preview fails with
`auth/unauthorized-domain` unless the hostname is added. Options, in order of
preference:

- Accept it: previews are for checking layout, and the signed-out shell renders
  without Firebase Auth.
- Add the specific preview hostname temporarily while you need sign-in there,
  then remove it (they accumulate otherwise).
- Use branch deploys with a stable subdomain for long-lived branches.

Symptom to cause, for the first deploy:

| Symptom | Cause |
| --- | --- |
| `auth/unauthorized-domain` | Hostname missing from Authorized domains |
| `auth/invalid-api-key` | `VITE_FIREBASE_API_KEY` missing, blank or wrong for this project |
| `auth/operation-not-allowed` | Google provider not enabled |
| Blank page, console error before render | A `VITE_FIREBASE_*` variable is missing at build time (the app currently initialises the SDK on import, so the fallback notice cannot render — tracked as review finding P0-1) |
| Refresh on `/trip/<id>` returns 404 | SPA redirect not applied; check `netlify.toml` and the build's publish directory |

---

## 5. Firestore: rules and indexes are deployed by hand

Rules and indexes are **not** part of CI and **not** part of the Netlify build.
They change only when a person runs the command below, which keeps a green pull
request from silently changing production security.

```bash
npm run test:rules                     # 64-test emulator suite, must pass
npx firebase use the-good-treasurer
npx firebase deploy --only firestore:rules
```

Deploy indexes only when a query actually needs one (currently none do):

```bash
npx firebase deploy --only firestore:indexes
```

Notes:

- The suite loads `firestore.rules` itself — the same file the deploy ships — so
  a passing suite is meaningful.
- `npm run test:rules` does not need a Firebase login or any credential; it
  boots a local emulator under the throwaway project `demo-the-good-treasurer`.
- `npm run lint`, `npm test` and `npm run build` must also pass before deploying,
  either locally or as the CI run on the merged commit.
- Never edit rules in the console. The repository file is the only copy.
- Rolling back rules = deploy the previous version from git history.

The Firestore database itself (production mode, `asia-south1` or similar) is
created once in the Firebase console.

---

## 6. Requiring CI to pass before merging into `main`

Netlify deploys `main` on every push, so `main` must not accept a red commit.
GitHub enforces that, not Netlify.

**First PR.** Open one pull request and let CI run once. The status check only
appears in the branch-protection picker after it has reported at least once.

**Then, in the GitHub UI:** Settings → **Branches** → **Add branch protection
rule** (or, for the newer UI, Settings → **Rules → Rulesets**):

- Branch name pattern: `main`
- ☑ **Require a pull request before merging** — approvals can stay at 0, so a
  solo maintainer can still merge their own PR (the PR itself is what gets the
  CI run attached)
- ☑ **Require status checks to pass before merging**
  - select **`verify`** (the single job in `.github/workflows/ci.yml`)
  - ☑ **Require branches to be up to date before merging**
- ☑ **Do not allow bypassing the above settings** (recommended: it binds admins
  too, which is the point for a one-person project)
- ☐ Allow force pushes — leave **unchecked**
- ☐ Allow deletions — leave **unchecked**

Equivalent via the REST API, using a file `protection.json`:

```json
{
  "required_status_checks": { "strict": true, "contexts": ["verify"] },
  "enforce_admins": true,
  "required_pull_request_reviews": { "required_approving_review_count": 0 },
  "restrictions": null,
  "allow_force_pushes": false,
  "allow_deletions": false
}
```

```bash
gh api --method PUT \
  repos/vj-ashwin/The_Good_Treasurer/branches/main/protection \
  --input protection.json
```

Why this is the right gate:

- CI is the only thing that runs the emulator-based rules tests; Netlify does
  not, and a deploy preview will happily publish a red commit.
- Requiring `verify` means the rules suite, the money property tests, the lint
  pass and the type-checked build all block the merge, not just the deploy.
- The Netlify deploy-preview check (`netlify/...`) can be required as well, but
  it only proves the site built, which `verify` already covers. Skip it.

Solo-maintainer workflow this implies:

```bash
git switch -c feat/some-change
# ... commits ...
git push -u origin feat/some-change
gh pr create --fill          # CI runs here
# wait for verify to go green, then merge the PR
```

A direct push to `main` is rejected once the rule is on, so the only way in is
through a green pull request.

---

## 7. What is deliberately not automated

- **Firestore rules and index deploys.** Manual, after the emulator suite
  passes (§5).
- **Firebase credentials in CI.** No token, no service account, no
  `firebase login` in Actions.
- **Netlify deploys from CI.** Netlify's own Git integration owns deployment,
  including deploy previews and instant rollback.
- **Data migrations or backups.** None exist; there is no production data model
  to migrate yet.
- **Emulator-based UI tests / E2E.** Not part of this milestone.

---

## 8. First-deploy checklist

1. `npm ci`
2. `npm run lint`
3. `npm test`
4. `npm run test:rules`
5. `npm run build`
6. Netlify: import the repo, confirm build/publish, add the six env vars for all
   deploy contexts.
7. Firebase: enable Google, add `<your-site>.netlify.app` (and the custom
   domain) to Authorized domains.
8. Deploy `main`; open the Netlify URL and sign in with Google.
9. Deploy `firestore.rules` by hand (§5), then verify a signed-in write is
   accepted and a signed-out one is not.
10. Turn on the branch protection rule from §6.

---

## 9. Rollback

- **App:** Netlify → **Deploys** → pick the last good deploy → **Publish
  deploy**. This is instant and does not touch git.
- **Rules:** check out the previous `firestore.rules` from git and run the
  deploy command from §5.
- **Environment variables:** restore the values in the Netlify UI and trigger a
  clear-cache deploy; variables are baked into the bundle at build time.
