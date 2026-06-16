import { useEffect, useState } from 'react';
import { SpinScreen } from './ui/SpinScreen';
import { Lives } from './ui/Lives';

type Tab = 'spin' | 'lives';
const SPINS_KEY = 'syl.spins';
const LIVES_KEY = 'syl.lives';
const START_SPINS = 100;

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}

export default function App() {
  const [tab, setTab] = useState<Tab>('spin');
  const [spins, setSpins] = useState<number>(() => load(SPINS_KEY, START_SPINS));
  const [lives, setLives] = useState<any[]>(() => load(LIVES_KEY, []));

  useEffect(() => { localStorage.setItem(SPINS_KEY, JSON.stringify(spins)); }, [spins]);
  useEffect(() => { localStorage.setItem(LIVES_KEY, JSON.stringify(lives.slice(0, 200))); }, [lives]);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">SPIN<span>YOUR</span>LIFE</div>
        {spins <= 0 && (
          <button className="refill" onClick={() => setSpins(START_SPINS)}>+100 spins</button>
        )}
      </header>

      <main className="content">
        {tab === 'spin' && (
          <SpinScreen
            spins={spins}
            onSpend={() => setSpins((s) => Math.max(0, s - 1))}
            onLife={(L) => setLives((prev) => [{ ...L, ts: Date.now() }, ...prev])}
          />
        )}
        {tab === 'lives' && <Lives lives={lives} />}
      </main>

      <nav className="bottom-nav">
        <button className={tab === 'spin' ? 'active' : ''} onClick={() => setTab('spin')}>🎡<span>Spin</span></button>
        <button className={tab === 'lives' ? 'active' : ''} onClick={() => setTab('lives')}>📜<span>Lives</span></button>
      </nav>
    </div>
  );
}
