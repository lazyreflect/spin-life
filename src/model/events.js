// Life events — the structured replacement for faceless Gaussian "luck".
// A few events fire contextually over a life, shift the destination wealth
// (in rank space), optionally cut the lifespan, and give the card a story.
// Probabilities are per-LIFETIME chances tuned to roughly realistic rates and,
// where appropriate, scaled by the country's circumstances, the career, and the
// person's traits.
//
// DIVISION OF LABOR: events NARRATE and PERTURB an outcome the career model has
// already produced — they never re-decide who someone became. (A girl already
// landed in `homemaker`/informal work via femaleLFP/enrollment upstream; the
// `keptfromschool` event only captions it, with zero wealth effect, so the
// same demographic force is not counted twice.)
import { clamp } from './stats.js';

const lifeAvg = (c) => (c.lifeM + c.lifeF) / 2;
// instability proxy from life expectancy: low-LE countries see far more war,
// famine, untreated illness, accidents and crime (war/disease/poverty cluster).
export const instabilityOf = (c) => clamp((74 - lifeAvg(c)) / 30, 0, 1);

// — gate helper sets (reference the committed career catalog's real ids) —
const SUB_TOP = new Set(['low', 'lowmid', 'mid']);
const LOW_BAND = new Set(['low', 'lowmid']);
const MID_UP = new Set(['mid', 'highmid', 'high', 'elite']);
const RICH_BAND = new Set(['high', 'elite']);
// cohorts with no formal-employment safety net (informal economy + not-in-work)
const VULN_COHORT = new Set(['informal', 'unemployed', 'homemaker']);
// Role categories that used to be hardcoded id-Sets here (dangerous, company-town,
// automatable, performer, trader, status) are now `tags` ON each career in
// careers.json — one source of truth, validated on load, no inverted index to
// drift out of sync with the catalog. Events gate on a tag instead of an id list.
const hasTag = (career, tag) => !!career.tags && career.tags.includes(tag);

// netWorth is absolute USD (catalog ~ p10 2k / p50 25k / p90 250k); map to a
// low-wealth factor in [0,1] on a log scale (rich -> 0, poor -> 1).
const lowWealthFactor = (c) => {
  const nw = Math.max(c.netWorth, 500);
  return clamp((Math.log10(60000) - Math.log10(nw)) / (Math.log10(60000) - Math.log10(2000)), 0, 1);
};

// PRECARITY = lack of a safety net. The SAME shock is a setback for a salaried
// worker and a catastrophe for an informal day-laborer. Combines the country's
// vulnerable-employment share (real data) with the person's cohort/income band.
// Null-safe: 55 countries lack vulnEmployment — fall back to instability+wealth.
export function precarity(ctx, country, bands) {
  // vulnEmployment is always present post-load (load.js imputes it from
  // life-expectancy instability where the column is absent — the same estimate
  // this function used to compute inline as a fallback).
  let cCountry = clamp(country.vulnEmployment / 100, 0, 1);
  cCountry = clamp(0.7 * cCountry + 0.3 * lowWealthFactor(country), 0, 1);
  const cohort = ctx.career.cohort;
  // career-side precarity: no-safety-net cohorts are worst; otherwise it's the
  // band's own precarity (data/bands.json), no inline magnitude ladder.
  const cCareer = VULN_COHORT.has(cohort) ? 0.9 : bands[ctx.career.incomeBand].precarity;
  return clamp(0.5 * cCareer + 0.5 * cCountry, 0, 1);
}

// Global event-frequency knob. The expanded catalog adds VARIETY, not volume —
// most lives should still be uneventful (modal card = 0 events). This scales
// every per-event probability so the aggregate "lives with an event" rate stays
// near the calibrated target (~45%) rather than ballooning with the catalog.
const RATE = 0.42;

// heavy-tailed magnitude in [lo,hi], skewed toward lo (most shocks are small,
// a rare one is ruinous). p>1 increases the skew.
const mag = (lo, hi, rand, p = 2.4) => lo + (hi - lo) * Math.pow(rand(), p);

