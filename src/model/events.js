// Life events — the structured replacement for faceless Gaussian "luck".
// A few events fire contextually over a life, shift the destination wealth
// (in rank space), optionally cut the lifespan, and give the card a story.
// Probabilities are per-LIFETIME chances tuned to roughly realistic rates and,
// where appropriate, scaled by the country's circumstances.
import { clamp } from './stats.js';

const lifeAvg = (c) => (c.lifeM + c.lifeF) / 2;
// instability proxy from life expectancy: low-LE countries see far more war,
// famine, untreated illness, accidents and crime (war/disease/poverty cluster).
export const instabilityOf = (c) => clamp((74 - lifeAvg(c)) / 30, 0, 1);

const SUB_TOP = new Set(['low', 'lowmid', 'mid']);
const STATUS = new Set(['politician', 'banker', 'executive', 'civil-servant', 'clergy', 'lawyer']);

// w = wealth-rank delta, age = years delta, fatalP = chance the event kills early.
// child: can also befall someone who dies before adulthood. prob(ctx, instability).
export const EVENTS = [
  // — adversity (rises with country instability) —
  { id: 'illness',  text: 'battled a serious illness',         prob: (x, i) => 0.06 * (1 + 1.4 * i),                w: -0.14, age: -7,  fatalP: 0.07, child: true },
  { id: 'war',      text: 'was displaced by war',              prob: (x, i) => 0.12 * i * i,                        w: -0.34, age: -7,  fatalP: 0.18, child: true },
  { id: 'famine',   text: 'lived through a famine',            prob: (x, i) => 0.07 * i * i,                        w: -0.20, age: -5,  fatalP: 0.10, child: true },
  { id: 'accident', text: 'was struck by tragedy',             prob: (x, i) => 0.025 * (1 + 1.2 * i),               w: -0.05, age: -12, fatalP: 0.30, child: true },
  { id: 'crime',    text: 'was robbed of everything',          prob: (x, i) => 0.03 * (0.4 + 1.3 * i),              w: -0.16 },
  { id: 'addiction',text: 'lost years to addiction',          prob: () => 0.030,                                   w: -0.20, age: -6,  fatalP: 0.05 },
  // a major loss, but rarely a total wipe — pensions/property/family usually leave a residue
  { id: 'ruin',     text: 'lost most of it to bad debt',       prob: (x) => 0.03 * (0.3 + x.childRank),             w: -0.30 },
  { id: 'scandal',  text: 'fell from grace in a scandal',      prob: (x) => (STATUS.has(x.career.id) ? 0.04 : 0.004), w: -0.28 },
  // — fortune (RARE; opportunity events richer in functioning economies) —
  { id: 'emigrate', text: 'emigrated for a better life',       prob: (x, i) => 0.06 * i * clamp(0.5 + 0.35 * x.zIq, 0, 1.6), w: 0.20, age: 3 },
  { id: 'windfall', text: 'came into an inheritance',          prob: (x) => 0.05 * Math.pow(x.parentRank, 1.5),     w: 0.28 },
  { id: 'business', text: 'built a thriving business',         prob: (x, i) => (SUB_TOP.has(x.career.incomeBand) ? 0.03 : 0.012) * (0.6 + 0.7 * (1 - i)) * clamp(0.5 + 0.5 * x.zIq, 0.06, 1.8), w: 0.33 },
  { id: 'married',  text: 'married into wealth',               prob: () => 0.020,                                   w: 0.22 },
  { id: 'bigbreak', text: 'caught a lucky break',              prob: (x, i) => 0.02 * (0.6 + 0.7 * (1 - i)) * clamp(0.5 + 0.5 * x.zIq, 0.06, 1.8), w: 0.18 },
  { id: 'lottery',  text: 'won the lottery',                   prob: () => 0.0008,                                  w: 0.90 },
];

// events whose presence already explains a fall in standing/wealth, so no
// forced trajectory story is needed on top of them.
const DECLINE_IDS = new Set(['illness', 'war', 'famine', 'accident', 'crime', 'addiction', 'ruin', 'scandal']);
const IDLE_HEIR = ['lived off the family money', 'coasted on inherited wealth', 'never had to work the family money'];

// A large DOWNWARD status arc from a privileged origin (the rich heir who
// underachieves into a low-status job) needs a story — otherwise the card shows
// a -40 slide with no cause and a contradictory pile of money. We force one,
// and CALIBRATE the wealth to match: an idle heir's inherited cushion is drawn
// partway down toward the job's level, so a domestic worker isn't left sitting
// in the top wealth band without any backstory. Skipped when a decline event
// (or, for the still-wealthy case, an inheritance) already tells the story.
function forcedArcEvent(ctx, childPost, keep, rand) {
  const occ = ctx.occ ?? 0.40;
  const origin = ctx.originStanding ?? ctx.parentRank;
  if (origin - (0.60 * occ + 0.40 * childPost) < 0.18) return null; // not a steep fall
  if (keep.some((e) => DECLINE_IDS.has(e.id))) return null;         // already explained
  if (childPost >= 0.55) {
    if (keep.some((e) => e.id === 'windfall' || e.id === 'married')) return null; // inheritance tells it
    const pull = clamp(0.35 * (childPost - occ), 0.04, 0.20);
    return { id: 'arc-fall', text: IDLE_HEIR[Math.floor(rand() * IDLE_HEIR.length)], w: -pull, child: false };
  }
  if (childPost >= 0.38) return { id: 'arc-fall', text: 'watched the family money run dry', w: -0.05, child: false };
  return { id: 'arc-fall', text: 'never recovered after the family fell on hard times', w: 0, child: false };
}

// ctx: { parentRank, childRank (= pre-event position), zIq, career, occ }
export function rollEvents(ctx, country, rand = Math.random) {
  const inst = instabilityOf(country);
  const fired = EVENTS.filter((e) => rand() < e.prob(ctx, inst));
  // keep at most 2, the most consequential (keeps the card story clean)
  fired.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  let keep = fired.slice(0, 2);

  // positive gains face diminishing rank headroom (you can't climb rank you
  // don't have) — so windfalls lift the non-rich but don't slam the already
  // rich to the very top. A lottery jackpot is exempt: it can mint the elite.
  const gainOf = (e) => (e.w > 0 && e.id !== 'lottery') ? e.w * (1 - ctx.childRank) : e.w;
  let wealthDelta = keep.reduce((s, e) => s + gainOf(e), 0);

  // force an explanatory story (+ wealth calibration) for a steep unexplained fall
  const forced = forcedArcEvent(ctx, clamp(ctx.childRank + wealthDelta, 0.0005, 0.9995), keep, rand);
  if (forced) {
    keep = [forced, ...keep.filter((e) => e.id !== forced.id)].slice(0, 2); // forced is the headline
    wealthDelta = keep.reduce((s, e) => s + gainOf(e), 0);
  }

  let ageDelta = 0, fatal = false;
  const events = [];
  for (const e of keep) {
    ageDelta += e.age || 0;
    if (e.fatalP && rand() < e.fatalP) fatal = true;
    events.push({ text: e.text, child: !!e.child });
  }
  return { wealthDelta, ageDelta, fatal, events };
}
