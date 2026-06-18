// Standalone tuning lab for the procedural face system. Not wired into the app —
// served from its own Vite entry (faces.html) so it can't disturb the game.
import { useState } from 'react';
import { Face } from './Face';
import type { Sex, Headwear, Region } from './facegen';
import { HEADWEAR_OPTIONS, REGION_OPTIONS } from './facegen';

const GRAD = [2, 3.5, 5, 6.5, 8, 9];
const INK = '#171514';
const HEADWEAR_LABELS: Record<Headwear, string> = {
  auto: 'auto (per seed)', none: 'none',
  hijab: 'hijab', niqab: 'niqab', turban: 'turban (dastar)', kufi: 'kufi / taqiyah',
  tichel: 'tichel / headscarf', cap: 'cap', beanie: 'beanie', glasses: 'glasses', earrings: 'earrings',
};
// Human-readable labels for the ancestry/region phenotype selector.
const REGION_LABELS: Record<Region | 'auto', string> = {
  auto: 'auto (per seed)',
  eastAsian: 'East Asian', southeastAsian: 'Southeast Asian', southAsian: 'South Asian',
  centralWestAsian: 'Central / West Asian', european: 'European', northAfrican: 'North African',
  westAfrican: 'West African', eastAfrican: 'East African', southernAfrican: 'Southern African',
  pacific: 'Pacific / Oceanian', indigenousAmerican: 'Indigenous American',
};

