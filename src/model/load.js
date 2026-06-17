// Load boundary: the single place between raw JSON on disk and the data the
// model computes on. Two jobs:
//   1. IMPUTE missing country fields ONCE, from one policy, so the model carries
//      zero `??` fallbacks (no contradictory per-call-site defaults).
//   2. VALIDATE and FAIL LOUD — a missing required field or duplicate id is a
//      startup error, not a silent guess deep in the math.
// Imputed values are stamped on `_imputed` for provenance (so the sim / a card
// can know an outcome leaned on a guess).
import { clamp } from './stats.js';

const lifeAvg = (c) => (c.lifeM + c.lifeF) / 2;
// instability proxy from life expectancy (mirrors events.instabilityOf); used to
// estimate vulnerable-employment share where the World Bank column is absent.
const instability = (c) => clamp((74 - lifeAvg(c)) / 30, 0, 1);

// Country fields the model reads directly (after imputation). Missing any of
// these is a hard error rather than an in-math fallback.
export const REQUIRED_COUNTRY = [
  'code', 'name', 'continent', 'births', 'netWorth', 'wealthGini',
  'heightM', 'heightF', 'iq', 'lifeM', 'lifeF',
  'empAg', 'empIndustry', 'empServices', 'femaleLFP', 'secondaryEnrollment',
  'vulnEmployment', 'unemployment',
];

// Fill missing fields once. `policy` is data/imputation.json (injected, like all
// other data) — null/absent entries fall back to the documented constants here.
export function normalizeCountries(countries, policy = {}) {
  const c0 = (k, fallback) => (policy[k] == null ? fallback : policy[k]);
  return countries.map((c) => {
    const out = { ...c };
    const imputed = [];
    // vulnEmployment has a DERIVED estimate (not a flat constant): missing data
    // is filled from life-expectancy instability — the same estimate the old
    // precarity() fallback used — so precarity is preserved and career selection
    // now reads one consistent value instead of a separate flat 30%.
    if (out.vulnEmployment == null) { out.vulnEmployment = 100 * (0.15 + 0.85 * instability(c)); imputed.push('vulnEmployment'); }
    const fill = (k, v) => { if (out[k] == null) { out[k] = v; imputed.push(k); } };
    fill('unemployment', c0('unemployment', 6));
    fill('secondaryEnrollment', c0('secondaryEnrollment', 70));
    fill('femaleLFP', c0('femaleLFP', 55));
    fill('empAg', c0('empAg', 25));
    fill('empIndustry', c0('empIndustry', 25));
    fill('empServices', c0('empServices', 50));
    fill('netWorth', c0('netWorth', 25000));
    if (imputed.length) out._imputed = imputed;
    return out;
  });
}

// Validate inputs; throw with a readable summary on any problem.
export function validateInputs({ countries, careers }) {
  const errs = [];
  countries.forEach((c, i) => {
    for (const f of REQUIRED_COUNTRY) if (c[f] == null) errs.push(`country[${i}] ${c.code || c.name || i}: missing ${f}`);
  });
  const seen = new Set();
  for (const c of careers) {
    if (!c.id) { errs.push('career with no id'); continue; }
    if (seen.has(c.id)) errs.push(`duplicate career id: ${c.id}`);
    seen.add(c.id);
    // occRank is now data ON the career (no parallel map, no silent 0.40) — a
    // missing one is a build error, the whole point of consolidating it.
    if (typeof c.occRank !== 'number') errs.push(`career ${c.id}: missing/invalid occRank`);
    if (c.tags != null && !Array.isArray(c.tags)) errs.push(`career ${c.id}: tags must be an array`);
  }
  if (errs.length) {
    const shown = errs.slice(0, 20).join('\n  ');
    throw new Error(`[load] data validation failed (${errs.length}):\n  ${shown}${errs.length > 20 ? `\n  …and ${errs.length - 20} more` : ''}`);
  }
}
