type Life = any;

function pct(x: number) {
  return x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x).toString();
}
function Stat({ label, top, value, color }: { label: string; top?: number; value: string; color?: string }) {
  return (
    <div className="stat">
      <div className="stat-head">
        <span className="stat-label">{label}</span>
        {top != null && <span className="stat-top">TOP {pct(top)}%</span>}
      </div>
      <div className="stat-value" style={color ? { color } : undefined}>{value}</div>
    </div>
  );
}

export function Card({ life }: { life: Life }) {
  const arc =
    life.mobilityDelta > 0 ? `▲ climbed ${life.mobilityDelta} pts` :
    life.mobilityDelta < 0 ? `▼ fell ${-life.mobilityDelta} pts` : '— held station';
  return (
    <div className="card">
      <div className="card-top">
        <span className="card-rarity">{life.rarityLabel}</span>
        <span className="card-sex">{life.sex === 'Female' ? '♀' : '♂'}</span>
      </div>
      <div className="card-name">{life.flag} {life.name}</div>
      <div className="card-sentence">{life.sentence}</div>

      <div className="card-arc">
        <span>{life.career.emoji} {life.career.title}</span>
        <span className="muted">· {life.education}</span>
      </div>
      <div className="card-arc">
        <span>{life.classOrigin} → <b>{life.classFinal}</b></span>
        <span className={life.mobilityDelta >= 0 ? 'up' : 'down'}>{arc}</span>
      </div>

      <div className="stat-grid">
        <Stat label="COUNTRY" top={life.countryChance} value={`${life.flag} ${life.country}`} />
        <Stat label="NET WORTH" top={life.pct.money} value={life.netWorthLabel} color="#f5a623" />
        <Stat label="FAMILY" value={life.familyWealthLabel} />
        <Stat label="HEIGHT" top={life.pct.height} value={life.heightLabel} color="#51cf66" />
        <Stat label="IQ" top={life.pct.iq} value={String(life.iq)} color="#4dabf7" />
        <Stat label="LOOKS" top={life.pct.looks} value={life.looks.toFixed(1)} color="#f06595" />
        <Stat label="LIVES TO" top={life.pct.life} value={String(life.age)} color="#ff6b6b" />
      </div>
    </div>
  );
}
