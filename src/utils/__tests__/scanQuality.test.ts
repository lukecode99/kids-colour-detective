import {
  pushReading,
  avgSuccessiveDelta,
  isStable,
  stabilizedRgb,
  applyWhiteRef,
  isPlausibleWhiteRef,
  lightingHint,
  srgbToLinear,
  linearToSrgb,
  STABILITY_WINDOW,
} from '../scanQuality';
import { Rgb } from '../photoSample';
import { matchPaintsLab } from '../paintMatcher';
import { rgbToLab } from '../colorMath';

// Deterministic sensor noise: small per-frame wobble around a true colour.
function noisyReading(base: Rgb, frame: number): Rgb {
  const wobble = (n: number) => ((frame * 7 + n * 13) % 9) - 4; // −4..+4
  return [
    Math.max(0, Math.min(255, base[0] + wobble(0))),
    Math.max(0, Math.min(255, base[1] + wobble(1))),
    Math.max(0, Math.min(255, base[2] + wobble(2))),
  ];
}

describe('stable-frame averaging', () => {
  it('caps history at the window size', () => {
    let h: Rgb[] = [];
    for (let i = 0; i < 12; i++) h = pushReading(h, [i, i, i]);
    expect(h).toHaveLength(STABILITY_WINDOW);
    expect(h[h.length - 1]).toEqual([11, 11, 11]);
  });

  it('flags steady readings as stable and jumps as unstable', () => {
    const steady: Rgb[] = [
      [200, 180, 160],
      [202, 179, 161],
      [199, 181, 158],
    ];
    expect(isStable(steady)).toBe(true);
    expect(avgSuccessiveDelta(steady)).toBeLessThan(5);

    const jumping: Rgb[] = [
      [200, 180, 160],
      [90, 40, 30],
      [220, 210, 200],
    ];
    expect(isStable(jumping)).toBe(false);
  });

  it('returns the latest reading while moving, the window median when steady', () => {
    const jumping: Rgb[] = [
      [10, 10, 10],
      [240, 240, 240],
    ];
    expect(stabilizedRgb(jumping)).toEqual([240, 240, 240]);

    const steady: Rgb[] = [
      [198, 178, 158],
      [202, 182, 162],
      [200, 180, 160],
    ];
    expect(stabilizedRgb(steady)).toEqual([200, 180, 160]);
  });

  it('same wall scanned 5× returns the same top match 5/5 (CD-6 SC)', () => {
    // A real wall is painted in a real colour — Little Greene "Lute" #CAB49C.
    const wall: Rgb = [202, 180, 156];
    const topMatches: string[] = [];
    for (let scan = 0; scan < 5; scan++) {
      // Each "scan" is a fresh approach to the wall: 5 noisy frames.
      let history: Rgb[] = [];
      for (let frame = 0; frame < STABILITY_WINDOW; frame++) {
        history = pushReading(history, noisyReading(wall, scan * 5 + frame));
      }
      expect(isStable(history)).toBe(true);
      const [r, g, b] = stabilizedRgb(history);
      const top = matchPaintsLab(rgbToLab(r, g, b), 5)[0];
      topMatches.push(`${top.paint.brand} ${top.paint.name}`);
    }
    expect(new Set(topMatches).size).toBe(1);
  });
});

