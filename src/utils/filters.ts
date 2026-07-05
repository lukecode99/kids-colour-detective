import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paint } from './paintMatcher';

export interface PaintFilters {
  brands: string[];
  surfaces: string[];
  finishes: string[];
}

export const EMPTY_FILTERS: PaintFilters = { brands: [], surfaces: [], finishes: [] };

export const BRAND_OPTIONS = [
  'Dulux',
  "Johnstone's",
  'Farrow & Ball',
  'Little Greene',
  'Valspar',
  'Crown',
  'Hammerite',
  'RAL',
  'RAL Design',
  'BS 4800',
];

export const SURFACE_OPTIONS = [
  'interior wall',
  'exterior masonry',
  'wood',
  'metal',
  'radiator',
];

export const FINISH_OPTIONS = ['matt', 'silk', 'eggshell', 'satin', 'gloss'];

// Radiators are painted metal — the dataset tags those paints 'metal',
// so the radiator chip matches metal-suitable paints.
function surfaceMatches(paint: Paint, surface: string): boolean {
  if (surface === 'radiator') return paint.surfaces.includes('metal');
  return paint.surfaces.includes(surface);
}

// Empty group = no restriction; within a group chips OR together,
// across groups they AND.
export function applyFilters(paints: Paint[], filters: PaintFilters): Paint[] {
  const { brands, surfaces, finishes } = filters;
  if (!brands.length && !surfaces.length && !finishes.length) return paints;
  return paints.filter(p =>
    (!brands.length || brands.includes(p.brand)) &&
    (!surfaces.length || surfaces.some(s => surfaceMatches(p, s))) &&
    (!finishes.length || finishes.some(f => p.finishes.includes(f)))
  );
}

export function toggleFilter(filters: PaintFilters, group: keyof PaintFilters, value: string): PaintFilters {
  const current = filters[group];
  const next = current.includes(value)
    ? current.filter(v => v !== value)
    : [...current, value];
  return { ...filters, [group]: next };
}

const STORAGE_KEY = 'paintFilters.v1';

export async function loadFilters(): Promise<PaintFilters> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY_FILTERS;
    const parsed = JSON.parse(raw);
    return {
      brands: Array.isArray(parsed.brands) ? parsed.brands : [],
      surfaces: Array.isArray(parsed.surfaces) ? parsed.surfaces : [],
      finishes: Array.isArray(parsed.finishes) ? parsed.finishes : [],
    };
  } catch {
    return EMPTY_FILTERS;
  }
}

export async function saveFilters(filters: PaintFilters): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(filters));
  } catch {
    // persistence is best-effort; scanning must never break on storage errors
  }
}