export function FaceLab() {
  const [looks, setLooks] = useState(7);
  const [sex, setSex] = useState<Sex>('F');
  const [seed, setSeed] = useState('mira');
  const [skin, setSkin] = useState(true);
  const [hair, setHair] = useState(true);
  const [line, setLine] = useState(false);
  // default the lab to NO headwear so the strongest work shows on load: the full
  // head/hair silhouette, per-region facial morphology, hair texture, and skin
  // diversity across the 19 faces. A hijab default covered hair on every face and
  // read as homogeneous. Headwear (hijab/turban/etc.) is one click away for review.
  // The game-side default is still 'auto' per seed.
  const [headwear, setHeadwear] = useState<Headwear>('none');
  // ancestry/region phenotype. 'auto' = deterministic per seed (the game default).
  const [region, setRegion] = useState<Region | 'auto'>('auto');

  const reroll = () => setSeed(Math.random().toString(36).slice(2, 8));
  const variety = Array.from({ length: 12 }, (_, i) => `${seed}-${i}`);

  return (
    <div style={{ background: '#f6f4ee', minHeight: '100vh' }}>
    <div style={{ fontFamily: 'system-ui, sans-serif', color: INK, maxWidth: 940, margin: '0 auto', padding: 24 }}>
      <h1 style={{ fontWeight: 900, fontSize: 28, letterSpacing: -0.5, margin: '0 0 4px' }}>Face Lab</h1>
      <p style={{ margin: '0 0 20px', color: '#555', fontSize: 14 }}>
        Procedural portraits driven by the looks score. Symmetry &amp; proportion track beauty; the low end goes comedic.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 28, alignItems: 'start' }}>
        {/* hero preview */}
        <div style={{ border: `3px solid ${INK}`, borderRadius: 14, boxShadow: `5px 5px 0 ${INK}`, background: '#fff', padding: 16, textAlign: 'center' }}>
          <div style={{ color: INK }}>
            <Face looks={looks} sex={sex} seed={seed} size={210} skin={skin} showHair={hair} centerline={line} headwear={headwear} region={region} />
          </div>
          <div style={{ fontWeight: 900, fontSize: 22 }}>looks {looks.toFixed(1)}</div>
          <div style={{ fontSize: 12, color: '#777' }}>{sex === 'M' ? 'male' : 'female'} · seed {seed}</div>
        </div>

        {/* controls */}
        <div>
          <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Looks — {looks.toFixed(1)}</label>
          <input type="range" min={1.5} max={9} step={0.1} value={looks} onChange={(e) => setLooks(+e.target.value)} style={{ width: '100%' }} />

          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 16, fontSize: 13 }}>
            <Toggle label="Sex" on={sex === 'F'} onText="female" offText="male" onClick={() => setSex(sex === 'M' ? 'F' : 'M')} />
            <Toggle label="Skin fill" on={skin} onClick={() => setSkin(!skin)} />
            <Toggle label="Hair" on={hair} onClick={() => setHair(!hair)} />
            <Toggle label="Symmetry axis" on={line} onClick={() => setLine(!line)} />
          </div>

          <div style={{ display: 'flex', gap: 8, marginTop: 16 }}>
            <input value={seed} onChange={(e) => setSeed(e.target.value)} style={{ flex: 1, padding: '8px 10px', border: `2px solid ${INK}`, borderRadius: 8, fontSize: 14 }} />
            <button onClick={reroll} style={{ padding: '8px 16px', border: `2px solid ${INK}`, borderRadius: 8, background: '#ffd84d', fontWeight: 800, cursor: 'pointer' }}>Reroll seed</button>
          </div>

          {/* headwear: cultural & secular head pieces, composable over any face.
              'auto' resolves to a sensible per-seed default (usually none). */}
          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Headwear</label>
            <select value={headwear} onChange={(e) => setHeadwear(e.target.value as Headwear)}
                    style={{ width: '100%', padding: '8px 10px', border: `2px solid ${INK}`, borderRadius: 8, fontSize: 14, background: '#fff', fontWeight: 600 }}>
              <option value="auto">{HEADWEAR_LABELS.auto}</option>
              {HEADWEAR_OPTIONS.map((h) => <option key={h} value={h}>{HEADWEAR_LABELS[h]}</option>)}
            </select>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {(['none', ...HEADWEAR_OPTIONS.filter((h) => h !== 'none')] as Headwear[]).map((h) => (
                <button key={h} onClick={() => setHeadwear(h)}
                        style={{ border: `2px solid ${INK}`, borderRadius: 7, padding: '4px 8px',
                                 background: headwear === h ? '#a6c8e3' : '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>
                  {HEADWEAR_LABELS[h]}
                </button>
              ))}
            </div>
          </div>

          {/* ancestry / region phenotype: drives skin tone, hair colour + texture,
              and soft facial-dimension tendencies — sampled per seed from real
              human variation. 'auto' picks a region deterministically from the
              seed; it is fully independent of the looks axis. */}
          <div style={{ marginTop: 14 }}>
            <label style={{ display: 'block', fontWeight: 700, fontSize: 13, marginBottom: 4 }}>Ancestry / region</label>
            <select value={region} onChange={(e) => setRegion(e.target.value as Region | 'auto')}
                    style={{ width: '100%', padding: '8px 10px', border: `2px solid ${INK}`, borderRadius: 8, fontSize: 14, background: '#fff', fontWeight: 600 }}>
              <option value="auto">{REGION_LABELS.auto}</option>
              {REGION_OPTIONS.map((rg) => <option key={rg} value={rg}>{REGION_LABELS[rg]}</option>)}
            </select>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, marginTop: 8 }}>
              {(['auto', ...REGION_OPTIONS] as (Region | 'auto')[]).map((rg) => (
                <button key={rg} onClick={() => setRegion(rg)}
                        style={{ border: `2px solid ${INK}`, borderRadius: 7, padding: '4px 8px',
                                 background: region === rg ? '#e3c6a6' : '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 11 }}>
                  {REGION_LABELS[rg]}
                </button>
              ))}
            </div>
          </div>

          <h3 style={{ fontWeight: 800, fontSize: 14, margin: '24px 0 8px' }}>Same person, ugly → beautiful</h3>
          <div style={{ display: 'flex', gap: 6, color: INK }}>
            {GRAD.map((v) => (
              <div key={v} style={{ textAlign: 'center' }}>
                <Face looks={v} sex={sex} seed={seed} size={104} skin={skin} showHair={hair} headwear={headwear} region={region} />
                <div style={{ fontSize: 11, fontWeight: 700, marginTop: -4 }}>{v.toFixed(1)}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <h3 style={{ fontWeight: 800, fontSize: 14, margin: '28px 0 8px' }}>
        Variety at looks {looks.toFixed(1)} (12 seeds){headwear === 'auto' ? ' · auto headwear' : ` · ${HEADWEAR_LABELS[headwear]}`}
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: 4, color: INK }}>
        {variety.map((sd) => <Face key={sd} looks={looks} sex={sex} seed={sd} size={140} skin={skin} showHair={hair} headwear={headwear} region={region} />)}
      </div>
    </div>
    </div>
  );
}

function Toggle({ label, on, onClick, onText = 'on', offText = 'off' }: { label: string; on: boolean; onClick: () => void; onText?: string; offText?: string }) {
  return (
    <button onClick={onClick} style={{ border: `2px solid ${INK}`, borderRadius: 8, padding: '6px 10px', background: on ? '#a6e3a1' : '#fff', fontWeight: 700, cursor: 'pointer', fontSize: 12 }}>
      {label}: {on ? onText : offText}
    </button>
  );
}
