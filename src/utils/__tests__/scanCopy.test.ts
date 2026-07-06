import * as fs from 'fs';
import * as path from 'path';
import { SCAN_FOOTER_HINT } from '../scanCopy';

// CD-30: the footer is verbatim copy from Luke — these tests pin the exact
// sentence and prove both scan-screen variants actually render it. The
// camera screens can't be mounted under the node test environment (native
// vision-camera requires), so the render check reads the source directly.

describe('scan page footer wording (CD-30)', () => {
  it('is Luke\'s exact sentence, character for character', () => {
    expect(SCAN_FOOTER_HINT).toBe(
      'See your image captures and filter paint types and brands in the My Colours tab'
    );
  });

  it("keeps the 'My Colours' tab capitalisation", () => {
    expect(SCAN_FOOTER_HINT).toContain('My Colours tab');
    expect(SCAN_FOOTER_HINT).not.toContain('my colours');
  });

  it('both scan-screen variants render the shared constant, old wording is gone', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'screens', 'CameraScreen.tsx'),
      'utf8'
    );
    // One render site in WebCameraScreen, one in NativeCameraScreen.
    const renders = src.match(/\{SCAN_FOOTER_HINT\}/g) ?? [];
    expect(renders).toHaveLength(2);
    expect(src).toContain("from '../utils/scanCopy'");
    expect(src).not.toContain('All matches, filters');
    expect(src).not.toContain('buy links live');
  });

  it('never truncates: no numberOfLines cap on the footer text', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'screens', 'CameraScreen.tsx'),
      'utf8'
    );
    for (const line of src.split('\n')) {
      if (line.includes('SCAN_FOOTER_HINT') && line.includes('<Text')) {
        expect(line).not.toContain('numberOfLines');
      }
    }
  });
});
