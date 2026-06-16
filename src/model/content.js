// Names (culture clusters), career (education -> occupation), and formatting.
import { clamp, normCdf, sampleWeights } from './stats.js';

// --- names ------------------------------------------------------------------
const norm = (s) => `${s ?? ''}`.trim().toLowerCase();
const CONTINENT_REP = {
  Asia: 'india', Africa: 'nigeria', 'Middle East': 'saudi arabia',
  Europe: 'united kingdom', 'North America': 'united states',
  'South America': 'brazil', Oceania: 'australia', Antarctica: 'united states',
};
export function pickName(country, sex, nameGroups) {
  const n = norm(country.name);
  let g = nameGroups.find((x) => x.countries.some((c) => norm(c) === n));
  if (!g) { const rep = CONTINENT_REP[country.continent]; g = nameGroups.find((x) => x.countries.some((c) => norm(c) === rep)); }
  if (!g) g = nameGroups[0];
  const firsts = sex === 'Female' ? g.female_first_names : g.male_first_names;
  const first = firsts[Math.floor(Math.random() * firsts.length)] || 'Alex';
  const last = g.last_names[Math.floor(Math.random() * g.last_names.length)] || 'Doe';
  return `${first} ${last}`;
}

// --- career -----------------------------------------------------------------
const EDU = ['none', 'primary', 'secondary', 'vocational', 'bachelor', 'postgrad'];
const eduRank = (e) => EDU.indexOf(e);

// education attainment from IQ, family wealth, country enrollment, sex
export function rollEducation(zIq, parentRank, country, randn) {
  const enroll = (country.secondaryEnrollment ?? 70) / 100; // ~0..1.3
  let score = 0.85 * zIq + 1.6 * (parentRank - 0.5) + 1.4 * (enroll - 0.75) + 0.9 * randn();
  // map score -> tier index 0..5
  const cuts = [-1.1, -0.3, 0.4, 0.9, 1.7];
  let tier = 0;
  for (const c of cuts) if (score > c) tier++;
  // country floor: near-universal enrollment means almost nobody is unschooled
  const floor = enroll >= 0.9 ? 2 : enroll >= 0.6 ? 1 : 0;
  return EDU[Math.max(tier, floor)];
}

export function rollCareer(life, country, careers) {
  const tier = eduRank(life.education);
  const sectorShare = (sector) => {
    if (sector === 'agriculture') return (country.empAg ?? 25) / 100;
    if (sector === 'industry') return (country.empIndustry ?? 25) / 100;
    return (country.empServices ?? 50) / 100;
  };
  const femaleLF = (country.femaleLFP ?? 55) / 100;
  const eligible = careers.filter((c) => eduRank(c.minEducation) <= tier && (c.regions.includes('*') || c.regions.includes(country.continent)));
  const pool = eligible.length ? eligible : careers.filter((c) => eduRank(c.minEducation) <= tier);
  if (!pool.length) return careers.find((c) => c.id === 'subsistence-farmer') || careers[0];
  const weights = pool.map((c) => {
    let w = Math.max(0.02, sectorShare(c.sector));
    if (life.sex === 'Female') w *= clamp(0.4 + femaleLF, 0.3, 1.3);
    const tilt = 1 + 0.05 * (c.iqTilt * life.zIq + c.looksTilt * life.zLooks + c.heightTilt * life.zHeight);
    w *= clamp(tilt, 0.2, 3);
    // education match: people gravitate to jobs that use their schooling, so the
    // heavily over-qualified (e.g. a postgrad barber) are rare. Gap of 0-1 is free.
    const gap = Math.max(0, tier - eduRank(c.minEducation) - 1);
    w *= Math.exp(-(gap * gap) / 4);
    if (c.prestige === 'rare') w *= 0.5;
    if (c.prestige === 'legendary') w *= 0.12;
    return w;
  });
  return pool[sampleWeights(weights)];
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
export function wealthClass(rank) {
  const labels = ['lower class', 'working class', 'middle class', 'upper-middle class', 'upper class', 'the elite'];
  return labels[clamp(Math.floor(rank * 6), 0, 5)];
}
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const classPhrase = (label) => (label.startsWith('the') ? label : `the ${label}`);
export function buildSentence(life) {
  if (life.diedYoung) {
    const when = life.age < 1 ? 'as an infant' : `at ${life.age}`;
    return `Born into ${classPhrase(life.classOrigin)} in ${life.flag} ${life.country}, died ${when}.`;
  }
  const job = (life.career?.title || 'nobody').toLowerCase();
  const work = `became ${article(job)} ${job}`;
  const delta = life.mobilityDelta ?? 0;
  const end =
    delta > 4 ? `climbed to ${classPhrase(life.classFinal)} and died at ${life.age}` :
    delta < -4 ? `slid to ${classPhrase(life.classFinal)} and died at ${life.age}` :
    `died at ${life.age}, still ${classPhrase(life.classFinal)}`;
  return `Born into ${classPhrase(life.classOrigin)} in ${life.flag} ${life.country}, ${work}, ${end}.`;
}