// region-flavored natural disaster — shared mechanics, continent-picked text, so
// no hand-assigned culture->event (same philosophy as the career catalog).
const DISASTER = {
  Asia: ['lost everything to a flood', 'was uprooted by a cyclone', 'survived a devastating earthquake'],
  'Middle East': ['was displaced by drought', 'survived a devastating earthquake'],
  Africa: ['was driven off the land by drought', 'lost the harvest to a flood'],
  'North America': ['lost the home to a hurricane', 'was flooded out of everything', 'survived a wildfire'],
  'South America': ['lost everything to a flood', 'survived a devastating earthquake', 'was displaced by a landslide'],
  Europe: ['was flooded out of the home', 'lost the home to a wildfire'],
  Oceania: ['was battered by a cyclone', 'lost the coast to rising seas'],
  Antarctica: ['was cut off by a brutal winter'],
};
const pick = (arr, rand) => arr[Math.floor(rand() * arr.length)];
const disasterText = (x, rand) => pick(DISASTER[x.country.continent] || DISASTER.Asia, rand);

// w = wealth-rank delta (number, or fn(x, rand) for heavy-tailed severity).
// age = years delta. fatalP = chance the event kills early. child = can also
// befall someone who dies before adulthood (shown on died-young cards).
// decline = "this explains a fall", so the forced-arc story is not piled on top.
// precaritySensitive = severity (w and fatalP) scales with lack of safety net.
// Gates (all optional): sex, sector, tag (career tag), cohortIn (Set), bandIn
// (Set), region (continent list), formalOnly, minInst, requires, excludes.
export const EVENTS = [
  // ─────────────────────────── adversity ───────────────────────────
  { id: 'illness',   text: 'battled a serious illness',     prob: (x, i) => 0.06 * (1 + 1.4 * i),                 w: (x, r) => -mag(0.05, 0.40, r, 2.6), age: -7,  fatalP: 0.07, child: true, decline: true, precaritySensitive: true },
  { id: 'war',       text: 'was displaced by war',          prob: (x, i) => 0.12 * i * i,                         w: -0.34, age: -7,  fatalP: 0.18, child: true, decline: true, precaritySensitive: true },
  { id: 'famine',    text: 'lived through a famine',        prob: (x, i) => 0.07 * i * i,                         w: -0.20, age: -5,  fatalP: 0.10, child: true, decline: true, precaritySensitive: true },
  { id: 'accident',  text: 'was struck by tragedy',         prob: (x, i) => 0.025 * (1 + 1.2 * i),                w: -0.05, age: -12, fatalP: 0.30, child: true, decline: true, precaritySensitive: true },
  { id: 'crime',     text: 'was robbed of everything',      prob: (x, i) => 0.03 * (0.4 + 1.3 * i),               w: -0.16, decline: true, precaritySensitive: true },
  { id: 'addiction', text: 'lost years to addiction',       prob: () => 0.030,                                    w: -0.20, age: -6,  fatalP: 0.05, decline: true },
  // a major loss, but rarely a total wipe — pensions/property/family usually leave a residue
  { id: 'ruin',      text: 'lost most of it to bad debt',   prob: (x) => 0.03 * (0.3 + x.childRank),              w: -0.30, decline: true },
  { id: 'scandal',   text: 'fell from grace in a scandal',  prob: (x) => (hasTag(x.career, 'status') ? 0.04 : 0.004), w: -0.28, decline: true },
  // permanent disability — rarely fatal, but income-ending; brutal without a safety net
  { id: 'disability', text: 'was disabled by an injury',    prob: (x, i) => 0.018 * (1 + 1.0 * i) + (hasTag(x.career, 'dangerous') ? 0.02 : 0), w: (x, r) => -mag(0.08, 0.40, r, 2.2), age: -4, fatalP: 0.03, decline: true, precaritySensitive: true },
  // on-the-job death/injury for physically dangerous trades (informal miners die uninsured)
  { id: 'workinjury', text: 'was maimed in a workplace accident', tag: 'dangerous', prob: (x, i) => 0.05 * (1 + 0.8 * i), w: -0.16, age: -8, fatalP: 0.18, decline: true, precaritySensitive: true },
  { id: 'mentalill', text: 'struggled with mental illness',  prob: () => 0.05,                                    w: -0.10, age: -3,  fatalP: 0.03, decline: true },
  // approximate cohort shock (the sim rolls lives independently, so this is a
  // per-person stand-in for a shared pandemic rather than a true cohort event)
  { id: 'pandemic',  text: 'lived through a deadly pandemic', prob: (x, i) => 0.04 * (1 + 1.6 * i),               w: -0.06, age: -2,  fatalP: 0.05, child: true, decline: true, precaritySensitive: true },
  { id: 'maternal',  text: 'died in childbirth',            sex: 'Female', prob: (x, i) => 0.015 * (0.3 + 1.8 * i), w: -0.03, fatalP: 0.85, decline: true, precaritySensitive: true },
  { id: 'disaster',  text: disasterText,                    prob: (x, i) => 0.03 * (0.5 + 1.2 * i),               w: (x, r) => -mag(0.06, 0.30, r, 2.0), age: -3, fatalP: 0.06, child: true, decline: true, precaritySensitive: true },
  // eviction / debt spiral — concentrated where vulnerable employment is high
  { id: 'eviction',  text: 'was evicted and fell into debt', prob: (x) => 0.025 * (0.4 + 1.6 * x.prec),           w: -0.14, decline: true, precaritySensitive: true },
  { id: 'prison',    text: 'lost years to prison',          prob: (x, i) => 0.012 * (0.5 + 1.5 * i),              w: -0.18, age: -3,  decline: true },
  // financial fraud / Ponzi / romance scam — more prevalent in high-inequality states
  { id: 'scam',      text: 'was wiped out by a scam',       prob: (x) => 0.018 * (0.4 + clamp((x.country.wealthGini - 30) / 50, 0, 1)), w: (x, r) => -mag(0.08, 0.35, r, 2.2), decline: true },
  // trafficking/exploitation — kept rare, precarity-gated, narrated plainly
  { id: 'exploited', text: 'was trafficked and exploited',  prob: (x, i) => 0.004 * (0.4 + 1.6 * i) * (0.3 + x.prec), w: -0.18, age: -6, fatalP: 0.06, decline: true, precaritySensitive: true },

  // ──────────────────────────── family ─────────────────────────────
  { id: 'orphaned',  text: 'was orphaned young',            prob: (x, i) => 0.03 * (0.6 + 1.2 * i),               w: -0.10, child: true, decline: true, precaritySensitive: true },
  // widowhood — devastating for a non-earning homemaker, a setback for a dual earner
  { id: 'widowed',   text: 'was widowed and left to cope',  prob: (x, i) => 0.05 * (0.6 + 0.8 * i),               w: (x) => (x.career.cohort === 'homemaker' ? -0.22 : -0.08), age: -1, decline: true },
  { id: 'divorce',   text: 'was set back by a costly divorce', prob: (x) => (x.career.cohort === 'homemaker' ? 0.06 : 0.05), w: (x) => (x.career.cohort === 'homemaker' ? -0.18 : -0.10), decline: true },
  { id: 'lostchild', text: 'never recovered from losing a child', prob: (x, i) => 0.03 * (0.7 + 1.0 * i),         w: -0.04, age: -2, decline: true },
  { id: 'caregiver', text: 'gave up years to care for family', prob: () => 0.04,                                  w: -0.08, age: -1, decline: true },

  // ───────────────────────── work / economy ────────────────────────
  { id: 'layoff',    text: 'lost a career to automation',   tag: 'automatable', formalOnly: true, prob: () => 0.05, w: -0.12, decline: true },
  { id: 'closure',   text: 'lost the job when the plant closed', tag: 'company-town', formalOnly: true, prob: (x, i) => 0.05 * (0.7 + 0.8 * i), w: -0.14, decline: true, precaritySensitive: true },
  { id: 'cropfail',  text: 'was ruined by a failed harvest', sector: 'agriculture', prob: (x, i) => 0.05 * (0.6 + 1.4 * i), w: -0.16, decline: true, precaritySensitive: true },

  // ──────────────────────── political / macro ──────────────────────
  // currency collapse / hyperinflation — wipes savings; more to lose if richer
  { id: 'currency',  text: 'was wiped out when the currency collapsed', prob: (x, i) => 0.09 * i * i, w: (x) => -clamp(0.12 + 0.35 * x.childRank, 0.12, 0.50), decline: true },
  // expropriation / nationalization — targets the already-rich in unequal, unstable states
  { id: 'expropriated', text: 'had it all seized by the state', bandIn: RICH_BAND, prob: (x, i) => 0.05 * (0.3 + 1.5 * i) * clamp((x.country.wealthGini - 40) / 45, 0, 1), w: (x) => -clamp(0.20 + 0.45 * x.childRank, 0.2, 0.6), decline: true },
  // refugee — a downstream consequence of war (only fires if war fired)
  { id: 'refugee',   text: 'fled the country as a refugee', requires: ['war'], prob: (x, i) => 0.6 * i, w: -0.14, age: -3, decline: true, precaritySensitive: true },

  // ─────────────────────────── fortune ─────────────────────────────
  // (RARE; opportunity events richer in functioning economies / for high traits)
  { id: 'emigrate',  text: 'emigrated for a better life',   prob: (x, i) => 0.06 * i * clamp(0.5 + 0.35 * x.zIq, 0, 1.6), w: 0.20, age: 3 },
  { id: 'windfall',  text: 'came into an inheritance',      prob: (x) => 0.05 * Math.pow(x.parentRank, 1.5),      w: 0.28 },
  { id: 'business',  text: 'built a thriving business',     prob: (x, i) => (hasTag(x.career, 'trader') ? 0.045 : SUB_TOP.has(x.career.incomeBand) ? 0.03 : 0.012) * (0.6 + 0.7 * (1 - i)) * clamp(0.5 + 0.5 * x.zIq, 0.06, 1.8), w: 0.33 },
  { id: 'married',   text: 'married into wealth',           prob: () => 0.020,                                    w: 0.22 },
  { id: 'bigbreak',  text: 'caught a lucky break',          prob: (x, i) => 0.02 * (0.6 + 0.7 * (1 - i)) * clamp(0.5 + 0.5 * x.zIq, 0.06, 1.8), w: 0.18 },
  { id: 'lottery',   text: 'won the lottery',               prob: () => 0.0008,                                   w: 0.90, exemptHeadroom: true },
  // scholarship — lifts a poor, bright kid where there is a school system to climb
  { id: 'scholarship', text: 'won a life-changing scholarship', bandIn: SUB_TOP, prob: (x) => 0.04 * clamp(0.4 + 0.6 * x.zIq, 0, 1.6) * (1 - x.parentRank) * clamp(x.country.secondaryEnrollment / 100, 0.2, 1), w: 0.18 },
  // promotion / made partner — only for the formally employed, mid-band and up
  { id: 'promotion', text: 'rose to the top of the field',  bandIn: MID_UP, formalOnly: true, prob: (x) => 0.05 * clamp(0.5 + 0.5 * x.zIq, 0.1, 1.6), w: 0.16 },
  // sports breakout — height-tilted, very rare unless already an athlete
  { id: 'sports',    text: 'broke through as a star athlete', prob: (x) => (x.career.id === 'athlete' ? 0.06 : 0.004) * clamp(0.4 + 0.5 * x.zHeight, 0.05, 1.8), w: 0.40 },
  // fame — looks/talent-tilted for performers; a legendary card
  { id: 'fame',      text: 'shot to fame',                  tag: 'performer', prob: (x) => 0.03 * clamp(0.4 + 0.4 * x.zLooks + 0.3 * x.zIq, 0.06, 1.8), w: 0.42 },
  // wealth compounds — property/equity appreciation lifts those who already hold assets
  { id: 'appreciation', text: 'watched investments multiply', bandIn: MID_UP, prob: (x, i) => 0.05 * x.childRank * (1 - 0.6 * i), w: (x) => 0.10 + 0.25 * x.childRank, exemptHeadroom: true },
  // dark fortune — graft for status careers in unequal, weakly-governed states
  { id: 'corruption', text: 'grew rich on quiet corruption', prob: (x, i) => (hasTag(x.career, 'status') ? 0.05 : 0) * (0.3 + 1.2 * i) * clamp((x.country.wealthGini - 40) / 45, 0, 1), w: 0.30 },

  // ───────────────────── narration (no wealth effect) ───────────────
  // captions an outcome the career model already produced (a girl in a low-LFP,
  // low-enrollment country who landed in homemaker/informal/low-band work).
  // w:0 — narrates, never re-penalizes. Gated to stay consistent with the card.
  {
    id: 'keptfromschool', sex: 'Female', child: true, w: 0,
    text: (x, r) => pick(['was kept home from school to work', 'was married off young instead of schooled', 'never got to finish her schooling'], r),
    prob: (x) => {
      const consistent = x.career.cohort === 'homemaker' || x.career.cohort === 'informal' || LOW_BAND.has(x.career.incomeBand);
      if (!consistent) return 0;
      const enroll = x.country.secondaryEnrollment;
      const lfp = x.country.femaleLFP;
      const struct = clamp((75 - enroll) / 75, 0, 1) * clamp((55 - lfp) / 55, 0, 1);
      return 0.7 * struct;
    },
    excludes: ['scholarship'],
  },
];

