// Fortune score, percentile (vs every birth on earth), and verdict tiers.
//
// The card's headline — "luckier than 87% of all births" + a tier (💀 FAIL →
// MYTHIC) — comes from ONE designed number per life, the Fortune score S ∈ [0,1].
//
// Design principle: THE VERDICT NEVER OUTRUNS THE VISIBLE WEALTH. Players read
// "luck" as the big number on the card (net worth) — a poor card is an unlucky
// life, and no amount of longevity, climb, or IQ should override that. So WEALTH
// (global) is the spine; everything else is a bonus that only modulates *within
// what wealth allows* and is itself scaled by wealth — a climb counts only if it
// ended in money, a long life only enriches an already-rich one. Mathematically
// S ≤ wealth tail, so below-top-25% wealth simply cannot reach EPIC+. Wealth is
// GLOBAL (1 − pct.money), killing the old "top-of-a-poor-country = luckier than
// 98%" bug. Percentile = S's position in the population CDF (data/luckCdf.json);
// tiers cut off the percentile.
import { clamp } from './stats.js';

// ── the knob block (re-gen the CDF after changing these: npm run cdf) ───────
export const FORTUNE = {
  wealthFloor: 0.82,  // pure wealth earns this fraction of its tail; story adds the rest
  mobSpan: 70,        // mobilityDelta that maps to a full climb bonus
  cutShortMax: 0.15,  // ceiling for a life that never reached adulthood
  // "story" bonus — only matters scaled by wealth (climb counts only if it ended rich).
  // weights sum to 1 so the bonus is in [0,1].
  bonus: { climb: 0.35, life: 0.25, career: 0.18, iq: 0.12, looks: 0.05, height: 0.05 },
};

// career prestige → global "impressiveness" tail (careers.json: common/uncommon/rare/legendary)
const PREST_TAIL = { common: 0.10, uncommon: 0.35, rare: 0.62, legendary: 0.90 };
// global TOP% → luck tail (smaller pct = rarer = luckier). pct fields are global.
const tail = (pct) => clamp(1 - (pct == null ? 50 : pct) / 100, 0, 1);

// A life that never reached adulthood never realized its rolled wealth/career —
// those signals are counterfactual. Score it on survival alone (younger =
// unluckier), landing in FAIL/ROUGH whatever destiny it never got to live.
const reachedAdulthood = (life) => !life.diedYoung;
const survivalScore = (age) => clamp((age / 18) * FORTUNE.cutShortMax, 0, FORTUNE.cutShortMax);

// Fortune score S ∈ [0,1]. Pure: reads only fields roll.js already computes
// (global pct.*, mobilityDelta, career.prestige).
export function fortuneScore(life) {
  if (!reachedAdulthood(life)) return survivalScore(life.age);

  const F = FORTUNE, p = life.pct || {};
  const wealth = tail(p.money);   // GLOBAL wealth — the spine; S is bounded by this
  const climbUp = clamp((life.mobilityDelta ?? 0) / F.mobSpan, 0, 1); // a fall shows up as low wealth
  const bo = F.bonus;
  const story = clamp(
    bo.climb * climbUp + bo.life * tail(p.life) + bo.career * (PREST_TAIL[life.career?.prestige] ?? 0.10)
    + bo.iq * tail(p.iq) + bo.looks * tail(p.looks) + bo.height * tail(p.height),
    0, 1,
  );
  // Wealth dominates: S ≤ wealth tail, and the story only modulates within
  // [wealthFloor·wealth, wealth] — so on a poor card the story barely registers,
  // and a globally-poor life can never reach a lucky tier.
  return clamp(wealth * (F.wealthFloor + (1 - F.wealthFloor) * story), 0, 1);
}

// ── percentile via a precomputed CDF (quantile function) ────────────────────
export function buildCdf(scores, buckets = 512) {
  const sorted = [...scores].sort((a, b) => a - b);
  const edges = new Array(buckets + 1);
  for (let i = 0; i <= buckets; i++) {
    const pos = (i / buckets) * (sorted.length - 1);
    const lo = Math.floor(pos), hi = Math.ceil(pos), f = pos - lo;
    edges[i] = sorted[lo] + (sorted[hi] - sorted[lo]) * f;
  }
  return { buckets, edges };
}

// percentile (0..100): "luckier than X% of all births"
export function percentileOf(score, cdf) {
  const { edges } = cdf;
  const n = edges.length - 1;
  if (score <= edges[0]) return 0;
  if (score >= edges[n]) return 100;
  let lo = 0, hi = n;
  while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (edges[mid] <= score) lo = mid; else hi = mid; }
  const span = edges[hi] - edges[lo] || 1;
  const frac = (lo + (score - edges[lo]) / span) / n;
  return clamp(frac * 100, 0, 100);
}

// ── verdict tiers (cut off the percentile) ──────────────────────────────────
// v2 cutoffs: high tiers are now genuinely RARE so they're earned, not the top
// decile of a smooth blend. LEGENDARY ≈ top 4% (~1 in 25 pulls), MYTHIC ≈ top
// 0.4% (~1 in 250). EPIC absorbs "very good but not rare". band keys the DIED
// tail bank; mood the opener register; foil = the header shimmers (EPIC+).
export const TIERS = [
  { key: 'fail',      name: '💀 FAIL',    short: 'FAIL',      color: '#d4361f', max: 5,        band: 'low',  mood: 'grim',    foil: false },
  { key: 'rough',     name: 'ROUGH',      short: 'ROUGH',     color: '#c2410c', max: 25,       band: 'low',  mood: 'grim',    foil: false },
  { key: 'mid',       name: 'MID',        short: 'MID',       color: '#8a8178', max: 50,       band: 'mid',  mood: 'neutral', foil: false },
  { key: 'blessed',   name: 'BLESSED',    short: 'BLESSED',   color: '#0b7a3a', max: 82,       band: 'good', mood: 'warm',    foil: false },
  { key: 'epic',      name: 'EPIC',       short: 'EPIC',      color: '#7c3aed', max: 96,       band: 'good', mood: 'warm',    foil: true  },
  { key: 'legendary', name: 'LEGENDARY',  short: 'LEGENDARY', color: '#ff7a00', max: 99.6,     band: 'top',  mood: 'warm',    foil: true  },
  { key: 'mythic',    name: 'MYTHIC',     short: 'MYTHIC',    color: '#ff2d6b', max: Infinity, band: 'top',  mood: 'warm',    foil: true  },
];

export function tierOf(percentile) {
  for (const t of TIERS) if (percentile < t.max) return t;
  return TIERS[TIERS.length - 1];
}

// ── class label → short label the card's arc uses ───────────────────────────
const SHORT_CLASS = {
  'lower class': 'lower', 'working class': 'working', 'middle class': 'middle',
  'upper-middle class': 'upper-mid', 'upper class': 'upper', 'the elite': 'elite',
};
export const shortClass = (label) => SHORT_CLASS[label] ?? label;
