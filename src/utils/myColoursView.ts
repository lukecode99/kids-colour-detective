// CD-19: what the My Colours tab shows. The live scan never renders here —
// it belongs to the Scan tab alone; My Colours is the saved captures only.
// The screen and its tests share these helpers so the render condition is
// pinned down in one place.
import { SavedColorEntry } from './savedColors';
import { CurrentColour } from './currentColour';
import { Paint, PAINTS } from './paintMatcher';
import { PaintFilters, EMPTY_FILTERS, applyFilters } from './filters';

export interface MyColoursCard {
  kind: 'capture';
  entry: SavedColorEntry;
}

// One card per saved capture, newest first (savedColors already stores them
// that way). The current scan is deliberately ignored: mid-scan, post-save
// or on a fresh launch, no CURRENT SCAN card ever appears in My Colours.
export function buildMyColoursCards(
  current: CurrentColour | null,
  saved: SavedColorEntry[]
): MyColoursCard[] {
  return saved.map(entry => ({ kind: 'capture', entry }));
}

// The empty state depends only on saved captures — a live scan in progress
// must not suppress it (that's how the duplicate card snuck in pre-CD-19).
export function isMyColoursEmpty(
  current: CurrentColour | null,
  saved: SavedColorEntry[]
): boolean {
  return saved.length === 0;
}

// CD-20: each capture carries its own filter set (room-level preferences),
// so a card's matches and goes-with palette compute against ITS candidates,
// never a shared pool. Entries missing a set (mid-migration) fall back to
// unfiltered rather than someone else's preferences.
export function captureFilters(entry: SavedColorEntry): PaintFilters {
  return entry.filters ?? EMPTY_FILTERS;
}

export function captureCandidates(entry: SavedColorEntry, paints: Paint[] = PAINTS): Paint[] {
  return applyFilters(paints, captureFilters(entry));
}
