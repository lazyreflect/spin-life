import { useState } from 'react';
import { TIER_TRACK, tierBadge } from './verdict';
import { roller } from '../data';
import { canFoundLine, pairBlock } from '../model/lineage';
import { Card } from './Card';

// My Lives — the collection album, plus the lineage loop: select two eligible
// parents (one mother, one father) and start a family. The child reveals with the
// same card, then can be kept (it carries its own id / parentIds / generation).
export function MyLives({ lives, onKeep, onPair }: { lives: any[]; onKeep: (L: any) => void; onPair: (a: string, b: string) => void }) {
  const [selected, setSelected] = useState<string[]>([]); // up to two parent ids
  const [child, setChild] = useState<any>(null);

  const ownedTiers = new Set(lives.map((L) => tierBadge(L.luckPct).short));
  const best = lives.reduce((m, L) => Math.max(m, L.luckPct), -1);
  const bestBadge = best >= 0 ? tierBadge(best) : null;
  const sorted = [...lives].sort((a, b) => b.luckPct - a.luckPct);

  const parents = selected.map((id) => lives.find((l) => l.id === id)).filter(Boolean) as any[];
  const block = parents.length === 2 ? pairBlock(parents[0], parents[1]) : null;

  const toggle = (L: any) => {
    if (!canFoundLine(L)) return; // a card who can't found a line can't be a parent
    setSelected((prev) =>
      prev.includes(L.id) ? prev.filter((x) => x !== L.id)
      : prev.length < 2 ? [...prev, L.id] : prev,
    );
  };
  const startFamily = () => {
    const father = parents[0].sex === 'Male' ? parents[0] : parents[1];
    const mother = parents[0].sex === 'Female' ? parents[0] : parents[1];
    onPair(father.id, mother.id); // the marriage is now real
    const c = roller.rollChild(father, mother);
    c.id = crypto.randomUUID();
    setChild(c);
  };
  const keepChild = () => { onKeep(child); setChild(null); setSelected([]); };

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
        {sorted.map((L) => {
          const badge = tierBadge(L.luckPct);
          const role = L.diedYoung ? `died at ${L.age}` : `${L.career.emoji} ${L.career.title}`;
          const eligible = canFoundLine(L);
          const isSel = selected.includes(L.id);
          const order = selected.indexOf(L.id) + 1;
          return (
            <div
              className={'mini-card' + (isSel ? ' selected' : '') + (eligible ? '' : ' ineligible')}
              key={L.id}
              style={{ borderColor: isSel ? '#16130f' : badge.color }}
              onClick={() => toggle(L)}
            >
              <div className="mini-head" style={{ background: badge.color }}>
                <span className="mini-tier">{isSel ? `${order === 1 ? '①' : '②'} PARENT` : badge.short}</span>
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

      {selected.length > 0 && (
        <div className="pair-bar">
          {parents.length < 2 ? (
            <span className="pair-hint">Pick {2 - parents.length} more — a mother and a father</span>
          ) : block ? (
            <span className="pair-hint">{block}</span>
          ) : (
            <button className="btn pair-go" onClick={startFamily}>👶 Start a family</button>
          )}
          <button className="pair-clear" onClick={() => setSelected([])}>clear</button>
        </div>
      )}

      {child && (
        <div className="child-overlay" onClick={(e) => { if (e.target === e.currentTarget) setChild(null); }}>
          <div className="child-sheet">
            <div className="child-banner">A child is born</div>
            <Card life={child} />
            <div className="child-actions">
              <button className="btn btn-keep" onClick={keepChild}>＋ KEEP CHILD</button>
              <button className="btn btn-pull-again" onClick={() => setChild(null)}>DISCARD</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
