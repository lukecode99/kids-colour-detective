// Pure geometry + sampling maths for the photo pinpoint picker.
// Kept free of react-native imports so it runs under jest's node env.

export type Rgb = [number, number, number];

export interface ContainFit {
  scale: number; // image px → view px at zoom 1
  offsetX: number;
  offsetY: number;
}

export interface ViewTransform {
  scale: number; // user zoom, applied around the view centre
  tx: number;
  ty: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 8;

// Median per channel: deterministic for a fixed sample window, robust to
// single-pixel noise/outliers — repeated taps on the same spot always give
// the same colour.
export function medianRgb(pixels: Rgb[]): Rgb {
  if (!pixels.length) return [128, 128, 128];
  const median = (values: number[]): number => {
    const sorted = [...values].sort((a, b) => a - b);
    const mid = sorted.length >> 1;
    return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
  };
  return [
    median(pixels.map(p => p[0])),
    median(pixels.map(p => p[1])),
    median(pixels.map(p => p[2])),
  ];
}

// How an image fits inside a view with resizeMode="contain".
export function containFit(imgW: number, imgH: number, viewW: number, viewH: number): ContainFit {
  const scale = Math.min(viewW / imgW, viewH / imgH);
  return {
    scale,
    offsetX: (viewW - imgW * scale) / 2,
    offsetY: (viewH - imgH * scale) / 2,
  };
}

// A point on screen → the image pixel underneath it, given the current
// zoom/pan (scale around view centre, then translate). Returns null when
// the point falls outside the photo.
export function displayToImageCoords(
  px: number,
  py: number,
  viewW: number,
  viewH: number,
  imgW: number,
  imgH: number,
  t: ViewTransform
): { x: number; y: number } | null {
  const fit = containFit(imgW, imgH, viewW, viewH);
  const cx = viewW / 2;
  const cy = viewH / 2;
  const qx = (px - t.tx - cx) / t.scale + cx;
  const qy = (py - t.ty - cy) / t.scale + cy;
  const x = (qx - fit.offsetX) / fit.scale;
  const y = (qy - fit.offsetY) / fit.scale;
  if (x < 0 || y < 0 || x >= imgW || y >= imgH) return null;
  return { x, y };
}

// Keep zoom within bounds and pan from pushing the photo off screen.
export function clampTransform(t: ViewTransform, viewW: number, viewH: number): ViewTransform {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, t.scale));
  const maxTx = (viewW * (scale - 1)) / 2;
  const maxTy = (viewH * (scale - 1)) / 2;
  return {
    scale,
    tx: Math.min(maxTx, Math.max(-maxTx, t.tx)) + 0, // +0 normalises −0
    ty: Math.min(maxTy, Math.max(-maxTy, t.ty)) + 0,
  };
}

// Clamped top-left origin for an N×N sample window centred on (x, y).
export function sampleWindowOrigin(
  x: number,
  y: number,
  imgW: number,
  imgH: number,
  size: number
): { ox: number; oy: number; w: number; h: number } {
  const w = Math.min(size, imgW);
  const h = Math.min(size, imgH);
  const ox = Math.max(0, Math.min(imgW - w, Math.round(x) - (w >> 1)));
  const oy = Math.max(0, Math.min(imgH - h, Math.round(y) - (h >> 1)));
  return { ox, oy, w, h };
}
