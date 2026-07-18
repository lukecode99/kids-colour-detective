// Referral layer: buy links per paint and a local link-out log.
//
// Awin (B&Q / Wickes) is not approved yet, so the live default is an
// Amazon UK search link; flip REFERRAL_CONFIG.awinEnabled (and fill in the
// ids) when approval lands and retailer links start routing through Awin.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Paint } from './paintMatcher';

export interface ReferralConfig {
  awinEnabled: boolean;
  awinAffId: string; // Awin affiliate id, once approved
  awinMids: Record<string, string>; // retailer key -> Awin merchant id
  amazonTag: string; // Amazon Associates tag, e.g. "colourdet-21"
}

export const REFERRAL_CONFIG: ReferralConfig = {
  awinEnabled: false,
  awinAffId: '',
  awinMids: { bandq: '', wickes: '' },
  amazonTag: '',
};

export type RetailerKey = 'bandq' | 'wickes' | 'other';

export function retailerFromUrl(url: string): RetailerKey {
  if (/(^|\.)diy\.com/i.test(url.replace(/^https?:\/\//i, ''))) return 'bandq';
  if (/(^|\.)wickes\.co\.uk/i.test(url.replace(/^https?:\/\//i, ''))) return 'wickes';
  return 'other';
}

export interface BuyLink {
  url: string;
  retailer: string; // display label, e.g. "Amazon UK", "B&Q"
  via: 'amazon' | 'awin' | 'direct' | 'bandq';
}

// B&Q-stocked brands: B&Q search deeplink is the primary buy route.
// RAL / RAL Design / BS 4800 are reference systems only — Amazon is the only option.
const BANDQ_BRANDS = new Set(['Dulux', 'Crown', 'Valspar', 'Hammerite', "Johnstone's"]);
const RAL_BRANDS = new Set(['RAL', 'RAL Design', 'BS 4800']);

function bandqSearchUrl(paint: Paint): string {
  const term = encodeURIComponent(`${paint.brand} ${paint.name} paint`);
  return `https://www.diy.com/search?term=${term}`;
}

export function amazonSearchUrl(paint: Paint, config: ReferralConfig = REFERRAL_CONFIG): string {
  const query = encodeURIComponent(`${paint.brand} ${paint.name} paint`);
  const tag = config.amazonTag ? `&tag=${encodeURIComponent(config.amazonTag)}` : '';
  return `https://www.amazon.co.uk/s?k=${query}${tag}`;
}

export function awinDeepLink(
  retailerUrl: string,
  mid: string,
  affId: string
): string {
  return `https://www.awin1.com/cread.php?awinmid=${encodeURIComponent(mid)}&awinaffid=${encodeURIComponent(affId)}&ued=${encodeURIComponent(retailerUrl)}`;
}

const RETAILER_LABELS: Record<RetailerKey, string> = {
  bandq: 'B&Q',
  wickes: 'Wickes',
  other: 'Retailer',
};

// The primary monetised buy link for a paint.
// Priority: Awin deeplink (when approved) > B&Q search (stocked brands) > Amazon UK.
// RAL / RAL Design / BS 4800 are reference systems — Amazon only, no B&Q deeplink.
export function buyLinkFor(paint: Paint, config: ReferralConfig = REFERRAL_CONFIG): BuyLink {
  // Awin path: B&Q / Wickes retailer URLs route through Awin once approved
  if (config.awinEnabled && paint.retailerUrl) {
    const retailer = retailerFromUrl(paint.retailerUrl);
    const mid = config.awinMids[retailer];
    if (retailer !== 'other' && mid && config.awinAffId) {
      return {
        url: awinDeepLink(paint.retailerUrl, mid, config.awinAffId),
        retailer: RETAILER_LABELS[retailer],
        via: 'awin',
      };
    }
  }
  // B&Q-stocked brands: B&Q search deeplink (Awin approval pending)
  if (BANDQ_BRANDS.has(paint.brand)) {
    return { url: bandqSearchUrl(paint), retailer: 'B&Q', via: 'bandq' };
  }
  // Everything else (including RAL reference systems): Amazon UK search
  return { url: amazonSearchUrl(paint, config), retailer: 'Amazon UK', via: 'amazon' };
}

// Secondary non-affiliate link. Dataset retailerUrls are guessed slugs or
// generic directory pages — labelled as the brand site, not an exact page.
// Excluded: RAL/RAL Design/BS 4800 (Amazon only), B&Q brands (primary is B&Q search).
export function directLinkFor(paint: Paint): BuyLink | null {
  if (!paint.retailerUrl) return null;
  if (RAL_BRANDS.has(paint.brand)) return null;
  if (BANDQ_BRANDS.has(paint.brand)) return null;
  return {
    url: paint.retailerUrl,
    retailer: `${paint.brand} site`,
    via: 'direct',
  };
}

// --- Local link-out log ---

export interface LinkOutEntry {
  timestamp: number;
  brand: string;
  name: string;
  code: string;
  via: BuyLink['via'];
  retailer: string;
  url: string;
}

const LINKOUT_KEY = 'linkOuts.v1';
export const MAX_LINKOUTS = 200;

export async function loadLinkOuts(): Promise<LinkOutEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(LINKOUT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function logLinkOut(
  paint: Paint,
  link: BuyLink,
  now: number = Date.now()
): Promise<LinkOutEntry[]> {
  const entry: LinkOutEntry = {
    timestamp: now,
    brand: paint.brand,
    name: paint.name,
    code: paint.code,
    via: link.via,
    retailer: link.retailer,
    url: link.url,
  };
  const current = await loadLinkOuts();
  const next = [entry, ...current].slice(0, MAX_LINKOUTS);
  try {
    await AsyncStorage.setItem(LINKOUT_KEY, JSON.stringify(next));
  } catch {
    // logging must never break the buy flow
  }
  return next;
}
