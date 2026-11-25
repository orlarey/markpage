/**
 * Purpose: The conservation contract of a paginated render — everything the
 *   document says is on the pages exactly once. The check itself lives in
 *   packages/markpage/lib/conservation.mjs, shared with `markpage check`, so
 *   the CLI and this suite apply the very same rule.
 */
export {
  conservation,
  continuousText,
  paginatedFacts,
  sequenceDiff,
  words,
} from '../packages/markpage/lib/conservation.mjs';
