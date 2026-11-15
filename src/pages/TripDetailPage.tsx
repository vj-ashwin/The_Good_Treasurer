import { Link, useParams } from 'react-router-dom'
import { ROUTES } from '../routes'

/**
 * Placeholder for Milestones 5-7: expense entry, history, and report.
 * Confirms deep-link routing works (Netlify SPA fallback + refresh).
 */
export default function TripDetailPage() {
  const { tripId } = useParams<{ tripId: string }>()

  return (
    <div className="min-h-screen bg-slate-50">
      <main className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-6 py-16 text-center">
          <p className="text-sm font-medium text-slate-700">Trip detail</p>
          <p className="mt-2 text-sm text-slate-500">
            Trip ID: <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs">{tripId}</code>
          </p>
          <p className="mt-1 text-sm text-slate-500">
            Expenses, People, and Report tabs arrive in Milestones 5-7.
          </p>
          <Link
            to={ROUTES.HOME}
            className="mt-6 inline-block rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50"
          >
            Back to trips
          </Link>
        </div>
      </main>
    </div>
  )
}
