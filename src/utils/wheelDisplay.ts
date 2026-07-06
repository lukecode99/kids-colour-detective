// CD-23: Planner wheel display filter — what the wheel face shows.
// 'all'    wheel + saved-colour markers (default, pre-CD-23 behaviour)
// 'saved'  saved markers prominent: wheel chrome (reference dots + knob)
//          hidden, face dimmed, touches only identify markers
// 'wheel'  the plain picker, zero saved markers
// Pure mode→render mapping lives here so the screen and the tests agree;
// persistence follows the same AsyncStorage pattern as the paint filters.
import AsyncStorage from '@react-native-async-storage/async-storage';

export type WheelDisplayMode = 'all' | 'saved' | 'wheel';

export const WHEEL_DISPLAY_DEFAULT: WheelDisplayMode = 'all';

export const WHEEL_DISPLAY_OPTIONS: { mode: WheelDisplayMode; label: string }[] = [
  { mode: 'all', label: 'All' },
  { mode: 'saved', label: 'Saved only' },
  { mode: 'wheel', label: 'Wheel only' },
];

// Saved-colour markers render in every mode except the plain wheel.
export function markersVisible(mode: WheelDisplayMode): boolean {
  return mode !== 'wheel';
}

// The picker chrome (reference dots + knob) hides when saved colours are the
// point — the face stays as a dimmed backdrop so marker positions keep their
// hue/saturation meaning.
export function wheelChromeVisible(mode: WheelDisplayMode): boolean {
  return mode !== 'saved';
}

// Whether a touch moves the pick. In saved-only mode touches identify
// markers and nothing else — a hidden knob silently changing the matches
// below would be baffling.
export function allowsPick(mode: WheelDisplayMode): boolean {
  return mode !== 'saved';
}

// Saved-only with nothing saved needs a hint, not an empty circle.
export function showsEmptySavedHint(mode: WheelDisplayMode, savedCount: number): boolean {
  return mode === 'saved' && savedCount === 0;
}

const STORAGE_KEY = 'wheelDisplay.v1';

function isMode(value: unknown): value is WheelDisplayMode {
  return value === 'all' || value === 'saved' || value === 'wheel';
}

export async function loadWheelDisplayMode(): Promise<WheelDisplayMode> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return WHEEL_DISPLAY_DEFAULT;
    const parsed = JSON.parse(raw);
    return isMode(parsed) ? parsed : WHEEL_DISPLAY_DEFAULT;
  } catch {
    return WHEEL_DISPLAY_DEFAULT;
  }
}

export async function saveWheelDisplayMode(mode: WheelDisplayMode): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(mode));
  } catch {
    // persistence is best-effort; the planner must never break on storage errors
  }
}
