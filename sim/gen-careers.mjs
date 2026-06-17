// One-shot generator for data/careers.json. Keeps the catalog readable and the
// prevalence/prestige/cohort axes internally consistent. Run once, then it can be
// deleted — careers.json is the artifact. Run: node sim/gen-careers.mjs
import { writeFile } from 'node:fs/promises';

// c(id, title, emoji, sector, minEdu, iqTilt, looksTilt, heightTilt, band, prestige, prevalence, cohort?)
// prevalence = relative commonness GIVEN eligibility (log-ish headcount weight):
//   ~8-10 elementary mass jobs · 4-6 common · 1.5-3 skilled · 0.4-1 professional · <0.4 elite/legendary
// cohort: omit = formal employment (weighted by sector share). Otherwise weighted
//   by a country attribute: 'informal' -> vulnEmployment, 'homemaker' -> 1-femaleLFP
//   (women), 'unemployed' -> unemployment. These are EXCLUDED from over-qual checks.
const C = (id, title, emoji, sector, minEdu, iq, looks, ht, band, prestige, prev, cohort) => {
  const e = { id, title, emoji, sector, minEducation: minEdu, iqTilt: iq, looksTilt: looks, heightTilt: ht, incomeBand: band, prestige, prevalence: prev, regions: ['*'] };
  if (cohort) e.cohort = cohort;
  return e;
};

