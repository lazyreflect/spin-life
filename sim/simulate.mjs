// Spin Your Life — model validation harness.
// Drives the SHARED model (src/model/roll.js) so it validates what actually
// ships. Checks the structural copula correlations, the career-anchored
// invariants (job <-> class agreement), and prints emergent correlations +
// directional sanity. Pure Node, no deps.  Run: node sim/simulate.mjs [N]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRoller } from '../src/model/roll.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dir, '../data', f), 'utf8'));
const roller = makeRoller({
  countries: load('countries.json'), params: load('model-params.json'),
  names: load('names.json'), careers: load('careers.json').careers,
});
const N = +(process.argv[2] || 40000);

const EDU_RANK = { none: 0, primary: 1, secondary: 2, vocational: 3, bachelor: 4, postgrad: 5 };
const BANDS = ['low', 'lowmid', 'mid', 'highmid', 'high', 'elite'];
const ELITE = 0.8333; // childRank threshold for "the elite" class (5/6)

// ---- roll the population --------------------------------------------------
const L = [];
for (let i = 0; i < N; i++) L.push(roller.rollLife());

// ---- stats helpers --------------------------------------------------------
const mean = (a) => a.reduce((s, x) => s + x, 0) / a.length;
const variance = (a) => { const m = mean(a); return a.reduce((s, x) => s + (x - m) ** 2, 0) / a.length; };
function pearson(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  return sxy / Math.sqrt(sx * sy);
}

// adults only for wealth/career/class analysis (early deaths never lived a career)
const adults = L.filter((l) => !l.diedYoung);
const males = L.filter((l) => l.sex === 'Male');
const females = L.filter((l) => l.sex === 'Female');
const col = (arr, f) => arr.map(f);

// ---- structural copula correlations (must hold — straight from endowmentCorr)
const rHtLkM = pearson(col(males, (l) => l.zHeight), col(males, (l) => l.zLooks));
const rHtLkF = pearson(col(females, (l) => l.zHeight), col(females, (l) => l.zLooks));

// ---- emergent correlations (report + directional asserts) -----------------
const rIqWealth = pearson(col(adults, (l) => l.zIq), col(adults, (l) => l.childRank));
const rEduWealth = pearson(col(adults, (l) => EDU_RANK[l.education]), col(adults, (l) => l.childRank));
const rParentChild = pearson(col(adults, (l) => l.parentRank), col(adults, (l) => l.childRank));
const rIqLife = pearson(col(adults, (l) => l.zIq), col(adults, (l) => l.age));
const childMean = mean(col(adults, (l) => l.childRank));

// ---- career-anchored invariants -------------------------------------------
const byBand = Object.fromEntries(BANDS.map((b) => [b, []]));
for (const l of adults) (byBand[l.career.incomeBand] ||= []).push(l.childRank);
const bandMean = BANDS.map((b) => (byBand[b].length ? mean(byBand[b]) : NaN));
let monotonic = true;
for (let i = 1; i < BANDS.length; i++) if (!(bandMean[i] > bandMean[i - 1])) monotonic = false;
// only top-tier (high) or business-owner (elite) careers may reach elite class —
// UNLESS a life event (lottery, windfall, war...) legitimately broke the bounds
const subElite = ['low', 'lowmid', 'mid', 'highmid'];
const eliteLeak = adults.filter((l) => subElite.includes(l.career.incomeBand) && l.childRank >= ELITE && (!l.events || l.events.length === 0)).length;
const evtRate = L.filter((l) => l.events && l.events.length > 0).length / L.length;
// heavy over-qualification (3+ tiers above the job's minimum) should be rare
const overQual = adults.filter((l) => EDU_RANK[l.education] - EDU_RANK[l.career.minEducation] >= 3).length / adults.length;

// ---- directional sanity ----------------------------------------------------
const cond = (f) => { const a = adults.filter(f).map((l) => l.childRank); return a.length ? mean(a) : NaN; };
const richDumb = cond((l) => l.parentRank > 0.9 && l.zIq < -1.5);
const poorSmart = cond((l) => l.parentRank < 0.1 && l.zIq > 1.5);
const richSmart = cond((l) => l.parentRank > 0.9 && l.zIq > 1.5);
const poorDumb = cond((l) => l.parentRank < 0.1 && l.zIq < -1.5);

// ---- report ----------------------------------------------------------------
const row = (label, got, target, tol) => {
  const ok = tol == null ? '' : (Math.abs(got - target) <= tol ? '  PASS' : '  FAIL');
  const tgt = target == null ? '' : `target ${target}${tol != null ? ` ±${tol}` : ''}`;
  return `  ${label.padEnd(30)} ${got.toFixed(3).padStart(7)}   ${tgt}${ok}`;
};
const check = (label, cond, detail) => `  ${label.padEnd(30)} ${(cond ? 'PASS' : 'FAIL').padStart(7)}   ${detail}`;

console.log(`\nSpin Your Life — model sim (shared model)   N=${N.toLocaleString()}, ${L.length} lives, ${adults.length} adults\n`);
console.log('STRUCTURAL (copula — hard targets)');
console.log(row('corr(height, looks) M', rHtLkM, 0.20, 0.03));
console.log(row('corr(height, looks) F', rHtLkF, 0.10, 0.03));

console.log('\nCAREER-ANCHORED INVARIANTS');
console.log(check('class rises with income band', monotonic, `[${bandMean.map((m) => m.toFixed(2)).join(' ')}]`));
console.log(check('only top-tier career -> elite*', eliteLeak === 0, `${eliteLeak} leaks (*absent events)`));
console.log(check('heavy over-qualification rare', overQual < 0.03, `${(overQual * 100).toFixed(2)}% of adults`));
console.log(row('mean childRank (≈0.5 uniform)', childMean, 0.50, 0.07));
console.log(`  ${'lives with an event'.padEnd(30)} ${(evtRate * 100).toFixed(1)}%`);

console.log('\nEMERGENT CORRELATIONS (report)');
console.log(row('corr(IQ, wealth)', rIqWealth, null));
console.log(row('corr(education, wealth)', rEduWealth, null));
console.log(row('corr(parent, child wealth)', rParentChild, null));
console.log(row('corr(IQ, lifespan)', rIqLife, null));

console.log('\nDIRECTIONAL SANITY (mean adult wealth rank 0..1)');
console.log(`  born rich + low IQ   : ${richDumb.toFixed(3)}     born rich + high IQ : ${richSmart.toFixed(3)}`);
console.log(`  born poor + high IQ  : ${poorSmart.toFixed(3)}     born poor + low IQ  : ${poorDumb.toFixed(3)}`);
console.log('');
