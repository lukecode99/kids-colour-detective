import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  GREY_CARD_ASIN,
  GREY_CARD_AMAZON_TAG,
  GREY_CARD_LINK_ENABLED,
  GREY_CARD_PRODUCT_NAME,
  greyCardUrl,
  calibratedLabel,
  isCalibrationSurface,
  parsePreferredSurface,
  getPreferredSurface,
  loadPreferredSurface,
  recordSurfaceChoice,
  resetCalibrationSurface,
} from '../calibrationSurface';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

beforeEach(async () => {
  await AsyncStorage.clear();
  resetCalibrationSurface();
});

describe('grey-card purchase link (CD-34)', () => {
  it('the link flag stays OFF until Amazon Associates approval', () => {
    expect(GREY_CARD_LINK_ENABLED).toBe(false);
  });

  it('uses the single ASIN constant, untagged while no Associates tag is set', () => {
    expect(GREY_CARD_ASIN).toBe('B01DPV5PUA');
    expect(GREY_CARD_AMAZON_TAG).toBe('');
    expect(greyCardUrl()).toBe(`https://www.amazon.co.uk/dp/${GREY_CARD_ASIN}`);
  });

  it('appends the Associates tag once one is configured', () => {
    expect(greyCardUrl('B01DPV5PUA', 'colourdet-21')).toBe(
      'https://www.amazon.co.uk/dp/B01DPV5PUA?tag=colourdet-21'
    );
  });

  it('product wording is the fixed phrase', () => {
    expect(GREY_CARD_PRODUCT_NAME).toBe('18% photographic grey card');
  });
});

describe('calibrated pill label (CD-34)', () => {
  it('names the locked surface', () => {
    expect(calibratedLabel('card')).toBe('Calibrated · card');
    expect(calibratedLabel('paper')).toBe('Calibrated · paper');
  });
});

describe('surface preference parsing (CD-34)', () => {
  it('recognises only the two surfaces', () => {
    expect(isCalibrationSurface('paper')).toBe(true);
    expect(isCalibrationSurface('card')).toBe(true);
    expect(isCalibrationSurface('cardboard')).toBe(false);
    expect(isCalibrationSurface(undefined)).toBe(false);
  });

  it('parses missing or malformed state as no preference', () => {
    expect(parsePreferredSurface(null)).toBeNull();
    expect(parsePreferredSurface('{broken')).toBeNull();
    expect(parsePreferredSurface('{"surface":"tinfoil"}')).toBeNull();
    expect(parsePreferredSurface('{"surface":"card"}')).toBe('card');
    expect(parsePreferredSurface('{"surface":"paper"}')).toBe('paper');
  });
});

describe('surface preference store (CD-34)', () => {
  it('reports no preference until the persisted choice has loaded', async () => {
    recordSurfaceChoice('card');
    resetCalibrationSurface();
    expect(getPreferredSurface()).toBeNull();
    await loadPreferredSurface();
    expect(getPreferredSurface()).toBe('card');
  });

  it('remembers the latest choice across a restart', async () => {
    await loadPreferredSurface();
    expect(getPreferredSurface()).toBeNull();
    recordSurfaceChoice('paper');
    recordSurfaceChoice('card');
    expect(getPreferredSurface()).toBe('card');

    // "App restart": fresh in-memory store, same storage.
    resetCalibrationSurface();
    await loadPreferredSurface();
    expect(getPreferredSurface()).toBe('card');
  });
});
