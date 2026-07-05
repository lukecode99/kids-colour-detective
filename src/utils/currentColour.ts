// Tiny shared store for "the colour under consideration right now".
// The Scan tab (live camera or photo pinpoint) writes into it; the
// Matches and Palettes tabs read from it. Module-level rather than React
// context so it survives tabs unmounting (inactive tabs are unmounted to
// stop the camera).
import { useSyncExternalStore } from 'react';
import { Rgb } from './photoSample';

export interface CurrentColour {
  rgb: Rgb;
  hex: string;
  name: string; // friendly colour name, e.g. "Dusty Rose"
}

let current: CurrentColour | null = null;
const listeners = new Set<() => void>();

export function setCurrentColour(c: CurrentColour): void {
  current = c;
  listeners.forEach(l => l());
}

export function getCurrentColour(): CurrentColour | null {
  return current;
}

export function subscribeCurrentColour(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Test-only: clear the store between cases. */
export function resetCurrentColour(): void {
  current = null;
  listeners.forEach(l => l());
}

export function useCurrentColour(): CurrentColour | null {
  return useSyncExternalStore(subscribeCurrentColour, getCurrentColour, getCurrentColour);
}
