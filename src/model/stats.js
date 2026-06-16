// Core math: RNG, normal CDF/inverse, Cholesky, weighted sampling.
export const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

let _spare = null;
export function randn() {
  if (_spare !== null) { const s = _spare; _spare = null; return s; }
  let u, v, s;
  do { u = Math.random() * 2 - 1; v = Math.random() * 2 - 1; s = u * u + v * v; } while (s === 0 || s >= 1);
  const f = Math.sqrt(-2 * Math.log(s) / s);
  _spare = v * f; return u * f;
}

export function erf(x) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x));
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-x * x);
  return x >= 0 ? y : -y;
}
export const normCdf = (x) => 0.5 * (1 + erf(x / Math.SQRT2));

// Acklam inverse normal CDF (probit)
export function invNorm(p) {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-3.969683028665376e+1, 2.209460984245205e+2, -2.759285104469687e+2, 1.383577518672690e+2, -3.066479806614716e+1, 2.506628277459239e+0];
  const b = [-5.447609879822406e+1, 1.615858368580409e+2, -1.556989798598866e+2, 6.680131188771972e+1, -1.328068155288572e+1];
  const c = [-7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838e+0, -2.549732539343734e+0, 4.374664141464968e+0, 2.938163982698783e+0];
  const d = [7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996e+0, 3.754408661907416e+0];
  const pl = 0.02425, ph = 1 - pl;
  let q, r, x;
  if (p < pl) { q = Math.sqrt(-2 * Math.log(p)); x = (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  else if (p <= ph) { q = p - 0.5; r = q * q; x = (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1); }
  else { q = Math.sqrt(-2 * Math.log(1 - p)); x = -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  return x;
}

export function cholesky(A) {
  const n = A.length, L = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j];
    for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    L[i][j] = i === j ? Math.sqrt(s) : s / L[j][j];
  }
  return L;
}
export function corrNormals(L) {
  const n = L.length, out = new Array(n).fill(0), x = Array.from({ length: n }, randn);
  for (let i = 0; i < n; i++) for (let k = 0; k <= i; k++) out[i] += L[i][k] * x[k];
  return out;
}

// pick index from cumulative-weight array (binary search)
export function sampleCumulative(cum, total) {
  const r = Math.random() * total;
  let lo = 0, hi = cum.length - 1;
  while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < r) lo = mid + 1; else hi = mid; }
  return lo;
}
export function sampleWeights(weights) {
  let total = 0; for (const w of weights) total += w;
  let r = Math.random() * total;
  for (let i = 0; i < weights.length; i++) { r -= weights[i]; if (r <= 0) return i; }
  return weights.length - 1;
}
