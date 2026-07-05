import {
  medianRgb,
  containFit,
  displayToImageCoords,
  clampTransform,
  sampleWindowOrigin,
  Rgb,
} from '../photoSample';

describe('medianRgb', () => {
  it('takes the per-channel median for an odd count', () => {
    const pixels: Rgb[] = [
      [10, 200, 30],
      [20, 210, 10],
      [30, 190, 20],
    ];
    expect(medianRgb(pixels)).toEqual([20, 200, 20]);
  });

  it('averages the middle pair for an even count', () => {
    const pixels: Rgb[] = [
      [10, 0, 0],
      [20, 0, 0],
      [30, 0, 0],
      [40, 0, 0],
    ];
    expect(medianRgb(pixels)[0]).toBe(25);
  });

  it('is robust to a single outlier pixel (shadow/speckle)', () => {
    const wall: Rgb[] = Array.from({ length: 8 }, () => [200, 180, 160] as Rgb);
    expect(medianRgb([...wall, [0, 0, 0]])).toEqual([200, 180, 160]);
  });

  it('is deterministic — repeated samples of the same window match (CD-5 SC)', () => {
    const pixels: Rgb[] = Array.from({ length: 81 }, (_, i) => [
      (i * 37) % 256,
      (i * 91) % 256,
      (i * 13) % 256,
    ] as Rgb);
    const first = medianRgb(pixels);
    for (let i = 0; i < 5; i++) expect(medianRgb(pixels)).toEqual(first);
  });

  it('does not mutate its input', () => {
    const pixels: Rgb[] = [
      [3, 3, 3],
      [1, 1, 1],
      [2, 2, 2],
    ];
    medianRgb(pixels);
    expect(pixels[0]).toEqual([3, 3, 3]);
  });
});

describe('containFit', () => {
  it('letterboxes a landscape image in a portrait view', () => {
    const fit = containFit(2000, 1000, 400, 800);
    expect(fit.scale).toBe(0.2); // 2000 → 400 wide
    expect(fit.offsetX).toBe(0);
    expect(fit.offsetY).toBe(300); // (800 − 200) / 2
  });

  it('pillarboxes a portrait image in a landscape view', () => {
    const fit = containFit(1000, 2000, 800, 400);
    expect(fit.scale).toBe(0.2);
    expect(fit.offsetX).toBe(300);
    expect(fit.offsetY).toBe(0);
  });
});

describe('displayToImageCoords', () => {
  const VIEW = { w: 400, h: 800 };
  const IMG = { w: 2000, h: 1000 };
  const IDENTITY = { scale: 1, tx: 0, ty: 0 };

  it('maps the view centre to the image centre at zoom 1', () => {
    const p = displayToImageCoords(200, 400, VIEW.w, VIEW.h, IMG.w, IMG.h, IDENTITY)!;
    expect(p.x).toBeCloseTo(1000);
    expect(p.y).toBeCloseTo(500);
  });

  it('maps a known off-centre point at zoom 1', () => {
    // image starts at y=300 in the view; display (100, 350) → image (500, 250)
    const p = displayToImageCoords(100, 350, VIEW.w, VIEW.h, IMG.w, IMG.h, IDENTITY)!;
    expect(p.x).toBeCloseTo(500);
    expect(p.y).toBeCloseTo(250);
  });

  it('returns null in the letterbox area outside the photo', () => {
    expect(displayToImageCoords(200, 100, VIEW.w, VIEW.h, IMG.w, IMG.h, IDENTITY)).toBeNull();
  });

  it('accounts for zoom around the view centre', () => {
    // At 2× zoom with no pan the view centre still shows the image centre.
    const centre = displayToImageCoords(200, 400, VIEW.w, VIEW.h, IMG.w, IMG.h, { scale: 2, tx: 0, ty: 0 })!;
    expect(centre.x).toBeCloseTo(1000);
    expect(centre.y).toBeCloseTo(500);
    // A point 100px right of centre covers half the image distance vs zoom 1.
    const right = displayToImageCoords(300, 400, VIEW.w, VIEW.h, IMG.w, IMG.h, { scale: 2, tx: 0, ty: 0 })!;
    expect(right.x).toBeCloseTo(1250);
  });

  it('accounts for pan', () => {
    // Dragging the image 50px right means the centre pixel sits 50px right too.
    const p = displayToImageCoords(250, 400, VIEW.w, VIEW.h, IMG.w, IMG.h, { scale: 1, tx: 50, ty: 0 })!;
    expect(p.x).toBeCloseTo(1000);
    expect(p.y).toBeCloseTo(500);
  });

  it('same tap point always resolves to the same pixel (CD-5 SC)', () => {
    const t = { scale: 3.7, tx: -42, ty: 18 };
    const first = displayToImageCoords(123, 456, VIEW.w, VIEW.h, IMG.w, IMG.h, t)!;
    for (let i = 0; i < 5; i++) {
      expect(displayToImageCoords(123, 456, VIEW.w, VIEW.h, IMG.w, IMG.h, t)).toEqual(first);
    }
  });
});

describe('clampTransform', () => {
  it('clamps zoom to the 1–8 range', () => {
    expect(clampTransform({ scale: 0.3, tx: 0, ty: 0 }, 400, 800).scale).toBe(1);
    expect(clampTransform({ scale: 20, tx: 0, ty: 0 }, 400, 800).scale).toBe(8);
  });

  it('does not allow panning at zoom 1', () => {
    const t = clampTransform({ scale: 1, tx: 500, ty: -500 }, 400, 800);
    expect(t.tx).toBe(0);
    expect(t.ty).toBe(0);
  });

  it('limits pan proportionally to zoom', () => {
    const t = clampTransform({ scale: 2, tx: 9999, ty: -9999 }, 400, 800);
    expect(t.tx).toBe(200); // 400 × (2−1) / 2
    expect(t.ty).toBe(-400);
  });
});

describe('sampleWindowOrigin', () => {
  it('centres the window on the tap point', () => {
    expect(sampleWindowOrigin(100, 50, 2000, 1000, 9)).toEqual({ ox: 96, oy: 46, w: 9, h: 9 });
  });

  it('clamps at the image edges', () => {
    expect(sampleWindowOrigin(1, 1, 2000, 1000, 9)).toEqual({ ox: 0, oy: 0, w: 9, h: 9 });
    expect(sampleWindowOrigin(1999, 999, 2000, 1000, 9)).toEqual({ ox: 1991, oy: 991, w: 9, h: 9 });
  });

  it('shrinks the window for tiny images', () => {
    expect(sampleWindowOrigin(2, 2, 4, 4, 9)).toEqual({ ox: 0, oy: 0, w: 4, h: 4 });
  });
});
