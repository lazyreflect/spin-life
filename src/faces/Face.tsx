// Renders a FaceGeo. In line-art mode it's brutalist ink (strokes use
// currentColor so the host controls the ink). With skin fill on it builds 3D
// form: a clipped radial skin-volume gradient lit from upper-left, soft plane
// shadows (temple, cheek hollow, side-of-nose, under-jaw → neck) and a forehead
// highlight — giving the silhouette believable light planes instead of a flat
// potato. All <defs> ids are suffixed with the face's seed so the ~19 faces on
// one page don't share one document-global gradient.
import { Component } from 'react';
import { buildFace, type FaceParams, type HeadwearGeo } from './facegen';
import { hashSeed } from '../model/stats.js';

// Per-face error boundary: one face throwing during render must NOT blank the
// whole page (~19 render together). A failed face shows a quiet placeholder
// glyph instead, and the error is logged once so it isn't lost in HMR noise.
// (This repo ships no @types/react, so we type props/state locally rather than
// lean on Component's generics, which aren't resolvable here.)
interface BoundaryProps { size: number; resetKey?: string | number; children: unknown }
class FaceBoundary extends Component<BoundaryProps, { failed: boolean; key: string | number | undefined }> {
  declare props: BoundaryProps;
  state: { failed: boolean; key: string | number | undefined } = { failed: false, key: undefined };
  static getDerivedStateFromError() { return { failed: true }; }
  // Recover when the inputs change: a face that threw once must NOT stay a
  // permanent placeholder after the user dials to a valid looks/seed. When the
  // resetKey (the face's params) changes, clear the failed flag and re-attempt
  // the render. Without this the hero/gradient faces (which aren't React-keyed)
  // would brick forever on a single transient throw.
  static getDerivedStateFromProps(props: BoundaryProps, state: { failed: boolean; key: string | number | undefined }) {
    if (props.resetKey !== state.key) return { failed: false, key: props.resetKey };
    return null;
  }
  componentDidCatch(err: unknown) { console.error('[Face] render failed:', err); }
  render() {
    if (this.state.failed) {
      const s = this.props.size;
      return (
        <svg viewBox="0 0 200 240" width={s} height={s * 1.2} role="img" aria-label="face unavailable">
          <rect x="2" y="2" width="196" height="236" rx="14" fill="none"
                stroke="currentColor" strokeWidth={2} strokeDasharray="4 5" opacity={0.4} />
          <circle cx="100" cy="100" r="34" fill="none" stroke="currentColor" strokeWidth={2} opacity={0.4} />
          <path d="M86 150 Q100 142 114 150" fill="none" stroke="currentColor" strokeWidth={2} opacity={0.4} />
        </svg>
      );
    }
    return this.props.children as never;
  }
}

interface FaceProps extends FaceParams {
  size?: number;
  skin?: boolean;       // flat skin fill (off by default = pure ink on white)
  showHair?: boolean;
  centerline?: boolean; // dashed symmetry axis (demonstration aid)
  stroke?: number;
  // This repo ships no @types/react; React's special `key` isn't injected into
  // the JSX prop type here, so we accept it explicitly to keep tsc clean.
  key?: string | number;
}

