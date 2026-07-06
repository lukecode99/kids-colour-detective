import {
  MIN_ZOOM,
  MAX_ZOOM,
  resetViewport,
  isZoomed,
  clampViewport,
  screenToContent,
  contentToScreen,
  pinchViewport,
  panViewport,
} from '../wheelZoom';
import {
  pointToWheel,
  wheelToPoint,
  savedColourMarkers,
  hitMarker,
} from '../colourWheel';
import type { SavedColorEntry } from '../savedColors';

const SIZE = 260;
const RADIUS = SIZE / 2;

function saved(id: string, rgb: [number, number, number], hex: string): SavedColorEntry {
  return { id, hex, rgb, name: 'Some Colour', emoji: '🎨', match: '', timestamp: 1720000000000 };
}

describe('viewport mapping (CD-25)', () => {
  it('the identity viewport maps screen = content', () => {
    const vp = resetViewport();
    expect(screenToContent(70, 200, vp)).toEqual({ x: 70, y: 200 });
    expect(contentToScreen(70, 200, vp)).toEqual({ x: 70, y: 200 });
    expect(isZoomed(vp)).toBe(false);
  });

  it('screenToContent and contentToScreen are inverses under any zoom + pan', () => {
    let vp = pinchViewport(resetViewport(), 180, 90, 2.7, SIZE);
    vp = panViewport(vp, -35, 20, SIZE);
    for (const [x, y] of [[0, 0], [130, 130], [259, 41], [88, 199]]) {
      const c = screenToContent(x, y, vp);
      const s = contentToScreen(c.x, c.y, vp);
      expect(s.x).toBeCloseTo(x, 6);
      expect(s.y).toBeCloseTo(y, 6);
    }
  });

  it('pinching keeps the content under the focal point fixed', () => {
    const vp0 = resetViewport();
    const focal = { x: 180, y: 100 };
    const under = screenToContent(focal.x, focal.y, vp0);
    const vp1 = pinchViewport(vp0, focal.x, focal.y, 2, SIZE);
    const after = contentToScreen(under.x, under.y, vp1);
    expect(after.x).toBeCloseTo(focal.x, 6);
    expect(after.y).toBeCloseTo(focal.y, 6);
    expect(vp1.scale).toBeCloseTo(2, 6);
  });

  it('zoom clamps to the [1, MAX_ZOOM] range', () => {
    const zoomedOut = pinchViewport(resetViewport(), RADIUS, RADIUS, 0.2, SIZE);
    expect(zoomedOut.scale).toBe(MIN_ZOOM);
    let vp = resetViewport();
    for (let i = 0; i < 10; i++) vp = pinchViewport(vp, RADIUS, RADIUS, 2, SIZE);
    expect(vp.scale).toBe(MAX_ZOOM);
  });

  it('panning clamps so the wheel always covers the container', () => {
    const vp = pinchViewport(resetViewport(), RADIUS, RADIUS, 2, SIZE);
    const dragged = panViewport(vp, 9999, -9999, SIZE);
    expect(dragged.tx).toBe(0); // content left edge at the view edge
    expect(dragged.ty).toBe(SIZE * (1 - dragged.scale)); // bottom edge likewise
    // and at scale 1 the only legal pan is (0, 0)
    const flat = panViewport(resetViewport(), 50, -20, SIZE);
    expect(flat).toEqual({ scale: 1, tx: 0, ty: 0 });
  });

  it('clampViewport normalises an out-of-range viewport', () => {
    expect(clampViewport({ scale: 40, tx: 500, ty: -99999 }, SIZE)).toEqual({
      scale: MAX_ZOOM,
      tx: 0,
      ty: SIZE * (1 - MAX_ZOOM),
    });
  });

  it('reset returns cleanly to the un-zoomed wheel', () => {
    let vp = pinchViewport(resetViewport(), 200, 60, 3, SIZE);
    vp = panViewport(vp, -40, -40, SIZE);
    expect(isZoomed(vp)).toBe(true);
    expect(resetViewport()).toEqual({ scale: 1, tx: 0, ty: 0 });
    expect(isZoomed(resetViewport())).toBe(false);
  });
});

// SC: selection at 3× zoom lands on the expected hue/saturation — a screen
// touch maps through the viewport into content coords and then through the
// unchanged CD-17 wheel polar maths.
describe('selection precision under zoom (CD-25)', () => {
  it('a 3×-zoomed touch resolves to the hue/sat under the finger', () => {
    // zoom 3× about an off-centre focal point, then pan a little
    let vp = pinchViewport(resetViewport(), 170, 110, 3, SIZE);
    vp = panViewport(vp, 12, -18, SIZE);
    for (const [h, s] of [[137, 0.62], [12, 0.95], [301, 0.3]]) {
      const content = wheelToPoint(h, s, RADIUS);
      const screen = contentToScreen(content.x, content.y, vp);
      // Only test points actually visible inside the container.
      if (screen.x < 0 || screen.x > SIZE || screen.y < 0 || screen.y > SIZE) continue;
      const c = screenToContent(screen.x, screen.y, vp);
      const pick = pointToWheel(c.x, c.y, RADIUS);
      expect(pick.h).toBeCloseTo(h, 3);
      expect(pick.s).toBeCloseTo(s, 3);
    }
  });

  it('one screen pixel spans 1/3 of a content pixel at 3× — finer resolution', () => {
    const vp = pinchViewport(resetViewport(), RADIUS, RADIUS, 3, SIZE);
    const a = screenToContent(100, 100, vp);
    const b = screenToContent(101, 100, vp);
    expect(b.x - a.x).toBeCloseTo(1 / 3, 6);
  });
});

// SC: markers and their hit targets stay aligned with the zoomed wheel — the
// rendered pane and the touch mapping use the same transform, so a tap on a
// marker's on-screen position always finds it.
describe('markers under zoom/pan (CD-25)', () => {
  const markers = savedColourMarkers(
    [saved('teal', [0, 128, 128], '#008080'), saved('red', [255, 0, 0], '#FF0000')],
    RADIUS
  );

  it('a tap on a marker’s zoomed screen position hits that marker', () => {
    let vp = pinchViewport(resetViewport(), RADIUS, RADIUS, 3, SIZE);
    vp = panViewport(vp, 30, 25, SIZE);
    for (const m of markers) {
      const screen = contentToScreen(m.x, m.y, vp);
      const c = screenToContent(screen.x, screen.y, vp);
      expect(hitMarker(c.x, c.y, markers)?.id).toBe(m.id);
    }
  });

  it('the hit target scales with the marker visual: near-misses on screen still hit at 3×', () => {
    const vp = pinchViewport(resetViewport(), RADIUS, RADIUS, 3, SIZE);
    const m = markers[0];
    const screen = contentToScreen(m.x, m.y, vp);
    // 30 screen px off centre = 10 content px — on the enlarged visual's edge.
    const near = screenToContent(screen.x + 30, screen.y, vp);
    expect(hitMarker(near.x, near.y, markers)?.id).toBe(m.id);
    // 60 screen px = 20 content px — past the threshold, falls through to a pick.
    const far = screenToContent(screen.x + 60, screen.y, vp);
    expect(hitMarker(far.x, far.y, markers)).toBeNull();
  });
});
