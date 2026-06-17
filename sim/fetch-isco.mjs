// Fetch ISCO-08 occupation distribution from ILOSTAT and merge per-country
// employment shares of the 9 major groups into data/countries.json as `isco`.
//   ILOSTAT indicator EMP_TEMP_SEX_OCU_NB_A — employment by sex & occupation
//   (thousands). We take SEX_T (total), the most recent year that carries the
//   full ISCO-08 major-group breakdown, and divide each group by the total.
// ILOSTAT keys countries by ISO3; countries.json uses ISO2, so we map via the
// World Bank country list. Coverage is partial (occupation surveys are sparse in
// many low-income countries) — those keep no `isco` field and fall back to the
// always-present sector split (empAg/empIndustry/empServices) in rollCareer.
// Run: node sim/fetch-isco.mjs   (network required)
import { readFile, writeFile } from 'node:fs/promises';

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36';
const GROUPS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

async function iso3toIso2() {
  const url = 'https://api.worldbank.org/v2/country?format=json&per_page=400';
  const body = await (await fetch(url)).json();
  const map = new Map();
  for (const c of body[1] || []) if (c.id && c.iso2Code) map.set(c.id, c.iso2Code);
  return map;
}

// ILOSTAT CSV quotes fields and the source/indicator/note columns contain commas,
// so a naive split misaligns — tokenize with quote handling.
function splitCsvLine(line) {
  const out = []; let cur = ''; let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) { if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += ch; }
    else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
}

function parseCsv(text) {
  const lines = text.split('\n').filter(Boolean);
  const head = splitCsvLine(lines[0].replace(/^﻿/, ''));
  const ix = (n) => head.indexOf(n);
  const [iArea, iSex, iCl, iTime, iVal] = [ix('ref_area'), ix('sex'), ix('classif1'), ix('time'), ix('obs_value')];
  return lines.slice(1).map((l) => { const f = splitCsvLine(l); return { area: f[iArea], sex: f[iSex], cl: f[iCl], time: +f[iTime], val: +f[iVal] }; });
}

async function main() {
  process.stdout.write('mapping ISO3->ISO2 (World Bank)... ');
  const i3to2 = await iso3toIso2();
  console.log(`${i3to2.size} codes`);

  process.stdout.write('fetching ILOSTAT ISCO-08 (all countries, 2015+)... ');
  const url = 'https://rplumber.ilo.org/data/indicator/?id=EMP_TEMP_SEX_OCU_NB_A&timefrom=2015&format=.csv';
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`ILOSTAT HTTP ${res.status}`);
  const rows = parseCsv(await res.text());
  console.log(`${rows.length} rows`);

  // index: area -> year -> {classif -> value} (SEX_T, ISCO-08 only)
  const byArea = new Map();
  for (const r of rows) {
    if (r.sex !== 'SEX_T' || !r.cl.startsWith('OCU_ISCO08_') || !Number.isFinite(r.val)) continue;
    if (!byArea.has(r.area)) byArea.set(r.area, new Map());
    const yr = byArea.get(r.area);
    if (!yr.has(r.time)) yr.set(r.time, {});
    yr.get(r.time)[r.cl.replace('OCU_ISCO08_', '')] = r.val;
  }

  // for each area, newest year with a usable full breakdown -> shares
  const shares = new Map(); // iso2 -> {1..9: pct}
  for (const [area, yrs] of byArea) {
    const iso2 = i3to2.get(area);
    if (!iso2) continue;
    for (const year of [...yrs.keys()].sort((a, b) => b - a)) {
      const v = yrs.get(year);
      const present = GROUPS.filter((g) => v[g] != null);
      const groupSum = GROUPS.reduce((a, g) => a + (v[g] || 0), 0);
      if (!groupSum || present.length < 7) continue; // need a near-complete breakdown
      // renormalize over the 9 groups so the formal-occupation base sums to 100%
      // (drops the "not classified" remainder), keeping the same scale as the
      // sector split used for countries without ISCO coverage.
      const obj = {};
      for (const g of GROUPS) obj[g] = Math.round(((v[g] || 0) / groupSum) * 1000) / 10;
      shares.set(iso2, obj);
      break;
    }
  }

  const path = new URL('../data/countries.json', import.meta.url);
  const countries = JSON.parse(await readFile(path, 'utf8'));
  let merged = 0;
  for (const c of countries) { const s = shares.get(c.code); if (s) { c.isco = s; merged++; } }
  await writeFile(path, JSON.stringify(countries, null, 2) + '\n');
  console.log(`\nmerged isco into ${merged}/${countries.length} countries`);
}

main().catch((e) => { console.error(e); process.exit(1); });
