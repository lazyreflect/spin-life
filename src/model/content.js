// Names (culture clusters), career (education -> occupation), and formatting.
import { clamp, normCdf, sampleWeights, randn } from './stats.js';

// --- names ------------------------------------------------------------------
const norm = (s) => `${s ?? ''}`.trim().toLowerCase();
const CONTINENT_REP = {
  Asia: 'india', Africa: 'nigeria', 'Middle East': 'saudi arabia',
  Europe: 'united kingdom', 'North America': 'united states',
  'South America': 'brazil', Oceania: 'australia', Antarctica: 'united states',
};
export function pickName(country, sex, nameGroups, rng = Math.random) {
  const n = norm(country.name);
  let g = nameGroups.find((x) => x.countries.some((c) => norm(c) === n));
  if (!g) { const rep = CONTINENT_REP[country.continent]; g = nameGroups.find((x) => x.countries.some((c) => norm(c) === rep)); }
  if (!g) g = nameGroups[0];
  const firsts = sex === 'Female' ? g.female_first_names : g.male_first_names;
  const first = firsts[Math.floor(rng() * firsts.length)] || 'Alex';
  const last = g.last_names[Math.floor(rng() * g.last_names.length)] || 'Doe';
  return `${first} ${last}`;
}

// --- career -----------------------------------------------------------------
const EDU = ['none', 'primary', 'secondary', 'vocational', 'bachelor', 'postgrad'];
const eduRank = (e) => EDU.indexOf(e);

// education attainment from IQ, family wealth, country enrollment, sex
export function rollEducation(zIq, parentRank, country, rng = Math.random) {
  const enroll = country.secondaryEnrollment / 100; // ~0..1.3 (imputed in load.js)
  // IQ now leads attainment (high IQ -> more schooling -> access to high-ceiling
  // careers; low IQ -> less schooling -> capped careers), with family + country
  // enrollment still strong secondary factors.
  let score = 1.25 * zIq + 1.5 * (parentRank - 0.5) + 1.3 * (enroll - 0.75) + 0.8 * randn(rng);
  // map score -> tier index 0..5
  const cuts = [-1.1, -0.3, 0.4, 0.9, 1.7];
  let tier = 0;
  for (const c of cuts) if (score > c) tier++;
  // country floor: near-universal enrollment means almost nobody is unschooled
  const floor = enroll >= 0.9 ? 2 : enroll >= 0.6 ? 1 : 0;
  return EDU[Math.max(tier, floor)];
}

