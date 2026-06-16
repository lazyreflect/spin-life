// One shared "good vs bad" scale used to colour every wheel slice. The original
// game coloured slices by desirability, not by category — so a glance at the
// wheel tells you whether you're landing somewhere lucky or grim.
// 0 = undesirable (crimson) → 0.5 = middling (amber) → 1 = desirable (emerald).
const STOPS: Array<[number, [number, number, number]]> = [
  [0.0, [190, 75, 66]],   // crimson
  [0.5, [214, 162, 70]],  // amber / gold
  [1.0, [74, 158, 110]],  // emerald
];

export function desirabilityColor(t: number): string {
  const x = Math.max(0, Math.min(1, t));
  let a = STOPS[0], b = STOPS[STOPS.length - 1];
  for (let i = 0; i < STOPS.length - 1; i++) {
    if (x >= STOPS[i][0] && x <= STOPS[i + 1][0]) { a = STOPS[i]; b = STOPS[i + 1]; break; }
  }
  const f = (x - a[0]) / ((b[0] - a[0]) || 1);
  const c = a[1].map((av, i) => Math.round(av + (b[1][i] - av) * f));
  return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
}
