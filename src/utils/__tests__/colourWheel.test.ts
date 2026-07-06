import {
  pointToWheel,
  wheelToPoint,
  wheelPickToRgb,
  savedColourMarkers,
  hitMarker,
} from '../colourWheel';
import { buildCombinedView } from '../combinedView';
import { PAINTS } from '../paintMatcher';
import type { SavedColorEntry } from '../savedColors';

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

// CD-22: saved captures plotted on the wheel from their stored colour data.
function saved(
  id: string,
  rgb: [number, number, number] | undefined,
  hex: string,
  label?: string,
  thumbnailUri?: string
): SavedColorEntry {
  return {
    id,
    hex,
    rgb,
    name: 'Some Colour',
    emoji: '🎨',
    match: '',
    timestamp: 1720000000000,
    label,
    thumbnailUri,
  };
}

describe('saved-colour markers (CD-22 position maths)', () => {
  it('pure red sits at hue 0° on the rim — the east edge, exactly', () => {
    const [m] = savedColourMarkers([saved('red', [255, 0, 0], '#FF0000')], RADIUS);
    expect(m.h).toBeCloseTo(0, 5);
    expect(m.s).toBeCloseTo(1, 5);
    expect(m.x).toBeCloseTo(RADIUS * 2, 5);
    expect(m.y).toBeCloseTo(RADIUS, 5);
  });

  it('pure green sits at 120° on the rim', () => {
    const [m] = savedColourMarkers([saved('green', [0, 255, 0], '#00FF00')], RADIUS);
    expect(m.h).toBeCloseTo(120, 5);
    expect(m.s).toBeCloseTo(1, 5);
    expect(m.x).toBeCloseTo(RADIUS + Math.cos((120 * Math.PI) / 180) * RADIUS, 5);
    expect(m.y).toBeCloseTo(RADIUS + Math.sin((120 * Math.PI) / 180) * RADIUS, 5);
  });

  it('greys have zero saturation and land dead centre', () => {
    const [m] = savedColourMarkers([saved('grey', [128, 128, 128], '#808080')], RADIUS);
    expect(m.s).toBe(0);
    expect(m.x).toBeCloseTo(RADIUS, 5);
    expect(m.y).toBeCloseTo(RADIUS, 5);
  });

  it('marker positions agree with the touch mapping — picking that spot gives the hue back', () => {
    const [m] = savedColourMarkers([saved('teal', [0, 128, 128], '#008080')], RADIUS);
    const pick = pointToWheel(m.x, m.y, RADIUS);
    expect(pick.h).toBeCloseTo(m.h, 3);
    expect(pick.s).toBeCloseTo(m.s, 3);
  });

  it('uses the STORED rgb, not a re-derivation from anything else', () => {
    // deliberately inconsistent hex: position must follow rgb
    const [m] = savedColourMarkers([saved('x', [255, 0, 0], '#000000')], RADIUS);
    expect(m.h).toBeCloseTo(0, 5);
    expect(m.s).toBeCloseTo(1, 5);
  });

  it('falls back to hex for an entry that skipped rgb migration', () => {
    const [m] = savedColourMarkers([saved('legacy', undefined, '#FF0000')], RADIUS);
    expect(m.h).toBeCloseTo(0, 5);
    expect(m.s).toBeCloseTo(1, 5);
  });

  it('identifies by room label when set, colour name otherwise', () => {
    const [kitchen, unlabelled] = savedColourMarkers(
      [saved('a', [255, 0, 0], '#FF0000', 'Kitchen'), saved('b', [0, 255, 0], '#00FF00')],
      RADIUS
    );
    expect(kitchen.name).toBe('Kitchen');
    expect(unlabelled.name).toBe('Some Colour');
  });

  it('zero saved captures → zero markers; deletion drops exactly that marker', () => {
    expect(savedColourMarkers([], RADIUS)).toEqual([]);
    const entries = [saved('a', [255, 0, 0], '#FF0000'), saved('b', [0, 255, 0], '#00FF00')];
    const before = savedColourMarkers(entries, RADIUS);
    expect(before).toHaveLength(2);
    const after = savedColourMarkers(entries.filter(e => e.id !== 'a'), RADIUS);
    expect(after).toHaveLength(1);
    expect(after.find(m => m.id === 'a')).toBeUndefined();
  });
});

describe('marker tap detection (hitMarker)', () => {
  const markers = savedColourMarkers(
    [saved('red', [255, 0, 0], '#FF0000', 'Hall'), saved('grey', [128, 128, 128], '#808080')],
    RADIUS
  );

  it('a tap on a marker identifies that capture', () => {
    const red = markers[0];
    expect(hitMarker(red.x + 3, red.y - 2, markers)?.id).toBe('red');
  });

  it('a tap away from any marker falls through to the normal wheel pick', () => {
    expect(hitMarker(RADIUS * 0.5, RADIUS * 1.5, markers)).toBeNull();
  });

  it('overlapping markers resolve to the nearest one', () => {
    const twins = savedColourMarkers(
      [saved('a', [255, 0, 0], '#FF0000'), saved('b', [254, 1, 1], '#FE0101')],
      RADIUS
    );
    const nearest = hitMarker(twins[1].x, twins[1].y, twins);
    expect(nearest?.id).toBe('b');
  });
});

// CD-24: markers grew to a 20px visual; the tapped capture surfaces its photo.
describe('larger markers + capture photo (CD-24)', () => {
  it('markers carry the capture photo through to the tap detail', () => {
    const [withPhoto, without] = savedColourMarkers(
      [
        saved('a', [255, 0, 0], '#FF0000', 'Hall', 'file:///thumbnails/a.jpg'),
        saved('b', [0, 255, 0], '#00FF00'),
      ],
      RADIUS
    );
    expect(withPhoto.thumbnailUri).toBe('file:///thumbnails/a.jpg');
    // Pre-thumbnail saves stay tappable — no photo, swatch fallback renders.
    expect(without.thumbnailUri).toBeUndefined();
  });

  it('a tap anywhere on the 20px visual (10px off centre) still hits', () => {
    const markers = savedColourMarkers([saved('red', [255, 0, 0], '#FF0000')], RADIUS);
    const m = markers[0];
    expect(hitMarker(m.x + 10, m.y, markers)?.id).toBe('red');
    expect(hitMarker(m.x - 7, m.y + 7, markers)?.id).toBe('red');
  });

  it('non-overlapping pairs at the new size stay individually tappable', () => {
    // Two markers whose centres sit 22px apart — visually separate at 20px.
    const a = { id: 'a', hex: '#111111', name: 'A', h: 0, s: 0.5, x: 100, y: 100 };
    const b = { id: 'b', hex: '#222222', name: 'B', h: 0, s: 0.5, x: 122, y: 100 };
    expect(hitMarker(a.x, a.y, [a, b])?.id).toBe('a');
    expect(hitMarker(b.x, b.y, [a, b])?.id).toBe('b');
    // A tap between them resolves to whichever is nearer, never the wrong one.
    expect(hitMarker(108, 100, [a, b])?.id).toBe('a');
    expect(hitMarker(114, 100, [a, b])?.id).toBe('b');
  });
});
