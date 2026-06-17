// Fetch real per-country Total Fertility Rate from the World Bank and merge it
// into data/countries.json, keyed by ISO2 (the `code` field), exactly like
// fetch-labor.mjs. This replaces the `1.4 + 0.08·empAg` proxy the clan sim used,
// which ran hot (~4 vs real ~2.3) and made every pool explode to the cap.
//   SP.DYN.TFRT.IN — total fertility rate (births per woman). The completed
//                    fertility of one woman → the natural mean litter size for a
//                    couple in the clan sim (LINEAGE.md §10.3).
// We take the most recent non-null observation per country in the window below.
// Run: node sim/fetch-tfr.mjs   (network required)
import { readFile, writeFile } from 'node:fs/promises';

const INDICATORS = { tfr: 'SP.DYN.TFRT.IN' };
const WINDOW = '2015:2023'; // scan recent years, keep the latest non-null per country

async function fetchIndicator(code) {
  const url = `https://api.worldbank.org/v2/country/all/indicator/${code}?format=json&date=${WINDOW}&per_page=20000`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${code}: HTTP ${res.status}`);
  const body = await res.json();
  const rows = body[1] || [];
  const latest = new Map(); // iso2 -> { year, value }
  for (const r of rows) {
    const iso2 = r.country?.id;
    const value = r.value;
    const year = Number(r.date);
    if (!iso2 || value == null || Number.isNaN(year)) continue;
    const prev = latest.get(iso2);
    if (!prev || year > prev.year) latest.set(iso2, { year, value });
  }
  return latest;
}

const round2 = (x) => Math.round(x * 100) / 100;

async function main() {
  const path = new URL('../data/countries.json', import.meta.url);
  const countries = JSON.parse(await readFile(path, 'utf8'));

  const fetched = {};
  for (const [field, code] of Object.entries(INDICATORS)) {
    process.stdout.write(`fetching ${field} (${code})... `);
    fetched[field] = await fetchIndicator(code);
    console.log(`${fetched[field].size} countries`);
  }

  let merged = 0;
  const missing = { tfr: [] };
  for (const c of countries) {
    let touched = false;
    for (const field of Object.keys(INDICATORS)) {
      const hit = fetched[field].get(c.code);
      if (hit) { c[field] = round2(hit.value); touched = true; }
      else missing[field].push(c.code);
    }
    if (touched) merged++;
  }

  await writeFile(path, JSON.stringify(countries, null, 2) + '\n');
  console.log(`\nmerged into ${merged}/${countries.length} countries`);
  for (const field of Object.keys(INDICATORS)) {
    const m = missing[field];
    console.log(`  ${field}: ${countries.length - m.length} filled, ${m.length} missing${m.length ? ' (' + m.slice(0, 12).join(',') + (m.length > 12 ? '…' : '') + ')' : ''}`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
