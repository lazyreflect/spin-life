// Lineage eligibility — Phase 1 gating (LINEAGE.md §4.1).
//
// A card stops being just "a finished life" and becomes "a person who could found
// a line." Two cruelties already in the model gate that, diegetically rather than
// as a rules screen:
//   • you must have reached adulthood — a card that died young never did;
//   • a mother who died in childbirth cannot go on to raise a dynasty
//     (events.js sets fatalCause 'childbirth' for the fatal `maternal` event).
// Genetics is sex-gated for v1, so a couple needs one mother and one father.
//
// Pure + data-only: eligibility is derived entirely from fields frozen at roll
// time (age / diedYoung / fatalCause / sex), so it is safe to call on demand and
// never goes stale. No player-facing copy lives here — that is Phase 5's job.

export const FERTILE_AGE = 18;

// Can this card ever be a parent? → { eligible, reason }.
export function parentEligibility(life) {
  if (!life) return { eligible: false, reason: 'no card' };
  if (life.diedYoung || (life.age ?? 0) < FERTILE_AGE)
    return { eligible: false, reason: 'died before adulthood' };
  if (life.fatalCause === 'childbirth')
    return { eligible: false, reason: 'died in childbirth' };
  return { eligible: true, reason: null };
}

export const canFoundLine = (life) => parentEligibility(life).eligible;

// Why two cards can't be paired → a reason string, or null when the pairing is
// allowed. Both must be able to found a line, they can't be the same card, and
// (v1) the couple must be one mother + one father.
export function pairBlock(a, b) {
  if (!a || !b) return 'two cards are required';
  if (!canFoundLine(a) || !canFoundLine(b)) return 'one of them cannot start a family';
  if (a.id && b.id && a.id === b.id) return 'a person cannot pair with themselves';
  if (a.sex === b.sex) return 'a couple needs one mother and one father';
  return null;
}

export const canPair = (a, b) => pairBlock(a, b) == null;

// Shadow-family events (events.js) narrate a marriage/spouse/own-children, or the
// card's own parents. Once the lineage is real they contradict it (§4.7), so the
// display drops them: ORIGIN events ("orphaned") when the card has known parents,
// PARTNER events (marriage/widowhood/divorce/lost-child) when it has a recorded
// partner. The wealth EFFECT already happened at roll time — this only reconciles
// what's shown, never the score.
const FAMILY_ORIGIN = new Set(['orphaned']);
const FAMILY_PARTNER = new Set(['married', 'widowed', 'divorce', 'lostchild']);
export function displayEvents(life) {
  const hasParents = Array.isArray(life.parentIds) && life.parentIds.length > 0;
  const hasPartner = Array.isArray(life.partnerIds) && life.partnerIds.length > 0;
  if (!hasParents && !hasPartner) return life.events || [];
  return (life.events || []).filter(
    (e) => !((hasParents && FAMILY_ORIGIN.has(e.id)) || (hasPartner && FAMILY_PARTNER.has(e.id))),
  );
}
