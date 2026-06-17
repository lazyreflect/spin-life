import { useEffect, useState } from 'react';
import { SpinScreen } from './ui/SpinScreen';
import { MyLives } from './ui/MyLives';

type Tab = 'spin' | 'lives';
const PULLS_KEY = 'syl.pulls';
const LIVES_KEY = 'syl.lives';
const START_PULLS = 100;
const MAX_KEPT = 200;

function load<T>(key: string, fallback: T): T {
  try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); } catch { return fallback; }
}
// lives are unique (procedural) — a stable signature dedupes Keep / drives isKept
const lifeKey = (L: any) => `${L.code}|${L.name}|${L.age}|${L.netWorth}|${Math.round(L.luckPct)}`;

export default function App() {
  const [tab, setTab] = useState<Tab>('spin');
  const [pulls, setPulls] = useState<number>(() => load(PULLS_KEY, START_PULLS));
  const [lives, setLives] = useState<any[]>(() => load(LIVES_KEY, []));
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => { localStorage.setItem(PULLS_KEY, JSON.stringify(pulls)); }, [pulls]);
  useEffect(() => { localStorage.setItem(LIVES_KEY, JSON.stringify(lives)); }, [lives]);

  const isKept = (L: any) => lives.some((x) => lifeKey(x) === lifeKey(L));
  const keep = (L: any) => {
    if (isKept(L)) return;
    setLives((prev) => [{ ...L, ts: Date.now() }, ...prev].slice(0, MAX_KEPT));
    setHasNew(true);
  };
  const goTab = (t: Tab) => { setTab(t); if (t === 'lives') setHasNew(false); };

  return (
    <div className="app">
      <div className="screen">
        {tab === 'spin' && (
          <SpinScreen
            pulls={pulls}
            onSpend={() => setPulls((p) => Math.max(0, p - 1))}
            onRefill={() => setPulls(START_PULLS)}
            onKeep={keep}
            isKept={isKept}
          />
        )}
        {tab === 'lives' && <MyLives lives={lives} />}
      </div>

      <nav className="bottom-nav">
        <button className={tab === 'spin' ? 'active' : ''} onClick={() => goTab('spin')}>
          <span className="nav-icon">🎰</span><span className="nav-label">SPIN</span>
        </button>
        <button className={tab === 'lives' ? 'active' : ''} onClick={() => goTab('lives')}>
          <span className="nav-icon">🎟️</span><span className="nav-label">MY LIVES</span>
          {hasNew && <span className="nav-badge" />}
        </button>
      </nav>
    </div>
  );
}