// Cause nouns for the DIED line when an event proves fatal ("💀 Lost to {cause}").
// Distinct from the event's narration `text` ("lived through a famine") so the
// death line reads as a cause, not a survived-then-died contradiction. Gender-
// neutral. Only fatal-capable events (those with a fatalP) need an entry.
const FATAL_CAUSE = {
  illness: 'a serious illness', war: 'the war', famine: 'a famine',
  accident: 'a terrible accident', addiction: 'addiction', disability: 'an injury',
  workinjury: 'a workplace accident', mentalill: 'a long illness', pandemic: 'a pandemic',
  maternal: 'childbirth', disaster: 'a natural disaster', exploited: 'violence',
};

// events whose presence already explains a fall — built from the `decline` flag.
const DECLINE_IDS = new Set(EVENTS.filter((e) => e.decline).map((e) => e.id));
// Varied, specific causes for a forced downward arc, chosen by how much wealth
// survived and by country conditions — so big drops aren't all "family money".
// Phrasing must agree with the calibrated ending wealth (a "kept" phrase never
// pairs with a gutted net worth) and the magnitude of the fall.
const FALL_KEPT = ['lived off the family money', 'coasted on inherited wealth', 'never had to work the family name', 'lived comfortably off old money'];
const FALL_DRAWN = ['ran through the family money', 'frittered away the inheritance', 'let the family fortune slip away', 'sank it all into a failing business', 'made a string of bad investments', 'gambled away the family money', 'backed one bad venture after another', 'watched the family firm go under', 'was bled dry by a long legal battle', 'co-signed a loan that ruined them'];
const FALL_MODERATE = ['watched the family money run dry', 'never rebuilt after a business collapsed', 'was set back by a costly divorce', 'drained the savings supporting relatives', 'lost steady work to a lasting injury'];
const FALL_DEEP = ['never recovered after the family fell on hard times', 'was buried by debts that never cleared', 'lost the family land and never replaced it', 'never worked the same after a bad injury'];
const FALL_UNSTABLE = ['lost everything when the economy collapsed', 'was wiped out by hyperinflation', "saw the family's standing erased by upheaval", 'was driven off the family land by conflict', 'lost it all to a corrupt official'];

