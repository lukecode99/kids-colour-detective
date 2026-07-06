import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  WheelDisplayMode,
  WHEEL_DISPLAY_DEFAULT,
  WHEEL_DISPLAY_OPTIONS,
  markersVisible,
  wheelChromeVisible,
  allowsPick,
  showsEmptySavedHint,
  loadWheelDisplayMode,
  saveWheelDisplayMode,
} from '../wheelDisplay';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

beforeEach(() => AsyncStorage.clear());

// SC: mode → render mapping. 'all' is the pre-CD-23 wheel, 'saved' keeps
// every marker visible and tappable with the wheel de-emphasised, 'wheel'
// renders zero saved markers.
describe('display mode → render mapping (CD-23)', () => {
  it('offers exactly the three modes, All first (the default)', () => {
    expect(WHEEL_DISPLAY_OPTIONS.map(o => o.mode)).toEqual(['all', 'saved', 'wheel']);
    expect(WHEEL_DISPLAY_OPTIONS[0].mode).toBe(WHEEL_DISPLAY_DEFAULT);
    expect(WHEEL_DISPLAY_DEFAULT).toBe('all');
  });

  it('All: wheel chrome AND markers, picking enabled — current behaviour', () => {
    expect(markersVisible('all')).toBe(true);
    expect(wheelChromeVisible('all')).toBe(true);
    expect(allowsPick('all')).toBe(true);
  });

  it('Saved only: markers stay visible, chrome hides, touches only identify', () => {
    expect(markersVisible('saved')).toBe(true);
    expect(wheelChromeVisible('saved')).toBe(false);
    expect(allowsPick('saved')).toBe(false);
  });

  it('Wheel only: zero saved markers, the plain picker', () => {
    expect(markersVisible('wheel')).toBe(false);
    expect(wheelChromeVisible('wheel')).toBe(true);
    expect(allowsPick('wheel')).toBe(true);
  });

  it('empty-state hint shows only in Saved-only mode with nothing saved', () => {
    expect(showsEmptySavedHint('saved', 0)).toBe(true);
    expect(showsEmptySavedHint('saved', 1)).toBe(false);
    expect(showsEmptySavedHint('all', 0)).toBe(false);
    expect(showsEmptySavedHint('wheel', 0)).toBe(false);
  });
});

// SC: selection persists across app restarts — same storage pattern as the
// capture filters (AsyncStorage, defensive load).
describe('persistence (CD-23)', () => {
  it.each<WheelDisplayMode>(['all', 'saved', 'wheel'])(
    'round-trips %s through save → load',
    async mode => {
      await saveWheelDisplayMode(mode);
      expect(await loadWheelDisplayMode()).toBe(mode);
    }
  );

  it('defaults to All when nothing has ever been saved', async () => {
    expect(await loadWheelDisplayMode()).toBe('all');
  });

  it('a stored value that is not a mode falls back to the default', async () => {
    await AsyncStorage.setItem('wheelDisplay.v1', JSON.stringify('sideways'));
    expect(await loadWheelDisplayMode()).toBe('all');
  });

  it('corrupt JSON falls back to the default instead of throwing', async () => {
    await AsyncStorage.setItem('wheelDisplay.v1', '{not json');
    expect(await loadWheelDisplayMode()).toBe('all');
  });

  it('a later selection overwrites the earlier one', async () => {
    await saveWheelDisplayMode('saved');
    await saveWheelDisplayMode('wheel');
    expect(await loadWheelDisplayMode()).toBe('wheel');
  });
});
