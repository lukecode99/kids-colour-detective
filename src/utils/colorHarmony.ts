// Colour-harmony suggestions for a saved colour: complementary (180°),
// analogous (±30°), triadic (±120°), plus a 60-30-10 room scheme. Every
// suggestion is mapped to the nearest real paint in the dataset — the UI
// never shows a bare hex the user can't buy.
import { rgbToHsl, hslToRgb, rgbToLab } from './colorMath';
import { matchPaintsLab, Paint, PAINTS } from './paintMatcher';

export type Rgb3 = [number, number, number];

export type HarmonyRole = 'complementary' | 'analogous' | 'triadic';

export interface PaintSuggestion {
  role: HarmonyRole;
  angle: number; // hue rotation from the base colour, degrees
  paint: Paint;
  deltaE: number; // distance from the ideal harmony colour to the paint
  outsideFilters?: boolean; // filtered pool couldn't supply this role — paint is from the full dataset
}

export interface RoomScheme {
  main: Paint; // 60% — walls: the base colour itself as a real paint
  secondary: Paint; // 30% — analogous: harmonious larger accents
  accent: Paint; // 10% — complementary: the pop
  mainOutsideFilters?: boolean;
  secondaryOutsideFilters?: boolean;
  accentOutsideFilters?: boolean;
}

// Harmony targets for near-neutral bases would just be more grey (rotating
// the hue of grey is a no-op), so lift saturation to a visible floor and
// keep lightness in a paintable band before rotating.
const MIN_TARGET_SAT = 0.35;
const NEUTRAL_SAT = 0.15;
const MIN_TARGET_L = 0.25;
const MAX_TARGET_L = 0.8;

export function harmonyTarget(rgb: Rgb3, angle: number): Rgb3 {
  const [h, s, l] = rgbToHsl(rgb[0], rgb[1], rgb[2]);
  const ts = s < NEUTRAL_SAT ? MIN_TARGET_SAT : s;
  const tl = Math.min(MAX_TARGET_L, Math.max(MIN_TARGET_L, l));
  return hslToRgb(h + angle, ts, tl);
}

const paintKey = (p: Paint) => `${p.brand}|${p.code}|${p.name}`;

// Nearest paint to `rgb` that isn't already used by another suggestion, so
// one palette never shows the same tin twice.
export function nearestDistinctPaint(
  rgb: Rgb3,
  used: Set<string>,
  candidates: Paint[] = PAINTS
): { paint: Paint; deltaE: number } {
  const matches = matchPaintsLab(rgbToLab(rgb[0], rgb[1], rgb[2]), 10, candidates);
  const pick = matches.find(m => !used.has(paintKey(m.paint))) ?? matches[0];
  used.add(paintKey(pick.paint));
  return { paint: pick.paint, deltaE: pick.deltaE };
}

// Prefers the user's filtered candidates; when that pool can't supply an
// unused paint (empty filters result, or every close paint already used),
// falls back to the full dataset and flags the pick so the UI can label it
// "outside your filters" instead of silently widening (CD-15).
function pickWithFilterFallback(
  target: Rgb3,
  used: Set<string>,
  candidates: Paint[]
): { paint: Paint; deltaE: number; outsideFilters: boolean } {
  if (candidates.length) {
    const matches = matchPaintsLab(rgbToLab(target[0], target[1], target[2]), 10, candidates);
    const pick = matches.find(m => !used.has(paintKey(m.paint)));
    if (pick) {
      used.add(paintKey(pick.paint));
      return { paint: pick.paint, deltaE: pick.deltaE, outsideFilters: false };
    }
  }
  const full = nearestDistinctPaint(target, used);
  return { ...full, outsideFilters: candidates !== PAINTS };
}

const HARMONY_ANGLES: { role: HarmonyRole; angle: number }[] = [
  { role: 'complementary', angle: 180 },
  { role: 'analogous', angle: -30 },
  { role: 'analogous', angle: 30 },
  { role: 'triadic', angle: 120 },
  { role: 'triadic', angle: 240 },
];

export function harmonySuggestions(rgb: Rgb3, candidates: Paint[] = PAINTS): PaintSuggestion[] {
  const used = new Set<string>();
  // Reserve the base colour's own paint so suggestions differ from it.
  pickWithFilterFallback(rgb, used, candidates);
  return HARMONY_ANGLES.map(({ role, angle }) => {
    const target = harmonyTarget(rgb, angle);
    const { paint, deltaE, outsideFilters } = pickWithFilterFallback(target, used, candidates);
    return outsideFilters ? { role, angle, paint, deltaE, outsideFilters } : { role, angle, paint, deltaE };
  });
}

// 60-30-10: walls in the base colour, larger accents analogous, the pop
// complementary. All three are real, distinct paints.
export function roomScheme(rgb: Rgb3, candidates: Paint[] = PAINTS): RoomScheme {
  const used = new Set<string>();
  const main = pickWithFilterFallback(rgb, used, candidates);
  const secondary = pickWithFilterFallback(harmonyTarget(rgb, 30), used, candidates);
  const accent = pickWithFilterFallback(harmonyTarget(rgb, 180), used, candidates);
  return {
    main: main.paint,
    secondary: secondary.paint,
    accent: accent.paint,
    ...(main.outsideFilters && { mainOutsideFilters: true }),
    ...(secondary.outsideFilters && { secondaryOutsideFilters: true }),
    ...(accent.outsideFilters && { accentOutsideFilters: true }),
  };
}
