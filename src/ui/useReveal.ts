// The Act-2 reveal state machine for one rolled life. Drives the staged reveal
// (stat reels lock → career resolves → events → died → net worth counts to base
// then swings → verdict ignites + luck counts up), timed per verdict.ts's
// revealTimeline. `skip()` fast-forwards everything to the final frame (tap-to-
// skip). All timers/animation frames are cleaned up on unmount or life change.
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  revealTimeline, MONEY_BASE_MS, MONEY_PAUSE_MS, MONEY_SWING_MS, LUCK_COUNTUP_MS,
} from './verdict';

export type RevealState = {
  reelGo: boolean;
  lockHeight: boolean; lockLooks: boolean; lockIq: boolean;
  careerGo: boolean; lockCareer: boolean; showCareer: boolean;
  showEvents: boolean; showDied: boolean; showMoney: boolean;
  moneyPhase: 'base' | 'swing' | 'done';
  cuWorth: number; luckShown: number; verdict: boolean;
};

const INITIAL: RevealState = {
  reelGo: false, lockHeight: false, lockLooks: false, lockIq: false,
  careerGo: false, lockCareer: false, showCareer: false,
  showEvents: false, showDied: false, showMoney: false,
  moneyPhase: 'base', cuWorth: 0, luckShown: 0, verdict: false,
};
const easeOut = (p: number) => 1 - Math.pow(1 - p, 2);

export function useReveal(life: any) {
  const [s, setS] = useState<RevealState>(INITIAL);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const raf = useRef(0);

  useEffect(() => {
    const alive = !life.diedYoung;
    const evN = (life.events || []).length;
    const tl = revealTimeline(alive, evN);
    const patch = (p: Partial<RevealState>) => setS((prev) => ({ ...prev, ...p }));
    const at = (ms: number, fn: () => void) => { timers.current.push(setTimeout(fn, ms)); };
    const animate = (from: number, to: number, dur: number, key: 'cuWorth' | 'luckShown', done?: () => void) => {
      cancelAnimationFrame(raf.current);
      const t0 = performance.now();
      const step = (now: number) => {
        const p = Math.min(1, (now - t0) / dur);
        patch({ [key]: from + (to - from) * easeOut(p) } as Partial<RevealState>);
        if (p < 1) raf.current = requestAnimationFrame(step);
        else done?.();
      };
      raf.current = requestAnimationFrame(step);
    };
    const revealVerdict = () => { patch({ verdict: true }); animate(0, Math.round(life.luckPct), LUCK_COUNTUP_MS, 'luckShown', () => patch({ moneyPhase: 'done' })); };
    const startMoney = () => {
      const base = life.netWorthBase, finalW = life.netWorth;
      patch({ moneyPhase: 'base' });
      animate(0, base, MONEY_BASE_MS, 'cuWorth', () => {
        if (Math.abs(finalW - base) <= 1) { revealVerdict(); return; }
        at(MONEY_PAUSE_MS, () => { patch({ moneyPhase: 'swing' }); animate(base, finalW, MONEY_SWING_MS, 'cuWorth', revealVerdict); });
      });
    };

    setS(INITIAL);
    if (alive) {
      at(tl.reelGo, () => patch({ reelGo: true }));
      at(tl.lockHeight, () => patch({ lockHeight: true }));
      at(tl.lockLooks, () => patch({ lockLooks: true }));
      at(tl.lockIq, () => patch({ lockIq: true }));
      at(tl.showCareer, () => patch({ showCareer: true }));
      at(tl.careerGo, () => patch({ careerGo: true }));
      at(tl.lockCareer, () => patch({ lockCareer: true }));
    }
    at(tl.evStart, () => patch({ showEvents: true }));
    at(tl.diedAt, () => patch({ showDied: true }));
    at(tl.moneyAt, () => { patch({ showMoney: true }); alive ? startMoney() : revealVerdict(); });

    return () => { timers.current.forEach(clearTimeout); timers.current = []; cancelAnimationFrame(raf.current); };
  }, [life]);

  const skip = useCallback(() => {
    timers.current.forEach(clearTimeout); timers.current = []; cancelAnimationFrame(raf.current);
    setS({
      reelGo: true, lockHeight: true, lockLooks: true, lockIq: true,
      careerGo: true, lockCareer: true, showCareer: !life.diedYoung,
      showEvents: true, showDied: true, showMoney: true, moneyPhase: 'done',
      cuWorth: life.netWorth, luckShown: Math.round(life.luckPct), verdict: true,
    });
  }, [life]);

  return { ...s, luckShown: Math.round(s.luckShown), skip };
}
