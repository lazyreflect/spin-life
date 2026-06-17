// Child genotype draw — Phase 2 (LINEAGE.md §4.2).
//
//   z_child[t] = H_t·½(z_father[t] + z_mother[t])  +  sqrt(1 − H_t²/2)·noise[t]
//
// H_t = narrow-sense heritability (the offspring-on-midparent regression slope).
// The first term gives regression to the mean for free; the second is fresh
// Mendelian noise. With unit-variance, uncorrelated-across-couples parents the
// child marginals stay unit-variance.
//
// The subtlety the review flagged: midparent *averaging* attenuates the cross-
// trait correlation (corr(height,looks)) whenever heritabilities differ — and
// chol(R) on the noise alone does NOT fix it. So the noise correlation is
// PRE-SOLVED to over-correct, landing the child on the calibrated target each
// generation. See solveNoiseCorr.

import { cholesky, corrNormals } from './stats.js';

// Narrow-sense heritabilities, keyed by endowmentCorr.order. famWealth is the
// heritable wealth *disposition* (two-channel wealth, §4.3); the wealth *position*
// is inherited separately via the mobility loop, so they don't double-count.
export const DEFAULT_HERITABILITY = { famWealth: 0.40, iq: 0.50, height: 0.80, looks: 0.35 };

// Solve the residual-noise correlation so the child lands on R_target after the
// heritable midparent term is added:
//   Cov(child_a,child_b) = H_a·H_b·Cov(MP_a,MP_b) + c_a·c_b·R_noise[a][b]
//   Cov(MP_a,MP_b) = ¼(R_male[a][b] + R_female[a][b])   (midparent of two parents)
//   c_t = sqrt(1 − H_t²/2)
// → R_noise[a][b] = (R_target[a][b] − H_a·H_b·¼(R_male+R_female)[a][b]) / (c_a·c_b)
// Diagonals are 1 by construction (the variance algebra balances).
function solveNoiseCorr(Rtarget, Rmale, Rfemale, H, c) {
  const n = Rtarget.length;
  const Rn = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    if (a === b) { Rn[a][b] = 1; continue; }
    const mpCov = 0.25 * (Rmale[a][b] + Rfemale[a][b]);
    Rn[a][b] = (Rtarget[a][b] - H[a] * H[b] * mpCov) / (c[a] * c[b]);
  }
  return Rn;
}

export function makeChildDraw({ endowmentCorr, heritability = DEFAULT_HERITABILITY } = {}) {
  const order = endowmentCorr.order;            // [famWealth, iq, height, looks]
  const Rm = endowmentCorr.male, Rf = endowmentCorr.female;
  const H = order.map((k) => heritability[k]);
  const c = H.map((h) => Math.sqrt(1 - (h * h) / 2));   // residual-noise scale per trait
  // residual correlation is solved against the CHILD's own sex target (§4.2)
  const noiseChol = {
    Male: cholesky(solveNoiseCorr(Rm, Rm, Rf, H, c)),
    Female: cholesky(solveNoiseCorr(Rf, Rm, Rf, H, c)),
  };

  // father/mother z are arrays in `order`; childSex selects the residual matrix.
  function drawChildZ(fatherZ, motherZ, childSex, rng) {
    const noise = corrNormals(noiseChol[childSex], rng);
    const z = new Array(order.length);
    for (let t = 0; t < order.length; t++) {
      z[t] = (H[t] / 2) * (fatherZ[t] + motherZ[t]) + c[t] * noise[t];
    }
    return z;
  }

  // Convenience over the named latents a life object stores.
  function drawChild(father, mother, childSex, rng) {
    const fz = [father.zFw, father.zIq, father.zHeight, father.zLooks];
    const mz = [mother.zFw, mother.zIq, mother.zHeight, mother.zLooks];
    const z = drawChildZ(fz, mz, childSex, rng);
    return { zFw: z[0], zIq: z[1], zHeight: z[2], zLooks: z[3] };
  }

  return { drawChildZ, drawChild, order, heritability: H };
}
