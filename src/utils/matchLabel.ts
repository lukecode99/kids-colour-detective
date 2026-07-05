// Structured best-match info for saved colours (CD-14). Entries persisted
// before this change only carry the frozen "Brand — Name (96%)" string;
// parseMatchLabel recovers the parts so old entries render the same split
// layout as new ones.
import { PaintMatch } from './paintMatcher';

export interface BestMatchInfo {
  brand: string;
  name: string;
  pct: number;
}

export function bestMatchInfo(matches: PaintMatch[]): BestMatchInfo | undefined {
  const m = matches[0];
  return m ? { brand: m.paint.brand, name: m.paint.name, pct: m.matchPercent } : undefined;
}

export function formatMatchLabel(info: BestMatchInfo): string {
  return `${info.brand} — ${info.name} (${info.pct}%)`;
}

// Brand names never contain " — " but paint names may contain parentheses,
// so the brand match is lazy and the percentage is anchored to the end.
export function parseMatchLabel(label: string): BestMatchInfo | undefined {
  const m = /^(.+?) — (.+) \((\d+)%\)$/.exec(label);
  return m ? { brand: m[1], name: m[2], pct: Number(m[3]) } : undefined;
}
