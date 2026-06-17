import { useEffect, useState } from 'react';
import { beatDelays, COUNTUP_MS, eventPill, statChipBg, statTag } from './verdict';

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const eduLabel = (e: string) => (e === 'none' ? 'No school' : cap(e));
const FOIL_FROM = 90; // luckPct at/above which the header shimmers (EPIC+)

// count 0 → target over COUNTUP_MS (ease-out), starting after `delaySec`
function useCountUp(target: number, delaySec: number, key: unknown) {
  const [n, setN] = useState(0);
  useEffect(() => {
    setN(0);
    let raf = 0, t0 = 0;
    const tick = (now: number) => {
      if (!t0) t0 = now;
      const p = Math.min(1, (now - t0) / COUNTUP_MS);
      setN(Math.round(target * (1 - Math.pow(1 - p, 2))));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    const to = setTimeout(() => { raf = requestAnimationFrame(tick); }, delaySec * 1000);
    return () => { clearTimeout(to); cancelAnimationFrame(raf); };
  }, [key]);
  return n;
}

export function Card({ life }: { life: any }) {
  const v = life.verdict;
  const color = v.color;
  const alive = !life.diedYoung;
  const events: any[] = life.events || [];
  const d = beatDelays(events.length);
  const luckShown = useCountUp(Math.round(life.luckPct), d.luck, life);

  const delta = life.mobilityDelta || 0;
  const up = delta > 0, flat = delta === 0;
  const arc = !alive || flat ? 'held' : up ? `▲${delta}` : `▼${-delta}`;
  const arcColor = !alive || flat ? '#6a6258' : up ? '#0b7a3a' : '#c2410c';

  const stats = !alive ? [] : [
    { label: 'Final $', value: life.netWorthLabel, top: life.pct.money },
    { label: 'IQ', value: String(life.iq), top: life.pct.iq },
    { label: 'Height', value: life.heightLabel, top: life.pct.height },
    { label: 'Looks', value: life.looks.toFixed(1), top: life.pct.looks },
    { label: 'Age', value: String(life.age), top: life.pct.life },
  ];

  return (
    <div className="card" style={{ borderColor: color }}>
      <div className="card-head" style={{ background: color }}>
        {life.luckPct >= FOIL_FROM && <div className="card-foil" />}
        <span className="card-tier">{v.name}</span>
        <span className="card-rarity">◆ {life.rarityLabel}</span>
      </div>

      <div className="card-body">
        <div className="card-portrait">
          <div className="portrait-flag">{life.flag}</div>
          <div className="portrait-meta">
            <div className="portrait-name">{life.name}</div>
            <div className="portrait-role">
              {alive ? `${life.career.emoji} ${life.career.title} · ${eduLabel(life.education)}`
                     : `lived ${life.age} ${life.age === 1 ? 'year' : 'years'}`}
            </div>
          </div>
        </div>

        <div className="beat" style={{ animationDelay: `${d.born}s` }}>
          <span className="beat-pill" style={{ background: '#16130f' }}>BORN</span>
          <span className="beat-text">{life.opening}</span>
        </div>

        {events.map((e, i) => {
          const p = eventPill(e.kind);
          return (
            <div className="beat" key={i} style={{ animationDelay: `${d.event(i)}s` }}>
              <span className="beat-pill" style={{ background: p.bg }}>{p.fx}</span>
              <span className="beat-text">{e.text}</span>
            </div>
          );
        })}

        <div className="beat" style={{ animationDelay: `${d.died}s` }}>
          <span className="beat-pill" style={{ background: '#16130f' }}>DIED</span>
          <span className="beat-text">{life.fatalCause ? '💀 ' : ''}{life.ending}</span>
        </div>

        <div className="luck-box" style={{ background: color + '1f', animationDelay: `${d.luck}s` }}>
          <div className="luck-row">
            <span className="luck-label">Luckier than</span>
            <span className="luck-pct" style={{ color }}>{luckShown}<span className="luck-sign">%</span></span>
          </div>
          <div className="luck-sub">of all births on earth</div>
          <div className="luck-bar"><div className="luck-fill" style={{ width: `${life.luckPct}%`, background: color, animationDelay: `${d.luck}s` }} /></div>
        </div>

        {alive && (
          <>
            <div className="stat-strip" style={{ animationDelay: `${d.stats}s` }}>
              {stats.map((s) => (
                <div className="stat-chip" key={s.label} style={{ background: statChipBg(s.top) }}>
                  <div className="stat-label">{s.label}</div>
                  <div className="stat-value">{s.value}</div>
                  <div className="stat-tag">{statTag(s.top)}</div>
                </div>
              ))}
            </div>
            <div className="card-arc">
              <span>{life.classOriginShort} → {life.classFinalShort}</span>
              <span className="arc-delta" style={{ color: arcColor }}>{arc}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
