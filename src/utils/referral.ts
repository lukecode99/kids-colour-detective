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
  via: 'amazon' | 'awin' | 'direct';
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

// The primary monetised buy link for a paint. Amazon UK is the live
// default; once Awin is approved, B&Q/Wickes retailer URLs route through
// an Awin deeplink instead.
export function buyLinkFor(paint: Paint, config: ReferralConfig = REFERRAL_CONFIG): BuyLink {
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
  return { url: amazonSearchUrl(paint, config), retailer: 'Amazon UK', via: 'amazon' };
}

// Secondary non-affiliate link straight to the retailer product page,
// shown alongside the monetised link when the dataset has one.
export function directLinkFor(paint: Paint): BuyLink | null {
  if (!paint.retailerUrl) return null;
  return {
    url: paint.retailerUrl,
    retailer: RETAILER_LABELS[retailerFromUrl(paint.retailerUrl)],
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
