// Fortune score, percentile (vs every birth on earth), and verdict tiers.
//
// The card's headline — "Luckier than 87% of all births" + a tier (💀 FAIL →
// MYTHIC) — comes from ONE designed number per life, the Fortune score S ∈ [0,1].
// S is a deliberately-shaped weighted blend (not the multiplicative rarity), so a
// long quiet life reads as "fine", not Legendary. The percentile is S's position
// in the population CDF (Monte-Carlo'd once into data/luckCdf.json); tiers are cut
// off the percentile, not the raw score. See sim/gen-cdf.mjs for the CDF build.
import { clamp } from './stats.js';

// ── designed weights (the one knob block) ──────────────────────────────────
// Each sub-signal is mapped to [0,1] then blended. Tunable; re-gen the CDF after
// changing these (npm run cdf). Sum of WEIGHTS = 1 by construction.
export const FORTUNE = {
  weights: { wealth: 0.40, mobility: 0.22, lifespan: 0.26, career: 0.12 },
  mobSpan: 160,      // mobilityDelta that maps to a full ±0.5 swing around neutral
  eventNudge: 0.05,  // small extra so good luck visibly lifts / fatal sinks beyond wealth
  cutShortMax: 0.15, // ceiling for a life that never reached adulthood (see below)
};

// band → 0..1 "how high the career lands" (rare/high job = a luck notch, not the
// whole score). Mirrors data/bands.json order; stable 6-band ladder.
const BAND_NOTCH = { low: 0, lowmid: 0.2, mid: 0.4, highmid: 0.6, high: 0.8, elite: 1.0 };

// A life that never reached adulthood never realized its rolled wealth/career —
// those signals are counterfactual and must NOT lift the score. Such lives are
// scored on survival alone (younger = unluckier), landing in FAIL/ROUGH whatever
// destiny they never got to live.
const reachedAdulthood = (life) => !life.diedYoung;
const survivalScore = (age) => clamp((age / 18) * FORTUNE.cutShortMax, 0, FORTUNE.cutShortMax);

// Fortune score S ∈ [0,1] for a rolled life. Pure: reads only fields roll.js
// already computes (childRank, mobilityDelta, pct.life, career band, eventSwing).
export function fortuneScore(life) {
  if (!reachedAdulthood(life)) return survivalScore(life.age);

  const W = FORTUNE.weights;
  const wealth = clamp(life.childRank ?? 0.5, 0, 1);
  const mobility = clamp(0.5 + (life.mobilityDelta ?? 0) / FORTUNE.mobSpan, 0, 1);
  // pct.life = % of the world expected to outlive this age → low = rare long life.
  const lifespan = clamp(1 - (life.pct?.life ?? 50) / 100, 0, 1);
  const career = BAND_NOTCH[life.career?.incomeBand] ?? 0.4;
  const core = W.wealth * wealth + W.mobility * mobility + W.lifespan * lifespan + W.career * career;
  // eventSwing is in wealth-rank space (sum of event wealthDeltas); a windfall
  // nudges up, a fatal/ruinous run nudges down — on top of what it already moved
  // childRank, so the luck *reads* on the card.
  const swing = clamp((life.eventSwing ?? 0) * FORTUNE.eventNudge, -0.15, 0.15);
  return clamp(core + swing, 0, 1);
}

// ── percentile via a precomputed CDF ────────────────────────────────────────
// The CDF asset is the quantile function: edges[i] is the S value at cumulative
// fraction i/(N-1). Compact (a few hundred floats) and exact under correlation.

// Build the quantile-function representation from a sample of scores.
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

// percentile (0..100): "luckier than X% of all births". Binary-search S among the
// quantile edges, interpolate within the bucket.
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

// ── verdict tiers (cut off the percentile, exactly the prototype's cutoffs) ──
// mood drives DIED opener register (dignified vs blunt); band keys the tail bank.
export const TIERS = [
  { key: 'fail',      name: '💀 FAIL',    short: 'FAIL',      color: '#d4361f', max: 5,        band: 'low',  mood: 'grim'    },
  { key: 'rough',     name: 'ROUGH',      short: 'ROUGH',     color: '#c2410c', max: 25,       band: 'low',  mood: 'grim'    },
  { key: 'mid',       name: 'MID',        short: 'MID',       color: '#8a8178', max: 50,       band: 'mid',  mood: 'neutral' },
  { key: 'blessed',   name: 'BLESSED',    short: 'BLESSED',   color: '#0b7a3a', max: 75,       band: 'good', mood: 'warm'    },
  { key: 'epic',      name: 'EPIC',       short: 'EPIC',      color: '#7c3aed', max: 90,       band: 'good', mood: 'warm'    },
  { key: 'legendary', name: 'LEGENDARY',  short: 'LEGENDARY', color: '#ff7a00', max: 98,       band: 'top',  mood: 'warm'    },
  { key: 'mythic',    name: 'MYTHIC',     short: 'MYTHIC',    color: '#ff2d6b', max: Infinity, band: 'top',  mood: 'warm'    },
];

export function tierOf(percentile) {
  for (const t of TIERS) if (percentile < t.max) return t;
  return TIERS[TIERS.length - 1];
}

// ── class label → short label the card's arc uses (model emits verbose labels) ─
const SHORT_CLASS = {
  'lower class': 'lower', 'working class': 'working', 'middle class': 'middle',
  'upper-middle class': 'upper-mid', 'upper class': 'upper', 'the elite': 'elite',
};
export const shortClass = (label) => SHORT_CLASS[label] ?? label;
