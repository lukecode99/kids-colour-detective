// Brand match tab (CD-18): pick a colour you like from one brand and find
// the closest alternates other brands sell. Pure utils so the search and
// the cross-brand ranking are unit-testable without the UI.
import { Paint, PaintMatch, PAINTS, matchPaintsLab } from './paintMatcher';

// All colours a brand sells, A→Z by name — the browsing list.
export function brandColours(brand: string, paints: Paint[] = PAINTS): Paint[] {
  return paints
    .filter(p => p.brand === brand)
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Case-insensitive substring search on name or code within one brand.
// An empty/whitespace query browses the whole brand.
export function searchBrandColours(
  brand: string,
  query: string,
  paints: Paint[] = PAINTS
): Paint[] {
  const all = brandColours(brand, paints);
  const q = query.trim().toLowerCase();
  if (!q) return all;
  return all.filter(
    p => p.name.toLowerCase().includes(q) || p.code.toLowerCase().includes(q)
  );
}

// Closest alternates from every brand EXCEPT the source's own — the paint's
// precomputed Lab feeds straight into the ΔE2000 ranking, sorted nearest
// first by matchPaintsLab.
export function crossBrandAlternates(
  source: Paint,
  limit = 10,
  paints: Paint[] = PAINTS
): PaintMatch[] {
  const otherBrands = paints.filter(p => p.brand !== source.brand);
  return matchPaintsLab(source.lab, limit, otherBrands);
}
