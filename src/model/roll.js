// Roll a single random life. Dependency-injected with data so both the Node
// sim and the Vite app share one source of truth.
import { clamp, normCdf, cholesky, corrNormals, sampleCumulative, randn } from './stats.js';
import {
  wealthQuantile, sampleAge, wealthLifeAdj, adjCountryIq,
  moneyTopPercent, iqTopPercent, heightTopPercent, looksTopPercent, lifeTopPercent,
} from './distributions.js';
import { pickName, rollEducation, rollCareer, money, heightImperial, rarityText, wealthClass, buildSentence } from './content.js';

const flagEmoji = (code) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

// Career income routed into destination wealth (rank-space premium). Replaces
// the direct trait terms: IQ/family already flow in through education -> career.
const INCOME_PREMIUM = { low: -0.10, lowmid: -0.05, mid: 0.0, highmid: 0.08, high: 0.16, elite: 0.30 };

export function makeRoller({ countries, params, names, careers }) {
  const totalBirths = countries.reduce((a, c) => a + c.births, 0);
  const cum = []; let t = 0;
  for (const c of countries) { t += c.births; cum.push(t); }
  const L = { Male: cholesky(params.endowmentCorr.male), Female: cholesky(params.endowmentCorr.female) };
  const M = params.mobility, LS = params.lifespan;
  const betaOf = (g) => clamp(M.betaBase + M.betaPerGini * (g - 30), M.betaMin, M.betaMax);
  const incomePrem = (career) => INCOME_PREMIUM[career.incomeBand] ?? 0;

  // roll education + career for a draw (career income drives wealth, so it must
  // be known before the destination-wealth step)
  function rollJob(zIq, zLooks, zHt, sex, parentRank, country) {
    const education = rollEducation(zIq, parentRank, country, randn);
    const career = rollCareer({ zIq, zLooks, zHeight: zHt, sex, education }, country, careers);
    return { education, career };
  }

  // calibrate childRaw mean + spread once (now includes the career-income premium)
  let mu = 0.5, sd = 0.2;
  { const N = 30000, vals = new Array(N);
    for (let i = 0; i < N; i++) {
      const c = countries[sampleCumulative(cum, totalBirths)];
      const male = Math.random() < params.sexMaleProb;
      const z = corrNormals(male ? L.Male : L.Female);
      const parentRank = normCdf(z[0]);
      const beta = betaOf(c.wealthGini);
      const { career } = rollJob(z[1], z[3], z[2], male ? 'Male' : 'Female', parentRank, c);
      vals[i] = beta * parentRank + (1 - beta) * 0.5 + incomePrem(career) + M.luckSd * randn();
    }
    let m = 0; for (const v of vals) m += v; mu = m / N;
    let s = 0; for (const v of vals) s += (v - mu) ** 2;
    sd = Math.sqrt(s / N);
  }

  function rollLife() {
    const country = countries[sampleCumulative(cum, totalBirths)];
    const sex = Math.random() < params.sexMaleProb ? 'Male' : 'Female';
    const z = corrNormals(L[sex]); // [famWealth, iq, height, looks]
    const zFw = z[0], zIq = z[1], zHt = z[2], zLk = z[3];

    const parentRank = normCdf(zFw);
    const beta = betaOf(country.wealthGini);

    const iq = clamp(Math.round(adjCountryIq(country.iq) + params.iqSd * zIq), 55, 160);
    const heightCm = (sex === 'Female' ? country.heightF : country.heightM) + (sex === 'Female' ? params.heightSdF : params.heightSdM) * zHt;
    const looks = clamp(params.looksMean + params.looksSd * zLk, 0.1, 10);

    // education + career first: career income drives destination wealth
    const { education, career } = rollJob(zIq, zLk, zHt, sex, parentRank, country);
    const childRaw = beta * parentRank + (1 - beta) * 0.5 + incomePrem(career) + M.luckSd * randn();
    const childRank = clamp(normCdf((childRaw - mu) / sd), 0.0005, 0.9995);

    const familyWealth = wealthQuantile(country.netWorth, country.wealthGini, parentRank);
    const netWorth = wealthQuantile(country.netWorth, country.wealthGini, childRank);

    const baseLE = sex === 'Female' ? country.lifeF : country.lifeM;
    const targetLE = clamp(baseLE + wealthLifeAdj(childRank) + LS.iqLifeYrsPerSd * zIq, 28, 98);
    const age = sampleAge(baseLE, targetLE);

    const life = {
      country: country.name, code: country.code, flag: flagEmoji(country.code), continent: country.continent,
      sex, zIq, zHeight: zHt, zLooks: zLk,
      iq, heightCm, heightLabel: heightImperial(heightCm), looks,
      parentRank, childRank, familyWealth, netWorth,
      age, baseLE: Math.round(baseLE),
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

    // rarity = 1 / sqrt(product of marginal probabilities)  (v1; joint version later)
    const p = (x) => clamp(x / 100, 1e-6, 1);
    const prod = p(life.pct.money) * p(life.pct.iq) * p(life.pct.height) * p(life.pct.life) * p(life.pct.looks);
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
