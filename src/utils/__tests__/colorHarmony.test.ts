import {
  harmonyTarget,
  harmonySuggestions,
  nearestDistinctPaint,
  roomScheme,
  Rgb3,
} from '../colorHarmony';
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
      expect(suggestions).toHaveLength(5);
      for (const s of suggestions) {
        expect(s.paint.brand).toBeTruthy();
        expect(s.paint.name).toBeTruthy();
        expect(typeof s.paint.code).toBe('string');
        expect(s.paint.hex).toMatch(/^#[0-9A-Fa-f]{6}$/);
      }
    }
  });

  it('covers complementary, analogous ×2 and triadic ×2', () => {
    const roles = harmonySuggestions([200, 180, 160]).map(s => s.role);
    expect(roles.filter(r => r === 'complementary')).toHaveLength(1);
    expect(roles.filter(r => r === 'analogous')).toHaveLength(2);
    expect(roles.filter(r => r === 'triadic')).toHaveLength(2);
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
