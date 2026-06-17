// Spin Your Life — model validation harness.
// Drives the SHARED model (src/model/roll.js) so it validates what actually
// ships. Checks structural copula correlations, career-anchored invariants
// (job <-> class agreement), gates the key distributions, and emits a
// machine-readable sim-report.json for baseline diffing.
//
// Runs from a FIXED SEED so results are reproducible and a behavior-preserving
// refactor shows zero drift. EXITS NON-ZERO if any gated check fails, so it is a
// real CI gate (`npm run sim`) instead of advisory stdout.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRoller } from '../src/model/roll.js';
import { RULING } from '../src/model/content.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dir, '../data', f), 'utf8'));
const SEED = 0x5eed; // fixed root seed -> deterministic population
const bandsData = load('bands.json').bands;
const roller = makeRoller({
  countries: load('countries.json'), params: load('model-params.json'),
  names: load('names.json'), careers: load('careers.json').careers,
  bands: bandsData, imputation: load('imputation.json'), seed: SEED,
  luckCdf: load('luckCdf.json'), // so life.luckPct/verdict are populated for the Fortune gates
});
const N = +(process.argv[2] || 40000);

const EDU_RANK = { none: 0, primary: 1, secondary: 2, vocational: 3, bachelor: 4, postgrad: 5 };
const BANDS = [...bandsData].sort((a, b) => a.order - b.order).map((b) => b.id);
const ELITE = 0.8333; // childRank threshold for "the elite" class (5/6)

// ---- pass/fail tracking + report ------------------------------------------
let failed = 0;
const report = { seed: SEED, n: N, checks: {}, metrics: {} };
const gauge = (label, got, target, tol, key) => {
  const ok = Math.abs(got - target) <= tol;
  if (!ok) failed++;
  if (key) report.checks[key] = { got: +got.toFixed(4), target, tol, ok };
  return `  ${label.padEnd(30)} ${got.toFixed(3).padStart(7)}   target ${target} ±${tol}${ok ? '  PASS' : '  FAIL'}`;
};
const gate = (label, cond, detail, key) => {
  if (!cond) failed++;
  if (key) report.checks[key] = { ok: !!cond, detail };
  return `  ${label.padEnd(30)} ${(cond ? 'PASS' : 'FAIL').padStart(7)}   ${detail}`;
};
const note = (label, got, key) => { if (key) report.metrics[key] = +(+got).toFixed(4); return `  ${label.padEnd(30)} ${(+got).toFixed(3).padStart(7)}   `; };

// ---- golden-seed reproducibility (the foundation the gates rely on) --------
const g1 = roller.rollLife('golden-001');
const g2 = roller.rollLife('golden-001');
const reproducible = g1.name === g2.name && g1.netWorth === g2.netWorth && g1.career.id === g2.career.id && g1.age === g2.age && g1.rarity === g2.rarity;

// ---- roll the population --------------------------------------------------
const L = [];
for (let i = 0; i < N; i++) L.push(roller.rollLife());

// ---- stats helpers --------------------------------------------------------
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
function pearson(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  return sxy / Math.sqrt(sx * sy);
}

const adults = L.filter((l) => !l.diedYoung);
const males = L.filter((l) => l.sex === 'Male');
const females = L.filter((l) => l.sex === 'Female');
const col = (arr, f) => arr.map(f);

const rHtLkM = pearson(col(males, (l) => l.zHeight), col(males, (l) => l.zLooks));
const rHtLkF = pearson(col(females, (l) => l.zHeight), col(females, (l) => l.zLooks));

const rIqWealth = pearson(col(adults, (l) => l.zIq), col(adults, (l) => l.childRank));
const rEduWealth = pearson(col(adults, (l) => EDU_RANK[l.education]), col(adults, (l) => l.childRank));
const rParentChild = pearson(col(adults, (l) => l.parentRank), col(adults, (l) => l.childRank));
const rIqLife = pearson(col(adults, (l) => l.zIq), col(adults, (l) => l.age));
const childMean = mean(col(adults, (l) => l.childRank));

