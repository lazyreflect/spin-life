// UI-side presentation helpers for the reel-reveal redesign. Tier name/color/
// percentile come from the MODEL (life.verdict, life.luckPct); this file maps
// model facts to ramp colors, reel mechanics, and the reveal timeline ported from
// the prototype (Spin Life - Reel Reveal.dc.html).
import { TIERS } from '../model/score.js';
import { heightImperial } from '../model/content.js';

// ── reel mechanics ──────────────────────────────────────────────────────────
export const REEL_H = 34;                 // px per reel row (v2: tightened for no-scroll fit)
export const COUNTRY_LOCK_MS = 1100;      // Act 1: country reel locks
export const CARD_MOUNT_MS = 1520;        // Act 1 → Act 2 (card mounts)
export const REELDUR = { height: 1.6, looks: 2.0, iq: 2.5, career: 1.75 }; // seconds
export const REEL_EASE = 'cubic-bezier(.16,1,.3,1)'; // easeOutExpo: long slow tail
export const LOOKS_RANGE: [number, number] = [1.5, 9];

// decorative careers the OUTCOME reel scrolls through before landing on the real one
export const CAREERS = ['🩺 Doctor', '🎤 Musician', '🏦 Executive', '🚚 Driver', '🌾 Farmer', '⚖️ Lawyer', '🔧 Mechanic', '🎨 Artist', '💻 Developer', '🍳 Chef', '🔬 Scientist', '✈️ Pilot', '👷 Laborer', '🎬 Director'];

// build a reel strip: the range sampled `n` times, looped `loops`×, real value last
export function reelStrip(lo: number, hi: number, fmt: (v: number) => string, finalValue: string, n = 16, loops = 6): string[] {
  const loop: string[] = [];
  for (let i = 0; i < n; i++) loop.push(fmt(lo + (hi - lo) * (i / (n - 1))));
  let items: string[] = [];
  for (let i = 0; i < loops; i++) items = items.concat(loop);
  items.push(finalValue);
  return items;
}
export const fmtImperial = (cm: number) => heightImperial(cm);

// ── Act-2 reveal timeline (ms from card mount) ──────────────────────────────
// Returns the schedule for a life; consumed by useReveal. diedYoung skips the
// reels/career/money and goes story → died → verdict.
export function revealTimeline(alive: boolean, evN: number) {
  const lockHeight = 1660, lockLooks = 2080, lockIq = 2560, showCareer = 2740, careerGo = 2800, lockCareer = 4570;
  const evStart = alive ? 4760 : 360;
  const diedAt = evStart + (evN > 0 ? evN * 240 + 220 : 180);
  const moneyAt = diedAt + 560;
  return { reelGo: 40, lockHeight, lockLooks, lockIq, showCareer, careerGo, lockCareer, evStart, diedAt, moneyAt };
}
export const EVENT_STAGGER_MS = 240;
export const MONEY_BASE_MS = 720;   // count 0 → base
export const MONEY_PAUSE_MS = 300;  // beat before the swing
export const MONEY_SWING_MS = 780;  // base → final
export const LUCK_COUNTUP_MS = 600;

// ── stat color ramp (worst → red, best → premium gold) ──────────────────────
// `top` = global TOP% (smaller = rarer/better). Floods the chip bg on lock.
export function statRamp(top?: number): { bg: string; fg: string } {
  if (top == null) return { bg: '#fff5e0', fg: '#16130f' };
  if (top <= 8) return { bg: 'linear-gradient(135deg,#fbe79a 0%,#e3b02a 48%,#b9851f 100%)', fg: '#4a3000' };
  if (top <= 28) return { bg: '#bfe9c8', fg: '#0b6a33' };
  if (top <= 55) return { bg: '#efe7d6', fg: '#6a6258' };
  if (top <= 80) return { bg: '#ffd2b6', fg: '#b23c08' };
  return { bg: '#ffc2b8', fg: '#cf2e1a' };
}
export function statTag(top?: number): string {
  if (top == null) return '';
  const v = top < 1 ? top.toFixed(1) : Math.round(top).toString();
  return top <= 50 ? `top ${v}%` : `bot ${Math.round(100 - top)}%`;
}

// education eyebrow above the career ("Postgrad" → "Postgrad-educated")
const EDU_PHRASE: Record<string, string> = {
  postgrad: 'Postgrad-educated', bachelor: 'University-educated', vocational: 'Vocationally trained',
  secondary: 'Secondary-schooled', primary: 'Primary-schooled', none: 'Never schooled',
};
export const eduPhrase = (e?: string) => (e ? EDU_PHRASE[e] || e : '');

// ── event pill ──────────────────────────────────────────────────────────────
export function eventPill(kind: string): { fx: string; bg: string } {
  if (kind === 'good') return { fx: 'GOOD LUCK', bg: '#0b7a3a' };
  if (kind === 'neutral') return { fx: 'FATE', bg: '#8a8178' };
  return { fx: 'BAD LUCK', bg: '#c2410c' };
}

// ── money formatting (matches model's money() thresholds) ───────────────────
export function fmtMoney(n: number): string {
  n = Math.max(0, n);
  if (n >= 1e9) return '$' + +(n / 1e9).toFixed(1) + 'B';
  if (n >= 1e6) return '$' + +(n / 1e6).toFixed(1) + 'M';
  if (n >= 1e3) return '$' + +(n / 1e3).toFixed(0) + 'k';
  return '$' + Math.round(n);
}

// ── My Lives helpers ────────────────────────────────────────────────────────
export const TIER_TRACK = TIERS.map((t) => ({ key: t.key, short: t.short, color: t.color }));
export function tierBadge(pct: number): { short: string; color: string } {
  for (const t of TIERS) if (pct < t.max) return { short: t.short, color: t.color };
  const last = TIERS[TIERS.length - 1];
  return { short: last.short, color: last.color };
}
