// A decelerating slot reel: a tall strip that eases from offset 0 to its resting
// offset (easeOutExpo — long slow tail = the nail-biter) while blur sharpens, then
// snaps to a static colored value on lock. One CSS transition, GPU-cheap, no
// per-frame JS. Used for the stat reels and the career OUTCOME reel.
import { REEL_H, REEL_EASE } from './verdict';

export function DecelReel({
  items, go, locked, durationSec, value, color, big,
}: {
  items: string[];
  go: boolean;
  locked: boolean;
  durationSec: number;
  value: string;
  color: string;
  big?: boolean;
}) {
  if (locked) {
    return <div className={'reel-locked' + (big ? ' reel-locked-big' : '')} style={{ color }}>{value}</div>;
  }
  const rest = (items.length - 1) * REEL_H;
  const blurDur = Math.min(durationSec, 1);
  return (
    <div className="reel-viewport">
      <div
        className="reel-track"
        style={{
          transform: `translateY(${go ? -rest : 0}px)`,
          transition: `transform ${durationSec}s ${REEL_EASE}, filter ${blurDur}s linear`,
          filter: `blur(${go ? 0 : 3}px)`,
        }}
      >
        {items.map((it, i) => <div className={'reel-cell' + (big ? ' reel-cell-big' : '')} key={i}>{it}</div>)}
      </div>
    </div>
  );
}