// darken/lighten a #rrggbb hex by a factor (k<1 darker, k>1 lighter)
function shade(hex: string, k: number): string {
  if (!hex || hex[0] !== '#') hex = '#808080';   // guard: never crash on a bad colour
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) * k);
  const g = cl(((n >> 8) & 255) * k);
  const b = cl((n & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Mix a hex toward another hex by amount a∈[0,1]. Unlike multiplicative shade(),
// this ADDS absolute brightness so near-black hair still gets a visible sheen
// instead of collapsing to a flat cap.
function mix(hex: string, toward: string, a: number): string {
  const pa = (h: string) => { const n = parseInt((h[0] === '#' ? h.slice(1) : '808080'), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = pa(hex), [r2, g2, b2] = pa(toward);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(r1 + (r2 - r1) * a), g = cl(g1 + (g2 - g1) * a), b = cl(b1 + (b2 - b1) * a);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// Warm-shade: darken AND push hue toward a warm red/amber, the way real skin
// behaves in shadow (subsurface blood scatter keeps shadows ruddy, never grey).
// k<1 darkens; warmth∈[0,1] biases the result toward skin's own warm core. This
// is the fix for the muddy grey washes — every skin shadow stays in the skin's
// own warm family instead of sliding to neutral grey.
function warmShade(hex: string, k: number, warmth = 0.5): string {
  const lit = shade(hex, k);
  // a warm ruddy target derived from the tone itself (boost red, drop blue)
  const n = parseInt((hex[0] === '#' ? hex.slice(1) : '808080'), 16);
  const r0 = (n >> 16) & 255, g0 = (n >> 8) & 255, b0 = n & 255;
  const ruddy = `#${((1 << 24)
    | (Math.min(255, Math.round(r0 * k * 1.04)) << 16)
    | (Math.round(g0 * k * 0.82) << 8)
    | (Math.round(b0 * k * 0.72))).toString(16).slice(1)}`;
  return mix(lit, ruddy, warmth);
}

export function Face({ size = 200, ...rest }: FaceProps) {
  // resetKey: the inputs that drive geometry. When any of them change the
  // boundary clears a prior failure and re-attempts — so dialing past a bad
  // state recovers instead of leaving a permanent placeholder.
  const resetKey = `${rest.seed}|${rest.looks}|${rest.sex}|${rest.headwear ?? ''}|${rest.showHair ?? ''}|${rest.region ?? ''}`;
  return (
    <FaceBoundary size={size} resetKey={resetKey}>
      <FaceImpl size={size} {...rest} />
    </FaceBoundary>
  );
}

function FaceImpl({ size = 200, skin = false, showHair = true, centerline = false, stroke = 3, ...params }: FaceProps) {
  const g = buildFace({ ...params, hair: showHair });
  // unique per-face suffix for all defs ids. Must be unique across EVERY panel on
  // the page, not just per seed: the lab renders the SAME seed at different looks
  // (hero + the ugly→beautiful row), so a seed-only suffix collides and SVG
  // url(#id) references then resolve to the WRONG panel's gradient/clip. We hash
  // the full render-distinguishing tuple (seed + looks + sex + region + headwear +
  // skin/hair flags) so any two visibly-distinct faces get distinct ids. Still
  // fully deterministic (no clock/RNG) — same inputs always yield the same uid.
  const seed32 = typeof params.seed === 'number' ? params.seed >>> 0 : hashSeed(params.seed);
  const uidKey = `${seed32}|${params.looks}|${params.sex}|${params.region ?? ''}|${params.headwear ?? ''}|${skin ? 1 : 0}|${showHair ? 1 : 0}`;
  const uid = (hashSeed(uidKey) >>> 0).toString(36);
  const sh = g.shading;
  const { bbox } = sh;

  // shadow / highlight tones derived from this face's skin so they read as form,
  // not as a grey wash on every skin tone. The prototype's core (0.66×) was so
  // dark the lower-right of every face fell into a muddy blotch and the neck read
  // as a different person. Tones are gentler now — the volume gradient should
  // round the face, not bisect it into light/dark halves.
  // Skin tone ladder. Highlights warm toward a creamy specular (sun/skin sheen);
  // shadows warm toward the skin's own ruddy core (subsurface scatter) instead of
  // going grey. The warmth on the shadow steps is what kills the muddy washes and
  // keeps every tone — pale to deep — reading as living skin under one warm key.
  const skinHi = mix(shade(g.skinColor, 1.12), '#fff1dc', 0.22);   // warm lit plane
  const skinSpec = mix(shade(g.skinColor, 1.2), '#fffaf0', 0.5);   // tight specular pop
  const skinMid = g.skinColor;
  const skinLo = warmShade(g.skinColor, 0.9, 0.4);     // first turn into shadow
  const skinCore = warmShade(g.skinColor, 0.78, 0.55); // core shadow (ruddy, not grey)
  const skinDeep = warmShade(g.skinColor, 0.68, 0.55); // deepest creases / under-jaw
  // subsurface bounce: a faint warm glow that fills the shadow side so it never
  // dies to a flat dark — the light that scatters through and re-emerges.
  const skinBounce = mix(g.skinColor, '#d98a5a', 0.18);

  // iris colour: seed-derived but plausible (browns/hazel/blue/green/grey).
  const IRIS = ['#5b3a1e', '#7a4a22', '#3f6f73', '#5e7d52', '#6b6f78', '#8a6a3a', '#2f4a63'];
  const irisBase = IRIS[seed32 % IRIS.length];
  const irisHi = shade(irisBase, 1.5);
  const irisLo = shade(irisBase, 0.45);
  // sclera: not pure white — a faintly shaded off-white reads more real.
  const sclera = '#f3efe9';
  const scleraShadow = '#cdbfb2';   // upper-lid cast shadow on the eyeball

  // ---- tone-aware hair highlights. Multiplicative shade() collapses on near-
  // black hair (1.45 × #1A is still #26). So we MIX toward a warm highlight: dark
  // hair gets a strong cool-warm sheen lift, light hair a gentler one. This is the
  // fix for "dark hair reads as a flat helmet". ----
  const hairLuma = (() => { const h = g.hairColor || '#000'; const n = parseInt(h.slice(1), 16); return (((n >> 16) & 255) * 0.299 + ((n >> 8) & 255) * 0.587 + (n & 255) * 0.114) / 255; })();
  const darkHair = hairLuma < 0.32;
  const greyHair = (() => { const h = g.hairColor || '#000'; const n = parseInt(h.slice(1), 16); const r = (n >> 16) & 255, gg = (n >> 8) & 255, b = n & 255; const mx = Math.max(r, gg, b), mn = Math.min(r, gg, b); return (mx - mn) < 22 && hairLuma > 0.4; })();
  // Crown/midtone lift: a WARM amber lift derived from the hair itself, so even
  // near-black hair browns up toward the light instead of staying a flat cap. The
  // old steel-grey tint is gone — that was the muddy grey patch. Grey hair lifts
  // toward a soft pearl-white instead of amber.
  const hairLift = greyHair ? '#f4f2ee' : darkHair ? '#6b4a30' : '#fff0cf';
  const hairCrownHi = mix(g.hairColor, hairLift, darkHair ? 0.55 : 0.42);   // crown light
  const hairMidHi = mix(g.hairColor, hairLift, darkHair ? 0.34 : 0.24);
  // The glossy sheen band: a sharp wet specular. Dark hair gets a cool, BRIGHT
  // but NARROW (handled in the gradient stops) sheen so it reads as gloss on a
  // dark mass, not a grey wash spread over the whole crown.
  const hairSheen = greyHair ? '#ffffff'
    : darkHair ? mix(g.hairColor, '#cfd6e6', 0.78)
    : mix(g.hairColor, '#fff8ea', 0.62);
  const hairRoot = warmShade(g.hairColor, 0.5, 0.3);   // warm-dark roots, not grey-dark
  const hairStrandLo = mix(g.hairColor, '#000000', 0.32);   // dark gaps between locks
  const hairStrandHi = mix(g.hairColor, hairLift, darkHair ? 0.6 : 0.48);   // lit locks

  return (
    <svg viewBox="0 0 200 240" width={size} height={size * 1.2} role="img"
         aria-label={`face, looks ${params.looks.toFixed(1)}`}>
      {/* eye defs — always present (eyes carry realism in both modes). Per-eye
          ids are suffixed with the face uid AND the eye index so the ~19 faces
          on one page never share an iris/clip. */}
      <defs>
        {g.eyes.map((e, i) => (
          <g key={`edef${i}`}>
            {/* iris: lit from upper-left, darker limbal ring at the rim */}
            <radialGradient id={`iris-${uid}-${i}`} gradientUnits="userSpaceOnUse"
              cx={e.iris.cx - e.iris.r * 0.3} cy={e.iris.cy - e.iris.r * 0.3} r={e.iris.r * 1.25}
              fx={e.iris.cx - e.iris.r * 0.3} fy={e.iris.cy - e.iris.r * 0.3}>
              <stop offset="0%" stopColor={irisHi} />
              <stop offset="55%" stopColor={irisBase} />
              <stop offset="88%" stopColor={irisLo} />
              <stop offset="100%" stopColor={shade(irisBase, 0.3)} />
            </radialGradient>
            {/* sclera vertical shading: upper-lid casts a soft shadow on the eyeball */}
            <linearGradient id={`scl-${uid}-${i}`} gradientUnits="userSpaceOnUse"
              x1={e.ex} y1={e.ey - e.ry} x2={e.ex} y2={e.ey + e.ry}>
              <stop offset="0%" stopColor={scleraShadow} />
              <stop offset="38%" stopColor={sclera} />
              <stop offset="100%" stopColor={sclera} />
            </linearGradient>
            {/* clip everything (iris/pupil) to the eye opening so it can't overrun */}
            <clipPath id={`eye-${uid}-${i}`}><path d={e.d} /></clipPath>
          </g>
        ))}
        {/* headwear cloth: a soft top-lit gradient so garments read as draped
            fabric with volume, not flat shapes. Present in both render modes
            (cloth gets its own tone; line-art mode keeps the ink outlines). */}
        {g.headwear.kind !== 'none' && (
          <>
            <linearGradient id={`cloth-${uid}`} x1="0" y1="0" x2="0.25" y2="1">
              <stop offset="0%" stopColor={g.headwear.clothHi} />
              <stop offset="42%" stopColor={g.headwear.cloth} />
              <stop offset="100%" stopColor={g.headwear.clothShadow} />
            </linearGradient>
            <radialGradient id={`clothSoft-${uid}`}>
              <stop offset="0%" stopColor={g.headwear.clothShadow} stopOpacity={0.6} />
              <stop offset="100%" stopColor={g.headwear.clothShadow} stopOpacity={0} />
            </radialGradient>
            <filter id={`clothBlur-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
              <feGaussianBlur stdDeviation="1.6" />
            </filter>
          </>
        )}
        {/* head-stroke mask: white everywhere EXCEPT the front-hair shape, which is
            punched out in black. Applied to the head silhouette stroke so the skull
            edge is suppressed wherever the front hair covers it. In skin mode the
            hair fill already occludes the edge, but in line-art mode there is no
            fill — without this mask the skull dome line cuts straight across the
            hair (the reported bug). The hair's own ink outline still draws the
            hairline, so the silhouette stays crisp and continuous. */}
        {g.hairPath && !g.headwear.coversHair && (
          <mask id={`headStroke-${uid}`} maskUnits="userSpaceOnUse" x="0" y="0" width="200" height="240">
            <rect x="0" y="0" width="200" height="240" fill="#fff" />
            {/* dilate the punch-out slightly (a stroked + filled copy) so the head
                edge is hidden a touch BEYOND the hair outline — no thin sliver of
                skull line peeks out along the hairline. */}
            <path d={g.hairPath} fill="#000" stroke="#000" strokeWidth={stroke * 1.6} strokeLinejoin="round" />
          </mask>
        )}
      </defs>
      {skin && (
        <defs>
          {/* head volume: bright near the light (upper-left), falling to a core
              shadow at the lower-right rim */}
          <radialGradient id={`vol-${uid}`} gradientUnits="userSpaceOnUse"
            cx={bbox.x + bbox.w * sh.lightX} cy={bbox.y + bbox.h * sh.lightY}
            r={bbox.w * 1.02}
            fx={bbox.x + bbox.w * sh.lightX} fy={bbox.y + bbox.h * sh.lightY}>
            {/* one coherent upper-left key: lit forehead/cheek plane near the light,
                holding true skin tone across the mid-face, then a believable roll
                into the warm core shadow at the far (lower-right) rim. The mid-face
                still holds skinMid so it doesn't wash, but now there's a real, soft
                terminator instead of a flat disc. */}
            <stop offset="0%" stopColor={skinHi} />
            <stop offset="30%" stopColor={skinMid} />
            <stop offset="62%" stopColor={skinMid} />
            <stop offset="82%" stopColor={skinLo} />
            <stop offset="94%" stopColor={skinCore} />
            <stop offset="100%" stopColor={skinDeep} />
          </radialGradient>
          {/* directional key-shadow: a soft linear wash that darkens the whole
              shadow (light-opposite) side of the face, painted over the radial vol.
              This is what makes the light read as a single DIRECTIONAL source
              rather than a centred spotlight. Clipped to the head. */}
          <linearGradient id={`key-${uid}`} gradientUnits="userSpaceOnUse"
            x1={bbox.x + bbox.w * sh.lightX} y1={bbox.y + bbox.h * (sh.lightY + 0.1)}
            x2={bbox.x + bbox.w * (sh.lightX > 0.5 ? 0.05 : 0.95)}
            y2={bbox.y + bbox.h * 0.82}>
            <stop offset="0%" stopColor={skinCore} stopOpacity={0} />
            <stop offset="58%" stopColor={skinCore} stopOpacity={0} />
            <stop offset="100%" stopColor={skinCore} stopOpacity={0.5} />
          </linearGradient>
          {/* subsurface bounce fill: warm glow lifting the deepest shadow so it
              reads as translucent skin, not a dead dark edge. */}
          <radialGradient id={`bounce-${uid}`} gradientUnits="userSpaceOnUse"
            cx={bbox.x + bbox.w * (sh.lightX > 0.5 ? 0.2 : 0.8)}
            cy={bbox.y + bbox.h * 0.66} r={bbox.w * 0.5}>
            <stop offset="0%" stopColor={skinBounce} stopOpacity={0.32} />
            <stop offset="100%" stopColor={skinBounce} stopOpacity={0} />
          </radialGradient>
          {/* neck reads a touch darker than the face (it's set back) but must be
              the SAME PERSON — only a hair below the face's shadowed tone. */}
          <linearGradient id={`neck-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={skinLo} />
            <stop offset="60%" stopColor={skinCore} />
            <stop offset="100%" stopColor={shade(g.skinColor, 0.82)} />
          </linearGradient>
          {/* soft-edged shadow paint */}
          <radialGradient id={`soft-${uid}`}>
            <stop offset="0%" stopColor={skinCore} stopOpacity={0.55} />
            <stop offset="100%" stopColor={skinCore} stopOpacity={0} />
          </radialGradient>
          {/* forehead/cheek specular — a warm creamy plane light on the lit side */}
          <radialGradient id={`hi-${uid}`}>
            <stop offset="0%" stopColor={skinSpec} stopOpacity={0.6} />
            <stop offset="60%" stopColor={skinHi} stopOpacity={0.28} />
            <stop offset="100%" stopColor={skinHi} stopOpacity={0} />
          </radialGradient>
          <filter id={`blur-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.4" />
          </filter>
          <filter id={`blurS-${uid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="1.5" />
          </filter>
          {/* tighter blur for small features (nose/lip form) */}
          <filter id={`blurT-${uid}`} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="0.9" />
          </filter>
          {/* lower-lip body: lit top edge (catches light) -> shaded bottom roll */}
          <linearGradient id={`llip-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={shade(g.mouth.lipFill, 0.82)} />
            <stop offset="40%" stopColor={shade(g.mouth.lipFill, 1.16)} />
            <stop offset="100%" stopColor={shade(g.mouth.lipFill, 0.74)} />
          </linearGradient>
          {/* upper-lip body: in shadow at the top (under the nose), warmer at seam */}
          <linearGradient id={`ulip-${uid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={shade(g.mouth.lipFill, 0.72)} />
            <stop offset="100%" stopColor={shade(g.mouth.lipFill, 1.0)} />
          </linearGradient>
          {/* soft wet sheen on the lower lip */}
          <radialGradient id={`lhi-${uid}`}>
            <stop offset="0%" stopColor="#ffffff" stopOpacity={0.5} />
            <stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
          </radialGradient>
          {/* bright specular on the nose ball */}
          <radialGradient id={`nball-${uid}`}>
            <stop offset="0%" stopColor={shade(g.skinColor, 1.3)} stopOpacity={0.85} />
            <stop offset="100%" stopColor={skinHi} stopOpacity={0} />
          </radialGradient>
          <clipPath id={`head-${uid}`}><path d={g.headPath} /></clipPath>
          {/* hair volume: lit crown (upper-left) falling to dark roots/underside */}
          {g.hairShade && (() => {
            const hb = g.hairShade.bbox;
            return (
              <>
                <radialGradient id={`hair-${uid}`} gradientUnits="userSpaceOnUse"
                  cx={g.hairShade.crown.cx} cy={g.hairShade.crown.cy} r={g.hairShade.crown.r * 1.7}
                  fx={g.hairShade.crown.cx} fy={g.hairShade.crown.cy}>
                  <stop offset="0%" stopColor={hairCrownHi} />
                  <stop offset="26%" stopColor={hairMidHi} />
                  <stop offset="62%" stopColor={g.hairColor} />
                  <stop offset="100%" stopColor={hairRoot} />
                </radialGradient>
                {/* back lobe (long styles): flatter, set-back tone */}
                <linearGradient id={`hairB-${uid}`} gradientUnits="userSpaceOnUse"
                  x1={hb.x} y1={hb.y} x2={hb.x} y2={hb.y + hb.h}>
                  <stop offset="0%" stopColor={mix(g.hairColor, hairLift, darkHair ? 0.14 : 0.06)} />
                  <stop offset="100%" stopColor={shade(g.hairColor, 0.55)} />
                </linearGradient>
                {/* glossy sheen band — a TIGHT bright streak across the crown. The
                    sharp falloff (zero at 30% / 65%, peak at 48%) makes it read as
                    a wet specular highlight on a rounded mass, not a flat grey wash
                    smeared over the whole cap. */}
                <linearGradient id={`hairS-${uid}`} gradientUnits="userSpaceOnUse"
                  x1={hb.x} y1={g.hairShade.crown.cy - 7} x2={hb.x} y2={g.hairShade.crown.cy + 13}>
                  <stop offset="0%" stopColor={hairSheen} stopOpacity={0} />
                  <stop offset="30%" stopColor={hairSheen} stopOpacity={0} />
                  <stop offset="48%" stopColor={hairSheen} stopOpacity={darkHair ? 0.9 : 0.78} />
                  <stop offset="65%" stopColor={hairSheen} stopOpacity={0} />
                  <stop offset="100%" stopColor={hairSheen} stopOpacity={0} />
                </linearGradient>
                <clipPath id={`hairClip-${uid}`}><path d={g.hairPath!} /></clipPath>
              </>
            );
          })()}
        </defs>
      )}

      {/* headwear: draped cloth (hijab/tichel/niqab) sits BEHIND the head so it
          frames the face and covers the neck/shoulders. Drawn before the neck so
          a full hijab drape reads as one continuous garment. */}
      {g.headwear.drape && (
        <g>
          <path d={g.headwear.drape}
                fill={skin ? `url(#cloth-${uid})` : 'none'}
                stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
        </g>
      )}

      {/* neck + shoulders sit behind the head */}
      {skin
        ? <path d={g.neckPath} fill={`url(#neck-${uid})`} stroke="currentColor" strokeWidth={stroke * 0.7} strokeLinejoin="round" />
        : <path d={g.neckPath} fill="none" stroke="currentColor" strokeWidth={stroke * 0.7} strokeLinejoin="round" />}

      {/* hair behind the head — suppressed when a garment covers the hair */}
      {g.hairBackPath && !g.headwear.coversHair && <path d={g.hairBackPath} fill={skin ? (g.hairShade ? `url(#hairB-${uid})` : g.hairColor) : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />}

      {/* head: flat fill in line-art mode, lit volume in skin mode */}
      {skin
        ? <path d={g.headPath} fill={`url(#vol-${uid})`} stroke="none" />
        : null}

      {/* plane shadows + highlight, clipped to the head so they never bleed past
          the silhouette. Order: core shadows first, specular last. */}
      {skin && (
        <g clipPath={`url(#head-${uid})`}>
          {/* directional key shadow over the whole shadow side — establishes one
              coherent upper-left light. Soft-blurred so it's an even plane wash. */}
          <rect x={bbox.x} y={bbox.y} width={bbox.w} height={bbox.h}
                fill={`url(#key-${uid})`} filter={`url(#blur-${uid})`} />
          {/* warm subsurface bounce lifting the deep shadow back toward living skin */}
          <rect x={bbox.x} y={bbox.y} width={bbox.w} height={bbox.h}
                fill={`url(#bounce-${uid})`} />
          {/* under-jaw / submental core shadow into the neck */}
          <path d={sh.jawShade} fill={skinDeep} opacity={0.45} filter={`url(#blur-${uid})`} />
          {/* cheek hollows — soft slanted planes under the cheekbone. Strength is
              whisper-light on ordinary faces (form, not eye-bags), heavier for
              gaunt/chiselled faces. Heavily blurred so it never reads as a line. */}
          {sh.cheekHollow.map((c, i) => (
            <path key={`ch${i}`} d={c.d} fill={skinLo} opacity={sh.cheekStrength * 0.8} filter={`url(#blur-${uid})`} />
          ))}
          {/* temple falloff (more on the shadow side, but both turn away) */}
          {sh.templeShade.map((c, i) => (
            <path key={`tm${i}`} d={c.d} fill={skinLo} opacity={i === (sh.lightX < 0.5 ? 1 : 0) ? 0.34 : 0.2} filter={`url(#blur-${uid})`} />
          ))}
          {/* side-of-nose + under-tip shadow — makes the nose project. Soft &
              gentle: the prototype's was a hard dark blob beside the nose. */}
          <path d={sh.noseShade} fill={skinLo} opacity={0.3} filter={`url(#blur-${uid})`} />
          {/* --- nose 3D form: core shadow down both bridge walls (shadow side
              darker), a cast pool under the tip, then a bright dorsal ridge and a
              specular on the ball. Order: shadows first, highlights last. --- */}
          {g.nose.sideShade.map((d, i) => (
            <path key={`nss${i}`} d={d} fill={skinLo}
                  opacity={i === (sh.lightX < 0.5 ? 1 : 0) ? 0.3 : 0.14}
                  filter={`url(#blurS-${uid})`} />
          ))}
          <path d={g.nose.underShade} fill={skinCore} opacity={0.36} filter={`url(#blurT-${uid})`} />
          {/* bridge highlight: a SOFT dorsal ridge, not a drawn line. On a
              symmetric face this runs near-centre, so a hard stroke read as a
              faint scar down the nose. Wider + lower opacity + the broader blur
              turns it into a believable lift instead of a line. */}
          <path d={g.nose.bridgeHi} fill="none" stroke={shade(g.skinColor, 1.22)}
                strokeWidth={3.4} strokeLinecap="round" opacity={0.34} filter={`url(#blurS-${uid})`} />
          <circle cx={g.nose.ballHi.cx} cy={g.nose.ballHi.cy} r={g.nose.ballHi.r}
                  fill={`url(#nball-${uid})`} filter={`url(#blurT-${uid})`} />
          {/* forehead / upper-cheek highlight on the lit side — a broad soft glow
              that establishes the upper-left key light and gives the brow ridge a
              lift. A second, smaller cheek-ball highlight reinforces the form. */}
          <ellipse
            cx={bbox.x + bbox.w * (sh.lightX + 0.02)} cy={bbox.y + bbox.h * (sh.lightY + 0.0)}
            rx={bbox.w * 0.30} ry={bbox.h * 0.22}
            fill={`url(#hi-${uid})`} filter={`url(#blur-${uid})`} />
          <ellipse
            cx={bbox.x + bbox.w * (sh.lightX + 0.06)} cy={bbox.y + bbox.h * 0.46}
            rx={bbox.w * 0.16} ry={bbox.h * 0.12}
            fill={`url(#hi-${uid})`} opacity={0.7} filter={`url(#blur-${uid})`} />
        </g>
      )}

      {/* lip bodies (skin mode): filled volume + sheen, drawn over the skin but
          under the ink seam/contours so the dark mouth line still reads on top. */}
      {skin && (
        <g clipPath={`url(#head-${uid})`}>
          {/* soft shade pooling at the mouth corners — lighter so the mouth
              doesn't read as a downturned frown */}
          {g.mouth.cornerShade.map((c, i) => (
            <circle key={`mc${i}`} cx={c.cx} cy={c.cy} r={c.r * 0.8}
                    fill={skinLo} opacity={0.22} filter={`url(#blurT-${uid})`} />
          ))}
          {g.mouth.upperBody && <path d={g.mouth.upperBody} fill={`url(#ulip-${uid})`} stroke="none" />}
          {g.mouth.lowerBody && <path d={g.mouth.lowerBody} fill={`url(#llip-${uid})`} stroke="none" />}
          {g.mouth.lowerHi && (
            <ellipse cx={g.mouth.lowerHi.cx} cy={g.mouth.lowerHi.cy}
                     rx={g.mouth.lowerHi.rx} ry={g.mouth.lowerHi.ry}
                     fill={`url(#lhi-${uid})`} filter={`url(#blurT-${uid})`} />
          )}
        </g>
      )}

      {/* head silhouette stroke — drawn HERE, before the hair, so the front hair
          (fill + its own ink outline) paints cleanly OVER the skull edge where it
          covers the crown/temples. Drawing it after the hair (the old bug) left a
          skull edge line cutting across the hair. The lower face (jaw/chin/cheeks)
          isn't hair-covered, so its silhouette still reads crisply. The nose/mouth/
          ear/jaw ink stays in the feature group AFTER the hair (it's never under
          hair, and must sit on top of the skin form). */}
      <path d={g.headPath} fill="none" stroke="currentColor"
            strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round"
            mask={g.hairPath && !g.headwear.coversHair ? `url(#headStroke-${uid})` : undefined} />

      {/* hair: flat ink in line-art mode; lit volumetric mass in skin mode. The
          gradient fill gives the crown light + root shadow, then (clipped to the
          hair shape) a soft root/temple shadow, a glossy sheen band, and a few
          flow/strand lines tinted off the seed hairColor sell it as hair, not a
          helmet. The hair's own ink outline rides on top of the head stroke so the
          hairline is crisp and the skull edge never bleeds through the hair. */}
      {g.headwear.coversHair ? null : g.hairPath && skin && g.hairShade ? (
        <>
          <path d={g.hairPath} fill={`url(#hair-${uid})`} stroke="none" />
          <g clipPath={`url(#hairClip-${uid})`}>
            {g.hairShade.rootShadow.map((d, i) => (
              <path key={`hrs${i}`} d={d} fill={hairRoot}
                    opacity={i === 0 ? 0.3 : 0.38} filter={`url(#blur-${uid})`} />
            ))}
            <path d={g.hairShade.sheen} fill={`url(#hairS-${uid})`} filter={`url(#blurS-${uid})`} />
            {/* strands: separated locks flowing from the crown. Alternating lit
                (catching the key) and dark (gaps between locks) strands give the
                mass real strand structure instead of a smooth helmet. Slightly
                crisper now so the locks actually read at thumbnail size. */}
            {g.hairShade.strands.map((s, i) => (
              <path key={`hst${i}`} d={s.d} fill="none"
                    stroke={i % 2 ? hairStrandHi : hairStrandLo}
                    strokeWidth={s.w * (i % 2 ? 1.0 : 1.3)} strokeLinecap="round"
                    opacity={i % 2 ? 0.85 : 0.55} filter={`url(#blurT-${uid})`} />
            ))}
          </g>
          <path d={g.hairPath} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
        </>
      ) : g.hairPath ? (
        <path d={g.hairPath} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />
      ) : null}
      {/* beard sits under the chin, behind the line features */}
      {g.beard && <path d={g.beard} fill={skin ? g.hairColor : 'none'} stroke="currentColor" strokeWidth={stroke} strokeLinejoin="round" />}
      {/* feature ink group — head silhouette is already stroked above (before the
          hair), so this group carries only the facial features that always sit on
          top of the skin form: ears, jaw, nose, mouth, mustache. */}
      <g fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
        {g.ears.map((e, i) => <path key={`ear${i}`} d={e.d} />)}
        {g.jaw.map((j, i) => <path key={`jaw${i}`} d={j.d} strokeWidth={stroke * 0.55} opacity={0.5} />)}
        {/* nose: side contour + alar wings (faint) + columella tick. In skin mode
            the nose reads via soft form (shadow/highlight), so the ink contour is
            lightened to a hint; in line-art it carries the full weight. */}
        <path d={g.nose.d} strokeWidth={stroke * (skin ? 0.62 : 0.9)} opacity={skin ? 0.5 : 0.9} />
        {g.nose.ala.map((d, i) => <path key={`ala${i}`} d={d} strokeWidth={stroke * 0.55} opacity={skin ? 0.4 : 0.7} />)}
        <path d={g.nose.columella} strokeWidth={stroke * 0.5} opacity={skin ? 0.35 : 0.55} />
        {/* mouth seam (the dark vermillion line) + lip contours */}
        <path d={g.mouth.outline} strokeWidth={stroke * 1.05} />
        {g.mouth.upperLip && <path d={g.mouth.upperLip} strokeWidth={stroke * 0.7} opacity={skin ? 0.65 : 1} />}
        {g.mouth.lowerLip && <path d={g.mouth.lowerLip} strokeWidth={stroke * 0.75} opacity={skin ? 0.6 : 1} />}
        {g.mouth.philtrum.map((d, i) => <path key={`ph${i}`} d={d} strokeWidth={stroke * 0.4} opacity={skin ? 0.4 : 0.55} />)}
        {g.mustache && <path d={g.mustache} strokeWidth={stroke * 1.5} />}
      </g>
      {/* ---- eyes + brows: the realism core. Drawn after the head/ink so they sit
            on top. Each eye: shaded sclera, gradient iris tucked under the lid,
            pupil, catchlight, tear duct, lid lines, lash line + lashes. ---- */}
      <g>
        {g.eyes.map((e, i) => {
          const useFill = skin;   // sclera/iris colour only in skin mode; ink mode stays line-art
          return (
            <g key={`eye${i}`}>
              {/* sclera fill (skin mode) */}
              {useFill && <path d={e.d} fill={`url(#scl-${uid}-${i})`} stroke="none" />}
              {/* iris + pupil + catchlight, clipped to the eye opening */}
              <g clipPath={`url(#eye-${uid}-${i})`}>
                {useFill
                  ? <circle cx={e.iris.cx} cy={e.iris.cy} r={e.iris.r} fill={`url(#iris-${uid}-${i})`} />
                  : <circle cx={e.iris.cx} cy={e.iris.cy} r={e.iris.r} fill="none" stroke="currentColor" strokeWidth={stroke * 0.5} />}
                <circle cx={e.pupil.cx} cy={e.pupil.cy} r={e.pupil.r} fill={useFill ? '#120d0a' : 'currentColor'} />
                {/* catchlight: bright spec that sells a wet, living eye. Sized up a
                    touch and paired with a faint lower-right bounce light so the
                    eye stays alive even on the darkest irises/pupils at thumbnail. */}
                <circle cx={e.catch.cx + e.catch.r * 1.6} cy={e.catch.cy + e.catch.r * 1.9}
                        r={Math.max(0.5, e.catch.r * 0.5)} fill="#ffffff" opacity={0.4} />
                <circle cx={e.catch.cx} cy={e.catch.cy} r={e.catch.r * 1.15} fill="#ffffff" opacity={1} />
              </g>
              {/* tear duct (inner canthus) — subtle, skin mode only */}
              {useFill && <circle cx={e.tearDuct.cx} cy={e.tearDuct.cy} r={e.tearDuct.r} fill="#c98e83" opacity={0.7} />}
              {/* eye opening outline */}
              <path d={e.d} fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round" />
              {/* upper lash MASS (women): a soft filled crescent on the top rim
                  that bunches & flicks at the outer corner — a believable lash
                  band at thumbnail size. Falls back to the thick lid line below. */}
              {e.lashMass
                ? <path d={e.lashMass} fill="currentColor" stroke="currentColor" strokeWidth={0.5} strokeLinejoin="round" />
                : <path d={e.upperLidLine} fill="none" stroke="currentColor" strokeWidth={stroke * 1.25} strokeLinecap="round" />}
              {/* upper-lid crease */}
              <path d={e.crease} fill="none" stroke="currentColor" strokeWidth={stroke * 0.5} strokeLinecap="round" opacity={0.5} />
              {/* lower lid */}
              <path d={e.lowerLid} fill="none" stroke="currentColor" strokeWidth={stroke * 0.45} strokeLinecap="round" opacity={0.45} />
              {/* epicanthic fold (region phenotype): a faint medial lid line curving
                  over the inner canthus. Drawn as soft eyelid form, never a hard
                  feature — and entirely independent of the looks axis. */}
              {e.epicanthicFold && (
                <path d={e.epicanthicFold} fill="none" stroke="currentColor"
                      strokeWidth={stroke * 0.5} strokeLinecap="round" opacity={0.5} />
              )}
            </g>
          );
        })}
        {/* lashes */}
        {g.lashes.map((l, i) => (
          <path key={`lash${i}`} d={l.d} fill="none" stroke="currentColor" strokeWidth={l.w ?? stroke}
                strokeLinecap="round" />
        ))}
        {/* brow body: a single tapered filled shape (head -> arch -> fine tail).
            Reads as a real brow at thumbnail size where a stroke bar smudged. */}
        {g.brows.map((b, i) => (
          <path key={`brow${i}`} d={b.d} fill="currentColor" stroke="currentColor"
                strokeWidth={0.6} strokeLinejoin="round" opacity={skin ? 0.92 : 1} />
        ))}
        {/* brow hairs: a light directional texture over the body, not the main form */}
        {g.browHairs.map((h, i) => (
          <path key={`bh${i}`} d={h.d} fill="none" stroke="currentColor" strokeWidth={(h.w ?? 1) * 0.7}
                strokeLinecap="round" opacity={0.45} />
        ))}
      </g>
      {/* filled details — nostrils as slim soft ovals (the long axis tilts toward
          the septum) rather than hard solid dots. Softer in skin mode. */}
      {g.nose.nostrils.map((n, i) => (
        <ellipse key={`nos${i}`} cx={n.cx} cy={n.cy} rx={n.r * 0.85} ry={n.r * 1.25}
                 transform={`rotate(${i === 0 ? 18 : -18} ${n.cx} ${n.cy})`}
                 fill="currentColor" opacity={skin ? 0.62 : 0.85} />
      ))}
      {g.mouth.teeth && <path d={g.mouth.teeth} fill="#fff" stroke="currentColor" strokeWidth={stroke * 0.5} />}
      {g.stubble.length > 0 && <g fill="currentColor" opacity={0.5}>{g.stubble.map((p, i) => <circle key={`st${i}`} cx={p.cx} cy={p.cy} r={p.r} />)}</g>}
      {g.blemishes.map((b, i) => <circle key={`bl${i}`} cx={b.cx} cy={b.cy} r={b.r} fill="currentColor" />)}
      {/* ---- headwear, front layer: the cloth/cap that sits OVER the crown &
            forehead, plus veil, folds, accents, glasses and earrings. Drawn last
            so a garment correctly occludes hair & the upper face, while leaving
            the eyes (and, except for the niqab, nose+mouth) visible. All cloth
            ids are seed-suffixed so the ~19 faces never share a gradient. ---- */}
      <HeadwearFront g={g.headwear} uid={uid} skin={skin} stroke={stroke} />

      {centerline && <line x1={g.centerline.x} y1={g.centerline.y1} x2={g.centerline.x} y2={g.centerline.y2}
                           stroke="currentColor" strokeWidth={1} strokeDasharray="3 4" opacity={0.35} />}
    </svg>
  );
}

// Front-of-head garment layer. Kept as a small component so the FaceImpl JSX
// stays readable. Renders nothing for 'none'/accessory-less pieces.
function HeadwearFront({ g, uid, skin, stroke }: { g: HeadwearGeo; uid: string; skin: boolean; stroke: number }) {
  if (g.kind === 'none') return null;
  const clothFill = skin ? `url(#cloth-${uid})` : 'none';
  return (
    <g>
      {/* cap-style pieces (turban/kufi/beanie/cap): a solid mass over the crown */}
      {g.cap && (
        <path d={g.cap} fill={clothFill} stroke="currentColor"
              strokeWidth={stroke} strokeLinejoin="round" />
      )}
      {/* baseball-cap / beanie brim sits in front of the dome */}
      {g.capBrim && (
        <path d={g.capBrim} fill={skin ? `url(#cloth-${uid})` : 'none'} stroke="currentColor"
              strokeWidth={stroke} strokeLinejoin="round" />
      )}
      {/* draped-scarf front band framing the face (hijab/tichel/niqab). The path
          is an annulus: a second reversed loop carves the face opening, so we use
          the even-odd fill rule and stroke only the outline of the cloth edges. */}
      {g.crownBand && (
        <path d={g.crownBand} fill={clothFill} fillRule="evenodd" stroke="currentColor"
              strokeWidth={stroke} strokeLinejoin="round" />
      )}
      {/* soft inner shadow where cloth meets the face — only in skin mode */}
      {skin && g.frameShade && (
        <path d={g.frameShade} fill={`url(#clothSoft-${uid})`} filter={`url(#clothBlur-${uid})`} />
      )}
      {/* niqab face veil over nose+mouth, eye slot left open */}
      {g.veil && (
        <path d={g.veil} fill={clothFill} stroke="currentColor"
              strokeWidth={stroke} strokeLinejoin="round" />
      )}
      {/* wrap lines / knit ribs / turban folds (light ink texture on the cloth) */}
      {g.wrapLines.map((w, i) => (
        <path key={`hw${i}`} d={w.d} fill="none" stroke="currentColor"
              strokeWidth={w.w ?? 1} strokeLinecap="round" opacity={skin ? 0.32 : 0.55} />
      ))}
      {/* drape folds (soft seams) */}
      {g.folds.map((w, i) => (
        <path key={`hf${i}`} d={w.d} fill="none" stroke="currentColor"
              strokeWidth={w.w ?? 1} strokeLinecap="round" opacity={skin ? 0.28 : 0.5} />
      ))}
      {/* pin / knot accent */}
      {g.accent && (
        <>
          <circle cx={g.accent.cx} cy={g.accent.cy} r={g.accent.r}
                  fill={skin ? g.clothShadow : 'none'} stroke="currentColor" strokeWidth={stroke * 0.8} />
          {skin && (
            <circle cx={g.accent.cx - g.accent.r * 0.3} cy={g.accent.cy - g.accent.r * 0.3}
                    r={Math.max(0.5, g.accent.r * 0.3)} fill={g.clothHi} opacity={0.8} />
          )}
        </>
      )}
      {/* spectacles: lenses (faint glass tint in skin mode), bridge, temple arms */}
      {g.glasses && (
        <g>
          {g.glasses.lenses.map((d, i) => (
            <path key={`gl${i}`} d={d}
                  fill={skin ? '#bcd0d6' : 'none'} fillOpacity={skin ? 0.22 : 1}
                  stroke="currentColor" strokeWidth={stroke * 0.7} strokeLinejoin="round" />
          ))}
          <path d={g.glasses.bridge} fill="none" stroke="currentColor" strokeWidth={stroke * 0.7} strokeLinecap="round" />
          {g.glasses.temples.map((d, i) => (
            <path key={`gt${i}`} d={d} fill="none" stroke="currentColor" strokeWidth={stroke * 0.6} strokeLinecap="round" />
          ))}
        </g>
      )}
      {/* earrings: a hoop or a stud drop at each lobe */}
      {g.earrings && g.earrings.map((e, i) => (
        e.hoop
          ? <circle key={`ee${i}`} cx={e.cx} cy={e.cy + e.r} r={e.r}
                    fill="none" stroke={skin ? g.cloth : 'currentColor'} strokeWidth={stroke * 0.9} />
          : <g key={`ee${i}`}>
              <line x1={e.cx} y1={e.cy} x2={e.cx} y2={e.cy + 1.8} stroke="currentColor" strokeWidth={stroke * 0.5} />
              <circle cx={e.cx} cy={e.cy + 2.8} r={e.r}
                      fill={skin ? g.cloth : 'currentColor'} stroke="currentColor" strokeWidth={stroke * 0.4} />
              {skin && <circle cx={e.cx - e.r * 0.3} cy={e.cy + 2.8 - e.r * 0.3} r={Math.max(0.4, e.r * 0.35)} fill={g.clothHi} opacity={0.9} />}
            </g>
      ))}
    </g>
  );
}
