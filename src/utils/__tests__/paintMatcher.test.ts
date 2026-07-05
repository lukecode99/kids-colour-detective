import { deltaE2000, rgbToLab } from '../colorMath';
import { PAINTS, matchPaints, matchPercent, closenessLabel } from '../paintMatcher';

describe('deltaE2000', () => {
  it('is zero for identical colours', () => {
    const lab = rgbToLab(76, 175, 80);
    expect(deltaE2000(lab, lab)).toBeCloseTo(0, 6);
  });

  it('matches published CIEDE2000 reference pair (Sharma et al.)', () => {
    // Pair 1 from the Sharma 2005 test data set.
    expect(deltaE2000([50, 2.6772, -79.7751], [50, 0, -82.7485])).toBeCloseTo(2.0425, 3);
  });

  it('ranks a visually similar green closer than a grey-green', () => {
    const scannedGreen = rgbToLab(76, 175, 80); // #4CAF50
    const nearbyGreen = rgbToLab(67, 160, 71); // #43A047
    const greyGreen = rgbToLab(125, 139, 125); // #7D8B7D
    expect(deltaE2000(scannedGreen, nearbyGreen)).toBeLessThan(
      deltaE2000(scannedGreen, greyGreen)
    );
  });
});

describe('closeness bands', () => {
  it('labels the ΔE bands in plain English', () => {
    expect(closenessLabel(0.5)).toBe('Indistinguishable');
    expect(closenessLabel(3)).toBe('Very close');
    expect(closenessLabel(8)).toBe('Close');
    expect(closenessLabel(12)).toBe('Different colour');
  });

  it('clamps match % to 0–100', () => {
    expect(matchPercent(0)).toBe(100);
    expect(matchPercent(2.5)).toBe(95);
    expect(matchPercent(60)).toBe(0);
  });
});

describe('matchPaints', () => {
  it('returns 5 results sorted by ascending ΔE', () => {
    const matches = matchPaints(76, 175, 80);
    expect(matches).toHaveLength(5);
    for (let i = 1; i < matches.length; i++) {
      expect(matches[i].deltaE).toBeGreaterThanOrEqual(matches[i - 1].deltaE);
    }
  });

  it('finds an exact dataset colour at 100%', () => {
    const target = PAINTS.find(p => p.brand === 'Farrow & Ball' && p.name === 'Hague Blue')!;
    const n = parseInt(target.hex.slice(1), 16);
    const matches = matchPaints((n >> 16) & 255, (n >> 8) & 255, n & 255);
    expect(matches[0].deltaE).toBeLessThan(0.1);
    expect(matches[0].matchPercent).toBe(100);
    expect(matches[0].closeness).toBe('Indistinguishable');
    expect(matches.map(m => `${m.paint.brand} ${m.paint.name}`)).toContain(
      'Farrow & Ball Hague Blue'
    );
  });

  it('top-5 for a scanned green are all greens, not greys', () => {
    const matches = matchPaints(76, 175, 80);
    for (const m of matches) {
      // every close match should be meaningfully chromatic (not a grey):
      const [, a, b] = m.paint.lab;
      expect(Math.hypot(a, b)).toBeGreaterThan(10);
      expect(m.deltaE).toBeLessThan(10);
    }
  });

  it('includes the Hammerite range in matching', () => {
    expect(PAINTS.some(p => p.brand === 'Hammerite')).toBe(true);
  });
});
