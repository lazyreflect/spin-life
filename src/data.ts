import countries from '../data/countries.json';
import params from '../data/model-params.json';
import names from '../data/names.json';
import careersData from '../data/careers.json';
import { makeRoller } from './model/roll.js';

export const roller = makeRoller({
  countries: countries as any,
  params: params as any,
  names: names as any,
  careers: (careersData as any).careers,
});

export const CONTINENT_COLOR: Record<string, string> = {
  Asia: '#f5c043',
  Africa: '#ef5350',
  'Middle East': '#ff9f43',
  Europe: '#4dabf7',
  'North America': '#9775fa',
  'South America': '#51cf66',
  Oceania: '#22b8cf',
  Antarctica: '#ced4da',
};

// continents aggregated by births (for the first wheel)
const totals: Record<string, number> = {};
for (const c of countries as any[]) totals[c.continent] = (totals[c.continent] || 0) + c.births;
const grand = Object.values(totals).reduce((a, b) => a + b, 0);
export const CONTINENTS = Object.entries(totals)
  .sort((a, b) => b[1] - a[1])
  .map(([name, births]) => ({ name, births, frac: births / grand, color: CONTINENT_COLOR[name] || '#888' }));

export function countriesIn(continent: string) {
  const list = (countries as any[]).filter((c) => c.continent === continent);
  const sum = list.reduce((a, c) => a + c.births, 0);
  return list
    .sort((a, b) => b.births - a.births)
    .map((c) => ({ ...c, frac: c.births / sum, color: CONTINENT_COLOR[continent] || '#888' }));
}
