import {
  harmonyTarget,
  contrastTarget,
  harmonySuggestions,
  nearestDistinctPaint,
  roomScheme,
  Rgb3,
} from '../colorHarmony';
import { PAINTS } from '../paintMatcher';
import { hslToRgb, hexToRgb, rgbToHsl } from '../colorMath';

describe('colour maths helpers', () => {
  it('hslToRgb hits the primaries', () => {
    expect(hslToRgb(0, 1, 0.5)).toEqual([255, 0, 0]);
    expect(hslToRgb(120, 1, 0.5)).toEqual([0, 255, 0]);
    expect(hslToRgb(240, 1, 0.5)).toEqual([0, 0, 255]);
    expect(hslToRgb(0, 0, 0.5)).toEqual([128, 128, 128]);
  });

  it('hexToRgb parses with or without the hash', () => {
    expect(hexToRgb('#C8B4A0')).toEqual([200, 180, 160]);
    expect(hexToRgb('ffffff')).toEqual([255, 255, 255]);
  });
});

describe('harmony targets', () => {
  it('rotates hue: complementary of red is cyan-ish', () => {
    const [r, g, b] = harmonyTarget([255, 0, 0], 180);
    const [h] = rgbToHsl(r, g, b);
    expect(Math.abs(h - 180)).toBeLessThan(2);
  });

  it('lifts near-neutral bases so suggestions are visibly colourful', () => {
    const grey: Rgb3 = [128, 128, 128];
    const [r, g, b] = harmonyTarget(grey, 180);
    const [, s] = rgbToHsl(r, g, b);
    expect(s).toBeGreaterThan(0.25);
  });

  it('keeps lightness in a paintable band for near-white bases', () => {
    const offWhite: Rgb3 = [250, 250, 248];
    const [r, g, b] = harmonyTarget(offWhite, 180);
    const [, , l] = rgbToHsl(r, g, b);
    expect(l).toBeLessThanOrEqual(0.8);
  });
});

