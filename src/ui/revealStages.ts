// Builds the sequence of per-dimension reveal wheels for a single (already
// rolled) life. The model computes every value up front; these stages are pure
// presentation — each wheel just animates to a bucket we already know the
// answer for. Reveal order is UX only, not the correlation structure.
import { CONTINENTS, countriesIn } from '../data';
import { desirabilityColor } from './desirability';
import type { Seg } from './Wheel';

export type StageId = 'continent' | 'country' | 'wealth' | 'height' | 'iq' | 'looks' | 'life';

// continent -> country -> the original per-stat spins (wealth, height, IQ, looks, lifespan)
export const REVEAL_ORDER: StageId[] = ['continent', 'country', 'wealth', 'height', 'iq', 'looks', 'life'];

export type StageView = {
  segments: Seg[];
  targetIndex: number;
  title: string;       // hub label while the wheel is spinning
  result: string;      // hub label once the wheel has landed
  durationMs: number;
};

const flagEmoji = (code: string) =>
  String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));

type Bucket = { label: string; max: number };

// A stat wheel: equal slices coloured by desirability (low buckets bad/crimson
// -> high buckets good/emerald), landing on the bucket holding the rolled value.
function statStage(
  title: string, buckets: Bucket[],
  value: number, result: string, durationMs = 1300,
): StageView {
  let targetIndex = buckets.findIndex((b) => value < b.max);
  if (targetIndex < 0) targetIndex = buckets.length - 1;
  const n = buckets.length;
  const segments: Seg[] = buckets.map((b, i) => ({
    label: b.label,
    frac: 1 / n,
    color: desirabilityColor(i / (n - 1)),
  }));
  return { segments, targetIndex, title, result, durationMs };
}

const WEALTH_BUCKETS: Bucket[] = [
  { label: '<$1k', max: 1e3 }, { label: '$1–10k', max: 1e4 }, { label: '$10–100k', max: 1e5 },
  { label: '$100k–1M', max: 1e6 }, { label: '$1–10M', max: 1e7 }, { label: '$10M+', max: Infinity },
];
const HEIGHT_BUCKETS: Bucket[] = [
  { label: '<150', max: 150 }, { label: '150s', max: 160 }, { label: '160s', max: 170 },
  { label: '170s', max: 180 }, { label: '180s', max: 190 }, { label: '190+', max: Infinity },
];
const IQ_BUCKETS: Bucket[] = [
  { label: '<70', max: 70 }, { label: '70–85', max: 85 }, { label: '85–100', max: 100 },
  { label: '100–115', max: 115 }, { label: '115–130', max: 130 }, { label: '130+', max: Infinity },
];
const LOOKS_BUCKETS: Bucket[] = [
  { label: '0–2', max: 2 }, { label: '2–4', max: 4 }, { label: '4–6', max: 6 },
  { label: '6–8', max: 8 }, { label: '8–10', max: Infinity },
];
const LIFE_BUCKETS: Bucket[] = [
  { label: '<40', max: 40 }, { label: '40s', max: 50 }, { label: '50s', max: 60 }, { label: '60s', max: 70 },
  { label: '70s', max: 80 }, { label: '80s', max: 90 }, { label: '90+', max: Infinity },
];

export function buildStage(id: StageId, life: any): StageView {
  switch (id) {
    case 'continent': {
      const segments = CONTINENTS.map((c) => ({ label: c.name, frac: c.frac, color: desirabilityColor(c.desir) }));
      const targetIndex = CONTINENTS.findIndex((c) => c.name === life.continent);
      return { segments, targetIndex, title: 'CONTINENT', result: life.continent, durationMs: 1900 };
    }
    case 'country': {
      const list = countriesIn(life.continent);
      const segments = list.map((c) => ({ label: c.name, frac: c.frac, color: desirabilityColor(c.desir), flag: flagEmoji(c.code) }));
      const targetIndex = list.findIndex((c) => c.code === life.code);
      return { segments, targetIndex, title: 'COUNTRY', result: `${life.flag}\n${life.country}`, durationMs: 2100 };
    }
    case 'wealth':
      return statStage('NET WORTH', WEALTH_BUCKETS, life.netWorth, life.netWorthLabel);
    case 'height':
      return statStage('HEIGHT', HEIGHT_BUCKETS, life.heightCm, life.heightLabel);
    case 'iq':
      return statStage('IQ', IQ_BUCKETS, life.iq, String(life.iq));
    case 'looks':
      return statStage('LOOKS', LOOKS_BUCKETS, life.looks, life.looks.toFixed(1));
    case 'life':
      return statStage('LIVES TO', LIFE_BUCKETS, life.age, String(life.age));
  }
}
