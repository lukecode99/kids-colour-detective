import paintsJson from '../data/paints.json';
import { deltaE2000, rgbToLab, Lab } from './colorMath';

export interface Paint {
  brand: string;
  name: string;
  code: string;
  hex: string;
  lab: Lab;
  surfaces: string[];
  finishes: string[];
  retailerUrl: string;
}

export interface PaintMatch {
  paint: Paint;
  deltaE: number;
  matchPercent: number;
  closeness: string;
}

export const PAINTS = paintsJson as Paint[];

// Plain-English bands for ΔE2000: <1 indistinguishable to the eye,
// <5 very close, up to 10 still a usable match, beyond that a different colour.
export function closenessLabel(deltaE: number): string {
  if (deltaE < 1) return 'Indistinguishable';
  if (deltaE < 5) return 'Very close';
  if (deltaE <= 10) return 'Close';
  return 'Different colour';
}

export function matchPercent(deltaE: number): number {
  return Math.max(0, Math.min(100, Math.round(100 - 2 * deltaE)));
}

// Top-N nearest paints by ΔE2000, cheapest-first insertion so a scan only
// keeps `limit` candidates while walking the full dataset.
export function matchPaintsLab(lab: Lab, limit = 5, candidates: Paint[] = PAINTS): PaintMatch[] {
  const top: { paint: Paint; deltaE: number }[] = [];
  for (const paint of candidates) {
    const dE = deltaE2000(lab, paint.lab);
    if (top.length < limit) {
      top.push({ paint, deltaE: dE });
      top.sort((a, b) => a.deltaE - b.deltaE);
    } else if (dE < top[top.length - 1].deltaE) {
      top[top.length - 1] = { paint, deltaE: dE };
      top.sort((a, b) => a.deltaE - b.deltaE);
    }
  }
  return top.map(({ paint, deltaE }) => ({
    paint,
    deltaE,
    matchPercent: matchPercent(deltaE),
    closeness: closenessLabel(deltaE),
  }));
}

export function matchPaints(r: number, g: number, b: number, limit = 5): PaintMatch[] {
  return matchPaintsLab(rgbToLab(r, g, b), limit);
}
