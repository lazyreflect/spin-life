// Wealth (lognormal + Pareto tail), mortality curve, and global TOP% percentiles.
// Wealth + mortality math ported verbatim from the original spinyour.life bundle.
import { clamp, normCdf, invNorm } from './stats.js';

// --- IQ ---------------------------------------------------------------------
// Compress national IQ means toward the global 100: the raw between-country
// spread is contentious and produces implausible extremes. k<1 shrinks it.
export const IQ_COMPRESS = 0.55;
export const adjCountryIq = (countryIq) => 100 + IQ_COMPRESS * (countryIq - 100);

// --- wealth -----------------------------------------------------------------
export const giniToSigma = (g) => clamp(Math.SQRT2 * invNorm((g / 100 + 1) / 2), 0.18, 1.55);
export const giniToPareto = (g) => clamp(2.4 - 0.035 * (g - 50), 1.15, 2.6);
const U = 0.999, Y = 1 - U;

// net worth ($) at wealth percentile r (0..1, higher = richer)
export function wealthQuantile(median, gini, r) {
  const sigma = giniToSigma(gini);
  r = clamp(r, 1e-6, 1 - 1e-9);
  if (r < U) return median * Math.exp(sigma * invNorm(r));
  const a = median * Math.exp(sigma * invNorm(U));
  const i = Math.max(1 - r, 1e-12);
  return a * Math.pow(Y / i, 1 / giniToPareto(gini));
}
// P(wealth > amount) within a country
export function wealthSurvival(amount, c) {
  const sigma = giniToSigma(c.wealthGini);
  const r0 = c.netWorth * Math.exp(sigma * invNorm(U));
  if (amount <= r0) return 1 - normCdf(Math.log(amount / c.netWorth) / sigma);
  return Y * Math.pow(r0 / amount, giniToPareto(c.wealthGini));
}

// --- mortality (skew mixture: main mode + infant + young-adult hump) ---------
const te = (x, mu, s) => { const o = (x - mu) / s; return Math.exp(-0.5 * o * o) / s; };
export function ageWeights(baseLE, targetLE) {
  const r = clamp(0.003 * (82 - baseLE) + 0.008, 0.006, 0.085);     // infant fraction
  const o = clamp(targetLE + 4.5, 45, 98);                           // modal age
  const aL = clamp(13 + 0.16 * (78 - baseLE), 11, 19);               // left sd
  const aR = clamp(5.5 + 0.045 * (baseLE - 55), 5, 8);              // right sd: LOW-LE countries get a tighter upper tail (fewer reach extreme old age)
  const u = clamp(4.5 + 0.08 * (72 - baseLE), 3.2, 6.2);             // infant spread
  const w = new Array(131);
  for (let c = 0; c < 131; c++) {
    const l = c + 0.5;
    const main = te(l, o, l < o ? aL : aR);
    const infant = te(l, 1.5, u);
    const ya = te(l, 28, 15) * clamp(0.004 * (78 - baseLE) + 0.015, 0.008, 0.05);
    w[c] = (1 - r) * main + r * infant + ya;
  }
  return w;
}
export function sampleAge(baseLE, targetLE) {
  const w = ageWeights(baseLE, targetLE);
  let total = 0; for (const x of w) total += x;
  let pick = Math.random() * total;
  for (let c = 0; c < w.length; c++) { pick -= w[c]; if (pick <= 0) return c; }
  return 130;
}
// wealth -> life expectancy adjustment (+7 richest .. -5 poorest), from original C()
export function wealthLifeAdj(childRank) {
  const centered = 2 * childRank - 1;
  return centered >= 0 ? 7 * centered : 5 * centered;
}

// --- global TOP% (population-weighted across all countries) ------------------
export function moneyTopPercent(amount, countries, totalBirths) {
  let s = 0; for (const c of countries) s += c.births * wealthSurvival(amount, c);
  return clamp((s / totalBirths) * 100, 0.001, 100);
}
export function iqTopPercent(iq, countries, totalBirths) {
  let s = 0; for (const c of countries) s += c.births * (1 - normCdf((iq - adjCountryIq(c.iq)) / 15));
  return clamp((s / totalBirths) * 100, 0.001, 100);
}
export function heightTopPercent(cm, sex, countries, totalBirths) {
  const sd = sex === 'Female' ? 6.7 : 7.5;
  let s = 0; for (const c of countries) { const m = sex === 'Female' ? c.heightF : c.heightM; s += c.births * (1 - normCdf((cm - m) / sd)); }
  return clamp((s / totalBirths) * 100, 0.001, 100);
}
export const looksTopPercent = (looks) => clamp((1 - normCdf((looks - 5) / 2)) * 100, 0.001, 100);
export function lifeTopPercent(age, sex, countries, totalBirths) {
  let s = 0; for (const c of countries) { const le = sex === 'Female' ? c.lifeF : c.lifeM; s += c.births * (1 - normCdf((age - le) / 13)); }
  return clamp((s / totalBirths) * 100, 0.001, 100);
}