const byBand = Object.fromEntries(BANDS.map((b) => [b, []]));
for (const l of adults) (byBand[l.career.incomeBand] ||= []).push(l.childRank);
const bandMean = BANDS.map((b) => (byBand[b].length ? mean(byBand[b]) : NaN));
// strict monotonicity with a small noise epsilon: the rare `elite` band's mean
// is sampling-noisy at low N, but a genuine regression dips far more than 0.01.
let monotonic = true;
for (let i = 1; i < BANDS.length; i++) if (!(bandMean[i] > bandMean[i - 1] - 0.01)) monotonic = false;

const elites = adults.filter((l) => l.classFinal === 'the elite');
const eliteLeak = elites.filter((l) => !(RULING.has(l.career.id) || l.parentRank >= 0.98)).length;
const evtRate = L.filter((l) => l.events && l.events.length > 0).length / L.length;
const eliteRate = elites.length / adults.length;

const mobMean = mean(col(adults, (l) => l.mobilityDelta));
const steepDrops = adults.filter((l) => l.mobilityDelta <= -18);
const steepUnexplained = steepDrops.filter((l) => !((l.events && l.events.length) || l.career.cohort)).length;
const steepCovered = steepDrops.length ? 1 - steepUnexplained / steepDrops.length : 1;
const overQual = adults.filter((l) => !l.career.cohort && EDU_RANK[l.education] - EDU_RANK[l.career.minEducation] >= 3).length / adults.length;

// per-event fire-rate table (report only — feeds future per-event gates)
const evtCounts = {};
for (const l of L) for (const e of (l.events || [])) evtCounts[e.text] = (evtCounts[e.text] || 0) + 1;

const cond = (f) => { const a = adults.filter(f).map((l) => l.childRank); return a.length ? mean(a) : NaN; };
const richDumb = cond((l) => l.parentRank > 0.9 && l.zIq < -1.5);
const poorSmart = cond((l) => l.parentRank < 0.1 && l.zIq > 1.5);
const richSmart = cond((l) => l.parentRank > 0.9 && l.zIq > 1.5);
const poorDumb = cond((l) => l.parentRank < 0.1 && l.zIq < -1.5);

// ---- Fortune-score sanity (guards the national-rank "$7.5k = luckier-than-98%"
// bug from returning): luck % is GLOBAL, so the globally-poor must skew unlucky,
// and the high tiers must stay genuinely rare.
const median = (arr) => { const s = [...arr].sort((a, b) => a - b); return s.length ? s[s.length >> 1] : NaN; };
const sub5k = adults.filter((l) => l.netWorth < 5000);
const sub5kLuck = median(sub5k.map((l) => l.luckPct));
// THE wealth ceiling: the verdict never outruns the visible net worth. Because
// S ≤ the global wealth tail, a life clearly outside the global top quartile of
// wealth (here >top-30%) can never reach a lucky tier (EPIC+). This is the guard
// that keeps "$7.5k = luckier than 93%" from ever coming back.
const below30 = adults.filter((l) => l.pct.money > 30);
const below30Epic = below30.length ? below30.filter((l) => l.luckPct >= 82).length / below30.length : 0;
const legRate = adults.filter((l) => l.luckPct >= 96).length / adults.length;

// ---- report ----------------------------------------------------------------
console.log(`\nSpin Your Life — model sim (shared model)   N=${N.toLocaleString()}, ${L.length} lives, ${adults.length} adults   seed=0x${SEED.toString(16)}\n`);

console.log('DETERMINISM');
console.log(gate('seeded roll reproducible', reproducible, reproducible ? 'same seed -> identical life' : 'NON-DETERMINISTIC', 'reproducible'));

