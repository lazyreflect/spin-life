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
  // IQ now leads attainment (high IQ -> more schooling -> access to high-ceiling
  // careers; low IQ -> less schooling -> capped careers), with family + country
  // enrollment still strong secondary factors.
  let score = 1.25 * zIq + 1.5 * (parentRank - 0.5) + 1.3 * (enroll - 0.75) + 0.8 * randn();
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
  // informal & non-employment "menu shares" come from their own country attributes
  // (real World Bank columns) instead of the sector employment split.
  const informality = clamp((country.vulnEmployment ?? 30) / 100, 0.02, 0.95);
  const unemp = clamp((country.unemployment ?? 6) / 100, 0.01, 0.5);
  const eligible = careers.filter((c) => eduRank(c.minEducation) <= tier && (c.regions.includes('*') || c.regions.includes(country.continent)));
  const pool = eligible.length ? eligible : careers.filter((c) => eduRank(c.minEducation) <= tier);
  if (!pool.length) return careers.find((c) => c.id === 'subsistence-farmer') || careers[0];
  const BAND_SKILL = { low: 1, lowmid: 1.5, mid: 2, highmid: 3.5, high: 4, elite: 5 };
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
      const skill = (c.iqTilt || 0) >= 0.4 ? Math.max(cMin, BAND_SKILL[c.incomeBand] ?? cMin) : cMin;
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
  const idx = sampleWeights(weights);
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
const OCC_RANK = {
  // not-in-work / informal survival economy (own household standing is set by
  // inherited wealth; the occupation itself confers little)
  unemployed: 0.10, 'waste-picker': 0.10, 'unpaid-family-worker': 0.12, homemaker: 0.35,
  'day-laborer': 0.15, 'informal-trader': 0.15, 'rickshaw-puller': 0.15, 'artisanal-miner': 0.15, 'sex-worker': 0.15,
  // elementary / low-skill
  'subsistence-farmer': 0.15, farmer: 0.15, herder: 0.15, fisher: 0.15, 'street-vendor': 0.15, 'domestic-worker': 0.15,
  cleaner: 0.15, 'farm-laborer': 0.15, 'plantation-worker': 0.15, caregiver: 0.20, 'childcare-worker': 0.20,
  'garment-worker': 0.20, 'delivery-courier': 0.20, 'warehouse-worker': 0.20, 'sanitation-worker': 0.20,
  // operatives / service workers
  'factory-worker': 0.28, 'construction-worker': 0.28, 'truck-driver': 0.28, driver: 0.28, waiter: 0.28, 'retail-clerk': 0.28, 'security-guard': 0.28,
  mason: 0.28, forester: 0.28, 'bus-driver': 0.28, 'dock-worker': 0.28, 'hotel-staff': 0.28, 'postal-worker': 0.28,
  'call-center-agent': 0.28, receptionist: 0.28, 'teaching-assistant': 0.28,
  // skilled trades / technicians / clerical
  miner: 0.40, mechanic: 0.40, electrician: 0.40, plumber: 0.40, welder: 0.40, carpenter: 0.40, machinist: 0.40,
  'oil-rig-worker': 0.40, sailor: 0.40, 'train-operator': 0.40, tailor: 0.40, cook: 0.40, barber: 0.40, soldier: 0.40, clerk: 0.40,
  'sales-rep': 0.40, 'bank-teller': 0.40, bookkeeper: 0.40, 'community-health-worker': 0.40,
  // mid professionals / supervisors / public service
  shopkeeper: 0.52, 'civil-servant': 0.52, teacher: 0.52, nurse: 0.52, journalist: 0.52, clergy: 0.52, musician: 0.52, artist: 0.52, athlete: 0.52, actor: 0.52,
  'factory-supervisor': 0.52, 'power-plant-operator': 0.52, 'it-support': 0.52, chef: 0.52, 'police-officer': 0.52, firefighter: 0.52,
  midwife: 0.52, paramedic: 0.52, 'pharmacy-tech': 0.52, 'lab-technician': 0.52, 'social-worker': 0.52, 'content-creator': 0.52,
  // upper professionals
  accountant: 0.70, engineer: 0.70, 'software-developer': 0.70, architect: 0.70, pharmacist: 0.70, banker: 0.70, lawyer: 0.70, doctor: 0.70, professor: 0.70, scientist: 0.70, pilot: 0.70, astronaut: 0.70,
  'real-estate-agent': 0.62, agronomist: 0.62, veterinarian: 0.70, 'dental-hygienist': 0.62, 'military-officer': 0.70,
  'data-analyst': 0.70, 'management-consultant': 0.70, psychologist: 0.70, dentist: 0.70,
  // authority / power elite
  diplomat: 0.82, judge: 0.82, politician: 0.82, executive: 0.82, entrepreneur: 0.82,
};
export const occRankOf = (careerId) => OCC_RANK[careerId] ?? 0.40;

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
const article = (word) => (/^[aeiou]/i.test(word) ? 'an' : 'a');
const classPhrase = (label) => (label.startsWith('the') ? label : `the ${label}`);
export function buildSentence(life) {
  const ev = life.events && life.events.length ? `, ${life.events[0]}` : '';
  if (life.diedYoung) {
    const when = life.age < 1 ? 'as an infant' : `at ${life.age}`;
    return `Born into ${classPhrase(life.classOrigin)} in ${life.flag} ${life.country}${ev}, died ${when}.`;
  }
  const job = (life.career?.title || 'nobody').toLowerCase();
  const work = `became ${article(job)} ${job}`;
  const changed = life.classFinal !== life.classOrigin;
  const dir = (life.mobilityDelta ?? 0) > 0 ? 'climbed to' : 'slid to';
  const end = changed
    ? `${dir} ${classPhrase(life.classFinal)} and died at ${life.age}`
    : `died at ${life.age}, still ${classPhrase(life.classFinal)}`;
  return `Born into ${classPhrase(life.classOrigin)} in ${life.flag} ${life.country}, ${work}${ev}, ${end}.`;
}