// A large DOWNWARD status arc from a privileged origin (the rich heir who
// underachieves into a low-status job) needs a story — otherwise the card shows
// a -40 slide with no cause and a contradictory pile of money. We force one,
// and CALIBRATE the wealth to match: an idle heir's inherited cushion is drawn
// partway down toward the job's level, so a domestic worker isn't left sitting
// in the top wealth band without any backstory. Skipped when a decline event
// (or, for the still-wealthy case, an inheritance) already tells the story.
function forcedArcEvent(ctx, childPost, keep, rand, inst = 0) {
  const occ = ctx.occ ?? 0.40;
  const origin = ctx.originStanding ?? ctx.parentRank;
  const gap = origin - (0.60 * occ + 0.40 * childPost);
  if (gap < 0.10) return null;                              // not a noticeable fall
  if (keep.some((e) => DECLINE_IDS.has(e.id))) return null; // already explained
  // in volatile countries, a big fall is often an external shock (war/economy/graft)
  if (inst > 0.45 && gap >= 0.20 && rand() < 0.6) {
    return { id: 'arc-fall', kind: 'neutral', text: pick(FALL_UNSTABLE, rand), w: -clamp(0.10 + 0.30 * (gap - 0.20), 0.06, 0.24), child: false };
  }
  if (childPost >= 0.55) {
    if (keep.some((e) => e.id === 'windfall' || e.id === 'married')) return null; // inheritance tells it
    const pull = clamp(0.35 * (childPost - occ), 0.04, 0.20);
    // "kept" phrasing only if they END comfortable after the drawdown; otherwise
    // they ran it down (so "coasted" never pairs with a working-class outcome)
    return { id: 'arc-fall', kind: 'neutral', text: pick(childPost - pull >= 0.55 ? FALL_KEPT : FALL_DRAWN, rand), w: -pull, child: false };
  }
  if (childPost >= 0.38) return { id: 'arc-fall', text: pick(FALL_MODERATE, rand), w: -0.06, child: false };
  return { id: 'arc-fall', text: pick(FALL_DEEP, rand), w: 0, child: false };
}

