import * as fs from 'fs';
import * as path from 'path';
import { SCAN_FOOTER_HINT } from '../scanCopy';

// CD-30/CD-33: the footer is verbatim copy from Luke — these tests pin the
// exact sentence and prove both scan-screen variants actually render it. The
// camera screens can't be mounted under the node test environment (native
// vision-camera requires), so the render check reads the source directly.
// CD-40: tab renamed from "My Colours" to "Saved".

describe('scan page footer wording (CD-30, revised CD-33, CD-40)', () => {
  it('is Luke\'s exact sentence, character for character', () => {
    expect(SCAN_FOOTER_HINT).toBe(
      'See your captured colours and filter by brand and paint type in the Saved tab'
    );
  });

  it('the superseded CD-30 sentence is gone', () => {
    expect(SCAN_FOOTER_HINT).not.toContain('image captures');
  });

  it("keeps the 'Saved' tab capitalisation (CD-40 rename)", () => {
    expect(SCAN_FOOTER_HINT).toContain('Saved tab');
    expect(SCAN_FOOTER_HINT).not.toContain('My Colours');
  });

  it('the shared constant is rendered in CameraScreen via ScanDrawer, old wording is gone', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'screens', 'CameraScreen.tsx'),
      'utf8'
    );
    // CD-40 refactor: ScanDrawer is a shared component used by both WebCameraScreen
    // and NativeCameraScreen, so {SCAN_FOOTER_HINT} appears once in source but
    // is rendered by both variants at runtime.
    const renders = src.match(/\{SCAN_FOOTER_HINT\}/g) ?? [];
    expect(renders.length).toBeGreaterThanOrEqual(1);
    expect(src).toContain('ScanDrawer');
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
