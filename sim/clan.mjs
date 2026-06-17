// Spin Your Life — the clan-forward simulator (LINEAGE.md §10, "watch it live").
//
// Drives the SHARED model (rollLife founders + rollChild offspring) forward a few
// generations at CLAN scale (~10-20), so you can WATCH one small family ascend,
// stall, or die out against the twin antagonists: extinction and inbreeding.
//
// The loop (§10.2): spin a small clan -> FATE pairs eligible couples at random ->
// each couple has ONE litter sized by the mother-country's REAL TFR (Poisson, so
// low-TFR couples sometimes roll zero and the branch just ends) -> the couple
// retires -> the children are the next generation. No player here; this is the
// world model the v2 loop sits on top of.
//
// Two modes:
//   default  — ONE clan, narrated generation by generation (the intimate view).
//   --trials N — N independent clans, aggregate distribution (extinction odds, …).
//
// Usage:
//   node sim/clan.mjs [--seed 0x5eed] [--start 12] [--gens 8] [--cap 500] [--trials 1]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRoller } from '../src/model/roll.js';
import { parentEligibility, pairBlock } from '../src/model/lineage.js';
import { makeRng, hashSeed } from '../src/model/stats.js';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(__dir, '../data', f), 'utf8'));

// ---- args ------------------------------------------------------------------
const arg = (flag, def) => {
  const i = process.argv.indexOf(flag);
  if (i < 0 || i + 1 >= process.argv.length) return def;
  const v = process.argv[i + 1];
  return /^0x/.test(v) ? parseInt(v, 16) : Number(v);
};
const SEED = arg('--seed', 0x5eed) >>> 0;
const START = arg('--start', 12);   // founders you "spin" to seed the clan
const GENS = arg('--gens', 8);      // generations to run forward
const CAP = arg('--cap', 500);      // backstop only (famine / attention) — NOT a per-turn setter
const TRIALS = arg('--trials', 1);

const countries = load('countries.json');
const tfrByCode = new Map(countries.map((c) => [c.code, c.tfr]));
const TFR_FALLBACK = 2.2; // for the 26 tiny territories WB has no TFR for (177k births total)
const tfrOf = (code) => {
  const t = tfrByCode.get(code);
  return Number.isFinite(t) ? t : TFR_FALLBACK;
};

function makeClanRoller(seed) {
  return makeRoller({
    countries, params: load('model-params.json'), names: load('names.json'),
    careers: load('careers.json').careers, bands: load('bands.json').bands,
    imputation: load('imputation.json'), luckCdf: load('luckCdf.json'), seed,
  });
}