// does an event clear all of its (optional) eligibility gates for this person?
function passesGates(e, x) {
  if (e.sex && e.sex !== x.sex) return false;
  if (e.sector && e.sector !== x.career.sector) return false;
  if (e.tag && !hasTag(x.career, e.tag)) return false;
  if (e.bandIn && !e.bandIn.has(x.career.incomeBand)) return false;
  if (e.cohortIn && !e.cohortIn.has(x.career.cohort)) return false;
  if (e.formalOnly && VULN_COHORT.has(x.career.cohort)) return false;
  if (e.region && !e.region.includes(x.country.continent)) return false;
  if (e.minInst != null && x.inst < e.minInst) return false;
  return true;
}

// resolve a value that may be a constant or a fn(x, rand)
const val = (v, x, rand) => (typeof v === 'function' ? v(x, rand) : v);

// effective wealth delta for a fired event: resolve severity, then scale
// adversity by precarity (no safety net => the same shock hurts more).
function severityOf(e, x, rand) {
  let w = val(e.w, x, rand);
  if (e.precaritySensitive && w < 0) w *= (1 + 0.9 * x.prec);
  return w;
}

// ctx: { parentRank, childRank (= pre-event position), zIq, career, occ,
//        originStanding, sex, zLooks, zHeight }
export function rollEvents(ctx, country, rand = Math.random, bands) {
  const inst = instabilityOf(country);
  const prec = precarity(ctx, country, bands);
  // enrich the context once so event predicates can read derived signals
  const x = {
    ...ctx, country, inst, prec,
    sex: ctx.sex ?? 'Male',
    zLooks: ctx.zLooks ?? 0,
    zHeight: ctx.zHeight ?? 0,
  };

  // 1. eligibility + independent per-event roll (RATE scales aggregate frequency)
  let fired = EVENTS.filter((e) => passesGates(e, x) && rand() < RATE * val(e.prob, x, inst));
  // 2. `requires`: drop events whose prerequisite didn't fire
  const firedIds = new Set(fired.map((e) => e.id));
  fired = fired.filter((e) => !e.requires || e.requires.some((r) => firedIds.has(r)));

  // 3. resolve severity, then greedily keep at most 2 by |w|, honoring
  //    `excludes` (a kept event suppresses anything it conflicts with) — this
  //    keeps the card story clean and non-contradictory.
  const scored = fired.map((e) => ({ e, w: severityOf(e, x, rand) }));
  scored.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const keep = [];
  for (const s of scored) {
    if (keep.length >= 2) break;
    const conflict = keep.some((k) => (k.e.excludes && k.e.excludes.includes(s.e.id)) || (s.e.excludes && s.e.excludes.includes(k.e.id)));
    if (!conflict) keep.push(s);
  }

  // positive gains face diminishing rank headroom (you can't climb rank you
  // don't have) — so windfalls lift the non-rich but don't slam the already
  // rich to the very top. Lottery and asset appreciation are exempt (a jackpot
  // can mint the elite; compounding wealth is *meant* to favor existing wealth).
  const gainOf = (e, w) => (w > 0 && !e.exemptHeadroom) ? w * (1 - ctx.childRank) : w;
  const applied = keep.map((s) => ({ e: s.e, w: gainOf(s.e, s.w) }));
  let wealthDelta = applied.reduce((sum, s) => sum + s.w, 0);

  // force an explanatory story (+ wealth calibration) for a steep unexplained fall
  const forced = forcedArcEvent(ctx, clamp(ctx.childRank + wealthDelta, 0.0005, 0.9995), keep.map((s) => s.e), rand, inst);
  let finalKeep = applied;
  if (forced) {
    // forced becomes the headline; trim to 2 total
    finalKeep = [{ e: forced, w: forced.w }, ...applied.filter((s) => s.e.id !== forced.id)].slice(0, 2);
    wealthDelta = finalKeep.reduce((sum, s) => sum + s.w, 0);
  }

  // resolve lifespan effects (fatalP also scales with precarity for sensitive
  // events) and build the card-facing event list. `child` is preserved for the
  // died-young filter in roll.js. `kind` (good|bad|fatal) drives the card's pill
  // color; the one event that actually proved fatal is marked 'fatal' (so the UI
  // drops it from the pills) and its cause noun is surfaced for the DIED line.
  let ageDelta = 0, fatal = false, fatalCause = null;
  const events = [];
  for (const s of finalKeep) {
    const e = s.e;
    ageDelta += e.age || 0;
    const fp = e.fatalP ? clamp(e.fatalP * (e.precaritySensitive ? (1 + 0.7 * x.prec) : 1), 0, 0.95) : 0;
    let isFatal = false;
    if (fp && !fatal && rand() < fp) {
      fatal = true; isFatal = true;
      fatalCause = FATAL_CAUSE[e.id] || 'a serious illness';
    }
    // pill kind: a fatal roll wins; otherwise the event may declare its own kind
    // (the forced down-arc declares 'neutral' — it NARRATES the visible ▼ arc, it
    // isn't luck), else it's good/bad by the sign of its wealth effect.
    const kind = isFatal ? 'fatal' : (e.kind || (s.w > 0 ? 'good' : 'bad'));
    events.push({ text: val(e.text, x, rand), child: !!e.child, kind });
  }
  return { wealthDelta, ageDelta, fatal, fatalCause, events };
}
