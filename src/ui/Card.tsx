import { DecelReel } from './DecelReel';
import { useReveal } from './useReveal';
import { displayEvents } from '../model/lineage';
import {
  reelStrip, fmtImperial, LOOKS_RANGE, CAREERS, REELDUR,
  statRamp, statTag, eduPhrase, eventPill, fmtMoney,
} from './verdict';

const INK = '#16130f';
const HOLD_HEADER = '#23201a';

// the three stat reels, built from the life's per-country reel ranges
function statReels(life: any) {
  const r = life.reelRange;
  return [
    { key: 'height', label: 'Height', value: life.heightLabel, top: life.pct.height, dur: REELDUR.height,
      items: reelStrip(r.htLoCm, r.htHiCm, fmtImperial, life.heightLabel) },
    { key: 'looks', label: 'Looks', value: life.looks.toFixed(1), top: life.pct.looks, dur: REELDUR.looks,
      items: reelStrip(LOOKS_RANGE[0], LOOKS_RANGE[1], (v) => v.toFixed(1), life.looks.toFixed(1)) },
    { key: 'iq', label: 'IQ', value: String(life.iq), top: life.pct.iq, dur: REELDUR.iq,
      items: reelStrip(r.iqLo, r.iqHi, (v) => String(Math.round(v)), String(life.iq)) },
  ];
}

export function Card({ life }: { life: any }) {
  const rv = useReveal(life);
  const alive = !life.diedYoung;
  const v = life.verdict;
  const tierColor = v.color;

  const reels = alive ? statReels(life) : [];
  const lockByKey: Record<string, boolean> = { height: rv.lockHeight, looks: rv.lockLooks, iq: rv.lockIq };

  const careerTitle = alive ? `${life.career.emoji} ${life.career.title}` : `lived ${life.age} ${life.age === 1 ? 'year' : 'years'}`;
  const careerItems = (() => { let a: string[] = []; for (let i = 0; i < 5; i++) a = a.concat(CAREERS); a.push(careerTitle); return a; })();

  const swing = life.netWorth - life.netWorthBase;
  const showDelta = rv.showMoney && Math.abs(swing) > 1 && (rv.moneyPhase === 'swing' || rv.moneyPhase === 'done');
  const events = displayEvents(life);

  // death finale shows ONLY when a life was cut short — a fatal event or a child
  // death — where the age IS the story (DIED AT, with 💀). Ordinary adult lives
  // hide the death age at the founding reveal (Destiny model, LINEAGE.md §4.0):
  // they end on Net worth, and the age resurfaces only at retirement.
  const fatal = !!life.fatalCause;
  const tragic = fatal || life.diedYoung;

  return (
    <div className="card" onClick={rv.skip} style={{ borderColor: rv.verdict ? tierColor : INK }}>
      <div className={'card-head' + (rv.verdict ? ' ignite' : '')} style={{ background: rv.verdict ? tierColor : HOLD_HEADER }}>
        {rv.verdict && v.foil && <div className="card-foil" />}
        {rv.verdict ? (
          <>
            <div className="card-head-main">
              <span className="card-tier">{v.name}</span>
              <span className="card-luck">luckier than {rv.luckShown}% of births</span>
            </div>
            <span className="card-rarity">◆ {life.rarityLabel}</span>
          </>
        ) : (
          <span className="card-tallying">tallying your luck…</span>
        )}
      </div>

      <div className="card-body">
        {/* portrait — BORN opening folded into the subtitle */}
        <div className="card-portrait">
          <div className="portrait-flag">{life.flag}</div>
          <div className="portrait-meta">
            <div className="portrait-name">{life.name}</div>
            <div className="portrait-opening">{life.opening}</div>
          </div>
        </div>

        {alive && (
          <div className="stat-reels">
            {reels.map((r) => {
              const locked = lockByKey[r.key];
              const ramp = statRamp(r.top);
              return (
                <div className={'stat-reel' + (locked ? ' locked' : '')} key={r.key} style={{ background: locked ? ramp.bg : '#fff5e0' }}>
                  <div className="stat-reel-label">{r.label}</div>
                  <DecelReel items={r.items} go={rv.reelGo} locked={locked} durationSec={r.dur} value={r.value} color={ramp.fg} />
                  <div className="stat-reel-tag" style={{ color: ramp.fg }}>{locked ? statTag(r.top) : ''}</div>
                </div>
              );
            })}
          </div>
        )}

        {alive && rv.showCareer && (
          <div className={'outcome-panel' + (rv.lockCareer ? ' locked' : '')}>
            <div className="outcome-edu">{eduPhrase(life.education)}</div>
            <DecelReel items={careerItems} go={rv.careerGo} locked={rv.lockCareer} durationSec={REELDUR.career} value={careerTitle} color={INK} big />
          </div>
        )}

        {rv.showEvents && events.length > 0 && (
          <div className="card-events">
            {events.map((e: any, i: number) => {
              const p = eventPill(e.kind);
              return (
                <div className="beat" key={i} style={{ animationDelay: `${0.24 * i}s` }}>
                  <span className="beat-pill" style={{ background: p.bg }}>{p.fx}</span>
                  <span className="beat-text">{e.text}</span>
                </div>
              );
            })}
          </div>
        )}

        {rv.showDied && tragic && (
          <div className="finale">
            <div className="finale-rule" />
            <div className="finale-row">
              <div className="finale-age">
                <div className="finale-lead">DIED AT</div>
                <div className="finale-num">{life.age}</div>
              </div>
              <div className="finale-legacy">{fatal ? '💀 ' : ''}{life.legacy}</div>
            </div>
          </div>
        )}

        {rv.showMoney && alive && (
          <div className="money-panel" style={{ boxShadow: `6px 6px 0 ${rv.verdict ? tierColor : INK}` }}>
            <div className="money-top">
              <span className="money-label">Net worth</span>
              {rv.moneyPhase === 'done' && <span className="money-tag">{statTag(life.pct.money)}</span>}
            </div>
            <div className="money-row">
              <span className="money-value">{fmtMoney(rv.cuWorth)}</span>
              {showDelta && (
                <span className="money-delta" style={{ background: swing >= 0 ? '#7be0a3' : '#ff9f87' }}>
                  {swing >= 0 ? '+' : '−'}{fmtMoney(Math.abs(swing))} <span className="money-delta-sub">LUCK</span>
                </span>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
