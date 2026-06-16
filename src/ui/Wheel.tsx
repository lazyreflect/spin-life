import { useEffect, useRef, useState } from 'react';

export type Seg = { label: string; frac: number; color: string; flag?: string };

type Props = {
  segments: Seg[];
  targetIndex: number | null;
  spinKey: number;        // bump to trigger a spin
  durationMs: number;
  onSettled?: () => void;
  centerLabel?: string;
};

// shade a hex color by amount (-1..1)
function shade(hex: string, amt: number) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (x: number) => Math.max(0, Math.min(255, Math.round(x + 255 * amt)));
  return `rgb(${f(r)},${f(g)},${f(b)})`;
}

export function Wheel({ segments, targetIndex, spinKey, durationMs, onSettled, centerLabel }: Props) {
  const [rot, setRot] = useState(0);
  const rotRef = useRef(0);

  // build conic-gradient
  let acc = 0;
  const stops: string[] = [];
  segments.forEach((s, i) => {
    const start = acc * 360;
    acc += s.frac;
    const end = acc * 360;
    const col = i % 2 ? shade(s.color, -0.06) : s.color;
    stops.push(`${col} ${start}deg ${end}deg`);
  });
  const bg = `conic-gradient(from 0deg, ${stops.join(', ')})`;

  useEffect(() => {
    if (targetIndex == null || !segments[targetIndex]) return;
    let a = 0;
    for (let i = 0; i < targetIndex; i++) a += segments[i].frac;
    const mid = (a + segments[targetIndex].frac / 2) * 360;
    const base = rotRef.current - (rotRef.current % 360);
    const target = base + 360 * 6 - mid; // 6 full spins, then align mid to top
    rotRef.current = target;
    // force reflow so transition re-applies
    requestAnimationFrame(() => setRot(target));
  }, [spinKey]);

  // labels: only render text for slices wide enough; else flag/none
  const labels = segments.map((s, i) => {
    let a = 0;
    for (let k = 0; k < i; k++) a += segments[k].frac;
    const midDeg = (a + s.frac / 2) * 360;
    const wide = s.frac * 360;
    const text = wide >= 22 ? s.label : wide >= 7 ? (s.flag ?? '') : '';
    if (!text) return null;
    return (
      <div
        key={i}
        className="wheel-label"
        style={{ transform: `rotate(${midDeg}deg) translateY(-112px) rotate(${midDeg > 180 ? 90 : -90}deg)` }}
      >
        <span style={{ transform: midDeg > 180 ? 'rotate(180deg)' : 'none', display: 'inline-block' }}>{text}</span>
      </div>
    );
  });

  return (
    <div className="wheel-wrap">
      <div className="wheel-pointer" />
      <div
        className="wheel"
        style={{
          background: bg,
          transform: `rotate(${rot}deg)`,
          transition: `transform ${durationMs}ms cubic-bezier(0.18, 0.9, 0.12, 1)`,
        }}
        onTransitionEnd={() => onSettled?.()}
      >
        {labels}
      </div>
      <div className="wheel-hub">{centerLabel ?? 'SPIN\nYOUR\nLIFE'}</div>
    </div>
  );
}
