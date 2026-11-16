/**
 * Shown when the VITE_FIREBASE_* variables are missing from the build.
 *
 * Rendered before any Firebase SDK module is imported, so there is no chance
 * of a module-scope throw beating this screen to the root element.
 */
export default function ConfigurationNotice() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <div className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 shadow-sm">
        <h1 className="text-xl font-semibold text-slate-900">Firebase is not configured</h1>
        <p className="mt-3 text-sm leading-relaxed text-slate-600">
          The app could not read its Firebase settings. Add the following variables to a{' '}
          <code className="rounded bg-slate-100 px-1 py-0.5 text-xs">.env.local</code> file in the
          project root and restart the dev server:
        </p>
        <pre className="mt-4 overflow-x-auto rounded-lg bg-slate-900 p-4 text-xs leading-relaxed text-slate-100">
          {`VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=`}
        </pre>
      </div>
    </main>
  )
}
