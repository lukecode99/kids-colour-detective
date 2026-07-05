// Coverage calculator maths: wall dimensions -> litres -> tins -> price.
// Pure functions so the tin arithmetic is testable against hand-computed
// values.

export interface CoverageInput {
  widthM: number; // total wall width (sum of walls), metres
  heightM: number;
  coats?: number; // default 2
  coveragePerLitreM2?: number; // default 12 m²/L (typical emulsion)
  tinSizeL?: number; // default 2.5 L
  tinPriceGbp?: number; // default £28 per 2.5 L tin (typical branded emulsion)
}

export interface CoverageResult {
  areaM2: number;
  litres: number; // exact requirement, rounded to 2 dp
  tins: number;
  totalLitres: number; // litres actually bought (tins × tin size)
  totalPriceGbp: number;
}

export const COVERAGE_DEFAULTS = {
  coats: 2,
  coveragePerLitreM2: 12,
  tinSizeL: 2.5,
  tinPriceGbp: 28,
};

export function calcCoverage(input: CoverageInput): CoverageResult | null {
  const coats = input.coats ?? COVERAGE_DEFAULTS.coats;
  const perL = input.coveragePerLitreM2 ?? COVERAGE_DEFAULTS.coveragePerLitreM2;
  const tinSize = input.tinSizeL ?? COVERAGE_DEFAULTS.tinSizeL;
  const tinPrice = input.tinPriceGbp ?? COVERAGE_DEFAULTS.tinPriceGbp;

  if (
    !isFinite(input.widthM) || !isFinite(input.heightM) ||
    input.widthM <= 0 || input.heightM <= 0 ||
    coats <= 0 || perL <= 0 || tinSize <= 0
  ) {
    return null;
  }

  const areaM2 = input.widthM * input.heightM;
  const litresExact = (areaM2 * coats) / perL;
  const tins = Math.ceil(litresExact / tinSize);
  return {
    areaM2: Math.round(areaM2 * 100) / 100,
    litres: Math.round(litresExact * 100) / 100,
    tins,
    totalLitres: Math.round(tins * tinSize * 100) / 100,
    totalPriceGbp: Math.round(tins * tinPrice * 100) / 100,
  };
}

// Parses a user-typed dimension ("4", "4.2", "4,2") to metres; null when
// it isn't a usable positive number.
export function parseMetres(text: string): number | null {
  const n = parseFloat(text.replace(',', '.').trim());
  return isFinite(n) && n > 0 ? n : null;
}
