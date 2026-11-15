/**
 * Public surface of the money module.
 *
 * Everything exported here is a pure function over integer paise. Consumers should not
 * need to reach into the individual files.
 */

export {
  PAISE_PER_RUPEE,
  RUPEE_SIGN,
  formatPaise,
  isPaise,
  parsePaise,
  sumPaise,
} from './paise'
export { splitEvenly } from './split'
