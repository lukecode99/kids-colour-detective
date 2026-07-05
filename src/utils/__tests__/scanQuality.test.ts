import {
  pushReading,
  avgSuccessiveDelta,
  isStable,
  stabilizedRgb,
  applyWhiteRef,
  isPlausibleWhiteRef,
  lightingHint,
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

describe('white-card correction', () => {
  // A warm lamp scales channels roughly [1, 0.85, 0.6].
  const warm = (c: Rgb): Rgb => [
    Math.round(c[0] * 1.0),
    Math.round(c[1] * 0.85),
    Math.round(c[2] * 0.6),
  ];

  it('visibly corrects a warm-lamp scan (CD-6 SC)', () => {
    const trueWall: Rgb = [200, 180, 160];
    const wallUnderLamp = warm(trueWall); // [200, 153, 96]
    const paperUnderLamp = warm([255, 255, 255]); // the locked reference

    const corrected = applyWhiteRef(wallUnderLamp, {
      r: paperUnderLamp[0],
      g: paperUnderLamp[1],
      b: paperUnderLamp[2],
    });

    // Before: way off. After: within a couple of counts per channel.
    expect(Math.abs(wallUnderLamp[2] - trueWall[2])).toBeGreaterThan(50);
    expect(Math.abs(corrected[0] - trueWall[0])).toBeLessThanOrEqual(3);
    expect(Math.abs(corrected[1] - trueWall[1])).toBeLessThanOrEqual(3);
    expect(Math.abs(corrected[2] - trueWall[2])).toBeLessThanOrEqual(3);

    // And the correction changes the paint match back to the true wall's.
    const trueTop = matchPaintsLab(rgbToLab(...trueWall), 1)[0].paint;
    const correctedTop = matchPaintsLab(rgbToLab(...corrected), 1)[0].paint;
    expect(correctedTop.name).toBe(trueTop.name);
  });

  it('clamps at 255 and ignores a degenerate reference', () => {
    expect(applyWhiteRef([250, 250, 250], { r: 200, g: 200, b: 200 })).toEqual([255, 255, 255]);
    const rgb: Rgb = [100, 100, 100];
    expect(applyWhiteRef(rgb, { r: 10, g: 200, b: 200 })).toEqual(rgb);
  });

  it('accepts warm-lit paper, rejects dark or saturated surfaces', () => {
    expect(isPlausibleWhiteRef([255, 217, 153])).toBe(true); // paper under warm lamp
    expect(isPlausibleWhiteRef([250, 250, 250])).toBe(true); // paper in daylight
    expect(isPlausibleWhiteRef([80, 70, 60])).toBe(false); // too dark
    expect(isPlausibleWhiteRef([230, 60, 40])).toBe(false); // a red wall
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
