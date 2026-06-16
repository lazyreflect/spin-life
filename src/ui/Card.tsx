type Life = any;

function pct(x: number) {
  return x < 1 ? x.toFixed(2) : x < 10 ? x.toFixed(1) : Math.round(x).toString();
}

function Stat({ label, top, value }: { label: string; top?: number; value: string }) {
  // `top` = % of the world at or above you. Low = rare/good tail; high = common.
  const good = top != null && top <= 50;
  const tag = top == null ? null : good ? `top ${pct(top)}%` : `bottom ${pct(100 - top)}%`;
  return (
    <div className="stat">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      {tag && <div className={good ? 'stat-top good' : 'stat-top bad'}>{tag}</div>}
    </div>
  );
}

export function Card({ life }: { life: Life }) {
  const up = life.mobilityDelta > 0;
  const flat = life.mobilityDelta === 0;
  const arc = flat ? 'held station' : up ? `▲ climbed ${life.mobilityDelta}` : `▼ fell ${-life.mobilityDelta}`;
  return (
    <div className="card">
      <div className="card-head">
        <span className="card-rarity">◆ {life.rarityLabel}</span>
        <span className="card-origin">{life.sex === 'Female' ? '♀' : '♂'} · {life.flag} {life.country}</span>
      </div>

      <p className="card-sentence">{life.sentence}</p>

      {life.diedYoung ? (
        <div className="card-attr">— {life.name}, {life.flag} {life.country}</div>
      ) : (
        <>
          <div className="card-attr">— {life.name} · {life.career.emoji} {life.career.title} · {life.education}</div>

          <div className="card-arc">
            <span className="arc-route">{life.classOrigin} → <b>{life.classFinal}</b></span>
            <span className={flat ? 'arc-delta' : up ? 'arc-delta up' : 'arc-delta down'}>{arc}</span>
          </div>

          <div className="card-strip">
            <Stat label="Net worth" top={life.pct.money} value={life.netWorthLabel} />
            <Stat label="IQ" top={life.pct.iq} value={String(life.iq)} />
            <Stat label="Height" top={life.pct.height} value={life.heightLabel} />
            <Stat label="Looks" top={life.pct.looks} value={life.looks.toFixed(1)} />
            <Stat label="Lives to" top={life.pct.life} value={String(life.age)} />
          </div>
        </>
      )}
    </div>
  );
}
