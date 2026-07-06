// CD-28: first-run "tap the circle to save" affordance. A module-level
// store (same pattern as currentColour) tracks how many saves the user has
// made, persisted so the hint stays dismissed across restarts. The reticle
// reads visibility via the hook; the scan screens record saves — every save
// path counts, not just taps on the circle itself.
import { useEffect, useSyncExternalStore } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'captureHint.v1';
// Saves after which the hint stops appearing — by then they've got it.
export const CAPTURE_HINT_MAX_SAVES = 3;

export interface CaptureHintState {
  saves: number;
}

// Tolerant parse of the persisted state: anything malformed counts as a
// fresh install (hint shows).
export function parseCaptureHintState(raw: string | null): CaptureHintState {
  if (!raw) return { saves: 0 };
  try {
    const parsed = JSON.parse(raw);
    const saves = typeof parsed?.saves === 'number' && parsed.saves >= 0
      ? Math.floor(parsed.saves)
      : 0;
    return { saves };
  } catch {
    return { saves: 0 };
  }
}

export function shouldShowCaptureHint(
  state: CaptureHintState,
  max = CAPTURE_HINT_MAX_SAVES
): boolean {
  return state.saves < max;
}

export function withSaveRecorded(state: CaptureHintState): CaptureHintState {
  return { saves: state.saves + 1 };
}

// --- module store ---

let state: CaptureHintState = { saves: 0 };
let loaded = false;
const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach(l => l());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

// Hidden until storage has been read — a returning user must never see the
// hint flash before their persisted count loads.
export function isCaptureHintVisible(): boolean {
  return loaded && shouldShowCaptureHint(state);
}

export async function loadCaptureHintState(): Promise<void> {
  if (loaded) return;
  try {
    state = parseCaptureHintState(await AsyncStorage.getItem(STORAGE_KEY));
  } catch {
    state = { saves: 0 };
  }
  loaded = true;
  notify();
}

export function recordCaptureHintSave(): void {
  state = withSaveRecorded(state);
  notify();
  AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(state)).catch(() => {});
}

/** Test-only: back to the pre-load state. */
export function resetCaptureHint(): void {
  state = { saves: 0 };
  loaded = false;
  notify();
}

export function useCaptureHint(): boolean {
  useEffect(() => {
    loadCaptureHintState();
  }, []);
  return useSyncExternalStore(subscribe, isCaptureHintVisible, isCaptureHintVisible);
}
