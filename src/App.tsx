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
// Identity (lineage Phase 0): every kept card carries a stable collectible `id`
// (+ generation / parentIds for the family tree). `lifeKey` is the pre-id content
// signature, kept only to (a) derive a deterministic id when migrating legacy
// saves and (b) dedupe a life that somehow lacks an id.
const lifeKey = (L: any) => `${L.code}|${L.name}|${L.age}|${L.netWorth}|${Math.round(L.luckPct)}`;
const idOf = (L: any) => L.id ?? lifeKey(L);
// stamp founder identity on saves made before the id layer existed
function migrate(lives: any[]): any[] {
  if (lives.every((L) => L.id)) return lives;
  return lives.map((L) =>
    L.id ? L : { ...L, id: lifeKey(L), generation: L.generation ?? 0, parentIds: L.parentIds ?? null }
  );
}

export default function App() {
  const [tab, setTab] = useState<Tab>('spin');
  const [pulls, setPulls] = useState<number>(() => load(PULLS_KEY, START_PULLS));
  const [lives, setLives] = useState<any[]>(() => migrate(load(LIVES_KEY, [])));
  const [hasNew, setHasNew] = useState(false);

  useEffect(() => { localStorage.setItem(PULLS_KEY, JSON.stringify(pulls)); }, [pulls]);
  useEffect(() => { localStorage.setItem(LIVES_KEY, JSON.stringify(lives)); }, [lives]);

  const isKept = (L: any) => lives.some((x) => idOf(x) === idOf(L));
  const keep = (L: any) => {
    if (isKept(L)) return;
    const card = {
      ...L,
      id: L.id ?? crypto.randomUUID(),
      generation: L.generation ?? 0,
      parentIds: L.parentIds ?? null,
      ts: Date.now(),
    };
    setLives((prev) => [card, ...prev].slice(0, MAX_KEPT));
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
