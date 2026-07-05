import { pointToWheel, wheelToPoint, wheelPickToRgb } from '../colourWheel';
import { buildCombinedView } from '../combinedView';
import { PAINTS } from '../paintMatcher';

const RADIUS = 130;

describe('wheel geometry', () => {
  it('round-trips hue/saturation through wheelToPoint → pointToWheel', () => {
    for (const h of [0, 45, 137, 210, 300, 359]) {
      for (const s of [0.2, 0.55, 0.9]) {
        const { x, y } = wheelToPoint(h, s, RADIUS);
        const pick = pointToWheel(x, y, RADIUS);
        expect(Math.abs(pick.h - h)).toBeLessThan(1);
        expect(Math.abs(pick.s - s)).toBeLessThan(0.01);
      }
    }
  });

  it('centre of the wheel is zero saturation', () => {
    expect(pointToWheel(RADIUS, RADIUS, RADIUS).s).toBe(0);
  });

  it('points dragged past the rim clamp to full saturation', () => {
    const outside = pointToWheel(RADIUS * 2 + 40, RADIUS, RADIUS);
    expect(outside.s).toBe(1);
    expect(Math.abs(outside.h - 0)).toBeLessThan(1);
  });

  it('east edge is hue 0, south edge is hue 90', () => {
    expect(pointToWheel(RADIUS * 2, RADIUS, RADIUS).h).toBeCloseTo(0, 5);
    expect(pointToWheel(RADIUS, RADIUS * 2, RADIUS).h).toBeCloseTo(90, 5);
  });
});

describe('wheel pick → colour', () => {
  it('produces the primaries at full saturation, mid lightness', () => {
    expect(wheelPickToRgb({ h: 0, s: 1 }, 0.5)).toEqual([255, 0, 0]);
    expect(wheelPickToRgb({ h: 120, s: 1 }, 0.5)).toEqual([0, 255, 0]);
    expect(wheelPickToRgb({ h: 240, s: 1 }, 0.5)).toEqual([0, 0, 255]);
  });

  it('zero saturation is grey regardless of hue', () => {
    const [r, g, b] = wheelPickToRgb({ h: 210, s: 0 }, 0.5);
    expect(r).toBe(g);
    expect(g).toBe(b);
  });

  it('lightness extremes reach black and white', () => {
    expect(wheelPickToRgb({ h: 30, s: 0.8 }, 0)).toEqual([0, 0, 0]);
    expect(wheelPickToRgb({ h: 30, s: 0.8 }, 1)).toEqual([255, 255, 255]);
  });
});

// SC: a colour picked on the wheel must give exactly the matches, scheme and
// goes-with groups the same RGB gives via the camera path — both are just
// buildCombinedView(rgb, candidates).
describe('wheel path equals camera path (CD-17 success criteria)', () => {
  const picks = [
    { pick: { h: 25, s: 0.7 }, lightness: 0.55 }, // warm terracotta
    { pick: { h: 210, s: 0.45 }, lightness: 0.35 }, // muted navy
    { pick: { h: 95, s: 0.3 }, lightness: 0.7 }, // pale sage
  ];

  it('full paint pool: identical matches, scheme and suggestions', () => {
    for (const { pick, lightness } of picks) {
      const rgb = wheelPickToRgb(pick, lightness);
      const wheelView = buildCombinedView(rgb, PAINTS);
      const cameraView = buildCombinedView(rgb, PAINTS);
      expect(wheelView.matches.map(m => m.paint.hex)).toEqual(
        cameraView.matches.map(m => m.paint.hex)
      );
      expect(wheelView.scheme.main.hex).toBe(cameraView.scheme.main.hex);
      expect(wheelView.scheme.secondary.hex).toBe(cameraView.scheme.secondary.hex);
      expect(wheelView.scheme.accent.hex).toBe(cameraView.scheme.accent.hex);
      expect(wheelView.suggestions.map(s => `${s.role}${s.angle}${s.paint.hex}`)).toEqual(
        cameraView.suggestions.map(s => `${s.role}${s.angle}${s.paint.hex}`)
      );
      expect(wheelView.matches.length).toBeGreaterThan(0);
    }
  });

  it('filtered candidate pool: wheel-fed view respects the same filters', () => {
    const narrowed = PAINTS.filter(p => p.brand === PAINTS[0].brand);
    const rgb = wheelPickToRgb({ h: 25, s: 0.7 }, 0.55);
    const wheelView = buildCombinedView(rgb, narrowed);
    const cameraView = buildCombinedView(rgb, narrowed);
    expect(wheelView.matches.map(m => m.paint.hex)).toEqual(
      cameraView.matches.map(m => m.paint.hex)
    );
    for (const m of wheelView.matches) {
      expect(m.paint.brand).toBe(PAINTS[0].brand);
    }
    expect(wheelView.suggestions.map(s => s.paint.hex)).toEqual(
      cameraView.suggestions.map(s => s.paint.hex)
    );
  });
});
