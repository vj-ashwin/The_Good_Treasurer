/**
 * Deterministic ordering for person ids.
 *
 * Code-unit comparison, not `localeCompare`: the result must be identical on every
 * device and in every locale, because it decides which of two equal remainders lands
 * on which person.
 */
export function comparePersonIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0
}
