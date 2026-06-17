import { TIER_TRACK, tierBadge } from './verdict';

// My Lives — the collection album. A 7-chip tier-completion track (FAIL → MYTHIC,
// lit when you own one) over a 2-col grid of kept mini-cards.
export function MyLives({ lives }: { lives: any[] }) {
  const ownedTiers = new Set(lives.map((L) => tierBadge(L.luckPct).short));
  const best = lives.reduce((m, L) => Math.max(m, L.luckPct), -1);
  const bestBadge = best >= 0 ? tierBadge(best) : null;
  const sorted = [...lives].sort((a, b) => b.luckPct - a.luckPct);

  return (
    <div className="lives-screen">
      <div className="lives-title">My Lives</div>
      <div className="lives-sub">
        {lives.length} collected
        {bestBadge && <> · best: <b style={{ color: bestBadge.color }}>{bestBadge.short}</b></>}
      </div>

      <div className="tier-track">
        {TIER_TRACK.map((t) => {
          const owned = ownedTiers.has(t.short);
          return (
            <div className="tier-chip" key={t.key}>
              <div className="tier-dot" style={{ background: owned ? t.color : '#e3dac7' }} />
              <div className="tier-chip-label" style={{ color: owned ? '#16130f' : '#bcae97' }}>{t.short}</div>
            </div>
          );
        })}
      </div>

      <div className="album">
        {sorted.map((L, i) => {
          const badge = tierBadge(L.luckPct);
          const role = L.diedYoung ? `died at ${L.age}` : `${L.career.emoji} ${L.career.title}`;
          return (
            <div className="mini-card" key={i} style={{ borderColor: badge.color }}>
              <div className="mini-head" style={{ background: badge.color }}>
                <span className="mini-tier">{badge.short}</span>
                <span className="mini-flag">{L.flag}</span>
              </div>
              <div className="mini-body">
                <div className="mini-name">{L.name}</div>
                <div className="mini-role">{role}</div>
                <div className="mini-luck">
                  <span style={{ color: badge.color }}>{Math.round(L.luckPct)}<span className="mini-luck-sign">%</span></span>
                  <span className="mini-luck-label">luck</span>
                </div>
              </div>
            </div>
          );
        })}
        <div className="mini-empty">
          <span className="mini-empty-plus">＋</span>
          <span>PULL TO FILL</span>
        </div>
      </div>
    </div>
  );
}
