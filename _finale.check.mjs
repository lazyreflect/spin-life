import fs from 'fs'; import path from 'path'; import { fileURLToPath } from 'url';
import { makeRoller } from './src/model/roll.js';
const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, 'data', f), 'utf8'));
const roller = makeRoller({
  countries: load('countries.json'), params: load('model-params.json'), names: load('names.json'),
  careers: load('careers.json').careers, bands: load('bands.json').bands,
  imputation: load('imputation.json'), luckCdf: load('luckCdf.json'), copy: load('copy.json'),
});
// Replicate Card.tsx gating exactly:
const finaleShows = (L) => !!L.fatalCause || L.diedYoung;     // {rv.showDied && tragic && ...}
const N = 20000;
let n_finale = 0, n_ordinary = 0, leak = 0, sampleTragic = null, sampleOrdinary = null;
for (let i = 0; i < N; i++) {
  const L = roller.rollLife();
  if (finaleShows(L)) {
    n_finale++;
    if (!(L.fatalCause || L.diedYoung)) leak++;               // must be genuinely cut-short
    if (!sampleTragic) sampleTragic = { name:L.name, diedYoung:L.diedYoung, fatalCause:L.fatalCause, age:L.age, finaleLead:'DIED AT', shows:'age '+L.age };
  } else {
    n_ordinary++;
    if (!sampleOrdinary) sampleOrdinary = { name:L.name, age:L.age, ends:'NET WORTH '+L.netWorthLabel, deathAgeShown:false };
  }
}
console.log(`of ${N} lives:`);
console.log(`  show DIED AT finale (cut-short): ${n_finale} (${(100*n_finale/N).toFixed(1)}%)  leaks=${leak} ${leak===0?'PASS':'FAIL'}`);
console.log(`  ordinary → end on NET WORTH, no death age: ${n_ordinary} (${(100*n_ordinary/N).toFixed(1)}%)`);
console.log('  sample tragic  :', JSON.stringify(sampleTragic));
console.log('  sample ordinary:', JSON.stringify(sampleOrdinary));
process.exit(leak ? 1 : 0);
