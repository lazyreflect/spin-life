import countries from '../data/countries.json';
import params from '../data/model-params.json';
import names from '../data/names.json';
import careersData from '../data/careers.json';
import bandsData from '../data/bands.json';
import imputation from '../data/imputation.json';
import { makeRoller } from './model/roll.js';

export const roller = makeRoller({
  countries: countries as any,
  params: params as any,
  names: names as any,
  careers: (careersData as any).careers,
  bands: (bandsData as any).bands,
  imputation: imputation as any,
});

// --- birth desirability (drives wheel colour) -------------------------------
// How lucky is it to be born here? Blend of national wealth and life
// expectancy, min-max normalised across all countries -> 0..1.
const lifeAvg = (c: any) => (c.lifeM + c.lifeF) / 2;
const logNW = (c: any) => Math.log10(Math.max(1, c.netWorth));
const range = (xs: number[]) => [Math.min(...xs), Math.max(...xs)] as const;
const [nwMin, nwMax] = range((countries as any[]).map(logNW));
const [leMin, leMax] = range((countries as any[]).map(lifeAvg));
const norm = (v: number, lo: number, hi: number) => (hi > lo ? (v - lo) / (hi - lo) : 0.5);
export const desirabilityOf = (c: any) =>
  0.55 * norm(logNW(c), nwMin, nwMax) + 0.45 * norm(lifeAvg(c), leMin, leMax);

// continents aggregated by births (for the first wheel)
const totals: Record<string, number> = {};
const desirSum: Record<string, number> = {};
for (const c of countries as any[]) {
  totals[c.continent] = (totals[c.continent] || 0) + c.births;
  desirSum[c.continent] = (desirSum[c.continent] || 0) + c.births * desirabilityOf(c);
}
const grand = Object.values(totals).reduce((a, b) => a + b, 0);
export const CONTINENTS = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .map(([name, births]) => ({ name, births, frac: births / grand, desir: desirSum[name] / births }));

export function countriesIn(continent: string) {
  const list = (countries as any[]).filter((c) => c.continent === continent);
  const sum = list.reduce((a, c) => a + c.births, 0);
  return list
    .sort((a, b) => b.births - a.births)
    .map((c) => ({ ...c, frac: c.births / sum, desir: desirabilityOf(c) }));
}
