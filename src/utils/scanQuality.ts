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

// sRGB transfer function (IEC 61966-2-1). Lamp casts multiply light in
// LINEAR RGB, so correction has to happen there too — scaling the encoded
// values only half-removes a cast (CD-27).
export function srgbToLinear(c: number): number {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  const clamped = Math.max(0, Math.min(1, v));
  const c = clamped <= 0.0031308 ? clamped * 12.92 : 1.055 * Math.pow(clamped, 1 / 2.4) - 0.055;
  return Math.round(c * 255);
}

// Ratio-only cast correction against a locked NEUTRAL reference — grey card
// or white paper, either works (CD-27). Each linear channel is scaled so the
// reference becomes neutral at its own luminance; brightness is never boosted
// towards pure white, so the reference's reflectance doesn't matter and the
// cast factors cancel exactly for any neutral surface.
export function applyWhiteRef(rgb: Rgb, ref: WhiteRef): Rgb {
  if (ref.r <= 20 || ref.g <= 20 || ref.b <= 20) return rgb;
  const refLin = [srgbToLinear(ref.r), srgbToLinear(ref.g), srgbToLinear(ref.b)];
  const refMean = (refLin[0] + refLin[1] + refLin[2]) / 3;
  return [
    linearToSrgb(srgbToLinear(rgb[0]) * (refMean / refLin[0])),
    linearToSrgb(srgbToLinear(rgb[1]) * (refMean / refLin[1])),
    linearToSrgb(srgbToLinear(rgb[2]) * (refMean / refLin[2])),
  ];
}

// Does this reading look like a neutral calibration surface (grey card or
// white paper)? Plausibility is bounded saturation, NOT high brightness —
// a grey card reflects ~18%, so mid-grey readings are exactly what we
// expect. The cast bound is relative chroma: a warm/cool lamp on a neutral
// surface stays under it, while genuinely coloured surfaces (an orange
// wall at [200, 150, 70]) blow past it.
export function isPlausibleWhiteRef(rgb: Rgb): boolean {
  const [r, g, b] = rgb;
  const max = Math.max(r, g, b);
  const brightness = (r + g + b) / 3;
  if (brightness < 40 || max <= 0) return false;
  return (max - Math.min(r, g, b)) / max <= 0.45;
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
