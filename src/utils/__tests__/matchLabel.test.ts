import { bestMatchInfo, formatMatchLabel, parseMatchLabel } from '../matchLabel';
import { PaintMatch } from '../paintMatcher';

function match(brand: string, name: string, matchPercent: number): PaintMatch {
  return {
    paint: { brand, name, hex: '#aabbcc' },
    matchPercent,
  } as PaintMatch;
}

describe('bestMatchInfo', () => {
  it('returns brand/name/pct of the top match', () => {
    const info = bestMatchInfo([
      match("Johnstone's", 'Manhattan Grey Mid Sheen', 96),
      match('Dulux', 'Timeless', 91),
    ]);
    expect(info).toEqual({ brand: "Johnstone's", name: 'Manhattan Grey Mid Sheen', pct: 96 });
  });

  it('returns undefined for an empty list', () => {
    expect(bestMatchInfo([])).toBeUndefined();
  });
});

describe('formatMatchLabel / parseMatchLabel', () => {
  it('round-trips a plain label', () => {
    const info = { brand: 'Dulux', name: 'Timeless', pct: 91 };
    expect(parseMatchLabel(formatMatchLabel(info))).toEqual(info);
  });

  it("round-trips a brand with an apostrophe (Johnstone's)", () => {
    const info = { brand: "Johnstone's", name: 'Manhattan Grey', pct: 96 };
    expect(parseMatchLabel(formatMatchLabel(info))).toEqual(info);
  });

  it('round-trips a paint name containing parentheses', () => {
    const info = { brand: 'Farrow & Ball', name: 'Pigeon (No. 25)', pct: 88 };
    expect(parseMatchLabel(formatMatchLabel(info))).toEqual(info);
  });

  it('keeps the full name when the name itself contains " — "', () => {
    const info = { brand: 'Crown', name: 'Duck Egg — Bathroom', pct: 84 };
    expect(parseMatchLabel(formatMatchLabel(info))).toEqual(info);
  });

  it('returns undefined for malformed labels', () => {
    expect(parseMatchLabel('')).toBeUndefined();
    expect(parseMatchLabel('just some text')).toBeUndefined();
    expect(parseMatchLabel('Dulux — Timeless')).toBeUndefined();
    expect(parseMatchLabel('Dulux — Timeless (high%)')).toBeUndefined();
  });
});
