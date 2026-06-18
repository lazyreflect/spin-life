// Procedural face generator — looks score → facial symmetry & proportion.
//
// Design (see the chat discussion): a single normalized beauty parameter
// t ∈ [0,1] drives everything. At t=1 features mirror perfectly across the
// centerline and snap toward neoclassical canon. At t=0 we lean COMEDIC /
// grotesque: googly mismatched eyes, a bulbous off-center nose, a crooked
// mouth, Dumbo ears, warts. All jitter is seeded so a life's face is
// deterministic from its seed (survives shared permalinks), exactly like the
// rest of the model. Output is plain geometry (path `d` strings + primitive
// specs) so the same builder feeds both this lab and Card.tsx later.
//
// Sex shapes the structure, not just hair: women get a narrower softer jaw,
// higher arched thin brows, fuller lips + a cupid's bow, lashes, and longer
// hair; men get a wider squarer jaw, heavier straighter brows, thinner lips,
// short hair, and (for some seeds) facial hair. Beauty axis is independent of
// these — a man and a woman at looks 9 are both symmetric and canonical.
import { makeRng, hashSeed, clamp } from '../model/stats.js';

export type Sex = 'M' | 'F';

// Modular, optional headwear. The face is always built the same underneath; a
// head piece is a COMPOSABLE LAYER drawn over the head/hair. These are garments
// and accessories from cultures across the global cast — implemented to sit
// correctly over the skull, never tied to looks or attractiveness, and never
// altering the facial features themselves. 'auto' picks a sensible per-seed
// default (usually none); 'none' forces a bare head.
//   hijab     — headscarf covering hair, neck, shoulders; face open
//   niqab     — hijab + face veil, eyes visible
//   turban    — Sikh dastar (wrapped, peaked) — typically male
//   kufi      — small rounded skullcap (taqiyah/kufi)
//   tichel    — tied headscarf / mitpachat, hair covered, face & some nape open
//   cap       — secular baseball cap with a brim
//   beanie    — secular knit beanie
//   glasses   — secular spectacles (composes with any of the above)
//   earrings  — secular ear studs/hoops (composes with any of the above)
export type Headwear =
  | 'auto' | 'none'
  | 'hijab' | 'niqab' | 'turban' | 'kufi' | 'tichel'
  | 'cap' | 'beanie' | 'glasses' | 'earrings';

// The selectable list the lab cycles through (excludes 'auto', which resolves to
// one of these per seed). Order groups cultural garments then secular options.
export const HEADWEAR_OPTIONS: Headwear[] = [
  'none', 'hijab', 'niqab', 'tichel', 'turban', 'kufi', 'beanie', 'cap', 'glasses', 'earrings',
];

// ============================================================================
// ANCESTRY / GEOGRAPHIC REGION — phenotype distributions
// ----------------------------------------------------------------------------
// The game's cast is drawn from every country on earth. To represent that cast
// respectfully we model phenotype (skin tone, hair colour + TEXTURE, and soft
// tendencies for facial dimensions) as DISTRIBUTIONS per broad geographic
// ancestry region, sampled per-individual with the existing seeded RNG.
//
// TAXONOMY (deliberately broad, overlapping, non-exhaustive — these are clines,
// not rigid boxes; real humans vary continuously and regions share enormous
// overlap). Granularity is chosen to be useful for art variety without implying
// false precision or "racial type" essentialism. Sub-Saharan Africa — the most
// internally diverse region on earth — is split so its real range shows.
//
//   eastAsian      — China, Korea, Japan, Mongolia
//   southeastAsian — Vietnam, Thailand, Philippines, Indonesia, Malaysia
//   southAsian     — India, Pakistan, Bangladesh, Sri Lanka, Nepal
//   centralWestAsian — Middle East, Iran, Anatolia, Caucasus, Central Asia
//   european       — Europe (north→south cline), incl. diaspora
//   northAfrican   — Maghreb, Nile valley, Horn fringe
//   westAfrican    — West/Central Sub-Saharan Africa
//   eastAfrican    — East Africa / Horn (taller, narrower features common)
//   southernAfrican — Southern Africa, incl. Khoisan-range variation
//   pacific        — Melanesia, Polynesia, Micronesia, Aboriginal Australian
//   indigenousAmerican — Indigenous peoples of the Americas
//
// NOTE: every field below is a RANGE or PROBABILITY. No region is a single face.
// Two seeds in the same region draw different individuals; regions overlap on
// shared human ranges. Phenotype is 100% independent of the looks/beauty axis.
export type Region =
  | 'eastAsian' | 'southeastAsian' | 'southAsian' | 'centralWestAsian'
  | 'european' | 'northAfrican'
  | 'westAfrican' | 'eastAfrican' | 'southernAfrican'
  | 'pacific' | 'indigenousAmerican';

// Selectable list the lab cycles through (also the pool 'auto' draws from).
export const REGION_OPTIONS: Region[] = [
  'eastAsian', 'southeastAsian', 'southAsian', 'centralWestAsian',
  'european', 'northAfrican',
  'westAfrican', 'eastAfrican', 'southernAfrican',
  'pacific', 'indigenousAmerican',
];

// Hair texture as a continuum (Andre Walker-ish 1→4, expressed 0..1): straight,
// wavy, curly, coiled. Real populations span the whole range; regions only shift
// the CENTRE of the distribution, never lock a single value.
export type HairTexture = 'straight' | 'wavy' | 'curly' | 'coiled';

export interface FaceParams {
  looks: number;            // raw looks score
  sex: Sex;
  seed: string | number;    // life seed (deterministic)
  range?: [number, number]; // looks scale, defaults to the app's LOOKS_RANGE
  hair?: boolean;
  headwear?: Headwear;      // optional head piece; defaults to 'auto'
  region?: Region | 'auto'; // ancestry/region; 'auto' = deterministic from seed
}

export interface Stroke { d: string; w?: number; }

// The resolved per-individual phenotype: a single deterministic draw from the
// region's distributions. Exposed on FaceGeo so the renderer and lab can read it
// (e.g. to label hair texture). NONE of these values touch the looks axis.
export interface Phenotype {
  region: Region;
  hairTexture: HairTexture;   // bucketed for labels…
  texture01: number;          // …and continuous 0..1 (0 straight → 1 coiled) for geometry
  epicanthic: number;         // 0..1 presence/strength of the epicanthic fold
}

export interface FaceGeo {
  t: number;                // normalized beauty 0..1
  cx: number;
  sex: Sex;
  skinColor: string;
  hairColor: string;
  phenotype: Phenotype;     // resolved ancestry phenotype (region + sampled traits)
  headPath: string;
  neckPath: string;          // neck + shoulder hint, drawn behind the head
  shading: {                 // 3D form cues (used when skin fill is on)
    lightX: number; lightY: number;   // highlight focus, normalized 0..1 within head bbox
    bbox: { x: number; y: number; w: number; h: number };
    cheekHollow: { d: string }[];     // soft plane shadows L/R under cheekbone
    cheekStrength: number;            // how dark the cheek hollow paints (0..1)
    templeShade: { d: string }[];     // temple/side-of-forehead falloff L/R
    jawShade: string;                 // under-jaw / submental core shadow
    noseShade: string;                // side-of-nose + under-tip shadow
  };
  hairPath: string | null;
  hairBackPath: string | null;
  hairShade: {                 // 3D form for the hair mass (used in skin mode)
    crown: { cx: number; cy: number; r: number };   // light anchor on the crown
    rootShadow: string[];      // soft core-shadow lobes at the hairline/temples
    sheen: string;             // glossy highlight band sweeping over the crown
    strands: { d: string; w: number }[];   // flow/strand lines following the style
    bbox: { x: number; y: number; w: number; h: number };  // hair extent (for gradient)
  } | null;
  ears: Stroke[];
  brows: Stroke[];
  browHairs: Stroke[];      // short directional hairs over each brow (skin mode)
  lashes: Stroke[];
  eyes: {
    d: string;                                  // eye-opening (almond) outline
    pupil: { cx: number; cy: number; r: number };
    iris: { cx: number; cy: number; r: number };
    catch: { cx: number; cy: number; r: number };   // specular catchlight
    crease: string;                             // upper-lid crease arc
    lowerLid: string;                           // lower waterline / lid arc
    upperLidLine: string;                       // thick lash-line along the top
    tearDuct: { cx: number; cy: number; r: number };
    lashMass: string | null;                    // filled upper-lash crescent (women)
    epicanthicFold: string | null;              // medial fold over the inner canthus (region phenotype)
    ex: number; ey: number; rx: number; ry: number;
  }[];
  nose: {
    d: string;                                  // bridge -> tip contour (ink)
    nostrils: { cx: number; cy: number; r: number }[];
    ala: string[];                              // L/R alar wing contours (ink, faint)
    bridgeHi: string;                           // bridge highlight ridge (skin)
    ballHi: { cx: number; cy: number; r: number };   // specular on the ball/tip
    sideShade: string[];                        // L/R side-of-bridge core shadow (skin)
    underShade: string;                         // cast shadow under the tip (skin)
    columella: string;                          // little septum tick between nostrils (ink)
  };
  mouth: {
    outline: string;
    upperLip: string | null;
    lowerLip: string | null;
    teeth: string | null;
    upperBody: string | null;                   // filled upper-lip volume (skin)
    lowerBody: string | null;                   // filled lower-lip volume (skin)
    lowerHi: { cx: number; cy: number; rx: number; ry: number } | null;  // soft lower-lip sheen
    philtrum: string[];                         // two philtrum ridge lines under the nose
    cornerShade: { cx: number; cy: number; r: number }[];   // soft shade pooling at the corners
    vermillion: string;                         // crisp lip-seam line (the dark mouth line)
    lipFill: string;                            // base lip tint colour
  };
  beard: string | null;
  mustache: string | null;
  stubble: { cx: number; cy: number; r: number }[];
  blemishes: { cx: number; cy: number; r: number }[];
  jaw: Stroke[];            // cheekbone/jaw definition lines (beauty cue)
  centerline: { x: number; y1: number; y2: number };
  headwear: HeadwearGeo;    // resolved head piece (kind 'none' => nothing drawn)
}

// Geometry for a single resolved head piece. Every garment is a stack of layers
// the renderer paints in z-order. Cloth pieces (hijab/tichel/niqab) drape BEHIND
// the head silhouette (covering hair & framing the face); caps/turbans/kufi sit
// ON TOP of the crown. `coversHair` tells the renderer to suppress the hair pass
// so cloth doesn't fight loose strands underneath. Accessories (glasses/earrings)
// carry their own small fields and compose with anything.
export interface HeadwearGeo {
  kind: Headwear;
  coversHair: boolean;
  // main draped/wrapped cloth body, behind the head (hijab/tichel/niqab veil)
  drape: string | null;
  // the part of the cloth that sits OVER the brow/crown (in front of the head)
  crownBand: string | null;
  // a soft inner-shadow band where cloth meets the face (frames it)
  frameShade: string | null;
  // structured caps drawn over the crown: kufi dome, turban wrap, beanie, cap
  cap: string | null;
  capBrim: string | null;        // baseball-cap brim (cap only)
  // wrap lines / folds drawn as strokes over the cap (turban folds, beanie ribs)
  wrapLines: Stroke[];
  // niqab face veil (covers nose & mouth, leaves an eye slot)
  veil: string | null;
  // fold/seam accents on the drape (gives cloth believable weight)
  folds: Stroke[];
  // a pin/brooch or knot accent (tichel knot, hijab pin)
  accent: { cx: number; cy: number; r: number } | null;
  // spectacles: two lens paths + a bridge + two temple arms
  glasses: { lenses: string[]; bridge: string; temples: string[] } | null;
  // earrings: a small drop per ear (cx,cy = lobe, r = stud/hoop radius)
  earrings: { cx: number; cy: number; r: number; hoop: boolean }[] | null;
  // base cloth colour (deterministic per seed); accents derive from it
  cloth: string;
  clothShadow: string;
  clothHi: string;
}

const DEFAULT_RANGE: [number, number] = [1.5, 9];
// Legacy flat palettes — retained as a fallback only. Region phenotype now drives
// skin & hair colour (see SKIN_STOPS / HAIR_STOPS + samplePhenotype below).
const SKIN = ['#F2C9A0', '#E8B48C', '#D69B72', '#B57B52', '#8C5A3A', '#F7D7B5'];
const HAIR = ['#2B2118', '#4A3525', '#6B4A2E', '#A9712F', '#86827E', '#1A1A1A'];

// ============================================================================
// PHENOTYPE DISTRIBUTIONS BY REGION
// ----------------------------------------------------------------------------
// Skin is modelled as a continuous tone ladder (a perceptual line through real
// human skin colours, light → deep). Each region samples a RANGE [lo,hi] on that
// ladder (0..1); we interpolate the ladder to a hex so no two draws need to land
// on a fixed swatch. This is grounded in the real distribution of constitutive
// skin pigmentation (which tracks ancestral UV exposure, NOT geography per se,
// hence broad overlapping ranges — e.g. South Asia and the Sahel both span very
// wide; Europe spans pale→olive; East Asia light→tan).
//
// SKIN_STOPS: the shared tone ladder, light (0) → deep (1). Warm undertones
// throughout because real skin is warm; the renderer adds its own shading.
const SKIN_STOPS = [
  '#FCE8D6', // 0.00 very fair (rosy/cool-fair)
  '#F4D2B6', // 0.14 fair
  '#E8B48C', // 0.28 light tan
  '#D69B72', // 0.42 olive / tan
  '#BD8158', // 0.56 light brown
  '#9C6440', // 0.70 brown
  '#7A4B2E', // 0.84 deep brown
  '#583620', // 1.00 very deep
];
// HAIR_STOPS: hair colour by a single "lightness/eumelanin" axis, dark (0) →
// light (1), with a separate red flag handled in the sampler. Most of humanity
// is in the dark half; blond/light hair is a regional minority trait.
const HAIR_STOPS = [
  '#0B0A09', // 0.00 black
  '#1C1612', // 0.14 near-black / soft black
  '#2E2018', // 0.28 dark brown
  '#4A3525', // 0.42 brown
  '#6B4A2E', // 0.56 medium brown
  '#8A6238', // 0.70 light brown
  '#B08648', // 0.84 dark blond
  '#D8B36A', // 1.00 blond
];
const HAIR_RED = '#7A3B22';   // auburn/red end, mixed in when the red flag fires
const HAIR_GREY = '#9A958C';  // (ageing not modelled here; kept for completeness)