const careers = [
  // ---- agriculture --------------------------------------------------------
  C('subsistence-farmer', 'Subsistence Farmer', '🌾', 'agriculture', 'none', -0.2, 0, 0, 'low', 'common', 9),
  C('farmer', 'Farmer', '🚜', 'agriculture', 'none', -0.1, 0, 0, 'lowmid', 'common', 6),
  C('farm-laborer', 'Farm Laborer', '🧑‍🌾', 'agriculture', 'none', -0.2, 0, 0.05, 'low', 'common', 6),
  C('plantation-worker', 'Plantation Worker', '🍃', 'agriculture', 'none', -0.2, 0, 0, 'low', 'common', 4),
  C('herder', 'Herder', '🐐', 'agriculture', 'none', -0.1, 0, 0, 'low', 'common', 3),
  C('fisher', 'Fisher', '🎣', 'agriculture', 'none', -0.1, 0, 0.1, 'low', 'common', 3),
  C('forester', 'Forester / Logger', '🪵', 'agriculture', 'primary', -0.1, 0, 0.1, 'lowmid', 'common', 1.5),
  C('agronomist', 'Agronomist', '🌱', 'agriculture', 'bachelor', 0.4, 0, 0, 'mid', 'uncommon', 0.6),
  C('veterinarian', 'Veterinarian', '🐄', 'agriculture', 'bachelor', 0.5, 0, 0, 'highmid', 'uncommon', 0.4),

  // ---- industry: production + skilled trades ------------------------------
  C('factory-worker', 'Factory Worker', '🏭', 'industry', 'primary', 0, 0, 0, 'lowmid', 'common', 7),
  C('garment-worker', 'Garment Worker', '🧵', 'industry', 'primary', -0.1, 0, 0, 'low', 'common', 5),
  C('construction-worker', 'Construction Worker', '👷', 'industry', 'primary', -0.1, 0, 0.1, 'lowmid', 'common', 6),
  C('mason', 'Mason / Bricklayer', '🧱', 'industry', 'primary', 0, 0, 0.05, 'lowmid', 'common', 3),
  C('carpenter', 'Carpenter', '🪚', 'industry', 'vocational', 0.1, 0, 0.05, 'lowmid', 'common', 3),
  C('mechanic', 'Mechanic', '🔧', 'industry', 'vocational', 0.1, 0, 0, 'mid', 'common', 4),
  C('electrician', 'Electrician', '⚡', 'industry', 'vocational', 0.2, 0, 0, 'mid', 'common', 3),
  C('plumber', 'Plumber', '🔩', 'industry', 'vocational', 0.1, 0, 0, 'mid', 'common', 3),
  C('welder', 'Welder', '🔥', 'industry', 'vocational', 0.1, 0, 0.05, 'mid', 'common', 2.5),
  C('machinist', 'Machinist', '⚙️', 'industry', 'vocational', 0.2, 0, 0, 'mid', 'common', 2),
  C('miner', 'Miner', '⛏️', 'industry', 'primary', -0.1, 0, 0.1, 'mid', 'common', 2),
  C('tailor', 'Tailor', '✂️', 'industry', 'primary', 0, 0, 0, 'lowmid', 'common', 3),
  C('factory-supervisor', 'Factory Supervisor', '📋', 'industry', 'secondary', 0.2, 0, 0, 'mid', 'common', 1.5),
  C('power-plant-operator', 'Power Plant Operator', '🏗️', 'industry', 'vocational', 0.3, 0, 0, 'highmid', 'uncommon', 0.7),
  C('oil-rig-worker', 'Oil Rig Worker', '🛢️', 'industry', 'vocational', 0.1, 0, 0.1, 'highmid', 'uncommon', 0.4),

  // ---- logistics / transport ----------------------------------------------
  C('truck-driver', 'Truck Driver', '🚚', 'services', 'secondary', 0, 0, 0, 'mid', 'common', 4),
  C('driver', 'Taxi / Rideshare Driver', '🚕', 'services', 'secondary', 0, 0, 0, 'lowmid', 'common', 4),
  C('delivery-courier', 'Delivery Courier', '📦', 'services', 'secondary', 0, 0, 0, 'lowmid', 'common', 4),
  C('warehouse-worker', 'Warehouse Worker', '🏬', 'services', 'primary', 0, 0, 0, 'lowmid', 'common', 4),
  C('bus-driver', 'Bus Driver', '🚌', 'services', 'secondary', 0, 0, 0, 'lowmid', 'common', 2.5),
  C('dock-worker', 'Dock Worker', '⚓', 'services', 'primary', 0, 0, 0.05, 'lowmid', 'common', 1.5),
  C('sailor', 'Sailor / Merchant Marine', '🚢', 'services', 'vocational', 0.1, 0, 0.1, 'mid', 'uncommon', 1),
  C('train-operator', 'Train Operator', '🚆', 'services', 'vocational', 0.2, 0, 0, 'mid', 'common', 1),

  // ---- services: low-end / hospitality ------------------------------------
  C('domestic-worker', 'Domestic Worker', '🧹', 'services', 'none', -0.1, 0, 0, 'low', 'common', 7),
  C('cleaner', 'Cleaner / Janitor', '🪣', 'services', 'none', -0.1, 0, 0, 'low', 'common', 5),
  C('street-vendor', 'Street Vendor', '🛒', 'services', 'none', 0, 0, 0, 'low', 'common', 5),
  C('retail-clerk', 'Retail Clerk', '🛍️', 'services', 'secondary', 0, 0.05, 0, 'lowmid', 'common', 7),
  C('waiter', 'Waiter', '🍽️', 'services', 'secondary', 0, 0.1, 0, 'lowmid', 'common', 6),
  C('shopkeeper', 'Shopkeeper', '🏪', 'services', 'primary', 0, 0, 0, 'lowmid', 'common', 5),
  C('cook', 'Cook', '🍳', 'services', 'vocational', 0, 0, 0, 'mid', 'common', 4),
  C('security-guard', 'Security Guard', '💂', 'services', 'secondary', 0, 0, 0.1, 'lowmid', 'common', 4),
  C('barber', 'Barber / Stylist', '💈', 'services', 'vocational', 0, 0.15, 0, 'mid', 'common', 3),
  C('hotel-staff', 'Hotel Staff', '🛎️', 'services', 'secondary', 0, 0.1, 0, 'lowmid', 'common', 3),
  C('chef', 'Chef', '👨‍🍳', 'services', 'vocational', 0.2, 0, 0, 'highmid', 'uncommon', 0.6),

  // ---- services: clerical / admin / sales ---------------------------------
  C('office-clerk', 'Office Clerk', '🗂️', 'services', 'secondary', 0.1, 0, 0, 'mid', 'common', 6),
  C('call-center-agent', 'Call Center Agent', '🎧', 'services', 'secondary', 0.1, 0, 0, 'lowmid', 'common', 3),
  C('receptionist', 'Receptionist', '💁', 'services', 'secondary', 0, 0.15, 0, 'lowmid', 'common', 2.5),
  C('sales-rep', 'Sales Representative', '🤝', 'services', 'secondary', 0.1, 0.15, 0.05, 'mid', 'common', 3),
  C('bank-teller', 'Bank Teller', '💵', 'services', 'secondary', 0.2, 0.05, 0, 'mid', 'common', 1.5),
  C('bookkeeper', 'Bookkeeper', '📒', 'services', 'secondary', 0.3, 0, 0, 'mid', 'common', 1.5),
  C('it-support', 'IT Support', '🖥️', 'services', 'vocational', 0.3, 0, 0, 'mid', 'common', 2),
  C('real-estate-agent', 'Real Estate Agent', '🏠', 'services', 'secondary', 0.1, 0.2, 0.05, 'highmid', 'uncommon', 1),

  // ---- public sector ------------------------------------------------------
  C('civil-servant', 'Civil Servant', '🏛️', 'services', 'bachelor', 0.2, 0, 0, 'highmid', 'uncommon', 3),
  C('sanitation-worker', 'Sanitation Worker', '🚮', 'services', 'primary', -0.1, 0, 0, 'lowmid', 'common', 2),
  C('postal-worker', 'Postal Worker', '📮', 'services', 'secondary', 0, 0, 0, 'lowmid', 'common', 1.5),
  C('police-officer', 'Police Officer', '👮', 'services', 'secondary', 0.1, 0, 0.15, 'mid', 'uncommon', 2.5),
  C('firefighter', 'Firefighter', '🚒', 'services', 'secondary', 0.1, 0, 0.15, 'mid', 'uncommon', 1),
  C('soldier', 'Soldier', '🎖️', 'services', 'secondary', 0, 0, 0.1, 'mid', 'uncommon', 3),
  C('military-officer', 'Military Officer', '🪖', 'services', 'bachelor', 0.3, 0, 0.1, 'highmid', 'uncommon', 0.6),

  // ---- care / health / education (mid-tier) -------------------------------
  C('teacher', 'Teacher', '🧑‍🏫', 'services', 'bachelor', 0.3, 0, 0, 'mid', 'uncommon', 5),
  C('teaching-assistant', 'Teaching Assistant', '✏️', 'services', 'secondary', 0.1, 0, 0, 'lowmid', 'common', 2),
  C('caregiver', 'Caregiver / Elder Care', '🧑‍🦽', 'services', 'secondary', 0, 0, 0, 'low', 'common', 3),
  C('childcare-worker', 'Childcare Worker', '🧸', 'services', 'secondary', 0, 0, 0, 'low', 'common', 2.5),
  C('community-health-worker', 'Community Health Worker', '🩺', 'services', 'secondary', 0.2, 0, 0, 'lowmid', 'common', 2),
  C('nurse', 'Nurse', '👩‍⚕️', 'services', 'bachelor', 0.4, 0, 0, 'highmid', 'uncommon', 4),
  C('midwife', 'Midwife', '🤱', 'services', 'vocational', 0.3, 0, 0, 'mid', 'uncommon', 1.5),
  C('paramedic', 'Paramedic', '🚑', 'services', 'vocational', 0.3, 0, 0.05, 'mid', 'uncommon', 1),
  C('pharmacy-tech', 'Pharmacy Technician', '💊', 'services', 'vocational', 0.3, 0, 0, 'mid', 'common', 1),
  C('lab-technician', 'Lab Technician', '🔬', 'services', 'vocational', 0.4, 0, 0, 'mid', 'uncommon', 1.2),
  C('dental-hygienist', 'Dental Hygienist', '🦷', 'services', 'vocational', 0.3, 0.05, 0, 'highmid', 'uncommon', 0.6),
  C('social-worker', 'Social Worker', '🫂', 'services', 'bachelor', 0.3, 0, 0, 'mid', 'uncommon', 1.5),

  // ---- professionals (high-skill) -----------------------------------------
  C('accountant', 'Accountant', '🧮', 'services', 'bachelor', 0.4, 0, 0, 'highmid', 'uncommon', 2),
  C('journalist', 'Journalist', '📰', 'services', 'bachelor', 0.4, 0.05, 0, 'mid', 'uncommon', 1.2),
  C('data-analyst', 'Data Analyst', '📊', 'services', 'bachelor', 0.5, 0, 0, 'highmid', 'rare', 1),
  C('engineer', 'Engineer', '🛠️', 'services', 'bachelor', 0.6, 0, 0, 'high', 'rare', 1.5),
  C('software-developer', 'Software Developer', '💻', 'services', 'bachelor', 0.6, 0, 0, 'high', 'rare', 1.5),
  C('architect', 'Architect', '📐', 'services', 'bachelor', 0.5, 0.05, 0, 'high', 'rare', 0.6),
  C('management-consultant', 'Management Consultant', '📈', 'services', 'bachelor', 0.5, 0.1, 0, 'high', 'rare', 0.4),
  C('banker', 'Banker / Financier', '🏦', 'services', 'bachelor', 0.4, 0.05, 0, 'high', 'rare', 0.8),
  C('pharmacist', 'Pharmacist', '⚗️', 'services', 'postgrad', 0.5, 0, 0, 'high', 'rare', 0.6),
  C('psychologist', 'Psychologist', '🧠', 'services', 'postgrad', 0.5, 0, 0, 'highmid', 'uncommon', 0.5),
  C('lawyer', 'Lawyer', '⚖️', 'services', 'postgrad', 0.5, 0.05, 0, 'high', 'rare', 0.8),
  C('doctor', 'Doctor', '🩻', 'services', 'postgrad', 0.6, 0, 0, 'high', 'rare', 0.7),
  C('dentist', 'Dentist', '🦷', 'services', 'postgrad', 0.5, 0, 0, 'high', 'rare', 0.4),
  C('professor', 'Professor', '🎓', 'services', 'postgrad', 0.7, 0, 0, 'highmid', 'rare', 0.4),
  C('scientist', 'Scientist', '🔭', 'services', 'postgrad', 0.7, 0, 0, 'highmid', 'rare', 0.4),
  C('pilot', 'Airline Pilot', '✈️', 'services', 'bachelor', 0.3, 0.05, 0.05, 'high', 'rare', 0.3),
  C('diplomat', 'Diplomat', '🎩', 'services', 'postgrad', 0.4, 0.1, 0, 'high', 'rare', 0.2),
  C('judge', 'Judge', '👨‍⚖️', 'services', 'postgrad', 0.5, 0, 0, 'high', 'rare', 0.15),

  // ---- creative / sport / fame --------------------------------------------
  C('musician', 'Musician', '🎸', 'services', 'secondary', 0, 0.1, 0, 'lowmid', 'uncommon', 1.5),
  C('artist', 'Artist', '🎨', 'services', 'secondary', 0.1, 0, 0, 'lowmid', 'uncommon', 1.5),
  C('clergy', 'Clergy', '⛪', 'services', 'secondary', 0.1, 0, 0, 'mid', 'uncommon', 2),
  C('content-creator', 'Content Creator', '📱', 'services', 'secondary', 0.1, 0.3, 0, 'mid', 'rare', 0.5),
  C('actor', 'Actor', '🎬', 'services', 'secondary', 0, 0.5, 0.05, 'high', 'legendary', 0.2),
  C('athlete', 'Pro Athlete', '🏅', 'services', 'secondary', 0, 0.1, 0.3, 'high', 'legendary', 0.15),

  // ---- elite / power ------------------------------------------------------
  C('entrepreneur', 'Founder', '🚀', 'services', 'secondary', 0.4, 0.05, 0, 'elite', 'legendary', 0.4),
  C('politician', 'Politician', '🗳️', 'services', 'bachelor', 0.2, 0.1, 0.05, 'high', 'legendary', 0.15),
  C('executive', 'CEO / Executive', '💼', 'services', 'bachelor', 0.4, 0.1, 0.05, 'elite', 'legendary', 0.12),
  C('astronaut', 'Astronaut', '👨‍🚀', 'services', 'postgrad', 0.7, 0, 0.05, 'highmid', 'legendary', 0.05),

  // ---- informal economy (weighted by vulnerable-employment share) ---------
  C('day-laborer', 'Day Laborer', '🧰', 'services', 'none', -0.1, 0, 0.05, 'low', 'common', 7, 'informal'),
  C('informal-trader', 'Informal Trader', '🧺', 'services', 'none', 0, 0, 0, 'low', 'common', 6, 'informal'),
  C('unpaid-family-worker', 'Unpaid Family Worker', '👨‍👩‍👧', 'services', 'none', -0.1, 0, 0, 'low', 'common', 5, 'informal'),
  C('waste-picker', 'Waste Picker', '♻️', 'services', 'none', -0.2, 0, 0, 'low', 'common', 2, 'informal'),
  C('rickshaw-puller', 'Rickshaw Puller', '🛺', 'services', 'none', -0.1, 0, 0.05, 'low', 'common', 2, 'informal'),
  C('artisanal-miner', 'Artisanal Miner', '🪨', 'services', 'none', -0.1, 0, 0.05, 'low', 'common', 1.5, 'informal'),
  C('sex-worker', 'Sex Worker', '🌃', 'services', 'none', 0, 0.2, 0, 'low', 'uncommon', 1, 'informal'),

  // ---- not in paid work ---------------------------------------------------
  C('homemaker', 'Homemaker', '🏠', 'services', 'none', 0, 0, 0, 'low', 'common', 6, 'homemaker'),
  C('unemployed', 'Unemployed', '🔍', 'services', 'none', 0, 0, 0, 'low', 'common', 5, 'unemployed'),
];

