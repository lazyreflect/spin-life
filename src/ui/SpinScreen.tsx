import { useEffect, useRef, useState } from 'react';
import { Wheel, type Seg } from './Wheel';
import { Card } from './Card';
import { roller, CONTINENTS } from '../data';
import { desirabilityColor } from './desirability';
import { REVEAL_ORDER, buildStage, type StageView } from './revealStages';

type Phase = 'idle' | 'spinning' | 'landed' | 'reveal';

// pause showing the landed value before the next wheel starts
const HOLD_MS = 600;

// populated wheel shown before the first spin
const IDLE_SEGS: Seg[] = CONTINENTS.map((c) => ({ label: c.name, frac: c.frac, color: desirabilityColor(c.desir) }));

export function SpinScreen({
  spins, onSpend, onLife,
}: { spins: number; onSpend: () => void; onLife: (life: any) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [life, setLife] = useState<any>(null);
  const [stageIdx, setStageIdx] = useState(0);
  const [view, setView] = useState<StageView | null>(null);
  const [center, setCenter] = useState('SPIN\nYOUR\nLIFE');
  const [spinKey, setSpinKey] = useState(0);
  const pending = useRef<any>(null);
  const holdTimer = useRef<ReturnType<typeof setTimeout>>();
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => () => clearTimeout(holdTimer.current), []);

  useEffect(() => {
    if (phase === 'reveal') {
      const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      return () => clearTimeout(t);
    }
  }, [phase]);

  function startStage(idx: number, L: any) {
    const v = buildStage(REVEAL_ORDER[idx], L);
    setStageIdx(idx);
    setView(v);
    setCenter(v.title);
    setPhase('spinning');
    setSpinKey((k) => k + 1);
  }

  function spin() {
    if (phase === 'spinning' || phase === 'landed') return;
    if (spins <= 0) return;
    onSpend();
    const L = roller.rollLife();
    pending.current = L;
    setLife(null);
    startStage(0, L);
  }

  // wheel finished its transition
  function onSettled() {
    const L = pending.current;
    if (!L || !view) return;
    // show the value that was landed on, then advance
    setCenter(view.result);
    setPhase('landed');
    holdTimer.current = setTimeout(() => {
      if (stageIdx + 1 < REVEAL_ORDER.length) {
        startStage(stageIdx + 1, L);
      } else {
        setLife(L);
        setPhase('reveal');
        onLife(L);
      }
    }, HOLD_MS);
  }

  const busy = phase === 'spinning' || phase === 'landed';
  const segments: Seg[] = view ? view.segments : IDLE_SEGS;

  return (
    <div className="screen spin-screen">
      <div className="spins-pill">{spins} spins</div>
      <Wheel
        segments={segments}
        targetIndex={view ? view.targetIndex : null}
        spinKey={spinKey}
        durationMs={view ? view.durationMs : 2000}
        onSettled={onSettled}
        centerLabel={center}
      />
      <div className="stage-progress">
        {(busy || phase === 'reveal') && REVEAL_ORDER.map((_, i) => (
          <span key={i} className={'dot' + (i < stageIdx || phase === 'reveal' ? ' done' : i === stageIdx ? ' active' : '')} />
        ))}
      </div>
      <button className="spin-btn" onClick={spin} disabled={busy || spins <= 0}>
        {busy ? 'Spinning…' : phase === 'reveal' ? 'Again?' : spins <= 0 ? 'Out of spins' : 'Spin'}
      </button>
      {phase === 'reveal' && life && <div ref={cardRef} style={{ width: '100%' }}><Card life={life} /></div>}
      {phase === 'idle' && <p className="hint">Spin to be born into a random life.</p>}
    </div>
  );
}
