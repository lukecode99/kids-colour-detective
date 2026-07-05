// CD-19: the current scan must never render in My Colours — Scan tab only.
// CD-20: each card's matches compute against ITS OWN filter set.
import {
  buildMyColoursCards,
  isMyColoursEmpty,
  captureFilters,
  captureCandidates,
} from '../myColoursView';
import { CurrentColour } from '../currentColour';
import { SavedColorEntry } from '../savedColors';
import { EMPTY_FILTERS, PaintFilters } from '../filters';
import { PAINTS, matchPaintsLab } from '../paintMatcher';

const scan: CurrentColour = { rgb: [180, 180, 178], hex: '#B4B4B2', name: 'Ash' };

function entry(id: string, hex = '#B4B4B2', filters?: PaintFilters): SavedColorEntry {
  return {
    id,
    hex,
    rgb: [180, 180, 178],
    lab: [73, 0, 1],
    name: 'Ash',
    emoji: '🩶',
    match: 'Dulux — Polished Pebble (96%)',
    timestamp: 1720000000000,
    filters,
  };
}

describe('buildMyColoursCards (CD-19 render condition)', () => {
  it('mid-scan with nothing saved renders no cards — no CURRENT SCAN block', () => {
    expect(buildMyColoursCards(scan, [])).toEqual([]);
  });

  it('after saving a scan there is exactly ONE card for that capture', () => {
    const cards = buildMyColoursCards(scan, [entry('a')]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toEqual({ kind: 'capture', entry: entry('a') });
  });

  it('never emits anything but capture cards, whatever the scan state', () => {
    const saved = [entry('a'), entry('b', '#112233')];
    for (const current of [scan, null]) {
      const cards = buildMyColoursCards(current, saved);
      expect(cards).toHaveLength(saved.length);
      expect(cards.every(c => c.kind === 'capture')).toBe(true);
    }
  });

  it('fresh launch (no live scan) shows the saved captures in stored order', () => {
    const saved = [entry('newest'), entry('older')];
    expect(buildMyColoursCards(null, saved).map(c => c.entry.id)).toEqual([
      'newest',
      'older',
    ]);
  });
});

describe('isMyColoursEmpty', () => {
  it('is empty with no saved captures even while a scan is live', () => {
    expect(isMyColoursEmpty(scan, [])).toBe(true);
    expect(isMyColoursEmpty(null, [])).toBe(true);
  });

  it('is not empty once a capture is saved', () => {
    expect(isMyColoursEmpty(null, [entry('a')])).toBe(false);
    expect(isMyColoursEmpty(scan, [entry('a')])).toBe(false);
  });
});

describe('per-capture filter independence (CD-20)', () => {
  const KITCHEN: PaintFilters = { brands: ['Dulux'], surfaces: [], finishes: [] };
  const BEDROOM: PaintFilters = { brands: [], surfaces: [], finishes: ['matt'] };

  it('two cards with different filter sets get different candidate pools', () => {
    const kitchen = entry('kitchen', '#B4B4B2', KITCHEN);
    const bedroom = entry('bedroom', '#B4B4B2', BEDROOM);

    const kitchenPool = captureCandidates(kitchen);
    const bedroomPool = captureCandidates(bedroom);

    expect(kitchenPool.every(p => p.brand === 'Dulux')).toBe(true);
    expect(bedroomPool.every(p => p.finishes.includes('matt'))).toBe(true);
    // same underlying colour, yet the pools differ — independence
    expect(kitchenPool.map(p => p.hex)).not.toEqual(bedroomPool.map(p => p.hex));
  });

  it("each card's matches respect its own filters, not the other card's", () => {
    const kitchen = entry('kitchen', '#B4B4B2', KITCHEN);
    const bedroom = entry('bedroom', '#B4B4B2', BEDROOM);

    const kitchenMatches = matchPaintsLab(kitchen.lab!, 5, captureCandidates(kitchen));
    const bedroomMatches = matchPaintsLab(bedroom.lab!, 5, captureCandidates(bedroom));

    expect(kitchenMatches.length).toBeGreaterThan(0);
    expect(bedroomMatches.length).toBeGreaterThan(0);
    expect(kitchenMatches.every(m => m.paint.brand === 'Dulux')).toBe(true);
    expect(bedroomMatches.every(m => m.paint.finishes.includes('matt'))).toBe(true);
  });

  it('a capture without filters (mid-migration) falls back to the full palette', () => {
    const legacy = entry('legacy');
    expect(captureFilters(legacy)).toEqual(EMPTY_FILTERS);
    expect(captureCandidates(legacy)).toHaveLength(PAINTS.length);
  });

  it('empty filter groups impose no restriction', () => {
    const open = entry('open', '#B4B4B2', EMPTY_FILTERS);
    expect(captureCandidates(open)).toHaveLength(PAINTS.length);
  });
});