// ISCO-08 major group per FORMAL career (1 Mgr · 2 Prof · 3 Tech/assoc-prof ·
// 4 Clerical · 5 Service/sales · 6 Skilled agriculture · 7 Craft/trades ·
// 8 Plant/machine operators · 9 Elementary). When a country has ILOSTAT
// occupation data (data/countries.json `isco`), rollCareer uses the country's
// share of the career's group as its base weight instead of the 3-sector split.
// Cohorts (informal/homemaker/unemployed) carry no group — they keep their own base.
const ISCO = {
  'subsistence-farmer': 6, farmer: 6, herder: 6, fisher: 6, forester: 6, 'farm-laborer': 9, 'plantation-worker': 9, agronomist: 2, veterinarian: 2,
  'factory-worker': 8, 'garment-worker': 8, 'construction-worker': 7, mason: 7, carpenter: 7, mechanic: 7, electrician: 7, plumber: 7, welder: 7, machinist: 7, miner: 8, tailor: 7, 'factory-supervisor': 3, 'power-plant-operator': 8, 'oil-rig-worker': 8,
  'truck-driver': 8, driver: 8, 'delivery-courier': 8, 'warehouse-worker': 9, 'bus-driver': 8, 'dock-worker': 9, sailor: 8, 'train-operator': 8,
  'domestic-worker': 9, cleaner: 9, 'street-vendor': 5, 'retail-clerk': 5, waiter: 5, shopkeeper: 5, cook: 5, 'security-guard': 5, barber: 5, 'hotel-staff': 5, chef: 3,
  'office-clerk': 4, 'call-center-agent': 4, receptionist: 4, 'sales-rep': 3, 'bank-teller': 4, bookkeeper: 3, 'it-support': 3, 'real-estate-agent': 3,
  'civil-servant': 3, 'sanitation-worker': 9, 'postal-worker': 4, 'police-officer': 5, firefighter: 5, soldier: 5, 'military-officer': 3,
  teacher: 2, 'teaching-assistant': 5, caregiver: 5, 'childcare-worker': 5, 'community-health-worker': 3, nurse: 2, midwife: 3, paramedic: 3, 'pharmacy-tech': 3, 'lab-technician': 3, 'dental-hygienist': 3, 'social-worker': 2,
  accountant: 2, journalist: 2, 'data-analyst': 2, engineer: 2, 'software-developer': 2, architect: 2, 'management-consultant': 2, banker: 2, pharmacist: 2, psychologist: 2, lawyer: 2, doctor: 2, dentist: 2, professor: 2, scientist: 2, pilot: 3, diplomat: 1, judge: 2,
  musician: 2, artist: 2, clergy: 2, 'content-creator': 2, actor: 2, athlete: 3,
  entrepreneur: 1, politician: 1, executive: 1, astronaut: 2,
};
for (const c of careers) if (!c.cohort) {
  if (!ISCO[c.id]) throw new Error(`missing ISCO group for ${c.id}`);
  c.isco = ISCO[c.id];
}

