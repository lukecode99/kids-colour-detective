// Colour-wheel geometry for the planner tab (CD-17): a standard HSL wheel
// where the angle from centre is hue (0° = east, clockwise) and the
// distance from centre is saturation. Pure maths so the touch → colour
// mapping is unit-testable without the UI.
import { hslToRgb } from './colorMath';

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
