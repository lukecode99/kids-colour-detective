// CD-44: Tests for per-capture filter persistence logic.
// Verifies that filterBrand/filterType selections map correctly to PaintFilters
// and are independent between captures.

interface PaintFilters {
  brands: string[];
  surfaces: string[];
  finishes: string[];
}

// Mirrors the mapping used in ColourDetail handleFilterBrand / handleFilterType
function buildCaptureFilters(
  brand: string | null,
  type: string | null,
  existingSurfaces: string[] = []
): PaintFilters {
  return {
    brands: brand ? [brand] : [],
    surfaces: existingSurfaces,
    finishes: type ? [type] : [],
  };
}

// Mirrors the initialisation from sc.filters in ColourDetail
function readFilterBrand(filters?: PaintFilters): string | null {
  return filters?.brands?.[0] ?? null;
}
function readFilterType(filters?: PaintFilters): string | null {
  return filters?.finishes?.[0] ?? null;
}

describe('CD-44 per-capture filter mapping', () => {
  it('brand selection maps to brands array', () => {
    const f = buildCaptureFilters('Dulux', null);
    expect(f.brands).toEqual(['Dulux']);
    expect(f.finishes).toEqual([]);
    expect(f.surfaces).toEqual([]);
  });

  it('null brand produces empty brands array', () => {
    const f = buildCaptureFilters(null, null);
    expect(f.brands).toEqual([]);
  });

  it('type selection maps to finishes array', () => {
    const f = buildCaptureFilters(null, 'matt');
    expect(f.finishes).toEqual(['matt']);
    expect(f.brands).toEqual([]);
  });

  it('combined brand+type stores both', () => {
    const f = buildCaptureFilters('Crown', 'silk');
    expect(f.brands).toEqual(['Crown']);
    expect(f.finishes).toEqual(['silk']);
  });

  it('changing brand preserves current type', () => {
    let brand: string | null = null;
    let type: string | null = 'matt';
    // user taps Dulux
    brand = 'Dulux';
    const f = buildCaptureFilters(brand, type);
    expect(f.brands).toEqual(['Dulux']);
    expect(f.finishes).toEqual(['matt']);
  });

  it('changing type preserves current brand', () => {
    let brand: string | null = 'Farrow & Ball';
    let type: string | null = null;
    // user taps Silk
    type = 'silk';
    const f = buildCaptureFilters(brand, type);
    expect(f.brands).toEqual(['Farrow & Ball']);
    expect(f.finishes).toEqual(['silk']);
  });

  it('reads filterBrand from persisted PaintFilters', () => {
    const stored: PaintFilters = { brands: ['Crown'], surfaces: [], finishes: ['matt'] };
    expect(readFilterBrand(stored)).toBe('Crown');
    expect(readFilterType(stored)).toBe('matt');
  });

  it('reads null from undefined filters (first open, no persistence yet)', () => {
    expect(readFilterBrand(undefined)).toBeNull();
    expect(readFilterType(undefined)).toBeNull();
  });

  it('reads null from empty filters (cleared)', () => {
    const cleared: PaintFilters = { brands: [], surfaces: [], finishes: [] };
    expect(readFilterBrand(cleared)).toBeNull();
    expect(readFilterType(cleared)).toBeNull();
  });

  it('captures have independent filter state', () => {
    const captureA = buildCaptureFilters('Dulux', 'matt');
    const captureB = buildCaptureFilters(null, null);
    expect(captureA.brands).toEqual(['Dulux']);
    expect(captureB.brands).toEqual([]);
    expect(captureA.finishes).toEqual(['matt']);
    expect(captureB.finishes).toEqual([]);
  });

  it('preserves existing surfaces when updating brand/type', () => {
    const existingSurfaces = ['interior'];
    const f = buildCaptureFilters('Dulux', 'matt', existingSurfaces);
    expect(f.surfaces).toEqual(['interior']);
  });
});
