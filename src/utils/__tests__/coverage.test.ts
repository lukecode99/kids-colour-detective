import { calcCoverage, parseMetres, COVERAGE_DEFAULTS } from '../coverage';

describe('coverage calculator (CD-8 SC: verified against hand-computed tin maths)', () => {
  it('single wall, defaults: 4m × 2.5m, 2 coats @ 12 m²/L', () => {
    // Hand-computed: area = 10 m²; litres = 10 × 2 / 12 = 1.6667;
    // tins of 2.5 L = ceil(0.6667) = 1; price = 1 × £28.
    const r = calcCoverage({ widthM: 4, heightM: 2.5 })!;
    expect(r.areaM2).toBe(10);
    expect(r.litres).toBe(1.67);
    expect(r.tins).toBe(1);
    expect(r.totalLitres).toBe(2.5);
    expect(r.totalPriceGbp).toBe(28);
  });

  it('whole room: 13m of wall × 2.4m high', () => {
    // Hand-computed: area = 31.2 m²; litres = 31.2 × 2 / 12 = 5.2;
    // tins = ceil(5.2 / 2.5) = ceil(2.08) = 3; price = 3 × £28 = £84.
    const r = calcCoverage({ widthM: 13, heightM: 2.4 })!;
    expect(r.areaM2).toBe(31.2);
    expect(r.litres).toBe(5.2);
    expect(r.tins).toBe(3);
    expect(r.totalLitres).toBe(7.5);
    expect(r.totalPriceGbp).toBe(84);
  });

  it('one coat, custom coverage and tin price', () => {
    // Hand-computed: area = 24 m²; litres = 24 × 1 / 10 = 2.4;
    // tins of 1 L = 3; price = 3 × £12 = £36.
    const r = calcCoverage({
      widthM: 8, heightM: 3, coats: 1,
      coveragePerLitreM2: 10, tinSizeL: 1, tinPriceGbp: 12,
    })!;
    expect(r.litres).toBe(2.4);
    expect(r.tins).toBe(3);
    expect(r.totalPriceGbp).toBe(36);
  });

  it('exact tin boundary needs no extra tin', () => {
    // litres = 15 × 2 / 12 = 2.5 exactly -> 1 tin of 2.5 L.
    const r = calcCoverage({ widthM: 6, heightM: 2.5 })!;
    expect(r.litres).toBe(2.5);
    expect(r.tins).toBe(1);
  });

  it('rejects nonsense dimensions', () => {
    expect(calcCoverage({ widthM: 0, heightM: 2 })).toBeNull();
    expect(calcCoverage({ widthM: -3, heightM: 2 })).toBeNull();
    expect(calcCoverage({ widthM: NaN, heightM: 2 })).toBeNull();
  });

  it('parseMetres handles decimals, commas and junk', () => {
    expect(parseMetres('4')).toBe(4);
    expect(parseMetres('4.2')).toBe(4.2);
    expect(parseMetres('4,2')).toBe(4.2);
    expect(parseMetres(' 3.5 ')).toBe(3.5);
    expect(parseMetres('')).toBeNull();
    expect(parseMetres('wall')).toBeNull();
    expect(parseMetres('-2')).toBeNull();
  });

  it('defaults stay in sync with the documented assumptions', () => {
    expect(COVERAGE_DEFAULTS).toEqual({
      coats: 2, coveragePerLitreM2: 12, tinSizeL: 2.5, tinPriceGbp: 28,
    });
  });
});
