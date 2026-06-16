import { useEffect, useMemo, useRef, useState } from 'react';
import { Wheel, type Seg } from './Wheel';
import { Card } from './Card';
import { roller, CONTINENTS, countriesIn } from '../data';

type Phase = 'idle' | 'continent' | 'country' | 'reveal';

export function SpinScreen({
  spins, onSpend, onLife,
}: { spins: number; onSpend: () => void; onLife: (life: any) => void }) {
  const [phase, setPhase] = useState<Phase>('idle');
  const [life, setLife] = useState<any>(null);
  const [spinKey, setSpinKey] = useState(0);
  const [segments, setSegments] = useState<Seg[]>(() => CONTINENTS.map((c) => ({ label: c.name, frac: c.frac, color: c.color })));
  const [target, setTarget] = useState<number | null>(null);
  const [center, setCenter] = useState('SPIN\nYOUR\nLIFE');
  const pending = useRef<any>(null);
  const cardRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (phase === 'reveal') {
      const t = setTimeout(() => cardRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 120);
      return () => clearTimeout(t);
    }
  }, [phase, life]);

  const continentSegs = useMemo(() => CONTINENTS.map((c) => ({ label: c.name, frac: c.frac, color: c.color })), []);

  function spin() {
    if (phase === 'continent' || phase === 'country') return;
    if (spins <= 0) return;
    onSpend();
    const L = roller.rollLife();
    pending.current = L;
    setLife(null);
    // continent phase
    const ci = CONTINENTS.findIndex((c) => c.name === L.continent);
    setSegments(continentSegs);
    setTarget(ci);
    setCenter('CONTINENT');
    setPhase('continent');
    setSpinKey((k) => k + 1);
  }

  function onSettled() {
    const L = pending.current;
    if (!L) return;
    if (phase === 'continent') {
      const list = countriesIn(L.continent);
      const idx = list.findIndex((c) => c.code === L.code);
      setSegments(list.map((c) => ({ label: c.name, frac: c.frac, color: c.color, flag: c.flag })));
      setTarget(idx);
      setCenter('COUNTRY');
      setPhase('country');
      setSpinKey((k) => k + 1);
    } else if (phase === 'country') {
      setLife(L);
      setCenter(`${L.flag}\n${L.country}`);
      setPhase('reveal');
      onLife(L);
    }
  }

  const spinning = phase === 'continent' || phase === 'country';

  return (
    <div className="screen spin-screen">
      <div className="spins-pill">{spins} spins</div>
      <Wheel
        segments={segments}
        targetIndex={target}
        spinKey={spinKey}
        durationMs={phase === 'continent' ? 2200 : 2600}
        onSettled={onSettled}
        centerLabel={center}
      />
      <button className="spin-btn" onClick={spin} disabled={spinning || spins <= 0}>
        {spinning ? 'Spinning…' : phase === 'reveal' ? 'Again?' : spins <= 0 ? 'Out of spins' : 'Spin'}
      </button>
      {phase === 'reveal' && life && <div ref={cardRef} style={{ width: '100%' }}><Card life={life} /></div>}
      {phase === 'idle' && <p className="hint">Spin to be born into a random life.</p>}
    </div>
  );
}
