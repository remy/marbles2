/**
 * 3-letter initials blocklist for high-score submissions.
 *
 * The on-device initials entry is 3 ASCII letters. With only 17,576
 * combinations, a curated blocklist is a realistic defence against
 * "cute" offensive submissions.
 *
 * Used by both the browser (docs/submit/submit-highscore.js) to give
 * instant feedback, and the Netlify function to enforce server-side
 * so the check can't be bypassed by crafting a raw POST.
 *
 * Policy:
 *  - Comparison is case-insensitive and ignores non-letter characters.
 *  - '???' (placeholder from a fresh cart) is rejected as a non-entry.
 *  - Adding/removing entries below is the whole maintenance story; no
 *    downstream code needs to change.
 *
 *  ---------------------------------------------------------------------
 *  TODO(remy): fill in the actual blocked combinations.
 *  ---------------------------------------------------------------------
 */

const BLOCKED = new Set([
  // profanity
  'ASS','FUK','FUQ','FKU','FUC','CNT','DCK','DIC','DIK','PNS',
  'TIT','BUM','BUT','SEX','SXY',

  // insults / rude
  'WNK','WKR','NOB', 'GIT',

  // slurs / hateful (trimmed but useful)
  'NAZ','KKK',

  // toilet / crude
  'CUM',
]);

/**
 * Normalize initials: uppercase, keep only A–Z / '?'.
 * Returns the stripped form (may be <3 chars if input had junk).
 */
export function normalizeInitials(raw) {
  if (typeof raw !== 'string') return '';
  return raw.toUpperCase().replace(/[^A-Z?]/g, '');
}

/**
 * True if the given initials (any casing) are blocked or empty.
 */
export function isInitialsBlocked(raw) {
  const s = normalizeInitials(raw);
  if (s.length === 0) return true;
  return BLOCKED.has(s);
}
