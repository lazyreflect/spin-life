// Three-beat card copy (BORN · DIED) — a small templating engine over the banks
// in data/copy.json. The banks are pure data, enriched freely in any session;
// this file is the stable mechanism that assembles them.
//
// One design, no special-case patchwork:
//   • each beat = frame/opener + clause, drawn from independent banks, so variety
//     is the PRODUCT of the slot sizes (see data/copy.json _schema);
//   • clause selection is generic — `passesWhen` filters by data-declared guards,
//     `fill` substitutes data-declared tokens. Adding clauses needs no code here;
//   • the DIED beat is chosen by the life's ENDING MODE through a dispatch table
//     (not an if/else chain): natural · fatal · cutShort;
//   • picks are a deterministic hash of the life (identical lives → identical copy,
//     so shareable permalinks reproduce exactly) and never touch the model RNG;
//   • an optional `recent` set lets the DISPLAY layer exclude lately-shown clauses
//     (sliding-window de-dup), the only reliable way to stay fresh at volume —
//     stateless picking can't beat the birthday bound. The canonical pick ignores
//     `recent` so stored/shared lives stay stable.
import { clamp, makeRng, hashSeed } from './stats.js';

// ── shared vocabulary (engine constants, not content) ───────────────────────
const CLASS_ORDER = ['lower', 'working', 'middle', 'upper-mid', 'upper', 'elite'];
const CLASSES_UP = { 1: 'a class', 2: 'two classes', 3: 'three classes', 4: 'four classes', 5: 'five classes' };
const ORIGIN_NOUN = { lower: 'poverty', working: 'working class', middle: 'middle class', upper: 'world they came from', elite: 'world they came from' };
const PRONOUN = { Male: { they: 'he', them: 'him', their: 'his' }, Female: { they: 'she', them: 'her', their: 'her' } };
const originKey = (shortClass) => (shortClass === 'upper-mid' ? 'upper' : shortClass);

// ── generic clause helpers ──────────────────────────────────────────────────
const cap = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const fill = (tpl, tokens) => tpl.replace(/\{(\w+)\}/g, (_, k) => (tokens[k] != null ? tokens[k] : ''));
const clauseText = (c) => (typeof c === 'string' ? c : c.text);

// a clause's data-declared guard vs. the life's computed context
function passesWhen(when, ctx) {
  if (!when) return true;
  if (when.dir && when.dir !== ctx.dir) return false;
  if (when.minClimb != null && ctx.climb < when.minClimb) return false;
  if (when.originLow && !ctx.originLow) return false;
  return true;
}

// pick one clause: keep those whose guard fits, prefer ones not lately shown,
// then draw from the seeded stream. When a `recent` set is supplied, the chosen
// clause's TEMPLATE text is recorded into it (so the next call avoids it) — both
// the compare and the record key on clauseText, never the filled output. Returns
// the raw clause (string | {text,…}).
function chooseClause(bank, ctx, rng, recent) {
  let cands = (bank || []).filter((c) => passesWhen(typeof c === 'object' ? c.when : null, ctx));
  if (!cands.length) cands = bank || [''];
  if (recent && recent.size) {
    const fresh = cands.filter((c) => !recent.has(clauseText(c)));
    if (fresh.length) cands = fresh;
  }
  const chosen = cands[Math.floor(rng() * cands.length)];
  if (recent) recent.add(clauseText(chosen));
  return chosen;
}

// ── per-life derived context + token map ────────────────────────────────────
function diedContext(life) {
  const oi = CLASS_ORDER.indexOf(life.classOriginShort);
  const fi = CLASS_ORDER.indexOf(life.classFinalShort);
  const climb = oi >= 0 && fi >= 0 ? fi - oi : 0;
  const delta = life.mobilityDelta ?? 0;
  return {
    climb,
    dir: delta > 5 ? 'up' : delta < -5 ? 'down' : 'flat',
    originLow: originKey(life.classOriginShort) === 'lower' || originKey(life.classOriginShort) === 'working',
  };
}

