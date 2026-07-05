import { brandColours, searchBrandColours, crossBrandAlternates } from '../brandMatch';
import { PAINTS, matchPaintsLab } from '../paintMatcher';
import { deltaE2000 } from '../colorMath';

const hagueBlue = PAINTS.find(p => p.brand === 'Farrow & Ball' && p.name === 'Hague Blue')!;

describe('brand colour browsing & search', () => {
  it('brandColours returns only that brand, sorted by name', () => {
    const fb = brandColours('Farrow & Ball');
    expect(fb.length).toBeGreaterThan(0);
    expect(fb.every(p => p.brand === 'Farrow & Ball')).toBe(true);
    const names = fb.map(p => p.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b)));
  });

  it('empty query browses the whole brand', () => {
    expect(searchBrandColours('Farrow & Ball', '  ')).toEqual(brandColours('Farrow & Ball'));
  });

  it('search matches name case-insensitively', () => {
    const hits = searchBrandColours('Farrow & Ball', 'hague');
    expect(hits.map(p => p.name)).toContain('Hague Blue');
    expect(hits.every(p => p.brand === 'Farrow & Ball')).toBe(true);
  });

  it('search matches the code too', () => {
    const hits = searchBrandColours('Farrow & Ball', 'no.30');
    expect(hits.some(p => p.name === 'Hague Blue')).toBe(true);
  });

  it('no cross-brand leakage on a shared word', () => {
    const hits = searchBrandColours('Dulux', 'blue');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.every(p => p.brand === 'Dulux')).toBe(true);
  });
});

describe('cross-brand alternates (CD-18 success criteria)', () => {
  it('Hague Blue #3F4D57 returns alternates sorted by ΔE, source brand excluded', () => {
    expect(hagueBlue.hex).toBe('#3F4D57');
    const alts = crossBrandAlternates(hagueBlue, 10);
    expect(alts).toHaveLength(10);
    expect(alts.every(m => m.paint.brand !== 'Farrow & Ball')).toBe(true);
    for (let i = 1; i < alts.length; i++) {
      expect(alts[i].deltaE).toBeGreaterThanOrEqual(alts[i - 1].deltaE);
    }
    // every result carries the closeness band and ΔE the row displays
    for (const m of alts) {
      expect(typeof m.closeness).toBe('string');
      expect(m.deltaE).toBeGreaterThan(0);
    }
  });

  it('hand-checked ΔE pair: Hague Blue vs RAL Design Galenite blue', () => {
    // ΔE2000 computed with an independent CIEDE2000 implementation from the
    // stored Lab values [31.93,-2.91,-7.72] vs Galenite blue — 1.3600.
    const galenite = PAINTS.find(
      p => p.brand === 'RAL Design' && p.name === 'Galenite blue'
    )!;
    expect(deltaE2000(hagueBlue.lab, galenite.lab)).toBeCloseTo(1.3599, 3);
    const [top] = crossBrandAlternates(hagueBlue, 1);
    expect(top.paint.name).toBe('Galenite blue');
    expect(top.closeness).toBe('Very close');
  });

  it('alternates equal matchPaintsLab over the paint pool minus the source brand', () => {
    const pool = PAINTS.filter(p => p.brand !== hagueBlue.brand);
    const direct = matchPaintsLab(hagueBlue.lab, 10, pool);
    const viaUtil = crossBrandAlternates(hagueBlue, 10);
    expect(viaUtil.map(m => m.paint.hex)).toEqual(direct.map(m => m.paint.hex));
  });
});
