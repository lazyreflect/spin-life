// Print sample life-cards using the shared model. Run: node sim/cards.js [count]
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { makeRoller } from '../src/model/roll.js';

const dir = path.dirname(fileURLToPath(import.meta.url));
const load = (f) => JSON.parse(fs.readFileSync(path.join(dir, '../data', f), 'utf8'));
const countries = load('countries.json');
const params = load('model-params.json');
const names = load('names.json');
const careers = load('careers.json').careers;

const roller = makeRoller({ countries, params, names, careers });
const n = +(process.argv[2] || 10);

const pct = (x) => (x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x)) + '%';
const arrow = (d) => (d > 0 ? `▲ climbed ${d}` : d < 0 ? `▼ fell ${-d}` : '— held');

for (let i = 0; i < n; i++) {
  const L = roller.rollLife();
  console.log('\n' + '─'.repeat(64));
  console.log(`${L.flag}  ${L.name}   (${L.sex})   ${L.rarityLabel}`);
  console.log(L.sentence);
  console.log('');
  console.log(`  Country   ${L.country} (${L.countryChance < 1 ? L.countryChance.toFixed(2) : L.countryChance.toFixed(1)}% of births)`);
  console.log(`  Career    ${L.career.emoji} ${L.career.title}   [${L.education}, ${L.career.prestige}]`);
  console.log(`  Net worth ${L.netWorthLabel}  (TOP ${pct(L.pct.money)})    family ${L.familyWealthLabel}`);
  console.log(`  Class arc ${L.classOrigin} → ${L.classFinal}   (${arrow(L.mobilityDelta)} pts)`);
  console.log(`  Height    ${L.heightLabel}  (TOP ${pct(L.pct.height)})`);
  console.log(`  IQ        ${L.iq}  (TOP ${pct(L.pct.iq)})`);
  console.log(`  Looks     ${L.looks.toFixed(1)}  (TOP ${pct(L.pct.looks)})`);
  console.log(`  Lives to  ${L.age}  (TOP ${pct(L.pct.life)})`);
}
console.log('\n' + '─'.repeat(64));