describe('harmony suggestions map to real paints (CD-7 SC)', () => {
  const bases: Rgb3[] = [
    [200, 180, 160], // beige wall
    [21, 101, 192], // strong blue
    [128, 128, 128], // pure grey
    [250, 250, 250], // near white
    [198, 40, 40], // red
  ];

  it('every suggestion is an actual paint with brand, code and hex — never a bare hex', () => {
    for (const base of bases) {
      const suggestions = harmonySuggestions(base);
      expect(suggestions).toHaveLength(6);
      for (const s of suggestions) {
        expect(s.paint.brand).toBeTruthy();
        expect(s.paint.name).toBeTruthy();
        expect(typeof s.paint.code).toBe('string');
        expect(s.paint.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('covers complementary, analogous ×2, triadic ×2 and contrast', () => {
    const roles = harmonySuggestions([200, 180, 160]).map(s => s.role);
    expect(roles.filter(r => r === 'complementary')).toHaveLength(1);
    expect(roles.filter(r => r === 'analogous')).toHaveLength(2);
    expect(roles.filter(r => r === 'triadic')).toHaveLength(2);
    expect(roles.filter(r => r === 'contrast')).toHaveLength(1);
  });

  it('never repeats a paint within one palette, nor the base paint itself', () => {
    for (const base of bases) {
      const used = new Set<string>();
      const own = nearestDistinctPaint(base, new Set());
      const keys = harmonySuggestions(base).map(
        s => `${s.paint.brand}|${s.paint.code}|${s.paint.name}`
      );
      expect(new Set(keys).size).toBe(keys.length);
      expect(keys).not.toContain(`${own.paint.brand}|${own.paint.code}|${own.paint.name}`);
      keys.forEach(k => used.add(k));
    }
  });

  it('is deterministic for the same input', () => {
    const a = harmonySuggestions([200, 180, 160]);
    const b = harmonySuggestions([200, 180, 160]);
    expect(a.map(s => s.paint.hex)).toEqual(b.map(s => s.paint.hex));
  });
});

describe('contrast role — complementary hue, lightness flipped (CD-16)', () => {
  it('flips lightness: a dark base targets a light contrast colour', () => {
    const darkNavy: Rgb3 = [20, 30, 70]; // l ≈ 0.18
    const [r, g, b] = contrastTarget(darkNavy);
    const [, , l] = rgbToHsl(r, g, b);
    const [, , baseL] = rgbToHsl(20, 30, 70);
    expect(l).toBeGreaterThan(0.6); // 1 - 0.18 clamped to 0.8
    expect(l).toBeGreaterThan(baseL);
  });

  it('flips lightness: a light base targets a dark contrast colour', () => {
    const paleBlue: Rgb3 = [200, 220, 245]; // l ≈ 0.87
    const [r, g, b] = contrastTarget(paleBlue);
    const [, , l] = rgbToHsl(r, g, b);
    const [, , baseL] = rgbToHsl(200, 220, 245);
    expect(l).toBeLessThan(0.4); // 1 - 0.87 clamped to 0.25
    expect(l).toBeLessThan(baseL);
  });

  it('uses the complementary hue', () => {
    const [r, g, b] = contrastTarget([198, 40, 40]); // red-ish base
    const [h] = rgbToHsl(r, g, b);
    const [baseH] = rgbToHsl(198, 40, 40);
    const diff = Math.abs((((h - baseH) % 360) + 360) % 360 - 180);
    expect(diff).toBeLessThan(2);
  });

  it('differs from the plain complementary target for non-mid-lightness bases', () => {
    for (const base of [[20, 30, 70], [200, 220, 245]] as Rgb3[]) {
      const [, , cl] = rgbToHsl(...contrastTarget(base));
      const [, , pl] = rgbToHsl(...harmonyTarget(base, 180));
      expect(Math.abs(cl - pl)).toBeGreaterThan(0.1);
    }
  });

  it("the contrast suggestion's paint differs from the complementary one (SC)", () => {
    for (const base of [[20, 30, 70], [200, 220, 245], [198, 40, 40]] as Rgb3[]) {
      const suggestions = harmonySuggestions(base);
      const comp = suggestions.find(s => s.role === 'complementary')!;
      const contrast = suggestions.find(s => s.role === 'contrast')!;
      expect(contrast.paint.hex).not.toBe(comp.paint.hex);
      // and the picked paints reflect the lightness flip relative to each other
      const [, , compL] = rgbToHsl(...hexToRgb(comp.paint.hex));
      const [, , contrastL] = rgbToHsl(...hexToRgb(contrast.paint.hex));
      const [, , baseL] = rgbToHsl(...base);
      if (baseL < 0.35) expect(contrastL).toBeGreaterThan(compL);
      if (baseL > 0.65) expect(contrastL).toBeLessThan(compL);
    }
  });

  it('lifts saturation for near-neutral bases like the other targets do', () => {
    const [r, g, b] = contrastTarget([128, 128, 128]);
    const [, s] = rgbToHsl(r, g, b);
    expect(s).toBeGreaterThan(0.25);
  });
});

describe('filtered goes-with with honest fallback (CD-15)', () => {
  const base: Rgb3 = [140, 160, 130];
  const paintKey = (p: { brand: string; code: string; name: string }) =>
    `${p.brand}|${p.code}|${p.name}`;

  it('draws only from the filtered candidates when the pool is deep enough', () => {
    const counts = new Map<string, number>();
    for (const p of PAINTS) counts.set(p.brand, (counts.get(p.brand) ?? 0) + 1);
    const brand = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
    const narrowed = PAINTS.filter(p => p.brand === brand);

    const suggestions = harmonySuggestions(base, narrowed);
    expect(suggestions).toHaveLength(6);
    for (const s of suggestions) {
      expect(s.outsideFilters).toBeUndefined();
      expect(s.paint.brand).toBe(brand);
    }

    const scheme = roomScheme(base, narrowed);
    for (const p of [scheme.main, scheme.secondary, scheme.accent]) {
      expect(p.brand).toBe(brand);
    }
    expect(scheme.mainOutsideFilters).toBeUndefined();
    expect(scheme.secondaryOutsideFilters).toBeUndefined();
    expect(scheme.accentOutsideFilters).toBeUndefined();
  });

  it('empty candidates fall back to the full dataset, every pick flagged', () => {
    const suggestions = harmonySuggestions(base, []);
    expect(suggestions).toHaveLength(6);
    for (const s of suggestions) {
      expect(s.outsideFilters).toBe(true);
      expect(s.paint.brand).toBeTruthy();
      expect(s.paint.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }

    const scheme = roomScheme(base, []);
    expect(scheme.mainOutsideFilters).toBe(true);
    expect(scheme.secondaryOutsideFilters).toBe(true);
    expect(scheme.accentOutsideFilters).toBe(true);
  });

  it('a tiny pool mixes in-filter picks with flagged fallbacks, never repeating a paint', () => {
    const tiny = PAINTS.slice(0, 3);
    const suggestions = harmonySuggestions(base, tiny);
    expect(suggestions).toHaveLength(6);

    const keys = suggestions.map(s => paintKey(s.paint));
    expect(new Set(keys).size).toBe(keys.length);

    expect(suggestions.some(s => s.outsideFilters)).toBe(true);
    for (const s of suggestions) {
      if (!s.outsideFilters) {
        expect(tiny.some(p => paintKey(p) === paintKey(s.paint))).toBe(true);
      }
    }
  });
});

describe('60-30-10 room scheme', () => {
  it('returns three distinct real paints, main nearest the base colour', () => {
    const base: Rgb3 = [200, 180, 160];
    const scheme = roomScheme(base);
    const own = nearestDistinctPaint(base, new Set());
    expect(scheme.main.hex).toBe(own.paint.hex);
    const keys = [scheme.main, scheme.secondary, scheme.accent].map(
      p => `${p.brand}|${p.code}|${p.name}`
    );
    expect(new Set(keys).size).toBe(3);
    for (const p of [scheme.main, scheme.secondary, scheme.accent]) {
      expect(p.brand).toBeTruthy();
      expect(p.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});
