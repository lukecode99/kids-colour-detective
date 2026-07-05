// CD-19: the current scan must never render in My Colours — Scan tab only.
import { buildMyColoursCards, isMyColoursEmpty } from '../myColoursView';
import { CurrentColour } from '../currentColour';
import { SavedColorEntry } from '../savedColors';

const scan: CurrentColour = { rgb: [180, 180, 178], hex: '#B4B4B2', name: 'Ash' };

function entry(id: string, hex = '#B4B4B2'): SavedColorEntry {
  return {
    id,
    hex,
    rgb: [180, 180, 178],
    lab: [73, 0, 1],
    name: 'Ash',
    emoji: '🩶',
    match: 'Dulux — Polished Pebble (96%)',
    timestamp: 1720000000000,
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
