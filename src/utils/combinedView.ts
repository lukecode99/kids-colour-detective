// Combined match view (CD-11): everything the Matches screen shows for a
// colour in one call — the top paint matches AND the goes-with palette
// (60-30-10 room scheme + harmony suggestions) — so matches and scheme
// ideas always describe the same colour on the same screen.
import { matchPaintsLab, Paint, PaintMatch, PAINTS } from './paintMatcher';
import { rgbToLab } from './colorMath';
import {
  harmonySuggestions,
  roomScheme,
  PaintSuggestion,
  RoomScheme,
  Rgb3,
} from './colorHarmony';

export interface CombinedView {
  matches: PaintMatch[];
  scheme: RoomScheme;
  suggestions: PaintSuggestion[];
}

// `candidates` (the user's brand/surface/finish filters) narrows the
// matches only; goes-with ideas always draw on the full dataset so a
// tight filter can't empty the palette.
export function buildCombinedView(
  rgb: Rgb3,
  candidates: Paint[] = PAINTS,
  limit = 5
): CombinedView {
  const [r, g, b] = rgb;
  return {
    matches: matchPaintsLab(rgbToLab(r, g, b), limit, candidates),
    scheme: roomScheme(rgb),
    suggestions: harmonySuggestions(rgb),
  };
}
