import { useEffect, useState } from 'react';
import { SpinScreen } from './ui/SpinScreen';
import { MyLives } from './ui/MyLives';

type Tab = 'spin' | 'lives';
const PULLS_KEY = 'syl.pulls';
const LIVES_KEY = 'syl.lives';
const START_PULLS = 100;
// Soft cap on the kept collection. Eviction is lineage-aware (see capLives): it
// drops only the oldest EVICTABLE cards — never a founder, never an ancestor of
// another kept card — so a growing family tree never silently loses the cards
// that anchor it. When a collection genuinely outgrows localStorage, the durable
// IndexedDB store is the planned next step.
const MAX_KEPT = 1000;

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
// Lineage-aware cap: when the collection exceeds MAX_KEPT, evict the oldest cards
// that are safe to lose — NOT founders (generation 0) and NOT ancestors (their id
// is referenced by another kept card's parentIds, so dropping them would orphan a
// tree). If everything is protected, the collection is kept whole rather than
// silently truncated. `lives` is newest-first, so we evict from the tail inward.
function capLives(lives: any[]): any[] {
  if (lives.length <= MAX_KEPT) return lives;
  const ancestorIds = new Set<string>();
  for (const L of lives) for (const pid of L.parentIds || []) ancestorIds.add(pid);
  const isProtected = (L: any) => L.generation === 0 || ancestorIds.has(L.id);
  const out = lives.slice();
  for (let i = out.length - 1; i >= 0 && out.length > MAX_KEPT; i--) {
    if (!isProtected(out[i])) out.splice(i, 1);
  }
  return out;
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
    setLives((prev) => capLives([card, ...prev]));
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
