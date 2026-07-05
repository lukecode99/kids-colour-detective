// Scan-quality pipeline maths: stable-frame averaging, white-card
// correction and lighting hints. Pure functions, no react-native imports,
// so everything runs under jest's node env.
import { Rgb, medianRgb } from './photoSample';

export const STABILITY_WINDOW = 5;
// Average successive RGB delta above which readings count as unstable.
export const STABILITY_THRESHOLD = 25;

export interface WhiteRef {
  r: number;
  g: number;
  b: number;
}

// Append a reading, keeping only the most recent `max`. Non-mutating.
export function pushReading(history: Rgb[], rgb: Rgb, max = STABILITY_WINDOW): Rgb[] {
  const next = [...history, rgb];
  return next.length > max ? next.slice(next.length - max) : next;
}

export function avgSuccessiveDelta(history: Rgb[]): number {
  if (history.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < history.length; i++) {
    const dr = history[i][0] - history[i - 1][0];
    const dg = history[i][1] - history[i - 1][1];
    const db = history[i][2] - history[i - 1][2];
    total += Math.sqrt(dr * dr + dg * dg + db * db);
  }
  return total / (history.length - 1);
}

export function isStable(history: Rgb[]): boolean {
  return history.length >= 2 && avgSuccessiveDelta(history) <= STABILITY_THRESHOLD;
}

// The colour to display: per-channel median over the window when the camera
// is steady (kills frame-to-frame sensor noise so the same wall keeps the
// same top match), the latest reading while moving (stays responsive).
export function stabilizedRgb(history: Rgb[]): Rgb {
  if (!history.length) return [128, 128, 128];
  if (!isStable(history)) return history[history.length - 1];
  return medianRgb(history);
}

// Scale each channel so the locked white reference maps to pure white.
export function applyWhiteRef(rgb: Rgb, ref: WhiteRef): Rgb {
  if (ref.r <= 20 || ref.g <= 20 || ref.b <= 20) return rgb;
  return [
    Math.min(255, Math.round((rgb[0] * 255) / ref.r)),
    Math.min(255, Math.round((rgb[1] * 255) / ref.g)),
    Math.min(255, Math.round((rgb[2] * 255) / ref.b)),
  ];
}

// Does this reading look like a white card? Bright with a bounded colour
// cast — a warm/cool lamp cast is fine (that's what we're correcting), but
// a dark or strongly saturated reading means they're not pointing at paper.
export function isPlausibleWhiteRef(rgb: Rgb): boolean {
  const [r, g, b] = rgb;
  const brightness = (r + g + b) / 3;
  if (brightness < 110) return false;
  return Math.max(r, g, b) - Math.min(r, g, b) <= 130;
}

export type LightHint = 'dim' | 'warm' | null;

// Suggest the torch when the scene is dark or has a strong warm cast
// (incandescent/evening light shifts every reading towards orange).
export function lightingHint(rgb: Rgb): LightHint {
  const [r, , b] = rgb;
  const brightness = (rgb[0] + rgb[1] + rgb[2]) / 3;
  if (brightness < 60) return 'dim';
  if (b > 0 && r / b >= 1.45 && r - b >= 45) return 'warm';
  return null;
}
