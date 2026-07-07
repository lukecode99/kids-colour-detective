// CD-34: the calibration journey starts with a choice — ordinary white
// paper (everyone has a sheet) or an 18% photographic grey card (the
// accurate reference). The correction maths treats both identically
// (CD-27's ratio-only correction cancels for any neutral), so the choice
// only drives guidance copy, the locked pill label, and which surface the
// chooser preselects next time. Same store shape as captureHint (CD-28).
import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

export type CalibrationSurface = 'paper' | 'card';

// Product wording is fixed: "18% photographic grey card".
export const GREY_CARD_PRODUCT_NAME = '18% photographic grey card';

// Single purchase constant for the "Get one" link. Swap the tag for the
// Amazon Associates id once approval lands — the ASIN stays put.
export const GREY_CARD_ASIN = 'B01DPV5PUA';
export const GREY_CARD_AMAZON_TAG = ''; // Associates tag, empty until approved
// OFF until the Associates application is approved — the chooser simply
// doesn't render the link while this is false.
export const GREY_CARD_LINK_ENABLED = false;

export function greyCardUrl(
  asin: string = GREY_CARD_ASIN,
  tag: string = GREY_CARD_AMAZON_TAG
): string {
  const suffix = tag ? `?tag=${encodeURIComponent(tag)}` : '';
  return `https://www.amazon.co.uk/dp/${encodeURIComponent(asin)}${suffix}`;
}

// Pill label once a reference is locked: "Calibrated · card" / "Calibrated · paper".
export function calibratedLabel(surface: CalibrationSurface): string {
  return `Calibrated · ${surface}`;
}

export function isCalibrationSurface(value: unknown): value is CalibrationSurface {
  return value === 'paper' || value === 'card';
}

// Tolerant parse of the persisted preference: anything malformed means no
// preference (the chooser highlights nothing).
export function parsePreferredSurface(raw: string | null): CalibrationSurface | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return isCalibrationSurface(parsed?.surface) ? parsed.surface : null;
  } catch {
    return null;
  }
}

// --- module store ---

const STORAGE_KEY = 'calibrationSurface.v1';

let preferred: CalibrationSurface | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// No preference until storage has been read — a returning user's choice
// must never be overridden by a null flash before the load completes.
export function getPreferredSurface(): CalibrationSurface | null {
  return loaded ? preferred : null;
}

export async function loadPreferredSurface(): Promise<void> {
  if (loaded) return;
  try {
    preferred = parsePreferredSurface(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    preferred = null;
  }
  loaded = true;
  notify();
}

export function recordSurfaceChoice(surface: CalibrationSurface): void {
  preferred = surface;
  loaded = true;
  notify();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ surface })).catch(() => {});
}

/** Test-only: back to the pre-load state. */
export function resetCalibrationSurface(): void {
  preferred = null;
  loaded = false;
  notify();
}

export function usePreferredSurface(): CalibrationSurface | null {
  useEffect(() => {
    loadPreferredSurface();
  }, []);
  return useSyncExternalStore(subscribe, getPreferredSurface, getPreferredSurface);
}
