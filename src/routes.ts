/** Route paths. Single source of truth so links never drift from the router. */
export const ROUTES = {
  HOME: '/',
  SIGN_IN: '/signin',
  TRIP: (tripId: string) => `/trip/${encodeURIComponent(tripId)}`,
} as const
