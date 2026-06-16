type Life = any;

export function Lives({ lives }: { lives: Life[] }) {
  const sorted = [...lives].sort((a, b) => b.rarity - a.rarity);
  return (
    <div className="screen lives-screen">
      <h2 className="screen-title">Your lives <span className="muted">· {lives.length}</span></h2>
      {lives.length === 0 && <p className="hint">No lives yet. Go spin one.</p>}
      <div className="lives-list">
        {sorted.map((L, i) => (
          <div className="life-row" key={i}>
            <div className="life-row-main">
              <span className="life-flag">{L.flag}</span>
              <div>
                <div className="life-name">{L.name}</div>
                <div className="muted small">{L.career.emoji} {L.career.title} · {L.country}</div>
              </div>
            </div>
            <div className="life-row-stats">
              <div className="life-rarity">{L.rarityLabel}</div>
              <div className="muted small">IQ {L.iq} · {L.netWorthLabel} · {L.age}y</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
