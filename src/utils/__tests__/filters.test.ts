import AsyncStorage from '@react-native-async-storage/async-storage';
import { rgbToLab } from '../colorMath';
import { PAINTS, matchPaintsLab } from '../paintMatcher';
import {
  EMPTY_FILTERS,
  applyFilters,
  toggleFilter,
  loadFilters,
  saveFilters,
  loadScanFilters,
  saveScanFilters,
  BRAND_OPTIONS,
  SURFACE_OPTIONS,
  FINISH_OPTIONS,
} from '../filters';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

describe('applyFilters', () => {
  it('returns everything when no filters are set', () => {
    expect(applyFilters(PAINTS, EMPTY_FILTERS)).toHaveLength(PAINTS.length);
  });

  it('exterior masonry filter only ever returns masonry paints', () => {
    const filtered = applyFilters(PAINTS, { ...EMPTY_FILTERS, surfaces: ['exterior masonry'] });
    expect(filtered.length).toBeGreaterThan(0);
    for (const p of filtered) {
      expect(p.surfaces).toContain('exterior masonry');
    }
  });

  it('matches through the matcher stay masonry-only (CD-3 success criterion)', () => {
    const candidates = applyFilters(PAINTS, { ...EMPTY_FILTERS, surfaces: ['exterior masonry'] });
    const matches = matchPaintsLab(rgbToLab(76, 175, 80), 5, candidates);
    expect(matches).toHaveLength(5);
    for (const m of matches) {
      expect(m.paint.surfaces).toContain('exterior masonry');
    }
  });

  it('brand filter restricts to that brand', () => {
    const filtered = applyFilters(PAINTS, { ...EMPTY_FILTERS, brands: ['Hammerite'] });
    expect(filtered.length).toBe(44);
    for (const p of filtered) expect(p.brand).toBe('Hammerite');
  });

  it('radiator chip maps to metal-suitable paints', () => {
    const filtered = applyFilters(PAINTS, { ...EMPTY_FILTERS, surfaces: ['radiator'] });
    expect(filtered.length).toBeGreaterThan(0);
    for (const p of filtered) expect(p.surfaces).toContain('metal');
  });

  it('groups AND together, chips within a group OR together', () => {
    const filtered = applyFilters(PAINTS, {
      brands: ['Dulux', 'Crown'],
      surfaces: ['wood'],
      finishes: ['gloss', 'satin'],
    });
    for (const p of filtered) {
      expect(['Dulux', 'Crown']).toContain(p.brand);
      expect(p.surfaces).toContain('wood');
      expect(p.finishes.some(f => f === 'gloss' || f === 'satin')).toBe(true);
    }
  });

  it('every chip option is spelled to match the dataset', () => {
    const brands = new Set(PAINTS.map(p => p.brand));
    for (const b of BRAND_OPTIONS) expect(brands.has(b)).toBe(true);
    const surfaces = new Set(PAINTS.flatMap(p => p.surfaces));
    for (const s of SURFACE_OPTIONS.filter(s => s !== 'radiator')) {
      expect(surfaces.has(s)).toBe(true);
    }
    const finishes = new Set(PAINTS.flatMap(p => p.finishes));
    for (const f of FINISH_OPTIONS) expect(finishes.has(f)).toBe(true);
  });
});

describe('toggleFilter', () => {
  it('adds then removes a chip without mutating the original', () => {
    const on = toggleFilter(EMPTY_FILTERS, 'surfaces', 'wood');
    expect(on.surfaces).toEqual(['wood']);
    expect(EMPTY_FILTERS.surfaces).toEqual([]);
    const off = toggleFilter(on, 'surfaces', 'wood');
    expect(off.surfaces).toEqual([]);
  });
});

describe('filter persistence', () => {
  beforeEach(() => AsyncStorage.clear());

  it('round-trips filters through storage (survives restart)', async () => {
    const filters = { brands: ['Dulux'], surfaces: ['exterior masonry'], finishes: ['matt'] };
    await saveFilters(filters);
    expect(await loadFilters()).toEqual(filters);
  });

  it('returns empty filters when nothing is stored', async () => {
    expect(await loadFilters()).toEqual(EMPTY_FILTERS);
  });

  it('returns empty filters on corrupt stored data', async () => {
    await AsyncStorage.setItem('paintFilters.v1', 'not json {');
    expect(await loadFilters()).toEqual(EMPTY_FILTERS);
  });
});

describe('scan filter decoupling (CD-29)', () => {
  beforeEach(() => AsyncStorage.clear());

  it('scan filters default to All (empty) even when global filters are set', async () => {
    await saveFilters({ ...EMPTY_FILTERS, brands: ['Dulux'], surfaces: ['wood'] });
    expect(await loadScanFilters()).toEqual(EMPTY_FILTERS);
  });

  it('changing scan filters never changes the global set, and vice versa', async () => {
    const globals = { brands: ['Farrow & Ball'], surfaces: [], finishes: ['matt'] };
    const scan = { brands: [], surfaces: ['exterior masonry'], finishes: [] };
    await saveFilters(globals);
    await saveScanFilters(scan);

    // Each side reads back exactly what it wrote.
    expect(await loadFilters()).toEqual(globals);
    expect(await loadScanFilters()).toEqual(scan);

    // Updating one leaves the other untouched.
    await saveScanFilters(toggleFilter(scan, 'brands', 'Crown'));
    expect(await loadFilters()).toEqual(globals);
    await saveFilters(toggleFilter(globals, 'finishes', 'gloss'));
    expect((await loadScanFilters()).brands).toEqual(['Crown']);
  });

  it('scan filters round-trip through their own key (survive restart)', async () => {
    const scan = { brands: ['Little Greene'], surfaces: ['interior wall'], finishes: [] };
    await saveScanFilters(scan);
    expect(await AsyncStorage.getItem('scanFilters.v1')).not.toBeNull();
    expect(await loadScanFilters()).toEqual(scan);
  });

  it('scan-filtered candidates through the matcher honour only the scan set', async () => {
    await saveFilters({ ...EMPTY_FILTERS, brands: ['Hammerite'] });
    await saveScanFilters({ ...EMPTY_FILTERS, brands: ['Dulux'] });
    const candidates = applyFilters(PAINTS, await loadScanFilters());
    const matches = matchPaintsLab(rgbToLab(200, 180, 160), 5, candidates);
    expect(matches).toHaveLength(5);
    for (const m of matches) expect(m.paint.brand).toBe('Dulux');
  });

  it('returns empty scan filters on corrupt stored data', async () => {
    await AsyncStorage.setItem('scanFilters.v1', '{oops');
    expect(await loadScanFilters()).toEqual(EMPTY_FILTERS);
  });
});
