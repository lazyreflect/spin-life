// Roll a single random life. Dependency-injected with data so both the Node
// sim and the Vite app share one source of truth.
import { clamp, normCdf, cholesky, corrNormals, sampleCumulative, randn } from './stats.js';
import {
  wealthQuantile, sampleAge, wealthLifeAdj,
  moneyTopPercent, iqTopPercent, heightTopPercent, looksTopPercent, lifeTopPercent,
} from './distributions.js';
import { pickName, rollEducation, rollCareer, money, heightImperial, rarityText, wealthClass, buildSentence } from './content.js';

const flagEmoji = (code) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

export function makeRoller({ countries, params, names, careers }) {
  const totalBirths = countries.reduce((a, c) => a + c.births, 0);
  const cum = []; let t = 0;
  for (const c of countries) { t += c.births; cum.push(t); }
  const L = { Male: cholesky(params.endowmentCorr.male), Female: cholesky(params.endowmentCorr.female) };
  const M = params.mobility, LS = params.lifespan;
  const betaOf = (g) => clamp(M.betaBase + M.betaPerGini * (g - 30), M.betaMin, M.betaMax);

  // calibrate childRaw spread once (mean is 0.5 by symmetry)
  let sd = 0.2;
  { const N = 30000, vals = new Array(N);
    for (let i = 0; i < N; i++) {
      const c = countries[sampleCumulative(cum, totalBirths)];
      const male = Math.random() < params.sexMaleProb;
      const z = corrNormals(male ? L.Male : L.Female);
      const beta = betaOf(c.wealthGini);
      vals[i] = beta * normCdf(z[0]) + (1 - beta) * 0.5 + M.wIqIncome * z[1] + M.wLooksIncome * z[3] + M.wHeightIncome * z[2] + M.luckSd * randn();
    }
    let m = 0; for (const v of vals) m += v; m /= N;
    let s = 0; for (const v of vals) s += (v - m) ** 2;
    sd = Math.sqrt(s / N);
  }

  function rollLife() {
    const country = countries[sampleCumulative(cum, totalBirths)];
    const sex = Math.random() < params.sexMaleProb ? 'Male' : 'Female';
    const z = corrNormals(L[sex]); // [famWealth, iq, height, looks]
    const zFw = z[0], zIq = z[1], zHt = z[2], zLk = z[3];

    const parentRank = normCdf(zFw);
    const beta = betaOf(country.wealthGini);
    const childRaw = beta * parentRank + (1 - beta) * 0.5 + M.wIqIncome * zIq + M.wLooksIncome * zLk + M.wHeightIncome * zHt + M.luckSd * randn();
    const childRank = clamp(normCdf((childRaw - 0.5) / sd), 0.0005, 0.9995);

    const iq = Math.round(country.iq + params.iqSd * zIq);
    const heightCm = (sex === 'Female' ? country.heightF : country.heightM) + (sex === 'Female' ? params.heightSdF : params.heightSdM) * zHt;
    const looks = clamp(params.looksMean + params.looksSd * zLk, 0.1, 10);

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
    life.education = rollEducation(zIq, parentRank, country, randn);
    life.career = rollCareer(life, country, careers);

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
