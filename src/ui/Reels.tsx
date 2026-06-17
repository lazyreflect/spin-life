// Three slot reels: WHERE (flag) · START (class) · LIFE (career). They roll, then
// lock left→right at 720/1080/1440ms (timed by SpinScreen); on reveal all three
// show their landed value. Idle shows the rest icons 🌍 🏠 💼.
export type ReelPhase = 'idle' | 'spinning' | 'reveal';

const STRIPS = [
  ['🇰🇷', '🇳🇪', '🇨🇭', '🇧🇷', '🇳🇬', '🇮🇳', '🇺🇸', '🇯🇵', '🇪🇬', '🇲🇽'],
  ['🏚️', '🔧', '🏠', '🏢', '👑', '🏚️', '🔧', '🏠', '🏢', '👑'],
  ['🩺', '🌾', '🏦', '🎤', '🚚', '🎨', '⚽', '🚀', '🔬', '🎬'],
];
const REST = ['🌍', '🏠', '💼'];
const LABELS = ['WHERE', 'START', 'LIFE'];

export function Reels({ phase, stopped, landed }: { phase: ReelPhase; stopped: number; landed: [string, string, string] }) {
  return (
    <div className="reels">
      {[0, 1, 2].map((i) => {
        const idle = phase === 'idle';
        const locked = !idle && (phase === 'reveal' || i < stopped);
        return (
          <div className="reel-col" key={i}>
            <div className={'reel-window' + (locked ? ' locked' : '')}>
              {idle ? (
                <div className="reel-item">{REST[i]}</div>
              ) : locked ? (
                <div className="reel-item lockpop">{landed[i]}</div>
              ) : (
                <div className="reel-strip">
                  {[...STRIPS[i], ...STRIPS[i]].map((e, k) => <div className="reel-item" key={k}>{e}</div>)}
                </div>
              )}
            </div>
            <span className="reel-label">{LABELS[i]}</span>
          </div>
        );
      })}
    </div>
  );
}
