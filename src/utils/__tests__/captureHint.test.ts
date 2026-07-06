import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  parseCaptureHintState,
  shouldShowCaptureHint,
  withSaveRecorded,
  isCaptureHintVisible,
  loadCaptureHintState,
  recordCaptureHintSave,
  resetCaptureHint,
  CAPTURE_HINT_MAX_SAVES,
} from '../captureHint';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

beforeEach(async () => {
  await AsyncStorage.clear();
  resetCaptureHint();
});

describe('capture hint logic (CD-28)', () => {
  it('parses missing or malformed state as a fresh install', () => {
    expect(parseCaptureHintState(null)).toEqual({ saves: 0 });
    expect(parseCaptureHintState('{broken')).toEqual({ saves: 0 });
    expect(parseCaptureHintState('{"saves":"lots"}')).toEqual({ saves: 0 });
    expect(parseCaptureHintState('{"saves":-2}')).toEqual({ saves: 0 });
    expect(parseCaptureHintState('{"saves":2}')).toEqual({ saves: 2 });
  });

  it('shows until the save threshold, then hides for good', () => {
    expect(shouldShowCaptureHint({ saves: 0 })).toBe(true);
    expect(shouldShowCaptureHint({ saves: CAPTURE_HINT_MAX_SAVES - 1 })).toBe(true);
    expect(shouldShowCaptureHint({ saves: CAPTURE_HINT_MAX_SAVES })).toBe(false);
    expect(shouldShowCaptureHint({ saves: 99 })).toBe(false);
  });

  it('counts saves', () => {
    let s = { saves: 0 };
    s = withSaveRecorded(s);
    s = withSaveRecorded(s);
    expect(s).toEqual({ saves: 2 });
  });
});

describe('capture hint store (CD-28)', () => {
  it('stays hidden until the persisted count has loaded (no first-frame flash)', async () => {
    expect(isCaptureHintVisible()).toBe(false);
    await loadCaptureHintState();
    expect(isCaptureHintVisible()).toBe(true);
  });

  it('auto-dismisses after N saves and persists the dismissal', async () => {
    await loadCaptureHintState();
    for (let i = 0; i < CAPTURE_HINT_MAX_SAVES; i++) {
      expect(isCaptureHintVisible()).toBe(true);
      recordCaptureHintSave();
    }
    expect(isCaptureHintVisible()).toBe(false);

    // "App restart": fresh in-memory store, same storage.
    resetCaptureHint();
    expect(isCaptureHintVisible()).toBe(false);
    await loadCaptureHintState();
    expect(isCaptureHintVisible()).toBe(false);
  });

  it('a partial save count survives restart', async () => {
    await loadCaptureHintState();
    recordCaptureHintSave();
    resetCaptureHint();
    await loadCaptureHintState();
    expect(isCaptureHintVisible()).toBe(true);
    for (let i = 1; i < CAPTURE_HINT_MAX_SAVES; i++) recordCaptureHintSave();
    expect(isCaptureHintVisible()).toBe(false);
  });
});