// duplicate-id guard
const ids = careers.map((c) => c.id);
const dup = ids.find((id, i) => ids.indexOf(id) !== i);
if (dup) throw new Error(`duplicate id: ${dup}`);

const NOTE = 'Global career catalog. Country/culture match is STRUCTURAL: each FORMAL career is weighted by the country employment share in its `sector` (empAg/empIndustry/empServices), gated by `minEducation`, scaled by `prevalence` (how common the role is given eligibility), and tilted by traits. Special `cohort`s replace sector weighting with a country attribute: `informal` -> vulnEmployment (vulnerable-employment %), `homemaker` -> (1-femaleLFP), `unemployed` -> unemployment %. `prestige` is now PURELY a collectible label (does not throttle selection — that is `prevalence`). Avoid hand-assigning culture->job (caricature); let the economy do it. See DESIGN.md §career.';
const SCHEMA = {
  id: 'kebab', title: 'string', emoji: 'string',
  sector: 'agriculture|industry|services',
  minEducation: 'none|primary|secondary|vocational|bachelor|postgrad',
  iqTilt: 'number (per-SD nudge to selection odds)', looksTilt: 'number', heightTilt: 'number',
  incomeBand: 'low|lowmid|mid|highmid|high|elite',
  prestige: 'common|uncommon|rare|legendary (collectible label only)',
  prevalence: 'number (relative commonness given eligibility; drives selection weight)',
  cohort: "omit (formal) | 'informal' | 'homemaker' | 'unemployed'",
  isco: 'ISCO-08 major group 1-9 (formal careers only); base weight = country isco share when available',
  regions: "['*'] or list of continents / culture-cluster ids",
};

const out = { _note: NOTE, _schema: SCHEMA, careers };
await writeFile(new URL('../data/careers.json', import.meta.url), JSON.stringify(out, null, 2) + '\n');
console.log(`wrote ${careers.length} careers`);
