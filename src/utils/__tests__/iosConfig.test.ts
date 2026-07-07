import * as fs from 'fs';
import * as path from 'path';

// CD-32: Apple flagged ITMS-90683 on build 17 — vision-camera compiles
// CLLocation APIs by default, so the binary references location without a
// purpose string. These tests pin the app.json config that fixes it:
// an honest NSLocationWhenInUseUsageDescription, plus enableLocation: false
// on the vision-camera plugin so the reference is stripped at pod install.

const appJson = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', '..', '..', 'app.json'), 'utf8')
);
const ios = appJson.expo.ios;

function visionCameraPluginProps(): any {
  const entry = appJson.expo.plugins.find(
    (p: any) => Array.isArray(p) && p[0] === 'react-native-vision-camera'
  );
  return entry?.[1];
}

describe('iOS purpose strings (CD-32, ITMS-90683)', () => {
  it('declares a location purpose string that is honest and user-facing', () => {
    const s = ios.infoPlist.NSLocationWhenInUseUsageDescription;
    expect(s).toBe(
      'This app does not use your location. Colour matching works entirely on your device.'
    );
    // User-facing, not dev jargon.
    expect(s).not.toMatch(/SDK|dependency|CoreLocation|API/i);
  });

  it('keeps the camera purpose string', () => {
    expect(ios.infoPlist.NSCameraUsageDescription).toMatch(/camera/i);
    expect(visionCameraPluginProps().cameraPermissionText).toMatch(/camera/i);
  });

  it('strips vision-camera location and microphone code paths', () => {
    const props = visionCameraPluginProps();
    expect(props.enableLocation).toBe(false);
    expect(props.enableMicrophonePermission).toBe(false);
  });
});

// CD-35: photo-library purpose string (expo-image-picker was a dependency
// with no config-plugin entry, so builds shipped the default message), plus
// the app icon pinned in-repo — prebuild was silently shipping its blank
// white placeholder because expo.icon was never set.
describe('photo library purpose string and icon (CD-35)', () => {
  const PHOTOS_PERMISSION =
    'Choose a photo to find the closest matching paint colours in it. Photos are analysed on your device only.';

  function imagePickerPluginProps(): any {
    const entry = appJson.expo.plugins.find(
      (p: any) => Array.isArray(p) && p[0] === 'expo-image-picker'
    );
    return entry?.[1];
  }

  it('declares an honest photo-library purpose string', () => {
    expect(ios.infoPlist.NSPhotoLibraryUsageDescription).toBe(PHOTOS_PERMISSION);
    expect(ios.infoPlist.NSPhotoLibraryUsageDescription).not.toMatch(/SDK|dependency|API/i);
  });

  it('configures the expo-image-picker plugin with the same strings', () => {
    const props = imagePickerPluginProps();
    expect(props.photosPermission).toBe(PHOTOS_PERMISSION);
    expect(props.cameraPermission).toBe(ios.infoPlist.NSCameraUsageDescription);
    expect(props.microphonePermission).toBe(false);
  });

  it('pins the app icon in the repo so prebuild cannot ship its placeholder', () => {
    expect(appJson.expo.icon).toBe('./assets/icon.png');
    const iconPath = path.join(__dirname, '..', '..', '..', 'assets', 'icon.png');
    expect(fs.existsSync(iconPath)).toBe(true);
    // Real payload, not a zero-byte stub.
    expect(fs.statSync(iconPath).size).toBeGreaterThan(1000);
  });
});
