// Colour-wheel geometry for the planner tab (CD-17): a standard HSL wheel
// where the angle from centre is hue (0° = east, clockwise) and the
// distance from centre is saturation. Pure maths so the touch → colour
// mapping is unit-testable without the UI.
import { hslToRgb, rgbToHsl, hexToRgb } from './colorMath';
import type { SavedColorEntry } from './savedColors';

export interface WheelPick {
  h: number; // hue, degrees in [0, 360)
  s: number; // saturation, [0, 1]
}

// Touch point (relative to the wheel's top-left corner) → hue/saturation.
// Points outside the wheel clamp to the rim rather than being rejected, so
// a drag that wanders off the edge keeps tracking.
export function pointToWheel(x: number, y: number, radius: number): WheelPick {
  const dx = x - radius;
  const dy = y - radius;
  const s = Math.min(Math.hypot(dx, dy) / radius, 1);
  const h = ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360;
  return { h, s };
}

// Inverse of pointToWheel: where on the wheel a hue/saturation sits — used
// to place the knob and the reference dots.
export function wheelToPoint(h: number, s: number, radius: number): { x: number; y: number } {
  const a = (h * Math.PI) / 180;
  return {
    x: radius + Math.cos(a) * s * radius,
    y: radius + Math.sin(a) * s * radius,
  };
}

// The picked wheel position + the lightness slider → the colour, via the
// same hslToRgb the harmony pipeline uses.
export function wheelPickToRgb(pick: WheelPick, lightness: number): [number, number, number] {
  return hslToRgb(pick.h, pick.s, lightness);
}

// ---------------------------------------------------------------------------
// CD-22: saved captures plotted on the wheel. Each marker sits at the hue
// angle / saturation radius of the capture's stored colour (rgb from the
// CD-13 schema; hex only for anything that somehow skipped migration), so
// the dot lands exactly where picking that colour by hand would.

export interface SavedMarker {
  id: string;
  hex: string; // the capture's own colour — the marker is painted with it
  name: string; // room label when set, else the colour name
  thumbnailUri?: string; // the captured photo (CD-24) — absent on pre-thumbnail saves
  h: number;
  s: number;
  x: number;
  y: number;
}

export function savedColourMarkers(
  entries: SavedColorEntry[],
  radius: number
): SavedMarker[] {
  return entries.map(e => {
    const [r, g, b] = e.rgb ?? hexToRgb(e.hex);
    const [h, s] = rgbToHsl(r, g, b);
    const { x, y } = wheelToPoint(h, s, radius);
    return {
      id: e.id,
      hex: e.hex,
      name: e.label || e.name,
      thumbnailUri: e.thumbnailUri,
      h,
      s,
      x,
      y,
    };
  });
}

// Which marker (if any) a touch lands on: nearest within the threshold, so
// overlapping markers resolve to the closest one instead of breaking. A miss
// returns null and the touch falls through to the normal wheel pick.
// Threshold tracks the CD-24 marker size (20px visual → a little slop).
export function hitMarker(
  x: number,
  y: number,
  markers: SavedMarker[],
  threshold = 18
): SavedMarker | null {
  let best: SavedMarker | null = null;
  let bestD = threshold;
  for (const m of markers) {
    const d = Math.hypot(m.x - x, m.y - y);
    if (d <= bestD) {
      best = m;
      bestD = d;
    }
  }
  return best;
}
