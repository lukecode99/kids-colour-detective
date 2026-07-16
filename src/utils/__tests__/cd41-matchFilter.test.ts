// CD-41: tests for the match-filtering logic used in the Polaroid detail view.
// Brand/type pills filter the ranked paint list by brand name and finish type.
import { matchPaintsLab, PAINTS } from '../paintMatcher';
import { applyFilters, PaintFilters } from '../filters';
import { rgbToLab } from '../colorMath';

// A neutral mid-grey LAB value — will always produce matches from any brand.
const GREY_LAB = rgbToLab(180, 180, 178);

function filteredMatches(lab: ReturnType<typeof rgbToLab>, brands: string[], finishes: string[]) {
  const filters: PaintFilters = { brands, surfaces: [], finishes };
  const candidates = applyFilters(PAINTS, filters);
  return matchPaintsLab(lab, 50, candidates);
}

describe('CD-41 detail view match filtering', () => {
  it('"All" + "Any" returns matches from multiple brands', () => {
    const all = filteredMatches(GREY_LAB, [], []);
    const brands = new Set(all.map(m => m.paint.brand));
    expect(brands.size).toBeGreaterThan(1);
  });

  it('Dulux brand filter only returns Dulux paints', () => {
    const dulux = filteredMatches(GREY_LAB, ['Dulux'], []);
    expect(dulux.length).toBeGreaterThan(0);
    expect(dulux.every(m => m.paint.brand === 'Dulux')).toBe(true);
  });

  it('Crown brand filter only returns Crown paints', () => {
    const crown = filteredMatches(GREY_LAB, ['Crown'], []);
    expect(crown.length).toBeGreaterThan(0);
    expect(crown.every(m => m.paint.brand === 'Crown')).toBe(true);
  });

  it('Matt finish filter only returns paints with matt finish', () => {
    const matt = filteredMatches(GREY_LAB, [], ['matt']);
    expect(matt.length).toBeGreaterThan(0);
    expect(matt.every(m => m.paint.finishes.includes('matt'))).toBe(true);
  });

  it('Eggshell finish filter only returns paints with eggshell finish', () => {
    const eg = filteredMatches(GREY_LAB, [], ['eggshell']);
    expect(eg.length).toBeGreaterThan(0);
    expect(eg.every(m => m.paint.finishes.includes('eggshell'))).toBe(true);
  });

  it('brand + type combined filter ANDs the constraints', () => {
    const result = filteredMatches(GREY_LAB, ['Dulux'], ['matt']);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every(m => m.paint.brand === 'Dulux' && m.paint.finishes.includes('matt'))).toBe(true);
  });

  it('matches are ranked by deltaE ascending (closest first)', () => {
    const result = filteredMatches(GREY_LAB, [], []);
    for (let i = 1; i < result.length; i++) {
      expect(result[i].deltaE).toBeGreaterThanOrEqual(result[i - 1].deltaE);
    }
  });

  it('matchPercent + deltaE fields are present on every result', () => {
    const result = filteredMatches(GREY_LAB, ['Dulux'], []);
    for (const m of result) {
      expect(typeof m.matchPercent).toBe('number');
      expect(typeof m.deltaE).toBe('number');
      expect(m.deltaE).toBeGreaterThanOrEqual(0);
      expect(m.matchPercent).toBeGreaterThanOrEqual(0);
      expect(m.matchPercent).toBeLessThanOrEqual(100);
    }
  });

  it('Farrow and Ball brand filter returns only F&B paints', () => {
    const fb = filteredMatches(GREY_LAB, ['Farrow & Ball'], []);
    if (fb.length > 0) {
      expect(fb.every(m => m.paint.brand === 'Farrow & Ball')).toBe(true);
    }
  });
});
