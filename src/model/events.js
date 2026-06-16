// Life events — the structured replacement for faceless Gaussian "luck".
// A few events fire contextually over a life, shift the destination wealth
// (in rank space, and they MAY break the career bounds — a lottery, a war),
// optionally cut the lifespan, and give the card a story. Most lives get 0-1.
import { clamp } from './stats.js';

const lifeAvg = (c) => (c.lifeM + c.lifeF) / 2;
// instability proxy from life expectancy: low-LE countries see more war/famine
export const instabilityOf = (c) => clamp((73 - lifeAvg(c)) / 28, 0, 1);

const SUB_TOP = new Set(['low', 'lowmid', 'mid']);
const STATUS = new Set(['politician', 'banker', 'executive', 'civil-servant', 'clergy', 'lawyer']);

// w = wealth-rank delta, age = years delta, fatalP = chance the event kills early.
// child: can also befall someone who dies before adulthood. prob(ctx, instability).
export const EVENTS = [
  { id: 'war',      text: 'was displaced by war',              prob: (x, i) => 0.11 * i,                                       w: -0.34, age: -7,  fatalP: 0.18, child: true },
  { id: 'famine',   text: 'lived through a famine',            prob: (x, i) => 0.06 * i,                                       w: -0.20, age: -5,  fatalP: 0.10, child: true },
  { id: 'illness',  text: 'battled a serious illness',         prob: (x, i) => 0.09 * (1 + 0.6 * i),                           w: -0.14, age: -7,  fatalP: 0.07, child: true },
  { id: 'accident', text: 'was struck by tragedy',             prob: () => 0.045,                                              w: -0.05, age: -12, fatalP: 0.30, child: true },
  { id: 'addiction',text: 'lost years to addiction',          prob: () => 0.035,                                              w: -0.20, age: -6,  fatalP: 0.05 },
  { id: 'crime',    text: 'was robbed of everything',          prob: (x, i) => 0.04 * (0.5 + i),                               w: -0.16 },
  { id: 'ruin',     text: 'lost it all to bad debt',           prob: (x) => 0.05 * (0.4 + x.childRank),                        w: -0.38 },
  { id: 'scandal',  text: 'fell from grace in a scandal',      prob: (x) => (STATUS.has(x.career.id) ? 0.07 : 0.008),          w: -0.28 },
  { id: 'windfall', text: 'came into an inheritance',          prob: (x) => 0.05 * (0.5 + x.parentRank),                       w: 0.28 },
  { id: 'lottery',  text: 'won the lottery',                   prob: () => 0.012,                                              w: 0.45 },
  { id: 'business', text: 'built a thriving business',         prob: (x) => (SUB_TOP.has(x.career.incomeBand) ? 0.07 : 0.02) * clamp(0.55 + 0.5 * x.zIq, 0.08, 1.8), w: 0.33 },
  { id: 'married',  text: 'married into wealth',               prob: () => 0.045,                                              w: 0.22 },
  { id: 'bigbreak', text: 'caught a lucky break', prob: (x) => (SUB_TOP.has(x.career.incomeBand) ? 0.02 : 0.05) * clamp(0.55 + 0.5 * x.zIq, 0.08, 1.8), w: 0.18 },
  { id: 'emigrate', text: 'emigrated for a better life',       prob: (x, i) => 0.07 * i * clamp(0.5 + 0.35 * x.zIq, 0, 1.6),   w: 0.20, age: 3 },
];

// ctx: { parentRank, childRank, zIq, career }
export function rollEvents(ctx, country, rand = Math.random) {
  const inst = instabilityOf(country);
  const fired = EVENTS.filter((e) => rand() < e.prob(ctx, inst));
  // keep at most 2, the most consequential (keeps the card story clean)
  fired.sort((a, b) => Math.abs(b.w) - Math.abs(a.w));
  const keep = fired.slice(0, 2);
  let wealthDelta = 0, ageDelta = 0, fatal = false;
  const events = [];
  for (const e of keep) {
    wealthDelta += e.w;
    ageDelta += e.age || 0;
    if (e.fatalP && rand() < e.fatalP) fatal = true;
    events.push({ text: e.text, child: !!e.child });
  }
  return { wealthDelta, ageDelta, fatal, events };
}
