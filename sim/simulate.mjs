// Spin Your Life — trait-model simulation & calibration harness
// Validates realized correlations / dispersion against DESIGN.md §5 targets.
// Pure Node, no deps.  Run: node sim/simulate.mjs [N]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const COUNTRIES = JSON.parse(fs.readFileSync(path.join(__dir, '../data/countries.json'), 'utf8'));
const N = +(process.argv[2] || 200000);

// ----------------------------------------------------------------------------
// MODEL PARAMETERS (seeds — tune these until the report goes green)
// ----------------------------------------------------------------------------
const P = {
  sexMaleProb: 0.512,
  iqSd: 15,
  heightSdM: 7.5, heightSdF: 6.7,   // cm
  looksMean: 5.0, looksSd: 2.0,     // 0..10 scale
  // destination-wealth (mobility) equation, in rank space
  betaBase: 0.25, betaPerGini: 0.006, betaMin: 0.20, betaMax: 0.60,
  wIqIncome: 0.065, wLooksIncome: 0.022, wHeightIncome: 0.010,
  luckSd: 0.26,
  // lifespan
  iqLifeYrsPerSd: 1.05, wealthLifeRich: 7, wealthLifePoor: 5, mortalitySd: 14,
};
// birth-level endowment correlations [famWealth, IQ, height, looks]
const R_MALE = [
  [1.00, 0.15, 0.05, 0.05],
  [0.15, 1.00, 0.10, 0.03],
  [0.05, 0.10, 1.00, 0.20],
  [0.05, 0.03, 0.20, 1.00],
];
const R_FEMALE = [
  [1.00, 0.15, 0.05, 0.05],
  [0.15, 1.00, 0.10, 0.03],
  [0.05, 0.10, 1.00, 0.10],
  [0.05, 0.03, 0.10, 1.00],
];

// ----------------------------------------------------------------------------
// math helpers
// ----------------------------------------------------------------------------
let _spare = null;
function randn() {
  if (_spare !== null) { const s = _spare; _spare = null; return s; }
  let u, v, s;
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1);
  const f = Math.sqrt(-2 * Math.log(s) / s);
  _spare = v * f; return u * f;
}
function erf(x) { // Abramowitz-Stegun 7.1.26
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));
function cholesky(A) {
  const n = A.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
  }
  return L;
}
const L_MALE = cholesky(R_MALE), L_FEMALE = cholesky(R_FEMALE);
function corrNormals(L) { // z = L·n
  const n = [randn(), randn(), randn(), randn()];
  return L.map(row => row.reduce((a, l, k) => a + l * n[k], 0));
}
function mean(a) { let s = 0; for (const x of a) s += x; return s / a.length; }
function variance(a) { const m = mean(a); let s = 0; for (const x of a) s += (x - m) ** 2; return s / a.length; }
function pearson(x, y) {
  const mx = mean(x), my = mean(y); let sxy = 0, sx = 0, sy = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx, dy = y[i] - my; sxy += dx * dy; sx += dx * dx; sy += dy * dy; }
  return sxy / Math.sqrt(sx * sy);
}
function slope(x, y) { // regression y ~ x
  const mx = mean(x), my = mean(y); let sxy = 0, sx = 0;
  for (let i = 0; i < x.length; i++) { const dx = x[i] - mx; sxy += dx * (y[i] - my); sx += dx * dx; }
  return sxy / sx;
}

// country sampler weighted by births
const cum = []; let tot = 0;
for (const c of COUNTRIES) { tot += c.births; cum.push(tot); }
function sampleCountry() {
  const r = Math.random() * tot; let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
  return COUNTRIES[lo];
}
const betaOf = (gini) => Math.min(P.betaMax, Math.max(P.betaMin, P.betaBase + P.betaPerGini * (gini - 30)));

