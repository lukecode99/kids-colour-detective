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
// matches AND the goes-with ideas (CD-15). A tight filter still can't
// empty the palette: when a role can't be filled from the filtered pool,
// colorHarmony falls back to the full dataset and flags the pick as
// outsideFilters so the UI can label it honestly.
export function buildCombinedView(
  rgb: Rgb3,
  candidates: Paint[] = PAINTS,
  limit = 5
): CombinedView {
  const [r, g, b] = rgb;
  return {
    matches: matchPaintsLab(rgbToLab(r, g, b), limit, candidates),
    scheme: roomScheme(rgb, candidates),
    suggestions: harmonySuggestions(rgb, candidates),
  };
}
