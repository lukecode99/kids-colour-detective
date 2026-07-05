import { buildCombinedView } from '../combinedView';
import { PAINTS, Paint } from '../paintMatcher';
import { Rgb3 } from '../colorHarmony';

const SAGE: Rgb3 = [140, 160, 130];

function isRealPaint(p: Paint): boolean {
  return PAINTS.some(x => x.brand === p.brand && x.name === p.name && x.hex === p.hex);
}

describe('buildCombinedView (combined matches + goes-with view)', () => {
  it('returns matches and the goes-with palette for the same colour in one call', () => {
    const view = buildCombinedView(SAGE);
    expect(view.matches.length).toBeGreaterThan(0);
    expect(view.matches.length).toBeLessThanOrEqual(5);
    expect(view.suggestions.length).toBeGreaterThan(0);
    expect(view.scheme.main).toBeDefined();
    expect(view.scheme.secondary).toBeDefined();
    expect(view.scheme.accent).toBeDefined();
  });

  it('every goes-with entry is a real dataset paint, never a bare hex', () => {
    const view = buildCombinedView(SAGE);
    for (const s of view.suggestions) {
      expect(isRealPaint(s.paint)).toBe(true);
    }
    for (const p of [view.scheme.main, view.scheme.secondary, view.scheme.accent]) {
      expect(isRealPaint(p)).toBe(true);
    }
  });

  it('matches rank closest first and describe the input colour', () => {
    const view = buildCombinedView(SAGE);
    const pcts = view.matches.map(m => m.matchPercent);
    expect([...pcts].sort((a, b) => b - a)).toEqual(pcts);
  });

  it('filter candidates narrow the matches AND the goes-with palette (CD-15)', () => {
    // Pick the brand with the most paints so the filtered pool is deep
    // enough to fill every role without fallback.
    const counts = new Map<string, number>();
    for (const p of PAINTS) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
    const brand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const narrowed = PAINTS.filter(p => p.brand === brand);
    const view = buildCombinedView(SAGE, narrowed);
    for (const m of view.matches) {
      expect(m.paint.brand).toBe(brand);
    }
    expect(view.suggestions).toHaveLength(5);
    for (const s of view.suggestions) {
      if (!s.outsideFilters) expect(s.paint.brand).toBe(brand);
    }
    for (const p of [view.scheme.main, view.scheme.secondary, view.scheme.accent]) {
      expect(isRealPaint(p)).toBe(true);
    }
  });

  it('a filter matching nothing still yields a full palette, all flagged outside the filters', () => {
    const view = buildCombinedView(SAGE, []);
    expect(view.matches).toHaveLength(0);
    expect(view.suggestions).toHaveLength(5);
    for (const s of view.suggestions) {
      expect(s.outsideFilters).toBe(true);
      expect(isRealPaint(s.paint)).toBe(true);
    }
    expect(view.scheme.mainOutsideFilters).toBe(true);
    expect(view.scheme.secondaryOutsideFilters).toBe(true);
    expect(view.scheme.accentOutsideFilters).toBe(true);
  });

  it('respects a custom match limit', () => {
    const view = buildCombinedView(SAGE, PAINTS, 3);
    expect(view.matches.length).toBe(3);
  });
});