function tokensFor(life, ctx) {
  const p = PRONOUN[life.sex] || PRONOUN.Male;
  return {
    flag: life.flag, country: life.country, age: life.age,
    cause: life.fatalCause, Cause: cap(life.fatalCause || ''),
    they: p.they, them: p.them, their: p.their,
    classesUp: CLASSES_UP[clamp(ctx.climb || 1, 1, 5)],
    originClass: ORIGIN_NOUN[originKey(life.classOriginShort)] || 'life they came from',
  };
}

// stable signature → seeds the private copy RNG (independent of the model stream)
function copySig(life) {
  const ev = (life.events || []).map((e) => e.text).join(',');
  return `${life.code}|${life.name}|${life.age}|${(life.childRank ?? 0).toFixed(4)}|${(life.eventSwing ?? 0).toFixed(3)}|${life.fatalCause || ''}|${ev}`;
}

// ── the three beats ─────────────────────────────────────────────────────────
function bornBeat(banks, life, rng, recent) {
  const bank = banks.origin[originKey(life.classOriginShort)] || banks.origin.middle;
  const choice = chooseClause(bank, {}, rng, recent);
  const tokens = tokensFor(life, {});
  const phrase = fill(clauseText(choice), tokens);
  const frames = (typeof choice === 'object' && choice.self) ? banks.bornFrames.self : banks.bornFrames.default;
  return fill(clauseText(chooseClause(frames, {}, rng, recent)), { ...tokens, phrase });
}

// DIED builders, dispatched by ending mode — one entry per mode, no if-chain.
// Each returns { ending, legacy }: `ending` is the full sentence (age included,
// used in text contexts); `legacy` is the AGE-FREE closing clause for the v2 card
// finale (which shows age as its own hero number, so the line must not repeat it).
const DIED = {
  natural(banks, life, rng, ctx, recent) {
    const band = life.verdict?.band || 'mid';
    const mood = life.verdict?.mood || 'neutral';
    const opener = clauseText(chooseClause(banks.diedOpeners[mood] || banks.diedOpeners.neutral, ctx, rng, recent));
    const tail = fill(clauseText(chooseClause(banks.diedTails[band] || banks.diedTails.mid, ctx, rng, recent)), tokensFor(life, ctx));
    return { ending: `${opener} ${life.age} — ${tail}.`, legacy: cap(tail) + '.' };
  },
  fatal(banks, life, rng, ctx, recent) {
    const tok = tokensFor(life, ctx);
    return {
      ending: fill(clauseText(chooseClause(banks.fatal, ctx, rng, recent)), tok),
      legacy: fill(clauseText(chooseClause(banks.fatalLegacy, ctx, rng, recent)), tok),
    };
  },
  cutShort(banks, life, rng, ctx, recent) {
    const tok = tokensFor(life, ctx);
    const bank = life.age <= 1 ? banks.cutShort.infant : banks.cutShort.child;
    return {
      ending: fill(clauseText(chooseClause(bank, ctx, rng, recent)), tok),
      legacy: fill(clauseText(chooseClause(banks.cutShortLegacy, ctx, rng, recent)), tok),
    };
  },
};

// how a life ended → which DIED builder. Fatal (an event killed them) folds the
// cause in; cutShort (died young, natural) gets the "barely begun" line; natural
// (the majority) gets the tier-scaled payoff with no cause.
const endingMode = (life) => (life.fatalCause ? 'fatal' : life.diedYoung ? 'cutShort' : 'natural');

// Build the BORN · DIED beats. ending omits the 💀 (the UI prepends it when
// life.fatalCause is set). opts.recent (a Set of clause texts) enables display
// de-dup; omit it for the canonical, reproducible pick.
export function buildBeats(banks, life, opts = {}) {
  const rng = opts.rng || makeRng(hashSeed(copySig(life)));
  const recent = opts.recent;
  const ctx = diedContext(life);
  const died = DIED[endingMode(life)](banks, life, rng, ctx, recent);
  return {
    opening: bornBeat(banks, life, rng, recent),
    ending: died.ending,
    legacy: died.legacy,
  };
}