// ----------------------------------------------------------------------------
// roll the population
// ----------------------------------------------------------------------------
const out = {
  zIq: new Float64Array(N), zHt: new Float64Array(N), zLk: new Float64Array(N),
  parentRank: new Float64Array(N), childRaw: new Float64Array(N), childRank: new Float64Array(N),
  age: new Float64Array(N), male: new Uint8Array(N), beta: new Float64Array(N),
};
for (let i = 0; i < N; i++) {
  const c = sampleCountry();
  const male = Math.random() < P.sexMaleProb;
  const z = corrNormals(male ? L_MALE : L_FEMALE); // [fw, iq, ht, lk]
  const parentRank = normCdf(z[0]);
  const beta = betaOf(c.wealthGini);
  const childRaw = beta * parentRank + (1 - beta) * 0.5
    + P.wIqIncome * z[1] + P.wLooksIncome * z[3] + P.wHeightIncome * z[2]
    + P.luckSd * randn();
  out.zIq[i] = z[1]; out.zHt[i] = z[2]; out.zLk[i] = z[3];
  out.parentRank[i] = parentRank; out.childRaw[i] = childRaw; out.male[i] = male ? 1 : 0; out.beta[i] = beta;
}
// uniformize childRank (re-spread to preserve dispersion) — second pass
const muRaw = mean(out.childRaw), sdRaw = Math.sqrt(variance(out.childRaw));
for (let i = 0; i < N; i++) out.childRank[i] = normCdf((out.childRaw[i] - muRaw) / sdRaw);
// lifespan (simplified mortality: normal around adjusted mean)
for (let i = 0; i < N; i++) {
  const cr = out.childRank[i];
  const centered = (cr - 0.5) * 2; // -1..1
  const wealthAdj = centered >= 0 ? P.wealthLifeRich * centered : P.wealthLifePoor * centered;
  const meanLife = 75 + wealthAdj + P.iqLifeYrsPerSd * out.zIq[i]; // base 75 placeholder for corr check
  out.age[i] = Math.max(0, meanLife + P.mortalitySd * randn());
}

// ----------------------------------------------------------------------------
// report
// ----------------------------------------------------------------------------
const A = (t) => Array.from(t);
const maleIdx = []; const femIdx = [];
for (let i = 0; i < N; i++) (out.male[i] ? maleIdx : femIdx).push(i);
const pick = (t, idx) => idx.map(i => t[i]);

const rIqInc = pearson(A(out.zIq), A(out.childRank));
const rLkInc = pearson(A(out.zLk), A(out.childRank));
const rHtInc = pearson(A(out.zHt), A(out.childRank));
const rHtLkM = pearson(pick(out.zHt, maleIdx), pick(out.zLk, maleIdx));
const rHtLkF = pearson(pick(out.zHt, femIdx), pick(out.zLk, femIdx));
const rIqLife = pearson(A(out.zIq), A(out.age));
const rankSlope = slope(A(out.parentRank), A(out.childRank));
const dispRatio = variance(A(out.childRank)) / variance(A(out.parentRank));
const avgBeta = mean(A(out.beta));

// directional sanity
function condMean(filter) { let s = 0, n = 0; for (let i = 0; i < N; i++) if (filter(i)) { s += out.childRank[i]; n++; } return n ? s / n : NaN; }
const richDumb = condMean(i => out.parentRank[i] > 0.9 && out.zIq[i] < -1.5);
const poorSmart = condMean(i => out.parentRank[i] < 0.1 && out.zIq[i] > 1.5);
const richSmart = condMean(i => out.parentRank[i] > 0.9 && out.zIq[i] > 1.5);
const poorDumb = condMean(i => out.parentRank[i] < 0.1 && out.zIq[i] < -1.5);

const row = (label, got, target, tol) => {
  const ok = tol == null ? '' : (Math.abs(got - target) <= tol ? '  PASS' : '  FAIL');
  const tgt = target == null ? '' : `target ${target}${tol != null ? ` ±${tol}` : ''}`;
  return `  ${label.padEnd(26)} ${got.toFixed(3).padStart(7)}   ${tgt}${ok}`;
};
console.log(`\nSpin Your Life — model sim   (N=${N.toLocaleString()}, ${COUNTRIES.length} countries)\n`);
console.log('CORRELATIONS / DISPERSION');
console.log(row('corr(IQ, income)', rIqInc, 0.28, 0.03));
console.log(row('corr(looks, income)', rLkInc, 0.12, 0.03));
console.log(row('corr(height, income)', rHtInc, 0.10, 0.03));
console.log(row('corr(height, looks) M', rHtLkM, 0.20, 0.03));
console.log(row('corr(height, looks) F', rHtLkF, 0.10, 0.03));
console.log(row('corr(IQ, lifespan)', rIqLife, 0.12, 0.03));
console.log(row('rank-rank slope', rankSlope, avgBeta, 0.05) + `   (avg β=${avgBeta.toFixed(3)})`);
console.log(row('dispersion ratio child/parent', dispRatio, 1.0, 0.1));
console.log('\nDIRECTIONAL SANITY (mean adult wealth rank 0..1)');
console.log(`  born rich + low IQ   : ${richDumb.toFixed(3)}   (should fall well below 0.9)`);
console.log(`  born poor + high IQ  : ${poorSmart.toFixed(3)}  (should climb above 0.1, rarely top out)`);
console.log(`  born rich + high IQ  : ${richSmart.toFixed(3)}   born poor + low IQ : ${poorDumb.toFixed(3)}`);
console.log('');
