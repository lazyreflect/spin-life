import { useEffect, useRef, useState } from 'react';
import { Reels } from './Reels';
import { Card } from './Card';
import { classIcon } from './verdict';
import { roller } from '../data';

type Phase = 'idle' | 'spinning' | 'reveal';

// reel lock + reveal timings (ms) from the prototype
const LOCKS = [720, 1080, 1440];
const REVEAL_AT = 1780;

export function SpinScreen({
  pulls, onSpend, onRefill, onKeep, isKept,
}: {
  pulls: number;
  onSpend: () => void;
  onRefill: () => void;
  onKeep: (life: any) => void;
  isKept: (life: any) => boolean;
}) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [life, setLife] = useState<any>(null);
  const [stopped, setStopped] = useState(0);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  function pull() {
    if (phase === 'spinning') return;
    if (pulls <= 0) { onRefill(); return; }
    onSpend();
    const L = roller.rollLife();
    setLife(L); setStopped(0); setPhase('spinning');
    clear();
    LOCKS.forEach((ms, i) => timers.current.push(setTimeout(() => setStopped(i + 1), ms)));
    timers.current.push(setTimeout(() => setPhase('reveal'), REVEAL_AT));
  }

  const reveal = phase === 'reveal';
  const spinning = phase === 'spinning';
  const landed: [string, string, string] = life
    ? [life.flag, classIcon(life.classOriginShort), life.diedYoung ? '🕯️' : (life.career?.emoji || '🎲')]
    : ['🌍', '🏠', '💼'];
  const kept = reveal && life ? isKept(life) : false;

  return (
    <div className="spin-screen">
      <div className="spin-banner">★ SPIN YOUR LIFE ★</div>

      {!reveal ? (
        <div className="spin-stage">
          <Reels phase={phase} stopped={stopped} landed={landed} />
          <div className="pulls-pill">{pulls > 0 ? `${pulls} pulls left` : 'out of pulls'}</div>
        </div>
      ) : (
        <div className="reveal-stage" key={life?.name + life?.age + life?.netWorth}>
          <Card life={life} />
          <div className="reveal-actions">
            <button className="btn btn-keep" onClick={() => !kept && onKeep(life)} disabled={kept}>
              {kept ? '✓ IN MY LIVES' : '＋ KEEP IT'}
            </button>
            <button className="btn btn-pull-again" onClick={pull}>PULL AGAIN ↻</button>
          </div>
        </div>
      )}

      {!reveal && (
        <button className="btn btn-pull" onClick={pull} disabled={spinning}>
          {spinning ? '· · ·' : pulls <= 0 ? 'REFILL +100' : 'PULL!'}
        </button>
      )}
    </div>
  );
}
