import { useEffect, useRef, useState } from 'react';
import { Card } from './Card';
import { roller } from '../data';
import { COUNTRY_LOCK_MS, CARD_MOUNT_MS } from './verdict';

type Phase = 'idle' | 'spinning' | 'reveal';

// the COUNTRY reel scrolls through flags (decorative) before landing on the roll
const STRIP_WHERE = ['🇰🇷', '🇳🇪', '🇨🇭', '🇧🇷', '🇳🇬', '🇮🇳', '🇺🇸', '🇯🇵', '🇪🇬', '🇲🇽'];

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
  const [countryLocked, setCountryLocked] = useState(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  function pull() {
    if (phase === 'spinning') return;
    if (pulls <= 0) { onRefill(); return; }
    onSpend();
    const L = roller.rollLife();
    // collectible identity (lineage Phase 0): a spun card is a founder — its own
    // line, no parents. Beats are already baked from content inside rollLife, so
    // stamping the id here never changes the displayed copy.
    L.id = crypto.randomUUID();
    L.generation = 0;
    L.parentIds = null;
    setLife(L); setCountryLocked(false); setPhase('spinning');
    clear();
    timers.current.push(setTimeout(() => setCountryLocked(true), COUNTRY_LOCK_MS));
    timers.current.push(setTimeout(() => setPhase('reveal'), CARD_MOUNT_MS));
  }

  const reveal = phase === 'reveal';
  const spinning = phase === 'spinning';
  const looping = spinning && !countryLocked;
  const kept = reveal && life ? isKept(life) : false;

  return (
    <div className="spin-screen">
      {!reveal && <div className="spin-banner">★ SPIN YOUR LIFE ★</div>}

      {!reveal ? (
        <>
          <div className="spin-stage">
            <div className="country-housing">
              <div className={'country-window' + (phase !== 'idle' && !looping ? ' locked' : '')}>
                {phase === 'idle' ? (
                  <div className="country-rest">🌍</div>
                ) : looping ? (
                  <div className="country-strip">
                    {[...STRIP_WHERE, ...STRIP_WHERE].map((f, i) => <div className="country-cell" key={i}>{f}</div>)}
                  </div>
                ) : (
                  <div className="country-rest lockpop">{life.flag}</div>
                )}
              </div>
              <span className="country-label">WHERE</span>
            </div>
            <div className="pulls-pill">{pulls > 0 ? `${pulls} pulls left` : 'out of pulls'}</div>
          </div>
          <button className="btn btn-pull" onClick={pull} disabled={spinning}>
            {spinning ? '· · ·' : pulls <= 0 ? 'REFILL +100' : 'PULL!'}
          </button>
        </>
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
    </div>
  );
}
