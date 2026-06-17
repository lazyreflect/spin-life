// UI-side presentation helpers. Tier name/color/percentile come from the MODEL
// (life.verdict, life.luckPct) — this file never re-derives the cutoffs; it only
// maps model facts to icons, chip colors, and the reveal animation timings ported
// from the prototype (Spin Life - Directions.dc.html).
import { TIERS } from '../model/score.js';

// reveal stagger: BORN at base, each event at +step, then DIED, luck, stats.
export const ANIM = { base: 0.12, step: 0.22 };
export const COUNTUP_MS = 750;

// beat delays (seconds) for a card with `evN` event rows
export const beatDelays = (evN: number) => ({
  born: ANIM.base,
  event: (i: number) => ANIM.base + ANIM.step * (i + 1),
  died: ANIM.base + ANIM.step * (evN + 1),
  luck: ANIM.base + ANIM.step * (evN + 2),
  stats: ANIM.base + ANIM.step * (evN + 3),
});

// START reel icon by class band (short labels emitted by the model)
const CLASS_ICON: Record<string, string> = {
  lower: '🏚️', working: '🔧', middle: '🏠', 'upper-mid': '🏢', upper: '🏢', elite: '👑',
};
export const classIcon = (shortClass: string) => CLASS_ICON[shortClass] || '🏠';

// event pill: label + background by kind. fatal is folded into DIED (never a pill).
export function eventPill(kind: string): { fx: string; bg: string } {
  if (kind === 'good') return { fx: 'GOOD LUCK', bg: '#0b7a3a' };
  if (kind === 'neutral') return { fx: 'FATE', bg: '#8a8178' };
  return { fx: 'BAD LUCK', bg: '#c2410c' };
}

// stat chip: gold for a top-10% tail, green for top-half, washed red otherwise.
// `top` = % of the world at or above you (low = rare/lucky).
export function statChipBg(top?: number): string {
  if (top == null) return '#fff5e0';
  return top <= 10 ? '#ffd23c' : top <= 50 ? '#bdf0c4' : '#ffe0d6';
}
export function statTag(top?: number): string {
  if (top == null) return '';
  const v = top < 1 ? top.toFixed(1) : Math.round(top).toString();
  return top <= 50 ? `top ${v}%` : `bot ${Math.round(100 - top)}%`;
}

// the 7-chip tier track for My Lives (FAIL → MYTHIC), in display order
export const TIER_TRACK = TIERS.map((t) => ({ key: t.key, short: t.short, color: t.color }));

// short tier label (no 💀) + color from a percentile — for mini-cards / album
export function tierBadge(pct: number): { short: string; color: string } {
  for (const t of TIERS) if (pct < t.max) return { short: t.short, color: t.color };
  const last = TIERS[TIERS.length - 1];
  return { short: last.short, color: last.color };
}