// ---- small helpers ---------------------------------------------------------
const median = (a) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[s.length >> 1]; };
const shuffle = (a, rng) => { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
// Knuth Poisson — completed-fertility litter size around the country TFR.
const poisson = (lambda, rng) => {
  if (lambda <= 0) return 0;
  const L = Math.exp(-lambda); let k = 0, p = 1;
  do { k++; p *= rng(); } while (p > L); return k - 1;
};

// ---- one clan, run forward -------------------------------------------------
// Returns a per-generation log + final outcome. `narrate` prints the intimate view.
function runClan(seed, narrate) {
  const roller = makeClanRoller(seed);
  const rng = makeRng(hashSeed(`clan:${seed}`)); // sim-logic stream (pairing, litters), independent of the model stream

  // Gen 0 — the clan you spin. Stamp identity the model leaves to the app layer.
  let living = [];
  for (let i = 0; i < START; i++) {
    const f = roller.rollLife();
    f.id = `F${i}`; f.generation = 0; f._founders = new Set([i]);
    living.push(f);
  }
  const founderName = new Map(living.map((f, i) => [i, `${f.flag} ${f.name.split(' ')[0]}`]));

  const log = [];
  const adultsOf = (pop) => pop.filter((l) => parentEligibility(l).eligible);
  const linesOf = (pop) => { const s = new Set(); for (const l of pop) for (const fid of l._founders) s.add(fid); return s; };
  const countriesOf = (pop) => new Set(pop.map((l) => l.code));

  const snap = (g, pop, births, couples) => {
    const ad = adultsOf(pop);
    const row = {
      gen: g, born: births, pop: pop.length, adults: ad.length, couples,
      countries: countriesOf(ad).size, lines: linesOf(ad).size,
      medWealth: Math.round(median(ad.map((l) => l.netWorth)) || 0),
      diedYoung: pop.length ? pop.filter((l) => l.diedYoung).length / pop.length : 0,
    };
    log.push(row);
    return row;
  };

  if (narrate) {
    const roster = living.map((f) => `${f.flag} ${f.name.split(' ')[0]}`).join(', ');
    console.log(`\n  Gen 0 — your clan of ${START}: ${roster}`);
    console.log(`         ${countriesOf(living).size} countries, ${linesOf(living).size} founder lines.`);
  }
  snap(0, living, START, 0);

  let extinctAt = null;
  for (let g = 1; g <= GENS; g++) {
    let pool = adultsOf(living);
    if (pool.length > CAP) { shuffle(pool, rng); pool = pool.slice(0, CAP); if (narrate) console.log(`         (cap: famine/attention trims the pool to ${CAP})`); }
    const mothers = shuffle(pool.filter((l) => l.sex === 'Female'), rng);
    const fathers = shuffle(pool.filter((l) => l.sex === 'Male'), rng);
    const nCouples = Math.min(mothers.length, fathers.length);

    if (nCouples === 0) { extinctAt = g - 1; if (narrate) console.log(`\n  Gen ${g}: no couple can form (${fathers.length} men, ${mothers.length} women) — the line ends.`); break; }

    const children = [];
    let litterDetail = [];
    for (let c = 0; c < nCouples; c++) {
      const f = fathers[c], m = mothers[c];
      if (pairBlock(f, m)) continue; // safety; shouldn't trip after the M/F split
      const n = poisson(tfrOf(m.code), rng);
      for (let k = 0; k < n; k++) {
        const kid = roller.rollChild(f, m, { rng });
        kid.id = `g${g}-${children.length}`;
        kid._founders = new Set([...f._founders, ...m._founders]);
        children.push(kid);
      }
      if (narrate) litterDetail.push({ f, m, n });
    }

    living = children; // parents retire after one litter (§10.2)
    const row = snap(g, living, children.length, nCouples);

    if (narrate) {
      const survived = children.filter((l) => !l.diedYoung).length;
      console.log(`\n  Gen ${g}: ${nCouples} couples → ${children.length} children (${survived} reach adulthood, ${children.length - survived} died young)`);
      console.log(`         pop ${row.pop} · ${row.countries} countries · ${row.lines} founder lines left · median net worth $${row.medWealth.toLocaleString()}`);
    }
    if (row.adults === 0) { extinctAt = g; if (narrate) console.log(`         every child of this generation died young — extinction.`); break; }
  }

  const finalAdults = adultsOf(living);
  const outcome = {
    extinct: extinctAt != null, extinctAt,
    finalGen: log[log.length - 1].gen, finalPop: extinctAt != null ? 0 : living.length,
    finalAdults: finalAdults.length,
    finalCountries: countriesOf(finalAdults).size,
    finalLines: linesOf(finalAdults).size, startLines: START,
    medWealth: Math.round(median(finalAdults.map((l) => l.netWorth)) || 0),
    log,
  };
  return outcome;
}

// ---- mode: single clan, narrated -------------------------------------------
function single() {
  console.log(`\nClan sim — one family, ${GENS} generations   start=${START}, seed=0x${SEED.toString(16)}, real TFR`);
  const o = runClan(SEED, true);
  console.log('\n  ── verdict ───────────────────────────────────────────────');
  if (o.extinct) {
    console.log(`  The line died out at generation ${o.extinctAt}. ${o.startLines} founders, no descendants left.`);
  } else {
    const fate = o.finalLines <= o.startLines / 3 ? 'collapsed toward a single bloodline (inbreeding)'
      : o.finalLines >= o.startLines ? 'kept its diversity'
        : 'narrowed but held on';
    console.log(`  Survived ${o.finalGen} generations: ${o.finalAdults} adults across ${o.finalCountries} countries.`);
    console.log(`  Founder lines: ${o.startLines} → ${o.finalLines} (${fate}).`);
    console.log(`  Median net worth: $${o.medWealth.toLocaleString()}.`);
  }
  console.log('');
}

// ---- mode: many clans, distribution ----------------------------------------
function trials() {
  console.log(`\nClan sim — ${TRIALS} trials   start=${START}, gens=${GENS}, real TFR\n`);
  const outs = [];
  for (let t = 0; t < TRIALS; t++) outs.push(runClan((SEED + t * 0x9e3779b1) >>> 0, false));
  const survivors = outs.filter((o) => !o.extinct);
  const pct = (n) => `${(100 * n / TRIALS).toFixed(0)}%`;
  const med = (f) => median(survivors.map(f));
  console.log(`  extinct within ${GENS} gens : ${pct(outs.filter((o) => o.extinct).length)} (${outs.filter((o) => o.extinct).length}/${TRIALS})`);
  if (survivors.length) {
    console.log(`  survivors (median):`);
    console.log(`    final adults      : ${med((o) => o.finalAdults)}`);
    console.log(`    countries         : ${med((o) => o.finalCountries)}`);
    console.log(`    founder lines left: ${med((o) => o.finalLines)} / ${START}`);
    console.log(`    net worth         : $${(med((o) => o.medWealth) || 0).toLocaleString()}`);
  }
  // growth signal: did surviving pops grow, hold, or shrink vs the seed?
  const grew = survivors.filter((o) => o.finalAdults > START).length;
  const shrank = survivors.filter((o) => o.finalAdults < START).length;
  console.log(`  among survivors: ${grew} grew, ${survivors.length - grew - shrank} held, ${shrank} shrank vs start of ${START}`);
  console.log('');
}

TRIALS > 1 ? trials() : single();
