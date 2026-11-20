import {
  searchByName,
  addToCompare,
  removeFromCompare,
  isInCompare,
  paintToCompareItem,
  captureToCompareItem,
  paintItemId,
  COMPARE_LIMIT,
  CompareItem,
} from '../compareSearch';
import { PAINTS } from '../paintMatcher';

const hagueBlue = PAINTS.find(p => p.brand === 'Farrow & Ball' && p.name === 'Hague Blue')!;

describe('compare search by name', () => {
  it('empty / whitespace query returns nothing', () => {
    expect(searchByName('')).toEqual([]);
    expect(searchByName('   ')).toEqual([]);
  });

  it('searches across every brand, not one', () => {
    const hits = searchByName('blue');
    const brands = new Set(hits.map(p => p.brand));
    expect(hits.length).toBeGreaterThan(0);
    // "blue" is common enough to appear in more than one brand's range.
    expect(brands.size).toBeGreaterThan(1);
  });

  it('is case-insensitive and finds a known colour', () => {
    const hits = searchByName('hague');
    expect(hits.map(p => `${p.brand}·${p.name}`)).toContain('Farrow & Ball·Hague Blue');
  });

  it('ranks exact-name and starts-with ahead of mid-substring', () => {
    const hits = searchByName('sea');
    // Every hit whose name starts with "sea" must come before any hit that only
    // contains "sea" later in the name.
    const firstMidSubstring = hits.findIndex(
      p => !p.name.toLowerCase().startsWith('sea') && p.name.toLowerCase().includes('sea'),
    );
    const lastStartsWith = hits
      .map((p, i) => (p.name.toLowerCase().startsWith('sea') ? i : -1))
      .reduce((m, i) => Math.max(m, i), -1);
    if (firstMidSubstring !== -1 && lastStartsWith !== -1) {
      expect(lastStartsWith).toBeLessThan(firstMidSubstring);
    }
  });

  it('caps the result list', () => {
    expect(searchByName('a').length).toBeLessThanOrEqual(30);
  });
});

describe('compare strip add / remove rules', () => {
  const a = paintToCompareItem(hagueBlue);
  const b = paintToCompareItem(PAINTS.find(p => p.name !== hagueBlue.name)!);

  it('adds an item', () => {
    expect(addToCompare([], a)).toEqual([a]);
  });

  it('refuses a duplicate id (same colour) — returns the same array reference', () => {
    const once = addToCompare([], a);
    const twice = addToCompare(once, paintToCompareItem(hagueBlue));
    expect(twice).toBe(once);
  });

  it(`caps at ${COMPARE_LIMIT} and returns the same reference when full`, () => {
    let items: CompareItem[] = [];
    for (let i = 0; i < COMPARE_LIMIT; i++) {
      items = addToCompare(items, { ...a, id: `x${i}` });
    }
    expect(items.length).toBe(COMPARE_LIMIT);
    const full = addToCompare(items, { ...a, id: 'overflow' });
    expect(full).toBe(items);
  });

  it('removes by id and reports membership', () => {
    const items = addToCompare(addToCompare([], a), b);
    expect(isInCompare(items, a.id)).toBe(true);
    const after = removeFromCompare(items, a.id);
    expect(isInCompare(after, a.id)).toBe(false);
    expect(after).toEqual([b]);
  });

  it('paint id is stable and brand+name+code scoped', () => {
    expect(paintItemId(hagueBlue)).toBe(`${hagueBlue.brand}|${hagueBlue.name}|${hagueBlue.code}`);
  });

  it('a capture item carries no brand and a capture-scoped id', () => {
    const cap = captureToCompareItem('#324965', 'My wall', 1234, 'scan');
    expect(cap.brand).toBeUndefined();
    expect(cap.source).toBe('scan');
    expect(cap.id).toBe('capture|#324965|1234');
  });
});
