// CD-25: pinch-zoom + pan viewport for the colour wheel. The wheel's own
// geometry (pointToWheel etc.) stays in untransformed CONTENT coordinates
// (0..size); this module maps between those and SCREEN coordinates (touches
// on the fixed-size wheel container): screen = content * scale + t.
// Selection precision scales with zoom for free — at 3× one screen pixel
// covers a third of a content pixel, so hue/saturation resolve 3× finer.

export interface WheelViewport {
  scale: number;
  tx: number;
  ty: number;
}

export const MIN_ZOOM = 1;
export const MAX_ZOOM = 5;
// One tap of the +/− buttons (the web fallback for pinching).
export const ZOOM_STEP = 1.5;

export function resetViewport(): WheelViewport {
  return { scale: 1, tx: 0, ty: 0 };
}

export function isZoomed(vp: WheelViewport): boolean {
  return vp.scale > 1.001;
}

// Keep the zoom in range and the wheel covering the whole container — no
// blank gutters to drag the content out of sight into. At scale 1 the only
// legal pan is (0, 0).
export function clampViewport(vp: WheelViewport, size: number): WheelViewport {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.scale));
  const min = size * (1 - scale); // content right/bottom edge stays at/past the view edge
  return {
    scale,
    tx: Math.min(0, Math.max(min, vp.tx)),
    ty: Math.min(0, Math.max(min, vp.ty)),
  };
}

export function screenToContent(
  x: number,
  y: number,
  vp: WheelViewport
): { x: number; y: number } {
  return { x: (x - vp.tx) / vp.scale, y: (y - vp.ty) / vp.scale };
}

export function contentToScreen(
  x: number,
  y: number,
  vp: WheelViewport
): { x: number; y: number } {
  return { x: x * vp.scale + vp.tx, y: y * vp.scale + vp.ty };
}

// Zoom about a focal screen point (the pinch midpoint, or the wheel centre
// for the buttons): the content under the focal point stays put.
export function pinchViewport(
  vp: WheelViewport,
  focalX: number,
  focalY: number,
  factor: number,
  size: number
): WheelViewport {
  const scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, vp.scale * factor));
  const c = screenToContent(focalX, focalY, vp);
  return clampViewport(
    { scale, tx: focalX - c.x * scale, ty: focalY - c.y * scale },
    size
  );
}

// Drag the view by a screen-space delta (two-finger drag while zoomed).
export function panViewport(
  vp: WheelViewport,
  dx: number,
  dy: number,
  size: number
): WheelViewport {
  return clampViewport({ scale: vp.scale, tx: vp.tx + dx, ty: vp.ty + dy }, size);
}