export function rollCareer(life, country, careers, rng = Math.random, bands) {
  const tier = eduRank(life.education);
  const sectorShare = (sector) => {
    if (sector === 'agriculture') return country.empAg / 100;
    if (sector === 'industry') return country.empIndustry / 100;
    return country.empServices / 100;
  };
  const femaleLF = country.femaleLFP / 100;
  // informal & non-employment "menu shares" come from their own country attributes
  // (real World Bank columns; imputed in load.js where absent) instead of the
  // sector employment split.
  const informality = clamp(country.vulnEmployment / 100, 0.02, 0.95);
  const unemp = clamp(country.unemployment / 100, 0.01, 0.5);
  const eligible = careers.filter((c) => eduRank(c.minEducation) <= tier && (c.regions.includes('*') || c.regions.includes(country.continent)));
  const pool = eligible.length ? eligible : careers.filter((c) => eduRank(c.minEducation) <= tier);
  if (!pool.length) return careers.find((c) => c.id === 'subsistence-farmer') || careers[0];
  const weights = pool.map((c) => {
    const cohort = c.cohort; // undefined = formal employment
    // base "menu share": formal jobs follow the sector employment split; the
    // special cohorts are weighted by their own country attribute.
    let base;
    if (cohort === 'informal') base = informality;
    else if (cohort === 'unemployed') base = unemp;
    else if (cohort === 'homemaker') base = life.sex === 'Female' ? clamp(1 - femaleLF, 0.05, 0.9) : 0.02;
    // ILOSTAT 9-group occupation share when available, else the 3-sector split.
    // The ×3 rescales the (finer) 9-group shares onto the same scale as the
    // 3-sector base so the formal-vs-cohort (informal/homemaker) balance — tuned
    // against the sector model — is preserved in ISCO-covered countries too.
    else if (country.isco && c.isco) base = Math.max(0.02, 3 * (country.isco[c.isco] ?? 0) / 100);
    else base = Math.max(0.02, sectorShare(c.sector));
    // prevalence = how common the role is GIVEN eligibility (replaces the old
    // prestige throttle; prestige is now a pure collectible label).
    let w = base * (c.prevalence ?? 1);
    // female labor-force participation tilt for PAID work (formal + informal);
    // homemaker already encodes the inverse, unemployment is part of the LF.
    if (life.sex === 'Female' && cohort !== 'homemaker') w *= clamp(0.4 + femaleLF, 0.3, 1.3);
    // IQ aligns with a JOB's skill demand: low IQ avoids high-skill jobs and is
    // steered to low-skill ones (fixes IQ-78 journalist). For cognitively-loaded
    // careers (high iqTilt) demand is set by how demanding the OUTCOME is (income
    // band), so a "Founder" (secondary min, elite band) isn't handed to low-IQ
    // people (IQ-gated founders). Skipped for not-in-work states, which aren't
    // skill-allocated. Physical/artistic careers (low iqTilt) keep the edu demand.
    const cMin = eduRank(c.minEducation);
    if (cohort !== 'homemaker' && cohort !== 'unemployed') {
      const skill = (c.iqTilt || 0) >= 0.4 ? Math.max(cMin, bands[c.incomeBand].skill) : cMin;
      const demand = (skill - 2.5) / 2.5; // -1 (unskilled) .. +1 (postgrad-level)
      w *= clamp(1 + 1.0 * demand * life.zIq, 0.06, 3.5);
    }
    // over-qualification: the heavily over-educated rarely take lower-skill FORMAL
    // jobs (fixes postgrad electrician). Informal work & non-employment are escape
    // hatches, not credential-sorted, so they skip this penalty (lets an educated
    // woman in a low-LFP country still land Homemaker).
    if (!cohort) {
      const gap = tier - cMin;
      w *= Math.exp(-(gap * gap) / 2);
    }
    // career-specific trait tilts (looks/height + extra IQ sensitivity), now with
    // real weight so the very attractive gravitate to looks-rewarding careers.
    const tilt = 1 + 0.12 * (c.looksTilt * life.zLooks + c.heightTilt * life.zHeight) + 0.08 * (c.iqTilt * life.zIq);
    w *= clamp(tilt, 0.1, 4);
    return w;
  });
  const idx = sampleWeights(weights, rng);
  // conditional selection probability P(career | country, education, traits) — a
  // Software Developer is mundane in Bangalore, rare in Niger. Fed into life rarity.
  const sum = weights.reduce((a, x) => a + x, 0) || 1;
  return { career: pool[idx], pSelect: weights[idx] / sum };
}

// --- formatting -------------------------------------------------------------
export function money(n) {
  const a = Math.abs(n);
  if (a >= 1e9) return `$${(n / 1e9).toFixed(1)}B`;
  if (a >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (a >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${Math.round(n)}`;
}
export function heightImperial(cm) {
  const inches = cm / 2.54;
  const ft = Math.floor(inches / 12);
  const inch = Math.round(inches - ft * 12);
  return inch === 12 ? `${ft + 1}'0"` : `${ft}'${inch}"`;
}
export function rarityText(rarity) {
  const n = Math.round(rarity);
  return `1 in ${n.toLocaleString()}`;
}
// Class is OCCUPATION-based (relation to capital / authority / skill), not a net-
// worth rank. Each career carries an occupational class position; wealth + power
// modify standing. "The elite" is the power elite — those who COMMAND capital or
// institutions (entrepreneur/executive/politician) AND are wealthy, or dynastic
// controlling wealth. Merely rich (a lottery winner, a top-paid professional) is
// "wealthy/upper", not elite.
export const RULING = new Set(['entrepreneur', 'executive', 'politician']);
// occRank (occupational class standing) now lives ON each career in careers.json
// (emitted by gen-careers.mjs, validated present in load.js) — one source of
// truth, no parallel map to drift, no silent 0.40 default.
export const occRankOf = (career) => career.occRank;

// occupational class standing, nudged by realized wealth; elite gated by power+wealth
export function classOf(occRank, wealthRank, ruling, dynastic) {
  const wealthy = wealthRank >= 0.90;
  if ((ruling && wealthy) || (dynastic && wealthy)) return 'the elite';
  const standing = 0.60 * occRank + 0.40 * wealthRank;
  const cuts = [0.20, 0.38, 0.56, 0.74, 0.90];
  const labels = ['lower class', 'working class', 'middle class', 'upper-middle class', 'upper class', 'upper class'];
  let i = 0; for (const c of cuts) if (standing >= c) i++;
  return labels[i];
}
