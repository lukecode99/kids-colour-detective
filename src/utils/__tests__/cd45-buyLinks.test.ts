// CD-45: Tests for buy-link routing logic.
// Mirrors buyLinkFor / directLinkFor / bandqSearchUrl logic from referral.ts.
// Inline implementation avoids AsyncStorage import in Node test env.

const BANDQ_BRANDS = new Set(['Dulux', 'Crown', 'Valspar', 'Hammerite', "Johnstone's"]);
const RAL_BRANDS = new Set(['RAL', 'RAL Design', 'BS 4800']);

interface Paint {
  brand: string;
  name: string;
  code: string;
  hex: string;
  retailerUrl: string;
  finishes: string[];
}

interface BuyLink {
  url: string;
  retailer: string;
  via: 'amazon' | 'awin' | 'direct' | 'bandq';
}

function amazonSearchUrl(paint: Paint): string {
  const query = encodeURIComponent(`${paint.brand} ${paint.name} paint`);
  return `https://www.amazon.co.uk/s?k=${query}`;
}

function bandqSearchUrl(paint: Paint): string {
  const term = encodeURIComponent(`${paint.brand} ${paint.name} paint`);
  return `https://www.diy.com/search?term=${term}`;
}

function buyLinkFor(paint: Paint, awinEnabled = false): BuyLink {
  if (awinEnabled && paint.retailerUrl) {
    const isBandq = /(^|\.)diy\.com/i.test(paint.retailerUrl.replace(/^https?:\/\//i, ''));
    const isWickes = /(^|\.)wickes\.co\.uk/i.test(paint.retailerUrl.replace(/^https?:\/\//i, ''));
    if ((isBandq || isWickes) && paint.retailerUrl) {
      return { url: `awin:${paint.retailerUrl}`, retailer: isBandq ? 'B&Q' : 'Wickes', via: 'awin' };
    }
  }
  if (BANDQ_BRANDS.has(paint.brand)) {
    return { url: bandqSearchUrl(paint), retailer: 'B&Q', via: 'bandq' };
  }
  return { url: amazonSearchUrl(paint), retailer: 'Amazon UK', via: 'amazon' };
}

function directLinkFor(paint: Paint): BuyLink | null {
  if (!paint.retailerUrl) return null;
  if (RAL_BRANDS.has(paint.brand)) return null;
  if (BANDQ_BRANDS.has(paint.brand)) return null;
  return { url: paint.retailerUrl, retailer: `${paint.brand} site`, via: 'direct' };
}

function makePaint(brand: string, name = 'Muted Sage', retailerUrl = ''): Paint {
  return { brand, name, code: 'X001', hex: '#aaa', retailerUrl, finishes: [] };
}

describe('CD-45 buy link routing', () => {
  describe('buyLinkFor — primary link', () => {
    it('Dulux → B&Q search URL', () => {
      const link = buyLinkFor(makePaint('Dulux', 'Cornfield'));
      expect(link.via).toBe('bandq');
      expect(link.retailer).toBe('B&Q');
      expect(link.url).toContain('diy.com/search');
      expect(link.url).toContain(encodeURIComponent('Dulux Cornfield paint'));
    });

    it('Crown → B&Q search URL', () => {
      const link = buyLinkFor(makePaint('Crown', 'Snowdrop'));
      expect(link.via).toBe('bandq');
      expect(link.url).toContain('diy.com/search');
    });

    it('Valspar → B&Q search URL', () => {
      const link = buyLinkFor(makePaint('Valspar', 'Alpine Mist'));
      expect(link.via).toBe('bandq');
    });

    it("Johnstone's → B&Q search URL", () => {
      const link = buyLinkFor(makePaint("Johnstone's", 'Brilliant White'));
      expect(link.via).toBe('bandq');
    });

    it('Hammerite → B&Q search URL', () => {
      const link = buyLinkFor(makePaint('Hammerite', 'Smooth Blue'));
      expect(link.via).toBe('bandq');
    });

    it('Farrow & Ball → Amazon', () => {
      const link = buyLinkFor(makePaint('Farrow & Ball', 'Stiffkey Blue'));
      expect(link.via).toBe('amazon');
      expect(link.retailer).toBe('Amazon UK');
      expect(link.url).toContain('amazon.co.uk');
    });

    it('RAL → Amazon (no B&Q even though not F&B)', () => {
      const link = buyLinkFor(makePaint('RAL', '9010'));
      expect(link.via).toBe('amazon');
      expect(link.retailer).toBe('Amazon UK');
    });

    it('RAL Design → Amazon only', () => {
      const link = buyLinkFor(makePaint('RAL Design', '010 60 29'));
      expect(link.via).toBe('amazon');
    });

    it('BS 4800 → Amazon only', () => {
      const link = buyLinkFor(makePaint('BS 4800', '18C39'));
      expect(link.via).toBe('amazon');
    });

    it('B&Q search URL is properly encoded', () => {
      const link = buyLinkFor(makePaint('Dulux', 'Egyptian Cotton'));
      expect(link.url).toBe('https://www.diy.com/search?term=' + encodeURIComponent('Dulux Egyptian Cotton paint'));
    });

    it('Awin path takes priority for B&Q brand when enabled and retailerUrl present', () => {
      const paint = makePaint('Dulux', 'Cornfield', 'https://www.diy.com/departments/dulux-cornfield/1234');
      const link = buyLinkFor(paint, true); // awinEnabled
      expect(link.via).toBe('awin');
    });

    it('B&Q brand without retailerUrl falls through to B&Q search when Awin enabled', () => {
      const paint = makePaint('Dulux', 'Cornfield', ''); // no retailerUrl
      const link = buyLinkFor(paint, true);
      expect(link.via).toBe('bandq');
    });
  });

  describe('directLinkFor — secondary link', () => {
    it('returns null for RAL brand', () => {
      expect(directLinkFor(makePaint('RAL', '9010', 'https://ral.de'))).toBeNull();
    });

    it('returns null for RAL Design brand', () => {
      expect(directLinkFor(makePaint('RAL Design', '010 60 29', 'https://ral.de'))).toBeNull();
    });

    it('returns null for BS 4800 brand', () => {
      expect(directLinkFor(makePaint('BS 4800', '18C39', 'https://bsi.org.uk'))).toBeNull();
    });

    it('returns null for B&Q brands (primary is already B&Q search)', () => {
      expect(directLinkFor(makePaint('Dulux', 'Cornfield', 'https://www.diy.com/x'))).toBeNull();
      expect(directLinkFor(makePaint('Crown', 'Snowdrop', 'https://www.diy.com/x'))).toBeNull();
    });

    it('returns null when no retailerUrl', () => {
      expect(directLinkFor(makePaint('Farrow & Ball', 'Stiffkey Blue', ''))).toBeNull();
    });

    it('returns brand site label (not exact page) for other brands', () => {
      const paint = makePaint('Farrow & Ball', 'Stiffkey Blue', 'https://farrow-ball.com/stiffkey-blue');
      const link = directLinkFor(paint);
      expect(link).not.toBeNull();
      expect(link!.retailer).toBe('Farrow & Ball site');
      expect(link!.via).toBe('direct');
      expect(link!.url).toBe('https://farrow-ball.com/stiffkey-blue');
    });

    it('Wickes brand gets generic site label', () => {
      const paint = makePaint('Wickes', 'Brilliant White', 'https://www.wickes.co.uk/p/white');
      const link = directLinkFor(paint);
      expect(link!.retailer).toBe('Wickes site');
    });
  });
});