// linear interp through a hex stop ladder at u∈[0,1]
function ladder(stops: string[], u: number): string {
  const x = clamp(u, 0, 1) * (stops.length - 1);
  const i = Math.min(stops.length - 2, Math.floor(x));
  const f = x - i;
  const pa = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
  const [r1, g1, b1] = pa(stops[i]), [r2, g2, b2] = pa(stops[i + 1]);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(r1 + (r2 - r1) * f), g = cl(g1 + (g2 - g1) * f), b = cl(b1 + (b2 - b1) * f);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

// A region profile: ranges (sampled per individual) + soft FEATURE BIAS nudges.
// Every numeric here is a small, believable shift applied on top of the existing
// sex/looks geometry — never a hard override, so individuals still vary widely
// and regions overlap. Biases are in the same units the geometry already uses
// (px or signed fractions); they are intentionally gentle (no caricature).
interface RegionProfile {
  skin: [number, number];        // skin-ladder range [lo,hi]
  hairLight: [number, number];   // hair-ladder range [lo,hi]
  redP: number;                  // P(auburn/red mixed in)
  greyP?: number;                // unused (ageing not modelled) — kept 0
  // hair texture distribution: mean & spread on 0..1 (0 straight → 1 coiled)
  texMean: number; texSpread: number;
  // epicanthic fold strength: mean & spread 0..1 (eyelid form, not "slanted eyes")
  epiMean: number; epiSpread: number;
  // facial-dimension tendencies. These are CENTRES of per-individual distributions
  // (the seed scatters each draw around its region mean, with overlap across
  // regions), expressed in the geometry's own units (px or signed fractions). They
  // are deliberately SIZED to read at thumbnail scale — several px on the 200-wide
  // face — grounded in documented population variation, never pushed to caricature.
  noseW: number;                 // nasal width bias (alar + tip ball) px
  noseBridge: number;            // bridge height/projection bias px (− lower/flatter)
  lipFull: number;               // lip fullness bias px (added to upper+lower)
  lipEvert: number;              // lip eversion 0..1 (everted/protruding vermillion)
  faceW: number;                 // face width bias px
  faceLong: number;              // face length bias px (+ longer, − shorter/rounder)
  cheekBone: number;             // zygomatic (cheekbone) prominence bias px
  jawSquare: number;             // jaw squareness bias 0..1 add to gonial flare
  browProminence: number;        // brow-ridge prominence bias px
  eyeAlmond: number;             // eye-roundness bias (− = more almond/narrow)
  eyeSpacing: number;            // inter-eye spacing bias px (+ wider-set)
  canthalTilt: number;           // outer-corner lift / palpebral tilt 0..1 (+ up)
}

// Centres of distributions grounded in documented phenotypic ranges. These are
// MEANS the seed scatters around — not descriptions of any individual. Where a
// region is highly variable (South Asia, the Sahel, the Pacific) the ranges are
// deliberately wide so the draw covers the real spread.
const REGION_PROFILES: Record<Region, RegionProfile> = {
  eastAsian: {
    skin: [0.10, 0.45], hairLight: [0.0, 0.20], redP: 0.0,
    texMean: 0.10, texSpread: 0.16, epiMean: 0.80, epiSpread: 0.20,
    noseW: -1.6, noseBridge: -4.5, lipFull: -0.4, lipEvert: 0.10,
    faceW: 4.5, faceLong: -3.0, cheekBone: 4.0,
    jawSquare: 0.06, browProminence: -2.0, eyeAlmond: -0.16,
    eyeSpacing: 1.6, canthalTilt: 0.55,
  },
  southeastAsian: {
    skin: [0.24, 0.58], hairLight: [0.0, 0.16], redP: 0.0,
    texMean: 0.20, texSpread: 0.22, epiMean: 0.60, epiSpread: 0.28,
    noseW: 1.4, noseBridge: -4.0, lipFull: 1.4, lipEvert: 0.22,
    faceW: 2.4, faceLong: -2.0, cheekBone: 2.6,
    jawSquare: 0.02, browProminence: -1.6, eyeAlmond: -0.08,
    eyeSpacing: 1.2, canthalTilt: 0.40,
  },
  southAsian: {
    skin: [0.30, 0.80], hairLight: [0.0, 0.22], redP: 0.0,
    texMean: 0.34, texSpread: 0.30, epiMean: 0.10, epiSpread: 0.16,
    noseW: -0.2, noseBridge: 2.2, lipFull: 1.2, lipEvert: 0.20,
    faceW: -1.0, faceLong: 1.5, cheekBone: -0.5,
    jawSquare: 0.0, browProminence: 1.6, eyeAlmond: 0.04,
    eyeSpacing: -0.6, canthalTilt: 0.15,
  },
  centralWestAsian: {
    skin: [0.18, 0.58], hairLight: [0.04, 0.40], redP: 0.04,
    texMean: 0.38, texSpread: 0.28, epiMean: 0.05, epiSpread: 0.10,
    noseW: 0.6, noseBridge: 5.0, lipFull: 0.6, lipEvert: 0.12,
    faceW: 0.0, faceLong: 2.0, cheekBone: 0.5,
    jawSquare: 0.03, browProminence: 3.0, eyeAlmond: 0.02,
    eyeSpacing: -0.8, canthalTilt: -0.05,
  },
  european: {
    skin: [0.02, 0.40], hairLight: [0.10, 0.95], redP: 0.06,
    texMean: 0.28, texSpread: 0.26, epiMean: 0.02, epiSpread: 0.06,
    noseW: -1.6, noseBridge: 3.5, lipFull: -1.2, lipEvert: 0.0,
    faceW: -1.0, faceLong: 2.5, cheekBone: -1.5,
    jawSquare: 0.03, browProminence: 1.4, eyeAlmond: 0.08,
    eyeSpacing: -1.4, canthalTilt: 0.05,
  },
  northAfrican: {
    skin: [0.22, 0.62], hairLight: [0.0, 0.30], redP: 0.03,
    texMean: 0.42, texSpread: 0.30, epiMean: 0.04, epiSpread: 0.08,
    noseW: 0.8, noseBridge: 3.0, lipFull: 1.0, lipEvert: 0.18,
    faceW: -0.5, faceLong: 1.5, cheekBone: 0.5,
    jawSquare: 0.0, browProminence: 1.8, eyeAlmond: 0.02,
    eyeSpacing: -0.8, canthalTilt: 0.10,
  },
  westAfrican: {
    skin: [0.62, 1.0], hairLight: [0.0, 0.10], redP: 0.0,
    texMean: 0.90, texSpread: 0.14, epiMean: 0.04, epiSpread: 0.08,
    noseW: 5.0, noseBridge: -4.0, lipFull: 5.0, lipEvert: 0.85,
    faceW: 1.5, faceLong: -1.0, cheekBone: 1.0,
    jawSquare: 0.05, browProminence: 1.0, eyeAlmond: 0.12,
    eyeSpacing: 1.0, canthalTilt: 0.10,
  },
  eastAfrican: {
    skin: [0.50, 0.92], hairLight: [0.0, 0.12], redP: 0.0,
    texMean: 0.84, texSpread: 0.18, epiMean: 0.04, epiSpread: 0.08,
    noseW: 1.4, noseBridge: 1.0, lipFull: 3.2, lipEvert: 0.55,
    faceW: -2.5, faceLong: 3.5, cheekBone: 1.5,
    jawSquare: 0.0, browProminence: 0.8, eyeAlmond: 0.08,
    eyeSpacing: -0.5, canthalTilt: 0.12,
  },
  southernAfrican: {
    skin: [0.44, 0.88], hairLight: [0.0, 0.12], redP: 0.0,
    texMean: 0.92, texSpread: 0.14, epiMean: 0.18, epiSpread: 0.22,
    noseW: 3.0, noseBridge: -3.0, lipFull: 3.0, lipEvert: 0.55,
    faceW: 2.0, faceLong: -2.0, cheekBone: 4.5,
    jawSquare: 0.0, browProminence: 0.5, eyeAlmond: 0.06,
    eyeSpacing: 1.4, canthalTilt: 0.25,
  },
  pacific: {
    skin: [0.40, 0.90], hairLight: [0.0, 0.18], redP: 0.02,
    texMean: 0.62, texSpread: 0.30, epiMean: 0.14, epiSpread: 0.22,
    noseW: 3.2, noseBridge: 0.5, lipFull: 3.4, lipEvert: 0.50,
    faceW: 2.8, faceLong: 0.0, cheekBone: 2.0,
    jawSquare: 0.05, browProminence: 2.0, eyeAlmond: 0.06,
    eyeSpacing: 1.2, canthalTilt: 0.10,
  },
  indigenousAmerican: {
    skin: [0.26, 0.62], hairLight: [0.0, 0.12], redP: 0.0,
    texMean: 0.10, texSpread: 0.14, epiMean: 0.32, epiSpread: 0.26,
    noseW: 1.6, noseBridge: 3.5, lipFull: 1.0, lipEvert: 0.20,
    faceW: 3.0, faceLong: -0.5, cheekBone: 5.0,
    jawSquare: 0.04, browProminence: 2.2, eyeAlmond: -0.04,
    eyeSpacing: 0.8, canthalTilt: 0.20,
  },
};

const TEXTURE_LABEL = (u: number): HairTexture =>
  u < 0.25 ? 'straight' : u < 0.5 ? 'wavy' : u < 0.78 ? 'curly' : 'coiled';

// Resolve 'auto' region deterministically from the seed. The pool is uniform
// over REGION_OPTIONS — a representation knob, NOT weighted by anything to do
// with looks. (A game wiring real demographics can pass an explicit region.)
function resolveRegion(want: Region | 'auto', seed32: number): Region {
  if (want !== 'auto') return want;
  return REGION_OPTIONS[(seed32 >>> 19) % REGION_OPTIONS.length];
}

// Sample one individual's phenotype from the region's distributions, using an
// INDEPENDENT RNG stream (seeded off the seed with a distinct constant) so that:
//  • phenotype is fully reproducible from the seed, and
//  • phenotype draws never perturb the looks-driven geometry RNG order (the two
//    streams don't share state) — guaranteeing orthogonality.
// `prng` is that independent stream. Returns colours + a resolved Phenotype.
function samplePhenotype(region: Region, prng: () => number): {
  skinColor: string; hairColor: string; pheno: Phenotype;
  bias: RegionProfile;   // the profile, for the geometry biases
} {
  const p = REGION_PROFILES[region];
  const pn = prng() * 2 - 1, pn2 = prng() * 2 - 1;   // two noise draws
  // skin: a triangular-ish draw within the region range (mean-biased)
  const su = (p.skin[0] + p.skin[1]) / 2 + (p.skin[1] - p.skin[0]) * 0.5 * pn;
  const skinColor = ladder(SKIN_STOPS, su);
  // hair lightness within range; then maybe push toward red/auburn
  const hu = (p.hairLight[0] + p.hairLight[1]) / 2 + (p.hairLight[1] - p.hairLight[0]) * 0.5 * pn2;
  let hairColor = ladder(HAIR_STOPS, hu);
  if (prng() < p.redP) {
    // mix the drawn tone toward auburn (keeps it believable, not crayon-red)
    const pa = (h: string) => { const n = parseInt(h.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; };
    const [r1, g1, b1] = pa(hairColor), [r2, g2, b2] = pa(HAIR_RED);
    const a = 0.55, cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
    hairColor = `#${((1 << 24) | (cl(r1 + (r2 - r1) * a) << 16) | (cl(g1 + (g2 - g1) * a) << 8) | cl(b1 + (b2 - b1) * a)).toString(16).slice(1)}`;
  }
  // hair texture: gaussian-ish around the region mean, clamped to [0,1]
  const tnoise = (prng() + prng() + prng() - 1.5) / 1.5;   // ~N(0,~0.4)
  const texture01 = clamp(p.texMean + tnoise * p.texSpread, 0, 1);
  // epicanthic fold strength around the region mean
  const enoise = (prng() + prng() - 1);
  const epicanthic = clamp(p.epiMean + enoise * p.epiSpread, 0, 1);

  // ---- PER-INDIVIDUAL STRUCTURAL SCATTER --------------------------------
  // The REGION_PROFILES values above are distribution CENTRES, not templates.
  // Without scatter, every individual in a region would share identical bone
  // structure (a rigid bucket). Here we draw, from the SAME independent
  // phenotype RNG (so looks stays decoupled), a fresh Gaussian-ish offset for
  // each structural field and add it to the region mean. Spreads are chosen so
  // that (a) two same-region seeds visibly differ, (b) the tails of adjacent
  // regions OVERLAP (shared human range — no rigid groups), and (c) the draw
  // never runs away into caricature (each field is clamped to a believable
  // band). ~N(0, ~0.4) per gaussian() call; spread is the 1-sigma magnitude.
  const gaussian = () => (prng() + prng() + prng() - 1.5) / 1.5;   // ~N(0, ~0.4)
  const j = (mean: number, spread: number, lo: number, hi: number) =>
    clamp(mean + gaussian() * spread, lo, hi);
  const bias: RegionProfile = {
    ...p,
    // nasal width: ±~1.6px individual scatter; clamped to the full human band.
    noseW: j(p.noseW, 1.8, -4.0, 6.5),
    // bridge projection: tall vs flat varies a lot within every population.
    noseBridge: j(p.noseBridge, 1.8, -6.0, 7.0),
    // lip fullness + eversion scatter together-ish but drawn independently.
    lipFull: j(p.lipFull, 1.4, -2.5, 6.5),
    lipEvert: j(p.lipEvert, 0.16, 0, 1),
    // overall face width and length.
    faceW: j(p.faceW, 1.6, -4.0, 6.0),
    faceLong: j(p.faceLong, 1.8, -4.5, 5.0),
    // zygomatic prominence — high individual variance everywhere.
    cheekBone: j(p.cheekBone, 1.6, -2.0, 6.5),
    jawSquare: j(p.jawSquare, 0.025, 0, 0.14),
    browProminence: j(p.browProminence, 1.0, -2.5, 5.0),
    eyeAlmond: j(p.eyeAlmond, 0.06, -0.22, 0.20),
    eyeSpacing: j(p.eyeSpacing, 1.1, -3.0, 3.0),
    canthalTilt: j(p.canthalTilt, 0.12, -0.20, 0.70),
  };

  return {
    skinColor, hairColor,
    pheno: { region, hairTexture: TEXTURE_LABEL(texture01), texture01, epicanthic },
    bias,
  };
}

const f2 = (x: number) => x.toFixed(2);
// multiply a #rrggbb hex by k (k<1 darker, k>1 lighter). Local copy so facegen
// can pre-derive cloth shadow/highlight tones without importing the renderer.
function shade(hex: string, k: number): string {
  if (!hex || hex[0] !== '#') hex = '#808080';
  const n = parseInt(hex.slice(1), 16);
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const r = cl(((n >> 16) & 255) * k), g = cl(((n >> 8) & 255) * k), b = cl((n & 255) * k);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}
// classic smoothstep on [0,1] — eases both ends. Used to round the jaw/chin
// taper so width settles into a curve instead of spiking to a point.
const smoothstep01 = (u: number) => { const x = clamp(u, 0, 1); return x * x * (3 - 2 * x); };

// Catmull-Rom through points -> smooth closed bezier path. Used for the head so
// low-looks faces can be lumpy and high-looks faces a clean oval, same code.
function closedSpline(pts: [number, number][]): string {
  const n = pts.length;
  let d = `M ${f2(pts[0][0])} ${f2(pts[0][1])}`;
  for (let i = 0; i < n; i++) {
    const p0 = pts[(i - 1 + n) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
    const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
    const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
    d += ` C ${f2(c1x)} ${f2(c1y)}, ${f2(c2x)} ${f2(c2y)}, ${f2(p2[0])} ${f2(p2[1])}`;
  }
  return d + ' Z';
}

// Almond/lens eye centered at (ex,ey) — ry/rx controls roundness (round=googly).
// `innerDy`/`outerDy` shift the medial/lateral corners vertically to express the
// palpebral (canthal) tilt: a negative outerDy lifts the outer corner. `side` is
// -1 for the left eye (outer corner on the −x side) and +1 for the right.
function almond(
  ex: number, ey: number, rx: number, ry: number,
  side = 1, innerDy = 0, outerDy = 0,
): string {
  // inner corner is on the −side*x side; outer on the +side*x side.
  const lDy = side < 0 ? outerDy : innerDy;   // corner at ex−rx
  const rDy = side < 0 ? innerDy : outerDy;   // corner at ex+rx
  const lY = ey + lDy, rY = ey + rDy;
  // mid heights track the average tilt so the lids stay smooth across the lift.
  const upMid = ey - ry + (lDy + rDy) / 2;
  const loMid = ey + ry + (lDy + rDy) / 2;
  return `M ${f2(ex - rx)} ${f2(lY)} C ${f2(ex - rx / 2)} ${f2(upMid)}, ${f2(ex + rx / 2)} ${f2(upMid)}, ${f2(ex + rx)} ${f2(rY)}`
    + ` C ${f2(ex + rx / 2)} ${f2(loMid)}, ${f2(ex - rx / 2)} ${f2(loMid)}, ${f2(ex - rx)} ${f2(lY)} Z`;
}

interface HeadMetrics { cx: number; cy: number; hw: number; hh: number; eyeY: number; top: number; }

// Seed-chosen hairstyle. Returns front (over the crown, drawn after the head)
// and an optional back lobe (drawn behind the head, for long styles).
// `tex` ∈ [0,1] (0 straight → 1 coiled). Coiled/curly hair stands OFF the head
// with more rounded volume (afro-like) and pushes the silhouette out at the sides
// and crown; straight hair lies flatter. This shapes the silhouette only; strand
// flow lines (built later in buildFace) carry the wave/coil texture itself.
function buildHair(sex: Sex, style: number, m: HeadMetrics, tex = 0.3): { front: string; back: string | null } {
  const { cx, cy, hw, hh, top } = m;
  const fy = m.eyeY - 21;            // forehead hairline baseline (above the brows)
  const lx = cx - hw - 1, rx = cx + hw + 1;
  // texture volume: coiled/curly hair stands OFF the skull with rounded, springy
  // body; straight hair lies flat. `vol` eases in so only genuinely textured hair
  // puffs, then ramps hard at the coiled end so a kinky/coily silhouette actually
  // READS at thumbnail size (the earlier curve was too timid — coiled hair looked
  // like a flat bob). This is the headline cue that hair texture varies by person.
  const vol = Math.pow(tex, 1.6);   // 0 straight → ~1 coiled, eased
  // `puff` is the extra rounded body curly/coiled hair carries past the face and
  // over the crown. Drives both the side wing and the crown dome below.
  const puff = vol;
  // crown lift: coiled hair domes well above the skull; straight hair barely.
  const cap = top - 18 - puff * 24; // coiled hair stands much taller off the crown
  const wing = hw + 4 + puff * 18;  // and rounds out well past the face at the sides
  // how much the long female fall is drawn UP into rounded body instead of hanging
  // straight: coiled hair reads as voluminous shape, not long straight curtains.
  const liftFall = puff;            // 0 = full straight fall, 1 = pulled up into a dome

  // ---- coiled / curly natural-hair silhouette --------------------------------
  // For genuinely curly→coiled hair (high tex), straight bob/crop outlines are
  // wrong AND erasing: the hair should read as rounded, voluminous body framing
  // the face, not a sleek helmet. Above a threshold we replace the styled outline
  // with a soft rounded halo whose radius grows with texture. The edge is gently
  // lobed (seeded by `style` so it isn't a perfect circle) — believable body, not
  // caricature. Strand ripples (built later) carry the coil texture on top.
  if (tex >= 0.55) {
    const t01 = (tex - 0.55) / 0.45;              // 0 at curly → 1 at fully coiled
    const F2sex = sex === 'F';
    // halo radius: how far the hair stands off the skull all around.
    const radX = hw + 6 + t01 * (F2sex ? 18 : 13);
    const crownY = top - (F2sex ? 16 : 10) - t01 * (F2sex ? 22 : 16);   // dome height
    // how far down the sides the rounded mass comes (frames the cheeks; longer
    // for women's fuller styles, cropped close for men).
    const sideY = F2sex ? cy + hh * (0.30 + 0.18 * (style === 0 ? 1 : 0)) : cy - hh * 0.05;
    // small seeded lobes so the outline reads as springy body, not a balloon.
    const lobe = 2 + t01 * 3;
    const lx2 = cx - radX, rx2 = cx + radX;
    // front cap: rounded dome over the crown, dipping to the hairline at the temples.
    const front =
      `M ${f2(lx2)} ${f2(fy + 8)}`
      + ` C ${f2(lx2 - lobe)} ${f2((fy + crownY) / 2)} ${f2(cx - radX * 0.7)} ${f2(crownY)} ${f2(cx)} ${f2(crownY)}`
      + ` C ${f2(cx + radX * 0.7)} ${f2(crownY)} ${f2(rx2 + lobe)} ${f2((fy + crownY) / 2)} ${f2(rx2)} ${f2(fy + 8)}`
      // dip down to the forehead hairline (rounded, no hard part)
      + ` C ${f2(cx + hw * 0.5)} ${f2(fy - 4)} ${f2(cx + hw * 0.22)} ${f2(fy + 2)} ${f2(cx)} ${f2(fy + 2)}`
      + ` C ${f2(cx - hw * 0.22)} ${f2(fy + 2)} ${f2(cx - hw * 0.5)} ${f2(fy - 4)} ${f2(lx2)} ${f2(fy + 8)} Z`;
    // back lobe: the rounded mass that frames the face down the sides.
    const back =
      `M ${f2(lx2)} ${f2(fy + 8)}`
      + ` C ${f2(lx2 - lobe)} ${f2(cy)} ${f2(lx2 + lobe)} ${f2(sideY - 8)} ${f2(cx - hw * 0.72)} ${f2(sideY)}`
      + ` Q ${f2(cx)} ${f2(sideY + 4)} ${f2(cx + hw * 0.72)} ${f2(sideY)}`
      + ` C ${f2(rx2 - lobe)} ${f2(sideY - 8)} ${f2(rx2 + lobe)} ${f2(cy)} ${f2(rx2)} ${f2(fy + 8)} Z`;
    return { front, back };
  }

  if (sex === 'F') {
    if (style === 0) {               // long centre part (straight) → rounded halo (coiled)
      // The fall ends higher and tucks IN as texture rises, so coiled hair reads as
      // a voluminous rounded shape rather than long straight curtains.
      const fallY = cy + hh * (1.14 - 0.5 * liftFall);
      const fallX = hw * (0.5 + 0.7 * liftFall);     // wider, rounder base when coiled
      const sideBow = 13 + puff * 14;                // bow the sides out into body
      const back = `M ${f2(lx - 2)} ${f2(fy + 6)} C ${f2(lx - sideBow)} ${f2(cy)} ${f2(lx - sideBow * 0.6)} ${f2(cy + hh * 0.92)} ${f2(cx - fallX)} ${f2(fallY)}`
        + ` Q ${f2(cx)} ${f2(fallY + 6 * (1 - liftFall))} ${f2(cx + fallX)} ${f2(fallY)} C ${f2(rx + sideBow * 0.6)} ${f2(cy + hh * 0.92)} ${f2(rx + sideBow)} ${f2(cy)} ${f2(rx + 2)} ${f2(fy + 6)} Z`;
      // front cap: a deeper centre dip for straight hair (a clear part); coiled hair
      // closes the part into a fuller, rounder crown with little/no centre dip.
      const dip = (1 - liftFall);
      const front = `M ${f2(cx - wing)} ${f2(fy + 12)} C ${f2(cx - wing - 1)} ${f2(cap + 14)} ${f2(cx - 18)} ${f2(cap)} ${f2(cx)} ${f2(cap)}`
        + ` C ${f2(cx + 18)} ${f2(cap)} ${f2(cx + wing + 1)} ${f2(cap + 14)} ${f2(cx + wing)} ${f2(fy + 12)}`
        + ` C ${f2(cx + hw * 0.55)} ${f2(fy - 6)} ${f2(cx + 7 * dip)} ${f2(fy + 1)} ${f2(cx)} ${f2(fy + 6 * dip - 2 * liftFall)}`   // part dips for straight, fills for coiled
        + ` C ${f2(cx - 7 * dip)} ${f2(fy + 1)} ${f2(cx - hw * 0.55)} ${f2(fy - 6)} ${f2(cx - wing)} ${f2(fy + 12)} Z`;
      return { front, back };
    }
    if (style === 1) {               // soft shoulder-length → curly rounded body
      const fallY = cy + hh * (0.7 - 0.28 * liftFall);
      const fallX = hw * (0.78 + 0.5 * liftFall);
      const sideBow = 10 + puff * 14;
      const back = `M ${f2(lx - 1)} ${f2(fy + 6)} C ${f2(lx - sideBow)} ${f2(cy)} ${f2(lx - sideBow * 0.5)} ${f2(cy + hh * 0.55)} ${f2(cx - fallX)} ${f2(fallY)}`
        + ` Q ${f2(cx)} ${f2(fallY + 5 * (1 - liftFall))} ${f2(cx + fallX)} ${f2(fallY)} C ${f2(rx + sideBow * 0.5)} ${f2(cy + hh * 0.55)} ${f2(rx + sideBow)} ${f2(cy)} ${f2(rx + 1)} ${f2(fy + 6)} Z`;
      const front = `M ${f2(cx - wing)} ${f2(fy + 10)} C ${f2(cx - wing - 1)} ${f2(cap + 10)} ${f2(cx - 16)} ${f2(cap - 1)} ${f2(cx + 2)} ${f2(cap - 1)}`
        + ` C ${f2(cx + 18)} ${f2(cap - 1)} ${f2(cx + wing + 1)} ${f2(cap + 12)} ${f2(cx + wing)} ${f2(fy + 10)}`
        + ` C ${f2(cx + 11)} ${f2(fy - 3)} ${f2(cx - 11)} ${f2(fy - 3)} ${f2(cx - wing)} ${f2(fy + 10)} Z`;
      return { front, back };
    }
    // style 2: soft pulled-back with crown volume + nape sweep
    const back = `M ${f2(cx - hw * 0.5)} ${f2(fy + 4)} C ${f2(cx - hw * 0.9)} ${f2(cy + hh * 0.4)} ${f2(cx - hw * 0.4)} ${f2(cy + hh * 0.78)} ${f2(cx)} ${f2(cy + hh * 0.82)}`
      + ` C ${f2(cx + hw * 0.4)} ${f2(cy + hh * 0.78)} ${f2(cx + hw * 0.9)} ${f2(cy + hh * 0.4)} ${f2(cx + hw * 0.5)} ${f2(fy + 4)} Z`;
    const front = `M ${f2(cx - hw - 1)} ${f2(fy + 8)} C ${f2(cx - hw - 1)} ${f2(cap + 6)} ${f2(cx + hw + 1)} ${f2(cap + 6)} ${f2(cx + hw + 1)} ${f2(fy + 8)}`
      + ` C ${f2(cx + 12)} ${f2(fy - 4)} ${f2(cx - 12)} ${f2(fy - 4)} ${f2(cx - hw - 1)} ${f2(fy + 8)} Z`;
    return { front, back };
  }
  // ---- male ---- (shorter, closer to the skull than female, but still with a
  // little crown height so it isn't a painted skullcap)
  const mcap = top - 11 - puff * 22; // male crown lift (less than female); coiled puffs up
  if (style === 0) {                 // short side-swept
    const front = `M ${f2(lx)} ${f2(fy + 7)} C ${f2(lx - 1)} ${f2(mcap + 5)} ${f2(cx - 10)} ${f2(mcap)} ${f2(cx + 4)} ${f2(mcap)}`
      + ` C ${f2(cx + 16)} ${f2(mcap)} ${f2(rx + 1)} ${f2(mcap + 7)} ${f2(rx)} ${f2(fy + 3)}`
      + ` C ${f2(cx + 8)} ${f2(fy - 6)} ${f2(cx - hw * 0.2)} ${f2(fy - 1)} ${f2(cx - hw * 0.55)} ${f2(fy + 4)}`   // sweep across forehead
      + ` C ${f2(cx - hw * 0.78)} ${f2(fy + 6)} ${f2(lx)} ${f2(fy + 2)} ${f2(lx)} ${f2(fy + 7)} Z`;
    return { front, back: null };
  }
  if (style === 1) {                 // even crop with slight widow's peak
    const front = `M ${f2(lx)} ${f2(fy + 6)} C ${f2(lx)} ${f2(mcap + 4)} ${f2(rx)} ${f2(mcap + 4)} ${f2(rx)} ${f2(fy + 6)}`
      + ` C ${f2(cx + hw * 0.55)} ${f2(fy - 3)} ${f2(cx + 10)} ${f2(fy - 2)} ${f2(cx)} ${f2(fy + 4)}`            // widow's peak
      + ` C ${f2(cx - 10)} ${f2(fy - 2)} ${f2(cx - hw * 0.55)} ${f2(fy - 3)} ${f2(lx)} ${f2(fy + 6)} Z`;
    return { front, back: null };
  }
  // style 2: receding M-shape (older / variety)
  const front = `M ${f2(lx + 3)} ${f2(fy + 8)} C ${f2(lx + 1)} ${f2(mcap + 7)} ${f2(rx - 1)} ${f2(mcap + 7)} ${f2(rx - 3)} ${f2(fy + 8)}`
    + ` C ${f2(cx + hw * 0.5)} ${f2(fy + 9)} ${f2(cx + hw * 0.28)} ${f2(fy - 4)} ${f2(cx)} ${f2(fy - 3)}`        // right recession
    + ` C ${f2(cx - hw * 0.28)} ${f2(fy - 4)} ${f2(cx - hw * 0.5)} ${f2(fy + 9)} ${f2(lx + 3)} ${f2(fy + 8)} Z`;
  return { front, back: null };
}

// Curated, deterministic cloth palettes — muted, dignified textile tones (not
// neon). Each garment indexes its own seed-derived colour from these so the same
// life always wears the same shade.
const CLOTH = [
  '#8a8f9c', // slate grey-blue
  '#6f7d8c', // dusty teal-grey
  '#9c7b6a', // warm taupe
  '#7a6f8c', // muted plum
  '#5f6b5a', // sage olive
  '#b08d6a', // sand / camel
  '#3f4a5c', // deep indigo
  '#7c5a52', // brick rose
  '#a8a29a', // oatmeal
  '#4a6b6f', // teal
];
const TURBAN_CLOTH = ['#3f4a5c', '#5f6b5a', '#7c5a52', '#8a8f9c', '#9c7b6a', '#4a6b6f'];

// Resolve + build a head piece. `m` carries the same head metrics buildFace uses
// so cloth lands exactly on the skull. `rng` is the SAME seeded stream (we pull a
// couple of values) so everything stays deterministic. Garment selection for
// 'auto' is intentionally conservative: most lives are bare-headed; a minority
// wear a culturally-appropriate piece, and it's stable per seed.
function buildHeadwear(
  want: Headwear, sex: Sex, seed32: number, m: HeadMetrics,
): HeadwearGeo {
  const { cx, cy, hw, hh, eyeY, top } = m;
  const F = sex === 'F';
  const chinY = cy + hh * (F ? 0.985 : 1.04);
  const fy = eyeY - 21;                       // hairline baseline

  // ---- resolve 'auto' deterministically -------------------------------------
  let kind = want;
  if (kind === 'auto') {
    // ~78% bare. The remaining slice is spread across pieces, biased by sex for
    // the gendered garments (turban→male; hijab/niqab/tichel→female). This is a
    // representation knob, never a beauty/quality signal.
    const pick = (seed32 >>> 7) % 100;
    if (pick < 78) kind = 'none';
    else if (pick < 84) kind = F ? 'hijab' : 'kufi';
    else if (pick < 88) kind = F ? 'tichel' : 'turban';
    else if (pick < 91) kind = F ? 'niqab' : 'kufi';
    else if (pick < 94) kind = 'beanie';
    else if (pick < 97) kind = 'cap';
    else if (pick < 99) kind = 'glasses';
    else kind = 'earrings';
  }

  // deterministic cloth colour per seed+garment
  const clothColor = (palette: string[]) => palette[(seed32 >>> 11) % palette.length];

  const empty: HeadwearGeo = {
    kind, coversHair: false,
    drape: null, crownBand: null, frameShade: null,
    cap: null, capBrim: null, wrapLines: [], veil: null, folds: [],
    accent: null, glasses: null, earrings: null,
    cloth: '#8a8f9c', clothShadow: '#6b6f78', clothHi: '#b9bcc4',
  };
  if (kind === 'none') return empty;

  // shared head-frame geometry: the opening cloth wraps around. The face opening
  // for cloth pieces is an oval a touch inside the head edge at the temples,
  // dropping to just under the chin / mid-jaw depending on the garment.
  const headTop = top - 2;

  // ===== HIJAB / NIQAB =======================================================
  // A scarf covering the hair, framing the face in a soft oval, draping down over
  // the neck and shoulders. niqab adds a face veil with an eye slot.
  if (kind === 'hijab' || kind === 'niqab') {
    const cloth = clothColor(CLOTH);
    const open = fy + 2;                       // top of the face opening (forehead)
    const sideX = hw + 4;                       // cloth bulges just past the face
    const jawOpenY = chinY - (kind === 'niqab' ? 30 : 4);  // niqab opening stops higher
    // the outer cloth silhouette: up over the crown, down the sides, flaring to
    // the shoulders, across the bottom. Drawn BEHIND the head.
    const shoY = 226, shoSpread = hw * 1.7;
    const drape =
      `M ${f2(cx)} ${f2(headTop - 9)}`
      + ` C ${f2(cx - hw * 0.7)} ${f2(headTop - 9)} ${f2(cx - sideX - 7)} ${f2(eyeY - 30)} ${f2(cx - sideX - 8)} ${f2(eyeY + 6)}`
      + ` C ${f2(cx - sideX - 9)} ${f2(cy + hh * 0.5)} ${f2(cx - shoSpread)} ${f2(shoY - 26)} ${f2(cx - shoSpread)} ${f2(shoY)}`
      + ` L ${f2(cx - shoSpread)} 240 L ${f2(cx + shoSpread)} 240 L ${f2(cx + shoSpread)} ${f2(shoY)}`
      + ` C ${f2(cx + shoSpread)} ${f2(shoY - 26)} ${f2(cx + sideX + 9)} ${f2(cy + hh * 0.5)} ${f2(cx + sideX + 8)} ${f2(eyeY + 6)}`
      + ` C ${f2(cx + sideX + 7)} ${f2(eyeY - 30)} ${f2(cx + hw * 0.7)} ${f2(headTop - 9)} ${f2(cx)} ${f2(headTop - 9)} Z`;
    // The front band of the scarf: cloth that sits OVER the head at the forehead
    // & temples (where the hair would otherwise show), framing the face. It is an
    // ANNULUS — outer edge follows the cloth silhouette over the crown & down the
    // cheeks to the jaw opening; the inner edge is the face-opening oval (forehead
    // just above the brows, down the cheeks in front of the ears to the jaw). The
    // head (drawn earlier) shows through the opening, so eyes/nose/mouth are clear.
    const browLine = fy - 1;                   // inner opening top: just above brows
    const openSide = hw * 0.9;                 // inner opening half-width at the cheeks
    const crownBand =
      // outer edge: temple -> over crown -> temple -> down cheeks to jaw
      `M ${f2(cx - sideX - 8)} ${f2(eyeY + 6)}`
      + ` C ${f2(cx - sideX - 8)} ${f2(eyeY - 26)} ${f2(cx - hw * 0.62)} ${f2(headTop - 7)} ${f2(cx)} ${f2(headTop - 7)}`
      + ` C ${f2(cx + hw * 0.62)} ${f2(headTop - 7)} ${f2(cx + sideX + 8)} ${f2(eyeY - 26)} ${f2(cx + sideX + 8)} ${f2(eyeY + 6)}`
      + ` C ${f2(cx + sideX + 6)} ${f2(jawOpenY - 14)} ${f2(cx + hw * 0.8)} ${f2(jawOpenY - 2)} ${f2(cx + hw * 0.46)} ${f2(jawOpenY)}`
      // inner opening edge, traversed BACKWARD so the path winds to leave a hole:
      + ` C ${f2(cx + hw * 0.2)} ${f2(jawOpenY + 2)} ${f2(cx - hw * 0.2)} ${f2(jawOpenY + 2)} ${f2(cx - hw * 0.46)} ${f2(jawOpenY)}`
      + ` C ${f2(cx - hw * 0.8)} ${f2(jawOpenY - 2)} ${f2(cx - sideX - 6)} ${f2(jawOpenY - 14)} ${f2(cx - sideX - 8)} ${f2(eyeY + 6)} Z`
      // SECOND subpath = the face hole (forehead just above brows down to jaw). With
      // the default nonzero fill-rule, a reversed inner loop carves the opening out.
      + ` M ${f2(cx - openSide)} ${f2(eyeY + 2)}`
      + ` C ${f2(cx - openSide)} ${f2(browLine - 2)} ${f2(cx - hw * 0.5)} ${f2(browLine - 4)} ${f2(cx)} ${f2(browLine - 4)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(browLine - 4)} ${f2(cx + openSide)} ${f2(browLine - 2)} ${f2(cx + openSide)} ${f2(eyeY + 2)}`
      + ` C ${f2(cx + openSide)} ${f2(jawOpenY - 12)} ${f2(cx + hw * 0.6)} ${f2(jawOpenY - 4)} ${f2(cx + hw * 0.4)} ${f2(jawOpenY - 2)}`
      + ` C ${f2(cx + hw * 0.18)} ${f2(jawOpenY)} ${f2(cx - hw * 0.18)} ${f2(jawOpenY)} ${f2(cx - hw * 0.4)} ${f2(jawOpenY - 2)}`
      + ` C ${f2(cx - hw * 0.6)} ${f2(jawOpenY - 4)} ${f2(cx - openSide)} ${f2(jawOpenY - 12)} ${f2(cx - openSide)} ${f2(eyeY + 2)} Z`;
    // soft inner shadow where the cloth opening meets the face (rounds the frame)
    const frameShade =
      `M ${f2(cx - hw * 0.86)} ${f2(open)}`
      + ` C ${f2(cx - hw * 0.6)} ${f2(headTop)} ${f2(cx + hw * 0.6)} ${f2(headTop)} ${f2(cx + hw * 0.86)} ${f2(open)}`
      + ` C ${f2(cx + hw * 0.7)} ${f2(open - 4)} ${f2(cx - hw * 0.7)} ${f2(open - 4)} ${f2(cx - hw * 0.86)} ${f2(open)} Z`;
    // drape folds: a few soft seams falling from the temples down the shoulders.
    const folds: Stroke[] = [
      { d: `M ${f2(cx - sideX - 4)} ${f2(eyeY + 14)} C ${f2(cx - hw * 1.1)} ${f2(cy + hh * 0.7)} ${f2(cx - hw * 1.2)} ${f2(shoY - 6)} ${f2(cx - hw * 1.3)} ${f2(shoY + 8)}`, w: 1.1 },
      { d: `M ${f2(cx + sideX + 4)} ${f2(eyeY + 14)} C ${f2(cx + hw * 1.1)} ${f2(cy + hh * 0.7)} ${f2(cx + hw * 1.2)} ${f2(shoY - 6)} ${f2(cx + hw * 1.3)} ${f2(shoY + 8)}`, w: 1.1 },
      { d: `M ${f2(cx - hw * 0.5)} ${f2(cy + hh * 0.9)} C ${f2(cx - hw * 0.55)} ${f2(shoY - 10)} ${f2(cx - hw * 0.5)} ${f2(shoY + 4)} ${f2(cx - hw * 0.4)} 238`, w: 0.9 },
      { d: `M ${f2(cx + hw * 0.5)} ${f2(cy + hh * 0.9)} C ${f2(cx + hw * 0.55)} ${f2(shoY - 10)} ${f2(cx + hw * 0.5)} ${f2(shoY + 4)} ${f2(cx + hw * 0.4)} 238`, w: 0.9 },
    ];
    // a small modest pin where the scarf crosses under the chin (hijab only)
    const accent = kind === 'hijab'
      ? { cx: cx + hw * 0.34, cy: jawOpenY - 2, r: 1.6 }
      : null;
    // niqab face veil: covers from just under the eyes down over nose & mouth,
    // hanging to the chest. Leaves a clean horizontal eye slot.
    let veil: string | null = null;
    if (kind === 'niqab') {
      const slotY = eyeY + 9;                  // veil top edge sits just below the eyes
      veil =
        `M ${f2(cx - hw * 0.8)} ${f2(slotY)}`
        + ` C ${f2(cx - hw * 0.4)} ${f2(slotY + 4)} ${f2(cx + hw * 0.4)} ${f2(slotY + 4)} ${f2(cx + hw * 0.8)} ${f2(slotY)}`
        + ` C ${f2(cx + hw * 0.92)} ${f2(slotY + 30)} ${f2(cx + hw * 0.7)} ${f2(chinY + 18)} ${f2(cx + hw * 0.3)} ${f2(chinY + 30)}`
        + ` C ${f2(cx + hw * 0.12)} ${f2(chinY + 34)} ${f2(cx - hw * 0.12)} ${f2(chinY + 34)} ${f2(cx - hw * 0.3)} ${f2(chinY + 30)}`
        + ` C ${f2(cx - hw * 0.7)} ${f2(chinY + 18)} ${f2(cx - hw * 0.92)} ${f2(slotY + 30)} ${f2(cx - hw * 0.8)} ${f2(slotY)} Z`;
      // a couple of soft veil folds
      folds.push({ d: `M ${f2(cx - hw * 0.2)} ${f2(slotY + 8)} C ${f2(cx - hw * 0.22)} ${f2(chinY)} ${f2(cx - hw * 0.18)} ${f2(chinY + 14)} ${f2(cx - hw * 0.16)} ${f2(chinY + 26)}`, w: 0.9 });
      folds.push({ d: `M ${f2(cx + hw * 0.2)} ${f2(slotY + 8)} C ${f2(cx + hw * 0.22)} ${f2(chinY)} ${f2(cx + hw * 0.18)} ${f2(chinY + 14)} ${f2(cx + hw * 0.16)} ${f2(chinY + 26)}`, w: 0.9 });
    }
    return {
      ...empty, kind, coversHair: true,
      drape, crownBand, frameShade, folds, accent, veil,
      cloth, clothShadow: shade(cloth, 0.78), clothHi: shade(cloth, 1.14),
    };
  }

  // ===== TICHEL / HEADSCARF ==================================================
  // A tied headscarf (mitpachat): covers the hair, wraps close to the head, ties
  // at the nape with a small knot and a short tail. Frames the face but leaves the
  // neck/shoulders open (unlike the hijab's full drape).
  if (kind === 'tichel') {
    const cloth = clothColor(CLOTH);
    const sideX = hw + 2;
    const napeY = cy + hh * 0.62;
    // wrap body: hugs the skull from the forehead, over the crown, down to the
    // nape where it gathers. Drawn behind the head.
    const drape =
      `M ${f2(cx)} ${f2(headTop - 6)}`
      + ` C ${f2(cx - hw * 0.7)} ${f2(headTop - 6)} ${f2(cx - sideX - 3)} ${f2(eyeY - 26)} ${f2(cx - sideX - 3)} ${f2(eyeY + 2)}`
      + ` C ${f2(cx - sideX - 3)} ${f2(napeY - 8)} ${f2(cx - hw * 0.5)} ${f2(napeY)} ${f2(cx)} ${f2(napeY + 2)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(napeY)} ${f2(cx + sideX + 3)} ${f2(napeY - 8)} ${f2(cx + sideX + 3)} ${f2(eyeY + 2)}`
      + ` C ${f2(cx + sideX + 3)} ${f2(eyeY - 26)} ${f2(cx + hw * 0.7)} ${f2(headTop - 6)} ${f2(cx)} ${f2(headTop - 6)} Z`;
    // front band over the forehead (a folded scarf edge), in front of the head
    const crownBand =
      `M ${f2(cx - sideX - 3)} ${f2(eyeY + 2)}`
      + ` C ${f2(cx - sideX - 3)} ${f2(eyeY - 24)} ${f2(cx - hw * 0.6)} ${f2(headTop - 4)} ${f2(cx)} ${f2(headTop - 4)}`
      + ` C ${f2(cx + hw * 0.6)} ${f2(headTop - 4)} ${f2(cx + sideX + 3)} ${f2(eyeY - 24)} ${f2(cx + sideX + 3)} ${f2(eyeY + 2)}`
      // inner edge: a folded hem dipping across the forehead just above the brows
      + ` C ${f2(cx + hw * 0.7)} ${f2(fy + 1)} ${f2(cx + hw * 0.3)} ${f2(fy - 3)} ${f2(cx)} ${f2(fy - 2)}`
      + ` C ${f2(cx - hw * 0.3)} ${f2(fy - 3)} ${f2(cx - hw * 0.7)} ${f2(fy + 1)} ${f2(cx - sideX - 3)} ${f2(eyeY + 2)} Z`;
    const frameShade =
      `M ${f2(cx - hw * 0.78)} ${f2(fy + 2)}`
      + ` C ${f2(cx - hw * 0.5)} ${f2(fy - 3)} ${f2(cx + hw * 0.5)} ${f2(fy - 3)} ${f2(cx + hw * 0.78)} ${f2(fy + 2)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(fy - 1)} ${f2(cx - hw * 0.5)} ${f2(fy - 1)} ${f2(cx - hw * 0.78)} ${f2(fy + 2)} Z`;
    // knot + short tail at the nape (lower-left, on the lit side reads nicely)
    const knotX = cx - hw * 0.36, knotY = napeY - 2;
    const accent = { cx: knotX, cy: knotY, r: 3.2 };
    const folds: Stroke[] = [
      // tail falling from the knot
      { d: `M ${f2(knotX)} ${f2(knotY + 2)} C ${f2(knotX - 4)} ${f2(knotY + 12)} ${f2(knotX - 2)} ${f2(knotY + 22)} ${f2(knotX - 6)} ${f2(knotY + 30)}`, w: 2.4 },
      // wrap seams over the crown
      { d: `M ${f2(cx - hw * 0.5)} ${f2(fy)} C ${f2(cx - hw * 0.3)} ${f2(headTop + 2)} ${f2(cx + hw * 0.1)} ${f2(headTop + 2)} ${f2(cx + hw * 0.4)} ${f2(fy - 1)}`, w: 0.9 },
      { d: `M ${f2(cx - hw * 0.7)} ${f2(eyeY - 6)} C ${f2(cx - hw * 0.4)} ${f2(eyeY - 18)} ${f2(cx + hw * 0.4)} ${f2(eyeY - 18)} ${f2(cx + hw * 0.7)} ${f2(eyeY - 6)}`, w: 0.8 },
    ];
    return {
      ...empty, kind, coversHair: true,
      drape, crownBand, frameShade, folds, accent,
      cloth, clothShadow: shade(cloth, 0.78), clothHi: shade(cloth, 1.14),
    };
  }

  // ===== TURBAN (Sikh dastar) ================================================
  // A wrapped turban with a peak at the front-centre and horizontal wrap layers.
  // Sits ON TOP of the head, covering the hair, rising above the crown.
  if (kind === 'turban') {
    const cloth = clothColor(TURBAN_CLOTH);
    const peakY = top - 24;                    // turban rises well above the skull
    const baseY = fy + 1;                       // wraps down to the hairline
    const sideX = hw + 1;
    // the dome: a broad, slightly peaked mass over the crown
    const cap =
      `M ${f2(cx - sideX)} ${f2(baseY)}`
      + ` C ${f2(cx - sideX - 2)} ${f2(eyeY - 24)} ${f2(cx - hw * 0.7)} ${f2(peakY + 4)} ${f2(cx - 6)} ${f2(peakY)}`
      + ` C ${f2(cx - 2)} ${f2(peakY - 3)} ${f2(cx + 4)} ${f2(peakY - 3)} ${f2(cx + 10)} ${f2(peakY + 1)}`
      + ` C ${f2(cx + hw * 0.7)} ${f2(peakY + 6)} ${f2(cx + sideX + 2)} ${f2(eyeY - 24)} ${f2(cx + sideX)} ${f2(baseY)}`
      // bottom hairline edge, dipping slightly at the centre-front
      + ` C ${f2(cx + hw * 0.6)} ${f2(baseY + 3)} ${f2(cx + hw * 0.2)} ${f2(baseY + 5)} ${f2(cx)} ${f2(baseY + 6)}`
      + ` C ${f2(cx - hw * 0.2)} ${f2(baseY + 5)} ${f2(cx - hw * 0.6)} ${f2(baseY + 3)} ${f2(cx - sideX)} ${f2(baseY)} Z`;
    // wrap layers: diagonal folds crossing to the front peak (the dastar's look)
    const wrapLines: Stroke[] = [
      { d: `M ${f2(cx - sideX + 1)} ${f2(eyeY - 8)} C ${f2(cx - hw * 0.4)} ${f2(eyeY - 20)} ${f2(cx + hw * 0.2)} ${f2(peakY + 8)} ${f2(cx + 6)} ${f2(peakY + 2)}`, w: 1.6 },
      { d: `M ${f2(cx - sideX + 2)} ${f2(eyeY - 16)} C ${f2(cx - hw * 0.3)} ${f2(peakY + 12)} ${f2(cx + hw * 0.3)} ${f2(peakY + 10)} ${f2(cx + 4)} ${f2(peakY + 1)}`, w: 1.4 },
      { d: `M ${f2(cx + sideX - 1)} ${f2(eyeY - 8)} C ${f2(cx + hw * 0.4)} ${f2(eyeY - 20)} ${f2(cx - hw * 0.2)} ${f2(peakY + 8)} ${f2(cx - 6)} ${f2(peakY + 2)}`, w: 1.6 },
      { d: `M ${f2(cx + sideX - 2)} ${f2(eyeY - 16)} C ${f2(cx + hw * 0.3)} ${f2(peakY + 12)} ${f2(cx - hw * 0.3)} ${f2(peakY + 10)} ${f2(cx - 4)} ${f2(peakY + 1)}`, w: 1.4 },
      // the front-centre vertical fold of the peak
      { d: `M ${f2(cx + 1)} ${f2(peakY)} L ${f2(cx + 2)} ${f2(baseY + 4)}`, w: 1.2 },
    ];
    return {
      ...empty, kind, coversHair: true,
      cap, wrapLines,
      cloth, clothShadow: shade(cloth, 0.74), clothHi: shade(cloth, 1.18),
    };
  }

  // ===== KUFI / TAQIYAH ======================================================
  // A small rounded skullcap sitting on the crown. Hair shows below it, so it
  // does NOT cover the hair. A subtle knit/embroidery band runs around the base.
  if (kind === 'kufi') {
    const cloth = clothColor(CLOTH);
    const baseY = fy + 4;                       // cap base sits at the hairline
    const domeTop = top + 2;                    // low rounded dome
    const sideX = hw * 0.82;
    const cap =
      `M ${f2(cx - sideX)} ${f2(baseY)}`
      + ` C ${f2(cx - sideX)} ${f2(domeTop + 10)} ${f2(cx - hw * 0.4)} ${f2(domeTop)} ${f2(cx)} ${f2(domeTop)}`
      + ` C ${f2(cx + hw * 0.4)} ${f2(domeTop)} ${f2(cx + sideX)} ${f2(domeTop + 10)} ${f2(cx + sideX)} ${f2(baseY)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(baseY + 4)} ${f2(cx - hw * 0.5)} ${f2(baseY + 4)} ${f2(cx - sideX)} ${f2(baseY)} Z`;
    // embroidery band + a couple of dome seams
    const wrapLines: Stroke[] = [
      { d: `M ${f2(cx - sideX)} ${f2(baseY - 2)} C ${f2(cx - hw * 0.5)} ${f2(baseY + 1)} ${f2(cx + hw * 0.5)} ${f2(baseY + 1)} ${f2(cx + sideX)} ${f2(baseY - 2)}`, w: 1.6 },
      { d: `M ${f2(cx)} ${f2(domeTop)} L ${f2(cx)} ${f2(baseY - 1)}`, w: 0.7 },
      { d: `M ${f2(cx - hw * 0.42)} ${f2(domeTop + 2)} C ${f2(cx - hw * 0.45)} ${f2((domeTop + baseY) / 2)} ${f2(cx - hw * 0.5)} ${f2(baseY - 3)} ${f2(cx - hw * 0.5)} ${f2(baseY - 2)}`, w: 0.6 },
      { d: `M ${f2(cx + hw * 0.42)} ${f2(domeTop + 2)} C ${f2(cx + hw * 0.45)} ${f2((domeTop + baseY) / 2)} ${f2(cx + hw * 0.5)} ${f2(baseY - 3)} ${f2(cx + hw * 0.5)} ${f2(baseY - 2)}`, w: 0.6 },
    ];
    return {
      ...empty, kind, coversHair: false,
      cap, wrapLines,
      cloth, clothShadow: shade(cloth, 0.78), clothHi: shade(cloth, 1.14),
    };
  }

  // ===== BEANIE (secular knit) ===============================================
  if (kind === 'beanie') {
    const cloth = clothColor(CLOTH);
    const baseY = fy + 3;
    const domeTop = top - 7;
    const sideX = hw + 2;
    const cap =
      `M ${f2(cx - sideX)} ${f2(baseY)}`
      + ` C ${f2(cx - sideX - 1)} ${f2(eyeY - 22)} ${f2(cx - hw * 0.5)} ${f2(domeTop)} ${f2(cx)} ${f2(domeTop)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(domeTop)} ${f2(cx + sideX + 1)} ${f2(eyeY - 22)} ${f2(cx + sideX)} ${f2(baseY)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(baseY + 4)} ${f2(cx - hw * 0.5)} ${f2(baseY + 4)} ${f2(cx - sideX)} ${f2(baseY)} Z`;
    // folded brim band + vertical knit ribs
    const brimY = baseY - 1;
    const capBrim =
      `M ${f2(cx - sideX)} ${f2(brimY)}`
      + ` C ${f2(cx - hw * 0.5)} ${f2(brimY + 5)} ${f2(cx + hw * 0.5)} ${f2(brimY + 5)} ${f2(cx + sideX)} ${f2(brimY)}`
      + ` L ${f2(cx + sideX)} ${f2(brimY - 7)} C ${f2(cx + hw * 0.5)} ${f2(brimY - 3)} ${f2(cx - hw * 0.5)} ${f2(brimY - 3)} ${f2(cx - sideX)} ${f2(brimY - 7)} Z`;
    const wrapLines: Stroke[] = [];
    for (let i = -3; i <= 3; i++) {
      const x = cx + i * (sideX / 3.5);
      wrapLines.push({ d: `M ${f2(x)} ${f2(domeTop + 8)} L ${f2(x + (i) * 0.6)} ${f2(brimY - 3)}`, w: 0.8 });
    }
    return {
      ...empty, kind, coversHair: true,
      cap, capBrim, wrapLines,
      cloth, clothShadow: shade(cloth, 0.76), clothHi: shade(cloth, 1.16),
    };
  }

  // ===== CAP (secular baseball) ==============================================
  if (kind === 'cap') {
    const cloth = clothColor(CLOTH);
    const baseY = fy + 2;
    const domeTop = top - 2;
    const sideX = hw * 0.96;
    const cap =
      `M ${f2(cx - sideX)} ${f2(baseY)}`
      + ` C ${f2(cx - sideX)} ${f2(eyeY - 24)} ${f2(cx - hw * 0.45)} ${f2(domeTop)} ${f2(cx + 2)} ${f2(domeTop)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(domeTop)} ${f2(cx + sideX)} ${f2(eyeY - 22)} ${f2(cx + sideX)} ${f2(baseY)}`
      + ` C ${f2(cx + hw * 0.5)} ${f2(baseY + 3)} ${f2(cx - hw * 0.5)} ${f2(baseY + 3)} ${f2(cx - sideX)} ${f2(baseY)} Z`;
    // brim projecting forward/down on the lit side (to the left)
    const capBrim =
      `M ${f2(cx - sideX + 3)} ${f2(baseY)}`
      + ` C ${f2(cx - hw * 1.25)} ${f2(baseY + 2)} ${f2(cx - hw * 1.35)} ${f2(baseY + 12)} ${f2(cx - hw * 0.9)} ${f2(baseY + 15)}`
      + ` C ${f2(cx - hw * 0.5)} ${f2(baseY + 14)} ${f2(cx - hw * 0.2)} ${f2(baseY + 6)} ${f2(cx + 2)} ${f2(baseY + 3)}`
      + ` C ${f2(cx - hw * 0.2)} ${f2(baseY + 2)} ${f2(cx - hw * 0.5)} ${f2(baseY + 1)} ${f2(cx - sideX + 3)} ${f2(baseY)} Z`;
    const wrapLines: Stroke[] = [
      { d: `M ${f2(cx)} ${f2(domeTop)} L ${f2(cx - 1)} ${f2(baseY)}`, w: 0.7 },
      { d: `M ${f2(cx - hw * 0.4)} ${f2(domeTop + 4)} C ${f2(cx - hw * 0.42)} ${f2((domeTop + baseY) / 2)} ${f2(cx - hw * 0.5)} ${f2(baseY - 2)} ${f2(cx - hw * 0.55)} ${f2(baseY)}`, w: 0.6 },
      { d: `M ${f2(cx + hw * 0.4)} ${f2(domeTop + 4)} C ${f2(cx + hw * 0.42)} ${f2((domeTop + baseY) / 2)} ${f2(cx + hw * 0.5)} ${f2(baseY - 2)} ${f2(cx + hw * 0.55)} ${f2(baseY)}`, w: 0.6 },
      // a button at the crown apex
      { d: `M ${f2(cx + 1)} ${f2(domeTop + 1)} l 0 0.2`, w: 2.4 },
    ];
    return {
      ...empty, kind, coversHair: true,
      cap, capBrim, wrapLines,
      cloth, clothShadow: shade(cloth, 0.76), clothHi: shade(cloth, 1.16),
    };
  }

  // ===== GLASSES (secular, composes) =========================================
  if (kind === 'glasses') {
    // two rounded-rectangle lenses sitting over the eyes, a bridge, arms back to
    // the ears. Positions derived from the head metrics (eye band at eyeY).
    const lensW = hw * 0.32, lensH = 11;
    const ly = eyeY - 1;
    const off = hw * 0.38;                       // half the inter-pupil distance-ish
    const lens = (sx: number) => {
      const x0 = sx - lensW, x1 = sx + lensW, y0 = ly - lensH * 0.5, y1 = ly + lensH * 0.55;
      const rr = 3.5;
      return `M ${f2(x0 + rr)} ${f2(y0)} L ${f2(x1 - rr)} ${f2(y0)} Q ${f2(x1)} ${f2(y0)} ${f2(x1)} ${f2(y0 + rr)}`
        + ` L ${f2(x1)} ${f2(y1 - rr)} Q ${f2(x1)} ${f2(y1)} ${f2(x1 - rr)} ${f2(y1)}`
        + ` L ${f2(x0 + rr)} ${f2(y1)} Q ${f2(x0)} ${f2(y1)} ${f2(x0)} ${f2(y1 - rr)}`
        + ` L ${f2(x0)} ${f2(y0 + rr)} Q ${f2(x0)} ${f2(y0)} ${f2(x0 + rr)} ${f2(y0)} Z`;
    };
    const lenses = [lens(cx - off), lens(cx + off)];
    const bridge = `M ${f2(cx - off + lensW)} ${f2(ly - 2)} Q ${f2(cx)} ${f2(ly - 4)} ${f2(cx + off - lensW)} ${f2(ly - 2)}`;
    const temples = [
      `M ${f2(cx - off - lensW)} ${f2(ly - 2)} L ${f2(cx - hw * 0.95)} ${f2(eyeY - 3)}`,
      `M ${f2(cx + off + lensW)} ${f2(ly - 2)} L ${f2(cx + hw * 0.95)} ${f2(eyeY - 3)}`,
    ];
    return {
      ...empty, kind, coversHair: false,
      glasses: { lenses, bridge, temples },
      cloth: '#222', clothShadow: '#111', clothHi: '#555',
    };
  }

  // ===== EARRINGS (secular, composes) ========================================
  if (kind === 'earrings') {
    const ey = eyeY + 17;                        // lobe sits below the ear canal
    const ex = hw * 0.92;
    const hoop = ((seed32 >>> 13) & 1) === 1;
    return {
      ...empty, kind, coversHair: false,
      earrings: [
        { cx: cx - ex, cy: ey, r: hoop ? 4.0 : 2.1, hoop },
        { cx: cx + ex, cy: ey, r: hoop ? 4.0 : 2.1, hoop },
      ],
      cloth: '#d8b441', clothShadow: '#8a6f22', clothHi: '#f7e79a',
    };
  }

  return empty;
}

export function buildFace({ looks, sex, seed, range = DEFAULT_RANGE, hair = true, headwear = 'auto', region = 'auto' }: FaceParams): FaceGeo {
  const t = clamp((looks - range[0]) / (range[1] - range[0]), 0, 1);
  const ugly = 1 - t;
  const A = Math.pow(ugly, 1.35);   // asymmetry amplitude (mismatch L vs R)
  const D = Math.pow(ugly, 1.15);   // proportion drift from canon
  const F = sex === 'F';
  // "gigachad" factor: a male-only ramp over the top ~20% of the looks scale.
  // At chad=1 the jaw goes mega-square, cheeks hollow, brow heavy, eyes intense,
  // mouth firm, and stubble shadows in. Zero for women and ordinary scores.
  const chad = F ? 0 : clamp((t - 0.78) / 0.22, 0, 1);
  const chad2 = chad * chad * (3 - 2 * chad);   // smoothstep

  const seed32 = typeof seed === 'number' ? seed >>> 0 : hashSeed(seed);
  const r = makeRng(seed32 ^ (F ? 0x9e3779b9 : 0));
  const s = () => r() * 2 - 1;      // [-1,1)

  // ---- ANCESTRY PHENOTYPE -------------------------------------------------
  // Resolved from the seed (NOT from looks). Sampled on an INDEPENDENT RNG
  // stream (distinct constant) so phenotype draws never consume from the
  // looks-driven `r`/`s` stream — that decoupling is what makes phenotype and
  // beauty fully orthogonal. The bias fields below are applied as gentle,
  // believable nudges on top of the existing sex/looks geometry; per-individual
  // `s()` jitter and the looks asymmetry/drift terms (A,D) are left untouched.
  const region0 = resolveRegion(region, seed32);
  const pheRng = makeRng((seed32 ^ 0x85ebca6b) >>> 0);   // separate phenotype stream
  const phe = samplePhenotype(region0, pheRng);
  const B = phe.bias;

  const cx = 100;
  const headCy = 116;
  // region faceW bias sets the base width before the looks-driven drift term; sized
  // to move the silhouette several px (a broad-faced region reads clearly wider than
  // a narrow-faced one at thumbnail). faceLong stretches/compresses the vertical.
  const headW = (F ? 46.5 : 49) + B.faceW + 4 * D * s();
  const headH = (F ? 58 : 58) + B.faceLong;
  const eyeY = 104;
  const top = headCy - headH;
  // cheekbone (zygomatic) prominence: a region bias that pushes the WIDEST point of
  // the head (the cheek band) out independently of overall face width. Applied as a
  // bump localised to the cheek band in prof() below.
  const cheekBoneAdd = B.cheekBone / Math.max(20, headW);   // as a fraction of headW

  // ---- head outline -----------------------------------------------------
  // Reworked toward an anatomical skull profile rather than a flat oval:
  //  • cranium narrower than the face and rounded at the crown
  //  • WIDEST point at the cheekbones (a touch above eye level), the "zygomatic"
  //  • forehead vertical-ish, temples pinched in
  //  • jaw tapers down to chin (gonial angle for men/chad, soft for women)
  // The profile is expressed as a radial multiplier `prof(sy)` of headW over the
  // vertical fraction sy ∈ [-1 (crown) .. +1 (chin)]. Lumpiness still rides the
  // wob term at low looks; high looks reads as a clean believable head.
  const N = 28;
  const wob: number[] = [];
  for (let i = 0; i < N; i++) wob.push(s());
  // cheekbone band sits a bit above the eyes; its sy value:
  const cheekSy = -0.18;
  // gonial flare (square jaw corner) — men ramped by chad; region jawSquare adds
  // a small flare for BOTH sexes (a soft tendency, never a hard square jaw).
  const gonial = (F ? 0.0 : 0.10 + 0.30 * chad2) + B.jawSquare;
  // cheekbone bump: a Gaussian centred on the cheek band that adds zygomatic
  // prominence (or recesses it) per region. Peaks right at the widest point.
  const cheekBump = (sy: number) => cheekBoneAdd * Math.exp(-Math.pow((sy - cheekSy) / 0.26, 2));
  const prof = (sy: number): number => {
    if (sy <= cheekSy) {
      // crown -> cheekbone: cranium tucks in at the very top & at the temples
      const u = (sy - (-1)) / (cheekSy - (-1));   // 0 at crown, 1 at cheek
      // round crown (narrow), bulge at temple/forehead, peak width at cheek
      const crown = 0.74 + 0.26 * Math.sin(u * Math.PI * 0.5);      // 0.74 -> 1.0
      const templePinch = -0.06 * Math.sin(u * Math.PI);            // slight waist at temples
      return crown + templePinch + cheekBump(sy);
    }
    // cheekbone -> chin: taper. Women taper hard & smooth; men hold width then
    // break at the gonial angle into the jaw.
    const u = (sy - cheekSy) / (1 - cheekSy);     // 0 at cheek, 1 at chin
    // A rounded-chin term: instead of the width racing to a sharp point at u=1,
    // hold a little width right at the bottom so the spline rounds the chin
    // instead of spiking it. (The old curves spiked to a witch-point.)
    const chinFloor = (F ? 0.56 : 0.58);          // min half-width retained at chin
    if (F) {
      // soft oval taper, but ease off so the chin is a rounded curve not a point.
      // Hold cheek width through the upper cheek, then a gentle taper to a soft,
      // slightly-rounded chin (never a witch point).
      return chinFloor + (1 - chinFloor) * (1 - smoothstep01(u) * 0.85) + cheekBump(sy);
    }
    // male: hold cheek width through the jaw band, then taper to a broad,
    // rounded chin; gonial flare adds a squared corner around u≈0.55
    const taper = chinFloor + (1 - chinFloor) * (1 - Math.pow(smoothstep01(u), 1.3) * 0.82);
    const flare = gonial * Math.exp(-Math.pow((u - 0.5) / 0.22, 2));
    return taper + flare + cheekBump(sy);
  };
  const pts: [number, number][] = [];
  for (let i = 0; i < N; i++) {
    const th = (i / N) * Math.PI * 2 - Math.PI / 2;
    const sy = Math.sin(th);                 // -1 top .. +1 chin
    const rx = headW * prof(sy);
    const pert = 1 + wob[i] * 0.16 * A;
    // chin sits lower & flatter for men; chad lengthens the lower face
    const ry = headH * (sy > 0.6 ? (F ? 0.93 : 1.0 + 0.06 * chad2) : 1)
                     * (sy < -0.6 ? 0.96 : 1);   // crown a hair flatter (forehead, not dome)
    pts.push([cx + Math.cos(th) * rx * pert, headCy + sy * ry * pert]);
  }
  const headPath = closedSpline(pts);

  // ---- neck + shoulder hint: drawn behind the head so the jaw overlaps it.
  // Two columns dropping from behind the jaw, flaring into trapezius/shoulders
  // at the bottom of the frame. Narrower & longer for women, thicker for men.
  const jawW = headW * prof(0.95);                 // width near the chin/jaw
  const neckTopY = headCy + headH * 0.78;
  const neckW = (F ? 0.50 : 0.62) * jawW;
  const neckBotY = 232;
  const shoY = 228;
  const shoSpread = headW * (F ? 1.5 : 1.72);
  const neckPath =
    `M ${f2(cx - neckW)} ${f2(neckTopY)}`
    + ` C ${f2(cx - neckW - 1)} ${f2(neckTopY + 14)} ${f2(cx - neckW - 2)} ${f2(shoY - 24)} ${f2(cx - shoSpread)} ${f2(shoY)}`
    + ` L ${f2(cx - shoSpread)} ${f2(neckBotY)} L ${f2(cx + shoSpread)} ${f2(neckBotY)} L ${f2(cx + shoSpread)} ${f2(shoY)}`
    + ` C ${f2(cx + neckW + 2)} ${f2(shoY - 24)} ${f2(cx + neckW + 1)} ${f2(neckTopY + 14)} ${f2(cx + neckW)} ${f2(neckTopY)} Z`;

  // ---- eyes: independent L/R so low looks goes googly & lopsided ----
  // Tightened from the prototype: the old eyes were too big & too round (read as
  // insectoid at thumbnail). Real adult eyes are ~1 eye-width apart and sit at the
  // vertical midline of the head. Spread/size pulled in; roundness leans almond.
  // region eyeSpacing widens/narrows the inter-eye distance visibly (wide-set vs
  // close-set is one of the most legible cross-population differences).
  const spread = (F ? 17.6 : 18.4) + B.eyeSpacing + 2 * D * s();
  const baseRx = (F ? 7.7 : 7.4) + 1.0 * D;
  const eyeAsym = s();                          // which eye is the big one
  // region eyeAlmond bias shifts the eye toward rounder (+) or narrower/almond (−).
  // Effect sized up so a narrow-eyed draw reads clearly narrower than a round one.
  const roundness = (F ? 0.5 : 0.46) + 0.32 * ugly - 0.12 * chad2 + B.eyeAlmond;   // almond when pretty; narrow & intense for chad
  // region canthalTilt lifts the OUTER corner of the palpebral fissure (a positive
  // tilt) — drawn by raising the outer end of the eye almond + lash line. 0 = level.
  const canthal = B.canthalTilt;
  const eyes: FaceGeo['eyes'] = [];
  const eyeCenters: { ex: number; ey: number; rx: number; ry: number }[] = [];
  // a single, shared gaze vector so both eyes look the SAME direction when pretty
  // (a coherent, believable gaze); low looks lets each eye drift independently.
  const gazeX = s() * 0.34;          // -1..1 fraction of iris travel, horizontal
  const gazeY = s() * 0.18;
  for (let k = 0; k < 2; k++) {
    const side = k === 0 ? -1 : 1;
    const ex = cx + side * (spread + s() * 5 * A);
    const ey = eyeY + s() * 9 * A;              // independent vertical -> wonky
    const sizeK = 1 + (k === 0 ? eyeAsym : -eyeAsym) * 0.55 * A;
    const rx = baseRx * sizeK;
    const ry = rx * roundness;
    // canthal tilt: lift the outer corner (and drop the inner a touch) so the
    // palpebral axis slants up-and-out. Magnitude scaled to read at thumbnail.
    const outerDy = -canthal * 3.2;     // outer corner up
    const innerDy = canthal * 1.4;      // inner corner slightly down

    // iris: a believable, sized disc that sits tucked slightly under the upper
    // lid (as real irises do). Radius ~ a bit larger than half the opening height.
    const ir = Math.min(rx * 0.62, ry * 1.18) * (1 + 0.05 * t);
    // gaze: pretty faces share one gaze; ugly faces add per-eye wander -> wall-eyed
    const wanderX = gazeX + s() * 0.9 * A * (k === 0 ? 1 : -1);
    const wanderY = gazeY + s() * 0.6 * A;
    const travelX = Math.max(0, rx - ir - 0.4);
    const travelY = Math.max(0, ry - ir * 0.55);
    const irisCx = ex + clamp(wanderX, -1.1, 1.1) * travelX;
    // bias the iris up a touch so the upper lid grazes it (realistic), more for chad
    const irisCy = ey + clamp(wanderY, -1.1, 1.1) * travelY - ry * (0.16 + 0.10 * chad2);
    const iris = { cx: irisCx, cy: irisCy, r: ir };
    // pupil: concentric with the iris; dilates a little when ugly (cartoon googly)
    const pr = ir * (0.42 + 0.10 * ugly);
    const pupil = { cx: irisCx, cy: irisCy, r: pr };
    // catchlight: a small specular dot at the upper-left of the iris (light source)
    const cat = { cx: irisCx - ir * 0.34, cy: irisCy - ir * 0.40, r: Math.max(0.7, ir * 0.22) };

    // upper-lid crease: an arc echoing the eye opening, set above it. Women get a
    // visible, higher crease; chad's heavy lid sits low & close to the lash line.
    const creaseLift = (F ? ry * 1.15 : ry * 0.85) - ry * 0.55 * chad2;
    const crease = `M ${f2(ex - rx * 0.86)} ${f2(ey - ry * 0.35)}`
      + ` Q ${f2(ex - rx * 0.1)} ${f2(ey - ry - creaseLift)} ${f2(ex + rx * 0.92)} ${f2(ey - ry * 0.5)}`;
    // lower lid: a soft second line a hair below the opening (gives lid thickness)
    const lowerLid = `M ${f2(ex - rx * 0.7)} ${f2(ey + ry * 0.55)}`
      + ` Q ${f2(ex)} ${f2(ey + ry * 1.05)} ${f2(ex + rx * 0.7)} ${f2(ey + ry * 0.55)}`;
    // upper lid line (lash line): the top half of the almond, drawn thick so the
    // upper rim reads as the dark lash margin every real eye has. Tilted to match
    // the canthal axis (corners lifted/dropped exactly like the eye opening).
    const lDy = side < 0 ? outerDy : innerDy;
    const rDy = side < 0 ? innerDy : outerDy;
    const lidMid = ey - ry + (lDy + rDy) / 2;
    const upperLidLine = `M ${f2(ex - rx)} ${f2(ey + lDy)} C ${f2(ex - rx / 2)} ${f2(lidMid)}, ${f2(ex + rx / 2)} ${f2(lidMid)}, ${f2(ex + rx)} ${f2(ey + rDy)}`;
    // tear duct (medial canthus): a small pink-ish wedge at the inner corner.
    const tearDuct = { cx: ex - side * (rx - 0.6), cy: ey + ry * 0.12, r: Math.max(0.8, rx * 0.13) };

    // upper-lash MASS: a soft filled crescent sitting on the top rim, thickening
    // toward the outer corner (where real lashes bunch). Gives women a believable
    // dark lash band at thumbnail size instead of sparse spider-legs. The outer
    // corner flicks up. Men get none (their lash line stays a thin margin).
    const outer = side;   // outward direction
    const lashH = F ? ry * 0.5 + 1.0 : 0;
    const lashMass = F
      ? `M ${f2(ex - rx)} ${f2(ey + lDy)}`
        + ` C ${f2(ex - rx * 0.5)} ${f2(lidMid)} ${f2(ex + rx * 0.5)} ${f2(lidMid)} ${f2(ex + rx)} ${f2(ey + rDy)}`
        // outer flick up
        + ` q ${f2(outer * 2.2)} ${f2(-1.4)} ${f2(outer * 3.0)} ${f2(-3.0)}`
        + ` q ${f2(-outer * 1.4)} ${f2(0.6)} ${f2(-outer * 2.6)} ${f2(1.0)}`
        // back along a slightly higher arc -> gives the band its thickness
        + ` C ${f2(ex + rx * 0.5)} ${f2(lidMid - lashH)} ${f2(ex - rx * 0.5)} ${f2(lidMid - lashH)} ${f2(ex - rx)} ${f2(ey + lDy)} Z`
      : null;

    // epicanthic fold (medial): a soft curtain of upper-lid skin sweeping from
    // above the inner corner down over the tear duct. Strength comes from the
    // region phenotype (phe.pheno.epicanthic), NOT from looks. At strength 0 it's
    // absent; at full strength it covers the inner canthus the way the fold does.
    // Drawn as a short curved stroke hugging the inner corner; the renderer paints
    // it as a faint lid line so it reads as eyelid form, not a scar.
    const epi = phe.pheno.epicanthic;
    const innerX = ex - side * (rx - 0.4);          // inner-corner x (toward nose)
    // The fold is a curtain of upper-lid skin that hoods the inner corner and
    // partly covers the tear duct. Drawn larger/curvier with strength so it READS
    // as eyelid form at thumbnail (the old stroke was a hairline nobody could see).
    const epicanthicFold = epi > 0.10
      ? `M ${f2(innerX + side * (rx * 0.18 + 0.6))} ${f2(ey + innerDy - ry * (0.6 + 0.7 * epi))}`
        + ` Q ${f2(innerX - side * (1.8 + 1.2 * epi))} ${f2(ey + innerDy - ry * 0.2)}`
        + ` ${f2(innerX - side * (0.4 + 0.6 * epi))} ${f2(ey + innerDy + ry * (0.45 + 0.4 * epi))}`
      : null;

    eyes.push({
      d: almond(ex, ey, rx, ry, side, innerDy, outerDy), pupil, iris, catch: cat,
      crease, lowerLid, upperLidLine, tearDuct, lashMass, epicanthicFold, ex, ey, rx, ry,
    });
    eyeCenters.push({ ex, ey, rx, ry });
  }

  // ---- lashes: women get a fanned set curving up off the whole upper lid (denser
  // toward the outer corner); men get a couple of sparse outer-corner ticks so the
  // upper rim doesn't read as bald. Each lash follows the lid tangent then flicks up.
  const lashes: Stroke[] = [];
  eyeCenters.forEach((e, k) => {
    const side = k === 0 ? -1 : 1;
    const { ex, ey, rx, ry } = e;
    // A few accent lashes only — the lashMass crescent now carries the body, so
    // these are just a couple of crisp tip flicks at the outer corner.
    const nLash = F ? 4 : 2;
    for (let j = 0; j < nLash; j++) {
      // u: position along the upper lid from inner(0) to outer(1) corner
      const u = F ? 0.42 + j * (0.5 / Math.max(1, nLash - 1)) : 0.62 + j * 0.2;
      // point on the upper almond curve (quadratic-ish): x across, y dips up
      const lx = ex + (u * 2 - 1) * rx * 0.95;
      const ly = ey - Math.cos((u - 0.5) * Math.PI) * ry * 0.95 - 0.4;
      const len = (F ? 3.0 : 2.6) + u * 2.6;       // longer toward the outer corner
      const flick = side * (0.7 + u * 1.7);         // curve outward at the tip
      lashes.push({
        d: `M ${f2(lx)} ${f2(ly)} q ${f2(flick * 0.5)} ${f2(-len * 0.6)} ${f2(flick)} ${f2(-len)}`,
        w: F ? 0.9 : 1,
      });
    }
  });

  // ---- brow hairs: short directional strokes laid over the brow ridge so the
  // brow reads as hair, not a painted bar. Combed outward (inner up, outer down).
  const browHairs: Stroke[] = [];
  const browLift0 = (F ? 15 : 11) - 2.5 * chad2;
  const browArch0 = (F ? 6 : 2.5) + 2 * t - 2 * chad2;
  eyeCenters.forEach((e, k) => {
    const side = k === 0 ? -1 : 1;
    const bw = e.rx + 2.5;
    const baseY = eyeY - browLift0;
    const nH = F ? 4 : 6;
    for (let j = 0; j < nH; j++) {
      const u = j / (nH - 1);                       // 0 inner .. 1 outer
      const hx = e.ex + (u * 2 - 1) * bw;
      // follow the brow arch (a shallow parabola peaking at centre)
      const arch = -browArch0 * (1 - Math.pow(u * 2 - 1, 2));
      const hy = baseY + arch + s() * 0.8 * (0.3 + 0.7 * ugly);
      const len = (F ? 2.6 : 3.6) + 1.4 * chad2;
      const up = u < 0.45 ? -len * 0.8 : -len * 0.35;   // inner hairs sweep up more
      browHairs.push({
        d: `M ${f2(hx)} ${f2(hy + len * 0.3)} l ${f2(side * len * 0.7)} ${f2(up)}`,
        w: (F ? 1 : 1.5) + 0.5 * chad2,
      });
    }
  });

  // ---- brows: women high/thin/arched, men low/thick/straight; chaos when ugly ----
  // The prototype drew a thin stroke bar PLUS scribbled hairs, which read as a
  // messy smudge. Each brow is now a single TAPERED FILLED BODY: thick at the
  // head (inner), peaking at the arch, tapering to a fine tail (outer). This is
  // what makes a brow read as a brow at thumbnail size. The hairs (browHairs)
  // become a light texture on top, not the main event.
  const browLift = (F ? 15 : 11) - 2.5 * chad2;       // chad brows ride low & close
  const browArch = (F ? 6 : 2.5) + 2 * t - 2 * chad2; // and flatten/straighten
  // region browProminence biases brow-body thickness (ridge tendency), sized to
  // visibly heavy ↔ light without caricature.
  const browThick = clamp((F ? 1.9 : 3.0) + 1.4 * chad2 - 0.5 * ugly + B.browProminence * 0.6, 1.0, 7);   // half-height at the body
  const brows: FaceGeo['brows'] = eyeCenters.map((e, k) => {
    const side = k === 0 ? -1 : 1;
    const ex = e.ex;
    const ey = eyeY + s() * 9 * A;
    const bw = e.rx + 3.0;
    const lift = browLift + s() * 6 * A;
    const tilt = s() * 7 * A * side;
    // inner head (toward nose), arch peak (~60% out), outer tail
    const inX = ex - side * bw, outX = ex + side * bw;
    const peakX = ex + side * bw * 0.18;
    const baseY = ey - lift;
    const inY = baseY + tilt;
    const peakY = baseY - browArch;
    const outY = baseY - tilt * 0.4 + browArch * 0.4;   // tail dips below the arch
    const th = browThick;
    // top edge: head -> arch -> tail; bottom edge back, tapering to a point at the tail
    const d =
      `M ${f2(inX)} ${f2(inY + th * 0.9)}`
      + ` Q ${f2((inX + peakX) / 2)} ${f2((inY + peakY) / 2 - th)} ${f2(peakX)} ${f2(peakY - th * 0.8)}`
      + ` Q ${f2((peakX + outX) / 2)} ${f2((peakY + outY) / 2 - th * 0.4)} ${f2(outX)} ${f2(outY)}`
      + ` Q ${f2((peakX + outX) / 2)} ${f2((peakY + outY) / 2 + th * 0.5)} ${f2(peakX)} ${f2(peakY + th * 0.7)}`
      + ` Q ${f2((inX + peakX) / 2)} ${f2((inY + peakY) / 2 + th * 0.9)} ${f2(inX)} ${f2(inY + th * 0.9)} Z`;
    return { d, w: F ? 2 : 3.4 + 1.8 * chad2 };
  });

  // ---- nose: real 3D form. The nose is built from a bridge (the dorsum), a
  // rounded ball/tip, two alar wings flanking the nostrils, and a columella
  // between them. Skin mode lights it with a bright dorsal ridge, a specular on
  // the ball, core shadow down the shadow side of the bridge, and a cast pool
  // under the tip — the cues that make a nose project instead of read as a line.
  // Pretty: slim straight bridge, neat tip. Ugly: long, bulbous, leaning, big alae.
  const lean = s() * 12 * A;
  const noseLen = (F ? 20 : 23) + 8 * D;
  // region noseW biases the tip ball half-width (broad ↔ narrow nasal tip). Sized
  // up so a broad-nose draw has a visibly fuller tip than a narrow one.
  const bulbR = (F ? 3 : 3.8) + 6.5 * ugly + B.noseW * 0.7;       // half-width of the ball/tip
  const tipX = cx + lean;
  const tipY = eyeY + 6 + noseLen;
  const rootY = eyeY + 4;                          // nasion (between the brows)
  const bridgeX = cx + lean * 0.25;
  const midY = (rootY + tipY) / 2;
  // dorsum side walls: the two slim edges of the bridge that flare to the alae.
  // region noseBridge biases bridge projection (higher/straighter ↔ lower/flatter).
  // A high-bridge region reads as a narrow, raised dorsum; a low-bridge region as a
  // flatter, broader bridge. We map the bias to dorsal WIDTH (low bridge → wider,
  // flatter-looking dorsum) and to the bridge-highlight strength below.
  const bridgeProj = B.noseBridge;     // signed px, + higher/straighter, − lower/flatter
  const dorsalW = clamp((F ? 1.6 : 2.1) + 1.4 * D - bridgeProj * 0.45, 0.8, 6);   // flatter bridge reads WIDER
  // alar (wing) width — sits a bit wider than the ball, low looks balloons it.
  // region noseW also widens/narrows the alae (nostril wing spread). This is the
  // headline nasal cue: a broad-nose region flares the alae clearly wider.
  const alaW = bulbR + (F ? 1.4 : 1.8) + 2.6 * ugly + B.noseW * 0.9;
  const alaY = tipY - 0.5;
  // ink contour: the prototype ran a hard line all the way up the side wall to the
  // nasion, which read as a harsh inverted-V down the face. Real noses show ink
  // mainly at the TIP/ball underside — the bridge is carried by light, not line.
  // So the contour now starts low (mid-nose), wraps softly under the ball and tip,
  // and the upper bridge is left to the highlight/shadow form.
  const noseD =
    `M ${f2(tipX - bulbR * 1.05)} ${f2(tipY - bulbR * 0.8)}`
    + ` Q ${f2(tipX - bulbR * 1.1)} ${f2(tipY + bulbR * 0.45)} ${f2(tipX - bulbR * 0.3)} ${f2(tipY + bulbR * 0.7)}`
    + ` Q ${f2(tipX)} ${f2(tipY + bulbR * 0.82)} ${f2(tipX + bulbR * 0.3)} ${f2(tipY + bulbR * 0.7)}`
    + ` Q ${f2(tipX + bulbR * 1.1)} ${f2(tipY + bulbR * 0.45)} ${f2(tipX + bulbR * 1.05)} ${f2(tipY - bulbR * 0.8)}`;
  // alar wings: a small curl from the ball outward & up into the cheek crease.
  const ala = [0, 1].map((k) => {
    const side = k === 0 ? -1 : 1;
    return `M ${f2(tipX + side * bulbR * 0.55)} ${f2(tipY + bulbR * 0.55)}`
      + ` Q ${f2(tipX + side * alaW)} ${f2(alaY + bulbR * 0.6)} ${f2(tipX + side * alaW)} ${f2(alaY - bulbR * 0.25)}`
      + ` Q ${f2(tipX + side * alaW * 0.8)} ${f2(alaY - bulbR * 1.0)} ${f2(tipX + side * bulbR * 0.7)} ${f2(tipY - bulbR * 0.4)}`;
  });
  // columella: short tick of the septum dropping between the two nostrils.
  const columella = `M ${f2(tipX)} ${f2(tipY + bulbR * 0.55)} l 0 ${f2(1.4 + 0.6 * ugly)}`;
  // nostrils: kept small & set under the ball. The prototype's were too round &
  // dark (read as clown-nose dots). Now slim ovals, handled by the renderer.
  const nostrils = [
    { cx: tipX - bulbR * 0.6, cy: alaY, r: 0.7 + 0.4 * ugly },
    { cx: tipX + bulbR * 0.6, cy: alaY, r: 0.7 + 0.4 * ugly },
  ];
  // --- skin-mode form for the nose ---
  // bridge highlight: a slim bright ridge running root -> ball on the lit side.
  const bridgeHi =
    `M ${f2(bridgeX)} ${f2(rootY + 2)}`
    + ` Q ${f2((bridgeX + tipX) / 2 - 0.5)} ${f2(midY)} ${f2(tipX - bulbR * 0.15)} ${f2(tipY - bulbR * 0.3)}`;
  // ball specular: small bright dot on the upper-lit quadrant of the tip.
  const ballHi = { cx: tipX - bulbR * 0.3, cy: tipY - bulbR * 0.35, r: Math.max(1.1, bulbR * 0.42) };
  // side-of-bridge core shadow: a soft sliver down the shadow wall, both sides
  // get a touch but the shadow side is darker (handled by the renderer order).
  const sideShade = [0, 1].map((k) => {
    const side = k === 0 ? -1 : 1;
    return `M ${f2(bridgeX + side * dorsalW * 0.4)} ${f2(rootY + 4)}`
      + ` Q ${f2(bridgeX + side * (dorsalW + 1))} ${f2(midY)} ${f2(tipX + side * bulbR * 0.95)} ${f2(tipY - bulbR * 0.2)}`
      + ` Q ${f2(tipX + side * bulbR * 0.3)} ${f2(midY + 2)} ${f2(bridgeX + side * dorsalW * 0.4)} ${f2(rootY + 4)} Z`;
  });
  // cast shadow under the tip: a dark crescent hugging the underside + nostrils.
  const underShade =
    `M ${f2(tipX - alaW * 0.85)} ${f2(alaY + 0.5)}`
    + ` Q ${f2(tipX)} ${f2(tipY + bulbR * 1.5)} ${f2(tipX + alaW * 0.85)} ${f2(alaY + 0.5)}`
    + ` Q ${f2(tipX + bulbR * 0.5)} ${f2(alaY + bulbR * 0.9)} ${f2(tipX)} ${f2(alaY + bulbR)}`
    + ` Q ${f2(tipX - bulbR * 0.5)} ${f2(alaY + bulbR * 0.9)} ${f2(tipX - alaW * 0.85)} ${f2(alaY + 0.5)} Z`;

  // ---- mouth: real lip volume. The seam (vermillion line) is the dark mouth
  // line; above it an upper-lip body with a cupid's bow tucks under the nose
  // (philtrum), below it a fuller lower lip catching a soft sheen. Women & pretty
  // men get full lips w/ a pronounced bow; men thinner & flatter; chad firm/level.
  // Ugly: crooked, off-level seam, thin asymmetric lips. ----
  const mouthY = (F ? 151 : 153) + s() * 4 * A;
  const mw = (F ? 15 : 17) + 3 * D;
  const tilt = s() * 11 * A;
  const smile = (5 * t + s() * 12 * A) * (1 - 0.7 * chad2);   // chad keeps a firm, level mouth
  const Lx = cx - mw, Ly = mouthY - tilt;
  const Rx = cx + mw, Ry = mouthY + tilt;
  // lip fullness: how far the upper lip rises and the lower lip drops from the seam.
  // region lipFull biases overall lip volume; sized so a full-lipped region is
  // clearly thicker, not a 1px nudge. lipEvert adds vermillion EVERSION — the lips
  // roll out and protrude, deepening both bodies and softening the cupid's bow.
  const evert = B.lipEvert;
  const upH = (F ? 4.0 : 2.6) + 2.2 * t - 1.0 * chad2 + B.lipFull * 0.55 + evert * 1.6;     // upper-lip height
  const loH = (F ? 5.2 : 3.4) + 2.6 * t - 0.8 * chad2 + B.lipFull * 0.65 + evert * 2.6;     // lower-lip height (fuller)
  const bowDip = (F ? 1.8 : 1.0) + 0.8 * t - 0.6 * evert;                 // eversion softens the bow
  // the seam: a gentle M-shaped curve (dips at the bow centre) instead of a flat arc.
  const sx = (u: number) => Lx + (Rx - Lx) * u;
  const sy = (u: number) => Ly + (Ry - Ly) * u + smile * Math.sin(u * Math.PI);
  const outline =
    `M ${f2(Lx)} ${f2(Ly)}`
    + ` Q ${f2(sx(0.27))} ${f2(sy(0.27) + 0.6)} ${f2(cx - 1.6)} ${f2(sy(0.5))}`
    + ` Q ${f2(cx)} ${f2(sy(0.5) - 0.4)} ${f2(cx + 1.6)} ${f2(sy(0.5))}`
    + ` Q ${f2(sx(0.73))} ${f2(sy(0.73) + 0.6)} ${f2(Rx)} ${f2(Ry)}`;
  const vermillion = outline;   // the crisp seam line drawn dark in both modes
  // upper lip: cupid's bow for women (and pretty men); fades with ugliness. Strong
  // region eversion also brings the lip body forward so it's always drawn.
  const showUpper = F || t > 0.42 || evert > 0.3;
  const upperLip = showUpper
    ? `M ${f2(Lx + 1)} ${f2(Ly)} Q ${f2(cx - mw * 0.45)} ${f2(mouthY - upH)} ${f2(cx - 2)} ${f2(mouthY - upH * 0.45 + bowDip)}`
      + ` Q ${f2(cx)} ${f2(mouthY - upH * 0.85 + bowDip)} ${f2(cx + 2)} ${f2(mouthY - upH * 0.45 + bowDip)}`
      + ` Q ${f2(cx + mw * 0.45)} ${f2(mouthY - upH)} ${f2(Rx - 1)} ${f2(Ry)}`
    : null;
  const showLower = F || t > 0.38 || evert > 0.3;
  const lowerLip = showLower
    ? `M ${f2(Lx + 2)} ${f2(Ly + 0.5)} Q ${f2(cx)} ${f2(mouthY + smile + loH)} ${f2(Rx - 2)} ${f2(Ry + 0.5)}`
    : null;
  // closed lip bodies (skin mode fills): upper body = bow top -> seam; lower body
  // = seam -> lower edge. Built as closed paths so they can take a lip tint.
  const upperBody = showUpper
    ? upperLip + ` Q ${f2(sx(0.73))} ${f2(sy(0.73) + 0.6)} ${f2(cx + 1.6)} ${f2(sy(0.5))}`
      + ` Q ${f2(cx)} ${f2(sy(0.5) - 0.4)} ${f2(cx - 1.6)} ${f2(sy(0.5))}`
      + ` Q ${f2(sx(0.27))} ${f2(sy(0.27) + 0.6)} ${f2(Lx + 1)} ${f2(Ly)} Z`
    : null;
  const lowerBody = showLower
    ? `M ${f2(Lx + 2)} ${f2(Ly + 0.5)}`
      + ` Q ${f2(sx(0.27))} ${f2(sy(0.27) + 0.6)} ${f2(cx - 1.6)} ${f2(sy(0.5))}`
      + ` Q ${f2(cx)} ${f2(sy(0.5) - 0.4)} ${f2(cx + 1.6)} ${f2(sy(0.5))}`
      + ` Q ${f2(sx(0.73))} ${f2(sy(0.73) + 0.6)} ${f2(Rx - 2)} ${f2(Ry + 0.5)}`
      + ` Q ${f2(cx)} ${f2(mouthY + smile + loH)} ${f2(Lx + 2)} ${f2(Ly + 0.5)} Z`
    : null;
  // soft sheen on the lower lip (wet highlight), set just below the seam centre.
  const lowerHi = showLower
    ? { cx: cx + smile * 0.15, cy: mouthY + smile + loH * 0.45, rx: mw * 0.34, ry: loH * 0.34 }
    : null;
  // philtrum: the two faint ridges running from the nose base to the bow peaks.
  const philtrumTopY = mouthY - upH - (F ? 4.5 : 3.5);
  const philtrum = (showUpper && philtrumTopY > tipY - 2)
    ? [
        `M ${f2(cx - 1.7)} ${f2(philtrumTopY)} Q ${f2(cx - 2.1)} ${f2((philtrumTopY + mouthY) / 2)} ${f2(cx - 2)} ${f2(mouthY - upH * 0.45 + bowDip)}`,
        `M ${f2(cx + 1.7)} ${f2(philtrumTopY)} Q ${f2(cx + 2.1)} ${f2((philtrumTopY + mouthY) / 2)} ${f2(cx + 2)} ${f2(mouthY - upH * 0.45 + bowDip)}`,
      ]
    : [];
  // corner shade: a soft dab of shadow pooling at each mouth corner (the modiolus),
  // giving the seam depth where the lips meet.
  const cornerShade = [
    { cx: Lx + 0.5, cy: Ly, r: 2.0 + 1.2 * t },
    { cx: Rx - 0.5, cy: Ry, r: 2.0 + 1.2 * t },
  ];
  // lip tint: a muted rose pulled toward the skin so it never reads as lipstick;
  // women a touch warmer/redder, men more neutral.
  const lipFill = F ? '#bd7163' : '#a9756a';
  const teeth = (!F && ugly > 0.6 && r() < 0.6)
    ? (() => { const tx = cx + (r() < 0.5 ? -1 : 1) * (mw * 0.4); const ty = mouthY + smile - 1; return `M ${f2(tx - 2)} ${f2(ty)} l 4 0 l -0.5 5 l -3 0 Z`; })()
    : null;

  // ---- ears: matched when pretty; mismatched / sticking out when not ----
  const ears: FaceGeo['ears'] = [0, 1].map((k) => {
    const side = k === 0 ? -1 : 1;
    const ex = cx + side * (headW * 0.86);
    const ey = eyeY + 8;
    const sc = 1 + (k === 0 ? s() : s()) * 0.5 * A;
    const out = side * (6 + 5 * A * Math.abs(s())) * sc;
    return { d: `M ${f2(ex)} ${f2(ey - 8 * sc)} q ${f2(out)} ${f2(2)} ${f2(out * 0.6)} ${f2(10 * sc)} q ${f2(-out * 0.4)} ${f2(8 * sc)} ${f2(-out * 0.7)} ${f2(6 * sc)}` };
  });

  // ---- cheekbone/jaw definition ----
  // PRIOR ART DIRECTION NOTE: the old version drew hard ink "parenthesis" strokes
  // from cheekbone to chin plus a second hard hollow line — they read as carved
  // scars, not bone. Jaw/cheek structure is FORM, not line. So the ink layer now
  // carries only the faintest cleft-chin tick (chad). All cheekbone & jaw volume
  // is done purely with soft, clipped, blurred plane-shadow paint (see shading
  // below: cheekHollow + jawShade), which is what actually reads as a face.
  const jaw: FaceGeo['jaw'] = [];
  if (chad2 > 0.25) {
    // a whisper of a cleft-chin tick, only on the most chiselled faces
    jaw.push({ d: `M ${f2(cx)} ${f2(headCy + headH * 0.84)} l 0 ${f2(3.5 * chad2)}`, w: 1.4 });
  }

  // ---- facial hair (men, looks-independent): some get a moustache or short beard ----
  let beard: string | null = null;
  let mustache: string | null = null;
  if (!F) {
    const fh = r();
    if (fh < 0.16) {                 // short beard
      const by = mouthY + smile + 9;
      beard = `M ${f2(cx - headW * 0.78)} ${f2(eyeY + 18)}`
        + ` C ${f2(cx - headW * 0.7)} ${f2(headCy + headH * 0.72)} ${f2(cx - headW * 0.3)} ${f2(headCy + headH * 1.0)} ${f2(cx)} ${f2(headCy + headH * 1.02)}`
        + ` C ${f2(cx + headW * 0.3)} ${f2(headCy + headH * 1.0)} ${f2(cx + headW * 0.7)} ${f2(headCy + headH * 0.72)} ${f2(cx + headW * 0.78)} ${f2(eyeY + 18)}`
        + ` C ${f2(cx + headW * 0.4)} ${f2(by + 10)} ${f2(cx + 14)} ${f2(by)} ${f2(cx)} ${f2(by)}`
        + ` C ${f2(cx - 14)} ${f2(by)} ${f2(cx - headW * 0.4)} ${f2(by + 10)} ${f2(cx - headW * 0.78)} ${f2(eyeY + 18)} Z`;
    } else if (fh < 0.4) {           // moustache
      const my = (tipY + mouthY) / 2 + 1;
      mustache = `M ${f2(cx - 13)} ${f2(my)} Q ${f2(cx - 6)} ${f2(my + 5)} ${f2(cx)} ${f2(my + 2)} Q ${f2(cx + 6)} ${f2(my + 5)} ${f2(cx + 13)} ${f2(my)}`;
    }
  }

  // ---- stubble shadow: chad-only speckle over the jaw, chin & upper lip ----
  const stubble: FaceGeo['stubble'] = [];
  if (chad2 > 0.1 && !beard) {
    const n = Math.floor(54 * chad2);
    const yTop = tipY + 3, yBot = headCy + headH * 0.9;
    for (let i = 0; i < n; i++) {
      const x = cx + s() * headW * 0.6;
      const y = yTop + r() * (yBot - yTop);
      if (Math.abs(y - mouthY) < 6 && Math.abs(x - cx) < mw + 2) continue;  // keep lips clean
      stubble.push({ cx: x, cy: y, r: 0.6 + r() * 0.5 });
    }
  }

  // ---- blemishes (warts/moles): comedic, low looks only ----
  const blemishes: FaceGeo['blemishes'] = [];
  const nBlem = Math.floor(ugly * 3.4 * r());
  for (let i = 0; i < nBlem; i++) {
    blemishes.push({ cx: cx + s() * headW * 0.55, cy: headCy + s() * headH * 0.45, r: 1.4 + r() * 1.8 });
  }

  // ---- 3D form shading regions (consumed by the renderer when skin fill is on).
  // A single light from upper-left gives the face volume: a bright highlight on
  // the forehead/cheek nearest the light, soft core shadows on the far temple,
  // under the cheekbones, beside the nose, and under the jaw + into the neck.
  const bbox = { x: cx - headW * 1.05, y: top - 4, w: headW * 2.1, h: headH * 2 };
  // light comes from the upper-left; nudge focus a touch by seed for variety
  const lightX = 0.36 + 0.05 * s();
  const lightY = 0.30 + 0.04 * s();
  const chinY = headCy + headH * (F ? 0.985 : 1.04 + 0.07 * chad2);
  // cheek-hollow darkness: barely-there on ordinary faces (just enough to round
  // the cheek), ramping up for gaunt/chiselled chad faces.
  const cheekStrength = 0.16 + 0.30 * chad2 + 0.06 * t;
  // cheek hollow: a soft, slanted plane sitting UNDER the cheekbone and angling
  // down toward the mouth corner (the natural buccal hollow), not a horizontal
  // lens that reads as an eye-bag. Tucked in toward the side so it never crosses
  // the centre of the cheek. Subtle by default; deepens (and rides higher/gaunter)
  // only for chad. Drawn soft + heavily blurred so it's form, never a line.
  const cheekHollow = [0, 1].map((k) => {
    const side = k === 0 ? -1 : 1;
    const topX = cx + side * headW * 0.58;          // starts just under the cheekbone
    const topY = eyeY + 13;
    const botX = cx + side * headW * 0.30;          // sweeps in toward the mouth
    const botY = eyeY + 34 + 4 * chad2;
    const w = headW * (0.16 + 0.05 * chad2);        // band thickness
    // a leaf-shaped plane following the diagonal from cheekbone to mouth corner
    return { d: `M ${f2(topX)} ${f2(topY)}`
      + ` Q ${f2(topX - side * w * 0.3)} ${f2((topY + botY) / 2)} ${f2(botX)} ${f2(botY)}`
      + ` Q ${f2(botX + side * w)} ${f2((topY + botY) / 2)} ${f2(topX + side * w * 0.6)} ${f2(topY + 2)}`
      + ` Q ${f2(topX + side * w * 0.2)} ${f2(topY - 1)} ${f2(topX)} ${f2(topY)} Z` };
  });
  // temple shade: the side-of-forehead plane turning away from the light (far
  // side gets more). Two soft wedges hugging the upper head edge.
  const templeShade = [0, 1].map((k) => {
    const side = k === 0 ? -1 : 1;
    const x0 = cx + side * headW * 0.70;
    const yTop = top + headH * 0.30;
    return { d: `M ${f2(x0)} ${f2(yTop)} Q ${f2(cx + side * headW * 0.92)} ${f2(yTop + 14)} ${f2(x0)} ${f2(yTop + 34)}`
      + ` Q ${f2(cx + side * headW * 0.55)} ${f2(yTop + 18)} ${f2(x0)} ${f2(yTop)} Z` };
  });
  // under-jaw / submental core shadow: a dark crescent under the chin & jaw,
  // bleeding into the neck so the head reads as sitting forward of the neck.
  const jawShade =
    `M ${f2(cx - jawW * 0.92)} ${f2(chinY - 16)}`
    + ` Q ${f2(cx)} ${f2(chinY + 12)} ${f2(cx + jawW * 0.92)} ${f2(chinY - 16)}`
    + ` Q ${f2(cx + neckW + 3)} ${f2(chinY + 4)} ${f2(cx + neckW)} ${f2(chinY + 14)}`
    + ` Q ${f2(cx)} ${f2(chinY + 22)} ${f2(cx - neckW)} ${f2(chinY + 14)}`
    + ` Q ${f2(cx - neckW - 3)} ${f2(chinY + 4)} ${f2(cx - jawW * 0.92)} ${f2(chinY - 16)} Z`;
  // nose shade: the cast/turning plane on the shadow side of the nose + a soft
  // pool under the tip — the single biggest cue that the nose projects forward.
  const nsSide = lightX < 0.5 ? 1 : -1;            // shadow falls opposite the light
  const noseShade =
    `M ${f2(cx + nsSide * 1)} ${f2(eyeY + 7)}`
    + ` Q ${f2(tipX + nsSide * (bulbR + 2.5))} ${f2((eyeY + tipY) / 2 + 2)} ${f2(tipX + nsSide * (bulbR + 1))} ${f2(tipY + 1)}`
    + ` Q ${f2(tipX)} ${f2(tipY + bulbR * 1.4)} ${f2(tipX - nsSide * bulbR * 0.4)} ${f2(tipY + bulbR)}`
    + ` Q ${f2(tipX + nsSide * 1.5)} ${f2(tipY - 3)} ${f2(cx + nsSide * 1)} ${f2(eyeY + 7)} Z`;

  // ---- hair: seed-chosen style per sex ----
  let hairPath: string | null = null;
  let hairBackPath: string | null = null;
  let hairShade: FaceGeo['hairShade'] = null;
  if (hair) {
    const style = ((seed32 >>> 4) % 3);   // unsigned: avoids negative %→always-updo bug
    const h = buildHair(sex, style, { cx, cy: headCy, hw: headW, hh: headH, eyeY, top }, phe.pheno.texture01);
    hairPath = h.front;
    hairBackPath = h.back;

    // ---- hair 3D form (skin mode): turn the flat cap into a lit mass.
    // The crown catches the light (upper-left), the hairline & temples fall into
    // a soft root shadow, a glossy sheen band sweeps across the upper crown, and
    // a few strand lines flow from the part/crown down the style. Long female
    // styles get longer, side-falling strands; short male styles get a tighter
    // swept set. All deterministic; colours tie to hairColor in the renderer.
    const fy = eyeY - 21;                       // hairline baseline (matches buildHair)
    const hairTop = top - (F ? 20 : 11);        // top of the cap (matches buildHair)
    const crownCx = cx - headW * 0.22;          // crown highlight sits toward the light
    const crownCy = hairTop + (fy - hairTop) * 0.34;
    const long = F && (style === 0 || style === 1);   // styles that fall past the jaw
    const reach = long ? headH * (style === 0 ? 1.12 : 0.62) : 0;

    const crown = { cx: crownCx, cy: crownCy, r: headW * 0.66 };
    // root shadow: a dark band hugging the hairline + a pool at each temple where
    // the hair turns away from the light, giving the mass a soft underside.
    const rootShadow: string[] = [
      `M ${f2(cx - headW * 0.95)} ${f2(fy + 6)} Q ${f2(cx)} ${f2(fy + 13)} ${f2(cx + headW * 0.95)} ${f2(fy + 6)}`
        + ` Q ${f2(cx + headW * 0.6)} ${f2(fy - 2)} ${f2(cx)} ${f2(fy - 1)}`
        + ` Q ${f2(cx - headW * 0.6)} ${f2(fy - 2)} ${f2(cx - headW * 0.95)} ${f2(fy + 6)} Z`,
      // far-side (light opposite) temple pool, a touch heavier
      `M ${f2(cx + headW * 0.72)} ${f2(hairTop + 14)} Q ${f2(cx + headW * 1.02)} ${f2(fy - 4)} ${f2(cx + headW * 0.78)} ${f2(fy + 8)}`
        + ` Q ${f2(cx + headW * 0.6)} ${f2(fy - 6)} ${f2(cx + headW * 0.72)} ${f2(hairTop + 14)} Z`,
    ];
    // sheen: a soft arc band sweeping over the crown, offset to the lit side. This
    // is the single biggest "hair not a helmet" cue.
    const shCx = cx - headW * 0.18;
    const shTop = hairTop + (fy - hairTop) * 0.18;
    const sheen =
      `M ${f2(shCx - headW * 0.62)} ${f2(shTop + 10)}`
      + ` Q ${f2(shCx - headW * 0.30)} ${f2(shTop - 4)} ${f2(shCx + headW * 0.10)} ${f2(shTop)}`
      + ` Q ${f2(shCx + headW * 0.48)} ${f2(shTop + 4)} ${f2(shCx + headW * 0.66)} ${f2(shTop + 16)}`
      + ` Q ${f2(shCx + headW * 0.30)} ${f2(shTop + 9)} ${f2(shCx - headW * 0.10)} ${f2(shTop + 11)}`
      + ` Q ${f2(shCx - headW * 0.40)} ${f2(shTop + 12)} ${f2(shCx - headW * 0.62)} ${f2(shTop + 10)} Z`;
    // strands: a handful of flow lines from the crown radiating down over the cap.
    // HAIR TEXTURE drives their shape: straight hair → smooth single arcs; wavy →
    // a gentle S; curly/coiled → tight, higher-frequency ripples. A strand is
    // emitted as a poly-line of small segments perpendicular-offset by a sine wave
    // whose frequency & amplitude rise with texture. Deterministic (uses `wob`).
    const tex = phe.pheno.texture01;
    // cycles & amplitude of the ripple along the strand, by texture
    const cycles = 0.4 + tex * tex * 4.6;     // straight ≈0.4 (almost none) → coiled ≈5.0
    // amplitude ramps hard at the coiled end so curl reads even at 140px thumbnails.
    const amp = Math.pow(tex, 1.5) * (long ? 4.2 : 3.4);
    // build a textured strand path between (x0,y0)→(x1,y1) with a baseline bow at
    // the control point (bowX,bowY) and a sine ripple of `ph` phase offset.
    const texturedStrand = (x0: number, y0: number, x1: number, y1: number, bowX: number, bowY: number, ph: number): string => {
      const segs = 8;
      // direction & perpendicular for the ripple offset
      const dx = x1 - x0, dy = y1 - y0;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len;     // unit perpendicular
      let d = `M ${f2(x0)} ${f2(y0)}`;
      for (let q = 1; q <= segs; q++) {
        const tt = q / segs;
        // quadratic baseline (bow) so the strand still follows the styled sweep
        const bx = (1 - tt) * (1 - tt) * x0 + 2 * (1 - tt) * tt * bowX + tt * tt * x1;
        const by = (1 - tt) * (1 - tt) * y0 + 2 * (1 - tt) * tt * bowY + tt * tt * y1;
        // ripple amplitude tapers in at the root & out at the tip
        const env = Math.sin(tt * Math.PI);
        const off = amp * env * Math.sin(ph + tt * Math.PI * 2 * cycles);
        d += ` L ${f2(bx + nx * off)} ${f2(by + ny * off)}`;
      }
      return d;
    };
    const strands: { d: string; w: number }[] = [];
    const nStrand = long ? 7 : 5;
    for (let j = 0; j < nStrand; j++) {
      const u = j / (nStrand - 1);    // 0 left .. 1 right (nStrand is always ≥5)
      const sx0 = cx + (u * 2 - 1) * headW * 0.74;          // fan out from crown
      const startY = hairTop + 4 + Math.abs(u - 0.5) * 10;  // crown dome
      const wob2 = wob[(j * 3) % N];                         // seeded gentle waver
      const ph = wob2 * Math.PI;                             // seeded ripple phase
      if (long) {
        // long: strands sweep out to the sides and fall toward the jaw/shoulder
        const side = u < 0.5 ? -1 : 1;
        const endX = cx + (u * 2 - 1) * headW * (0.86 + 0.18 * Math.abs(u - 0.5));
        const endY = fy + reach * (0.6 + 0.4 * Math.abs(u - 0.5));
        const midX = (sx0 + endX) / 2 + side * 5 + wob2 * 3;
        const midY = (startY + endY) / 2 - 4;
        strands.push({ d: texturedStrand(sx0, startY, endX, endY, midX, midY, ph), w: 1.0 });
      } else {
        // short: strands sweep across the forehead toward the part, shorter arcs
        const endX = sx0 + (cx - sx0) * 0.32 + wob2 * 2;
        const endY = fy + 1 + Math.abs(u - 0.5) * 4;
        const midX = (sx0 + endX) / 2;
        const midY = (startY + endY) / 2 - 3;
        strands.push({ d: texturedStrand(sx0, startY, endX, endY, midX, midY, ph), w: 0.9 });
      }
    }
    const hbX = cx - headW - 12;
    const hbW = (headW + 12) * 2;
    const hbY = hairTop - 4;
    const hbH = (fy + reach + 16) - hbY;
    hairShade = { crown, rootShadow, sheen, strands, bbox: { x: hbX, y: hbY, w: hbW, h: hbH } };
  }

  // ---- headwear: optional, composable head piece (deterministic per seed) ----
  const headwearGeo = buildHeadwear(
    headwear, sex, seed32,
    { cx, cy: headCy, hw: headW, hh: headH, eyeY, top },
  );

  return {
    t, cx, sex,
    // skin & hair colour now come from the region phenotype draw (deterministic,
    // looks-independent). The legacy flat palettes are kept only as a fallback.
    skinColor: phe.skinColor,
    hairColor: phe.hairColor,
    phenotype: phe.pheno,
    headPath, neckPath,
    shading: { lightX, lightY, bbox, cheekHollow, cheekStrength, templeShade, jawShade, noseShade },
    hairPath, hairBackPath, hairShade,
    ears, brows, browHairs, lashes, eyes,
    nose: { d: noseD, nostrils, ala, bridgeHi, ballHi, sideShade, underShade, columella },
    mouth: {
      outline, upperLip, lowerLip, teeth,
      upperBody, lowerBody, lowerHi, philtrum, cornerShade, vermillion, lipFill,
    },
    beard, mustache, stubble,
    blemishes, jaw,
    centerline: { x: cx, y1: top - 2, y2: headCy + headH + 2 },
    headwear: headwearGeo,
  };
}
