// Roll a single random life. Dependency-injected with data so both the Node
// sim and the Vite app share one source of truth.
import { clamp, normCdf, cholesky, corrNormals, sampleCumulative, randn } from './stats.js';
import {
  wealthQuantile, sampleAge, wealthLifeAdj, adjCountryIq,
  moneyTopPercent, iqTopPercent, heightTopPercent, looksTopPercent, lifeTopPercent,
} from './distributions.js';
import { pickName, rollEducation, rollCareer, money, heightImperial, rarityText, wealthClass, buildSentence } from './content.js';
import { rollEvents } from './events.js';

const flagEmoji = (code) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

// Destination wealth is ANCHORED on the career's income ceiling (its central
// national wealth rank); inheritance + luck only modulate within bounds. This
// makes job and class agree by construction: a clerk can't reach elite, and a
// rich kid who underachieves into a low-income job drops. Human capital (IQ,
// education, looks) flows in through career SELECTION, not a separate add-on.
const CAREER_RANK = { low: 0.20, lowmid: 0.33, mid: 0.48, highmid: 0.64, high: 0.80, elite: 0.93 };
const W_CAREER = 0.55; // career's share of the destination-wealth signal
// Hard [floor, ceiling] on the national wealth rank a career can reach, even
// with inheritance + luck. A clerk (mid) literally cannot end up elite; a
// high-income professional cannot end up destitute.
// Elite wealth (childRank >= 0.833) is reachable only by top-tier professions
// (high) or business ownership (elite) — a salaried highmid role (nurse,
// accountant, civil servant, scientist) tops out at "upper", never elite.
const CAREER_RANGE = {
  low: [0.00, 0.40], lowmid: [0.06, 0.55], mid: [0.20, 0.66],
  highmid: [0.40, 0.82], high: [0.58, 0.96], elite: [0.72, 1.0],
};

