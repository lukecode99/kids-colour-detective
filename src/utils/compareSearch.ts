// Compare tab (CD, 20-Nov): search the whole dataset by colour name (across every
// brand) and line up to four swatches side by side. Pure utils so the search ranking
// and the add/remove rules are unit-testable without the screen.
import { Paint, PAINTS } from './paintMatcher';
import { rgbToHex } from './colorMath';

export const COMPARE_LIMIT = 4;
const SEARCH_LIMIT = 30;

// One slot in the side-by-side strip. A slot is either a catalogue paint (from search)
// or a captured colour from a scan / My Colours, which has a hex but no brand range.
export interface CompareItem {
  id: string; // stable key: `${brand}|${name}|${code}` for paints, `capture|${hex}|${ts}` for captures
  name: string;
  brand?: string; // absent for captures
  finish?: string; // first finish, shown as the sub-line ("Easycare · Matt" style)
  hex: string;
  source: 'search' | 'scan' | 'saved';
}

function firstFinish(p: Paint): string | undefined {
  return p.finishes && p.finishes.length ? p.finishes[0] : undefined;
}

export function paintItemId(p: Paint): string {
  return `${p.brand}|${p.name}|${p.code}`;
}

// Turn a catalogue paint into a compare slot.
export function paintToCompareItem(p: Paint, source: 'search' | 'scan' = 'search'): CompareItem {
  return {
    id: paintItemId(p),
    name: p.name,
    brand: p.brand,
    finish: firstFinish(p),
    hex: p.hex,
    source,
  };
}

// Turn a saved/scanned capture into a compare slot. Captures have no brand range,
// so the sub-line falls back to "From your scan" / "From My Colours" in the UI.
export function captureToCompareItem(
  hex: string,
  name: string,
  timestamp: number,
  source: 'scan' | 'saved',
): CompareItem {
  return {
    id: `capture|${hex.toLowerCase()}|${timestamp}`,
    name,
    hex,
    source,
  };
}

// Case-insensitive name search across EVERY brand (this is the "search by name"
// half of the Compare tab). Ranks exact names first, then name-starts-with, then
// any substring; ties break A→Z then by brand so the list is stable. Code matches
// are included too so a user who knows the code still lands the colour.
export function searchByName(query: string, paints: Paint[] = PAINTS): Paint[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored: { p: Paint; rank: number }[] = [];
  for (const p of paints) {
    const name = p.name.toLowerCase();
    let rank: number;
    if (name === q) rank = 0;
    else if (name.startsWith(q)) rank = 1;
    else if (name.includes(q)) rank = 2;
    else if (p.code && p.code.toLowerCase().includes(q)) rank = 3;
    else continue;
    scored.push({ p, rank });
  }
  scored.sort(
    (a, b) =>
      a.rank - b.rank ||
      a.p.name.localeCompare(b.p.name) ||
      a.p.brand.localeCompare(b.p.brand),
  );
  return scored.slice(0, SEARCH_LIMIT).map(s => s.p);
}

// Add an item to the strip: capped at COMPARE_LIMIT, and a given colour can't be
// added twice (same id). Returns the original array unchanged when either guard trips,
// so a caller can detect a no-op by reference equality.
export function addToCompare(items: CompareItem[], item: CompareItem): CompareItem[] {
  if (items.length >= COMPARE_LIMIT) return items;
  if (items.some(i => i.id === item.id)) return items;
  return [...items, item];
}

export function removeFromCompare(items: CompareItem[], id: string): CompareItem[] {
  return items.filter(i => i.id !== id);
}

export function isInCompare(items: CompareItem[], id: string): boolean {
  return items.some(i => i.id === id);
}

// Guard used when seeding a slot straight from a scan's RGB — keeps the hex well-formed
// even if a caller passes raw channels.
export function rgbHex(rgb: [number, number, number]): string {
  return rgbToHex(rgb[0], rgb[1], rgb[2]);
}
