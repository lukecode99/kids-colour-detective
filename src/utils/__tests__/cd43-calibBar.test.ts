// CD-43: tests for calibration top bar state logic.
// The bar variant drives what CalibrationTopBar renders —
// amber (not calibrated), green (locked), or hidden (during calibration flow).

type WhiteRefMode = 'off' | 'choosing' | 'calibrating' | 'locked';

function calibBarVariant(mode: WhiteRefMode): 'amber' | 'green' | null {
  if (mode === 'choosing' || mode === 'calibrating') return null;
  return mode === 'locked' ? 'green' : 'amber';
}

describe('CD-43 calibration top bar variant', () => {
  it('shows amber when not calibrated', () => {
    expect(calibBarVariant('off')).toBe('amber');
  });

  it('shows green when locked', () => {
    expect(calibBarVariant('locked')).toBe('green');
  });

  it('hides during calibration flow so the overlay can take over', () => {
    expect(calibBarVariant('choosing')).toBeNull();
    expect(calibBarVariant('calibrating')).toBeNull();
  });
});