export function makeRoller({ countries, params, names, careers }) {
  const totalBirths = countries.reduce((a, c) => a + c.births, 0);
  const cum = []; let t = 0;
  for (const c of countries) { t += c.births; cum.push(t); }
  const L = { Male: cholesky(params.endowmentCorr.male), Female: cholesky(params.endowmentCorr.female) };
  const M = params.mobility, LS = params.lifespan;
  // Great Gatsby: inheritance persists more in high-inequality countries. Acts as
  // a realistic cushion (inherited assets keep an underachieving heir comfortable —
  // up to their career's ceiling, which still bars a modest job from true elite).
  const inheritWeight = (g) => clamp(0.22 + 0.006 * (g - 30), 0.18, 0.42);
  const careerRank = (career) => CAREER_RANK[career.incomeBand] ?? 0.5;

  // roll education + career for a draw (career income drives wealth, so it must
  // be known before the destination-wealth step)
  function rollJob(zIq, zLooks, zHt, sex, parentRank, country) {
    const education = rollEducation(zIq, parentRank, country, randn);
    const career = rollCareer({ zIq, zLooks, zHeight: zHt, sex, education }, country, careers);
    return { education, career };
  }

  // calibrate childRaw mean + spread once (now includes the career-income
  // premium), plus the spread of the parent->child rank jump (for arc rarity)
  let mu = 0.5, sd = 0.2, jumpSd = 0.2;
  { const N = 30000, vals = new Array(N), par = new Array(N);
    for (let i = 0; i < N; i++) {
      const c = countries[sampleCumulative(cum, totalBirths)];
      const male = Math.random() < params.sexMaleProb;
      const z = corrNormals(male ? L.Male : L.Female);
      const parentRank = normCdf(z[0]);
      const wI = inheritWeight(c.wealthGini);
      const { career } = rollJob(z[1], z[3], z[2], male ? 'Male' : 'Female', parentRank, c);
      par[i] = parentRank;
      vals[i] = W_CAREER * careerRank(career) + wI * parentRank + (1 - W_CAREER - wI) * 0.5 + M.luckSd * randn();
    }
    let m = 0; for (const v of vals) m += v; mu = m / N;
    let s = 0; for (const v of vals) s += (v - mu) ** 2; sd = Math.sqrt(s / N);
    let j = 0; for (let i = 0; i < N; i++) { const cr = normCdf((vals[i] - mu) / sd); j += (cr - par[i]) ** 2; }
    jumpSd = Math.sqrt(j / N);
  }

  function rollLife() {
    const country = countries[sampleCumulative(cum, totalBirths)];
    const sex = Math.random() < params.sexMaleProb ? 'Male' : 'Female';
    const z = corrNormals(L[sex]); // [famWealth, iq, height, looks]
    const zFw = z[0], zIq = z[1], zHt = z[2], zLk = z[3];

    const parentRank = normCdf(zFw);
    const wI = inheritWeight(country.wealthGini);

    const iq = clamp(Math.round(adjCountryIq(country.iq) + params.iqSd * zIq), 60, 160);
    const heightCm = (sex === 'Female' ? country.heightF : country.heightM) + (sex === 'Female' ? params.heightSdF : params.heightSdM) * zHt;
    const looks = clamp(params.looksMean + params.looksSd * zLk, 0.1, 10);

    // education + career first: career income drives destination wealth
    const { education, career } = rollJob(zIq, zLk, zHt, sex, parentRank, country);
    const childRaw = W_CAREER * careerRank(career) + wI * parentRank + (1 - W_CAREER - wI) * 0.5 + M.luckSd * randn();
    const [cFloor, cCeil] = CAREER_RANGE[career.incomeBand] ?? [0, 1];
    const childBase = clamp(normCdf((childRaw - mu) / sd), Math.max(cFloor, 0.0005), Math.min(cCeil, 0.9995));

    // life events: shift the outcome (may break career bounds — windfall, war),
    // cut the lifespan, and give the card a story
    const evt = rollEvents({ parentRank, childRank: childBase, zIq, career }, country);
    const childRank = clamp(childBase + evt.wealthDelta, 0.0005, 0.9995);

    const familyWealth = wealthQuantile(country.netWorth, country.wealthGini, parentRank);
    const netWorth = wealthQuantile(country.netWorth, country.wealthGini, childRank);

    const baseLE = sex === 'Female' ? country.lifeF : country.lifeM;
    const targetLE = clamp(baseLE + wealthLifeAdj(childRank) + LS.iqLifeYrsPerSd * zIq, 28, 98);
    let age = sampleAge(baseLE, targetLE);
    if (evt.fatal) age = clamp(Math.round(16 + Math.random() * (age - 16)), 15, age);
    else age = clamp(Math.round(age + evt.ageDelta), 1, 110);
    const diedYoung = age < 18; // never reached a career / adult class
    // suppress adult-life events (marriage, business…) for those who died young
    const eventTexts = (diedYoung ? evt.events.filter((e) => e.child) : evt.events).map((e) => e.text);

    const life = {
      country: country.name, code: country.code, flag: flagEmoji(country.code), continent: country.continent,
      sex, zIq, zHeight: zHt, zLooks: zLk, diedYoung,
      iq, heightCm, heightLabel: heightImperial(heightCm), looks,
      parentRank, childRank, familyWealth, netWorth,
      age, baseLE: Math.round(baseLE), events: eventTexts,
    };
    life.name = pickName(country, sex, names);
    life.education = education;
    life.career = career;

    // percentiles (global TOP%)
    life.pct = {
      country: moneyTopPercent(0, [country], country.births) , // placeholder; country chance handled in UI
      money: moneyTopPercent(netWorth, countries, totalBirths),
      iq: iqTopPercent(iq, countries, totalBirths),
      height: heightTopPercent(heightCm, sex, countries, totalBirths),
      looks: looksTopPercent(looks),
      life: lifeTopPercent(age, sex, countries, totalBirths),
    };
    life.countryChance = (country.births / totalBirths) * 100;

    // rarity = 1 / sqrt(product of marginal probabilities) + mobility-arc axis,
    // so a big rank jump/fall is rare even when the marginal stats are ordinary.
    const p = (x) => clamp(x / 100, 1e-6, 1);
    const arcP = clamp(2 * (1 - normCdf(Math.abs(childRank - parentRank) / jumpSd)), 1e-4, 1);
    const prod = p(life.pct.money) * p(life.pct.iq) * p(life.pct.height) * p(life.pct.life) * p(life.pct.looks) * arcP;
    life.rarity = 1 / Math.sqrt(prod);
    life.rarityLabel = rarityText(life.rarity);

    // mobility / class arc
    life.classOrigin = wealthClass(parentRank);
    life.classFinal = wealthClass(childRank);
    life.mobilityDelta = Math.round((childRank - parentRank) * 100);
    life.familyWealthLabel = money(familyWealth);
    life.netWorthLabel = money(netWorth);
    life.sentence = buildSentence({ ...life, country: country.name });
    return life;
  }

  return { rollLife, totalBirths, countries };
}