describe('calibration correction (CD-27: ratio-only, linear RGB)', () => {
  // A lamp cast multiplies LIGHT, i.e. linear RGB — model it there and
  // encode back to sRGB, the way the sensor actually sees it.
  const lit = (c: Rgb, cast: [number, number, number]): Rgb => [
    linearToSrgb(srgbToLinear(c[0]) * cast[0]),
    linearToSrgb(srgbToLinear(c[1]) * cast[1]),
    linearToSrgb(srgbToLinear(c[2]) * cast[2]),
  ];
  const asRef = ([r, g, b]: Rgb) => ({ r, g, b });

  it('sRGB linearisation round-trips', () => {
    for (const c of [0, 1, 10, 64, 128, 200, 254, 255]) {
      expect(linearToSrgb(srgbToLinear(c))).toBe(c);
    }
    expect(srgbToLinear(255)).toBeCloseTo(1, 6);
    expect(srgbToLinear(0)).toBe(0);
  });

  it('fully removes a linear-space cast, not half (CD-6 SC, linear model)', () => {
    // Mean-1 cast: ratio-only correction restores the exact true colour.
    const cast: [number, number, number] = [1.25, 1.0, 0.75];
    const trueWall: Rgb = [200, 180, 160];
    const wallUnderLamp = lit(trueWall, cast);
    const greyCardUnderLamp = lit([118, 118, 118], cast); // ~18% reflectance

    const corrected = applyWhiteRef(wallUnderLamp, asRef(greyCardUnderLamp));

    // Before: way off. After: recovered within rounding.
    expect(Math.abs(wallUnderLamp[0] - trueWall[0])).toBeGreaterThan(15);
    expect(Math.abs(corrected[0] - trueWall[0])).toBeLessThanOrEqual(2);
    expect(Math.abs(corrected[1] - trueWall[1])).toBeLessThanOrEqual(2);
    expect(Math.abs(corrected[2] - trueWall[2])).toBeLessThanOrEqual(2);

    // And the correction changes the paint match back to the true wall's.
    const trueTop = matchPaintsLab(rgbToLab(...trueWall), 1)[0].paint;
    const correctedTop = matchPaintsLab(rgbToLab(...corrected), 1)[0].paint;
    expect(correctedTop.name).toBe(trueTop.name);
  });

  it('mid-grey neutral at ~40% brightness corrects a warm cast to neutral within 1 (CD-27 SC)', () => {
    const cast: [number, number, number] = [1.0, 0.8, 0.55];
    const greySurface = lit([102, 102, 102], cast);
    const greyCardRef = lit([118, 118, 118], cast);
    // The reference is dim — brightness ~40%, nowhere near "bright white".
    expect((greyCardRef[0] + greyCardRef[1] + greyCardRef[2]) / 3).toBeLessThan(115);
    expect(isPlausibleWhiteRef(greyCardRef)).toBe(true);

    const corrected = applyWhiteRef(greySurface, asRef(greyCardRef));
    expect(Math.max(...corrected) - Math.min(...corrected)).toBeLessThanOrEqual(1);
  });

  it('grey card and white paper produce the same correction', () => {
    const cast: [number, number, number] = [1.0, 0.85, 0.6];
    const wallUnderLamp = lit([200, 180, 160], cast);
    const viaWhite = applyWhiteRef(wallUnderLamp, asRef(lit([255, 255, 255], cast)));
    const viaGrey = applyWhiteRef(wallUnderLamp, asRef(lit([118, 118, 118], cast)));
    for (let ch = 0; ch < 3; ch++) {
      expect(Math.abs(viaWhite[ch] - viaGrey[ch])).toBeLessThanOrEqual(1);
    }
  });

  it('never boosts a reading towards pure white', () => {
    // Ratio-only: a neutral reference leaves the reading untouched instead
    // of scaling it up to 255-white.
    expect(applyWhiteRef([250, 250, 250], { r: 200, g: 200, b: 200 })).toEqual([250, 250, 250]);
    expect(applyWhiteRef([100, 100, 100], { r: 120, g: 120, b: 120 })).toEqual([100, 100, 100]);
  });

  it('clamps at 255 and ignores a degenerate reference', () => {
    // A blue-deficient reference boosts blue hard enough to clip.
    expect(applyWhiteRef([240, 240, 240], { r: 200, g: 200, b: 120 })[2]).toBe(255);
    const rgb: Rgb = [100, 100, 100];
    expect(applyWhiteRef(rgb, { r: 10, g: 200, b: 200 })).toEqual(rgb);
  });

  it('accepts neutral surfaces at any reasonable brightness, rejects coloured ones (CD-27 SC)', () => {
    expect(isPlausibleWhiteRef([255, 217, 153])).toBe(true); // paper under warm lamp
    expect(isPlausibleWhiteRef([250, 250, 250])).toBe(true); // paper in daylight
    expect(isPlausibleWhiteRef([124, 115, 98])).toBe(true); // grey card under warm lamp
    expect(isPlausibleWhiteRef([80, 70, 60])).toBe(true); // dim but neutral
    expect(isPlausibleWhiteRef([200, 150, 70])).toBe(false); // strong orange
    expect(isPlausibleWhiteRef([230, 60, 40])).toBe(false); // a red wall
    expect(isPlausibleWhiteRef([30, 28, 25])).toBe(false); // too dark to trust
  });
});

describe('lighting hints', () => {
  it('suggests the torch in dim light', () => {
    expect(lightingHint([40, 38, 35])).toBe('dim');
  });

  it('flags a warm cast', () => {
    expect(lightingHint([200, 150, 90])).toBe('warm');
  });

  it('stays quiet in decent neutral light', () => {
    expect(lightingHint([180, 175, 170])).toBeNull();
    expect(lightingHint([90, 120, 200])).toBeNull(); // cool cast: no torch benefit
  });
});