console.log('\nSTRUCTURAL (copula — hard targets)');
console.log(gauge('corr(height, looks) M', rHtLkM, 0.20, 0.03, 'corrHtLkM'));
console.log(gauge('corr(height, looks) F', rHtLkF, 0.10, 0.03, 'corrHtLkF'));

console.log('\nCAREER-ANCHORED INVARIANTS');
console.log(gate('class rises with income band', monotonic, `[${bandMean.map((m) => m.toFixed(2)).join(' ')}]`, 'monotoneBands'));
console.log(gate('elite = power + wealth/dynasty', eliteLeak === 0, `${eliteLeak} unearned leaks`, 'eliteLeak'));
console.log(gate('heavy over-qualification rare', overQual < 0.03, `${(overQual * 100).toFixed(2)}% of adults`, 'overQual'));
console.log(gauge('mean childRank (≈0.5 uniform)', childMean, 0.50, 0.07, 'childMean'));
console.log(gauge('mean mobility Δ (≈0)', mobMean, 0, 3, 'mobMean'));
console.log(gate('steep drops carry a story', steepCovered >= 0.98, `${(steepCovered * 100).toFixed(1)}% of ≤-18 arcs explained`, 'steepCovered'));
// formerly printed-but-unchecked — now gated around calibrated targets so a
// content change that balloons the event rate or mints elites fails loudly.
console.log(gauge('lives with an event', evtRate, 0.45, 0.06, 'evtRate'));
console.log(gate('elite class stays scarce', eliteRate < 0.01, `${(eliteRate * 100).toFixed(2)}% of adults`, 'eliteRate'));

console.log('\nFORTUNE SCORE (wealth-dominant — the verdict never outruns the money)');
console.log(gate('globally-poor read unlucky', sub5kLuck < 38, `sub-$5k median luck ${sub5kLuck.toFixed(1)}%`, 'sub5kLuck'));
console.log(gate('wealth ceiling: <top-30% never EPIC+', below30Epic === 0, `${(below30Epic * 100).toFixed(3)}% of below-top-30% wealth reach EPIC+`, 'wealthCeiling'));
console.log(gate('LEGENDARY+ stays rare', legRate < 0.06, `${(legRate * 100).toFixed(1)}% of adults`, 'legendRate'));

console.log('\nEMERGENT CORRELATIONS (report)');
console.log(note('corr(IQ, wealth)', rIqWealth, 'rIqWealth'));
console.log(note('corr(education, wealth)', rEduWealth, 'rEduWealth'));
console.log(note('corr(parent, child wealth)', rParentChild, 'rParentChild'));
console.log(note('corr(IQ, lifespan)', rIqLife, 'rIqLife'));

console.log('\nDIRECTIONAL SANITY (mean adult wealth rank 0..1)');
console.log(`  born rich + low IQ   : ${richDumb.toFixed(3)}     born rich + high IQ : ${richSmart.toFixed(3)}`);
console.log(`  born poor + high IQ  : ${poorSmart.toFixed(3)}     born poor + low IQ  : ${poorDumb.toFixed(3)}`);
report.metrics.directional = { richDumb: +richDumb.toFixed(3), richSmart: +richSmart.toFixed(3), poorSmart: +poorSmart.toFixed(3), poorDumb: +poorDumb.toFixed(3) };
report.metrics.bandMean = bandMean.map((m) => +m.toFixed(3));
report.metrics.eventFireRate = Object.fromEntries(Object.entries(evtCounts).sort((a, b) => b[1] - a[1]).map(([k, v]) => [k, +(v / L.length).toFixed(4)]));

// ---- write report + exit code ---------------------------------------------
fs.writeFileSync(path.join(__dir, 'sim-report.json'), JSON.stringify(report, null, 2));
console.log(`\n${failed === 0 ? 'ALL CHECKS PASS' : `${failed} CHECK(S) FAILED`}   ->  sim/sim-report.json\n`);
process.exit(failed === 0 ? 0 : 1);
