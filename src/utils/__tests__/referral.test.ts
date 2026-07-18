jest.mock('react-native', () => ({ Platform: { OS: 'web' } }), { virtual: true });
jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ReferralConfig,
  retailerFromUrl,
  amazonSearchUrl,
  awinDeepLink,
  buyLinkFor,
  directLinkFor,
  loadLinkOuts,
  logLinkOut,
  MAX_LINKOUTS,
} from '../referral';
import { Paint } from '../paintMatcher';

const paint = (over: Partial<Paint> = {}): Paint => ({
  brand: 'Dulux',
  name: 'Timeless',
  code: 'D123',
  hex: '#F1EBDD',
  lab: [92, 1, 8],
  surfaces: ['walls'],
  finishes: ['matt'],
  retailerUrl: 'https://www.diy.com/departments/dulux-timeless/123.prd',
  ...over,
});

const LIVE: ReferralConfig = {
  awinEnabled: false,
  awinAffId: '',
  awinMids: { bandq: '', wickes: '' },
  amazonTag: '',
};

const APPROVED: ReferralConfig = {
  awinEnabled: true,
  awinAffId: '99999',
  awinMids: { bandq: '1234', wickes: '5678' },
  amazonTag: 'colourdet-21',
};

describe('retailer detection', () => {
  it('recognises B&Q and Wickes domains', () => {
    expect(retailerFromUrl('https://www.diy.com/x')).toBe('bandq');
    expect(retailerFromUrl('https://www.wickes.co.uk/x')).toBe('wickes');
    expect(retailerFromUrl('https://www.amazon.co.uk/x')).toBe('other');
  });
});

describe('buy links (CD-8 SC: every match with retailerUrl gets a working link)', () => {
  it('B&Q-stocked brands route to B&Q search while Awin is unapproved', () => {
    // Dulux is a B&Q-stocked brand; primary link is B&Q search (not Amazon)
    const link = buyLinkFor(paint(), LIVE);
    expect(link.via).toBe('bandq');
    expect(link.retailer).toBe('B&Q');
    expect(link.url).toContain('diy.com/search');
    expect(link.url).toContain(encodeURIComponent('Dulux Timeless paint'));
  });

  it('non-B&Q brands default to Amazon UK search while Awin is unapproved', () => {
    const fbPaint = paint({ brand: 'Farrow & Ball', name: 'Stiffkey Blue', retailerUrl: '' });
    const link = buyLinkFor(fbPaint, LIVE);
    expect(link.via).toBe('amazon');
    expect(link.retailer).toBe('Amazon UK');
    expect(link.url).toContain('amazon.co.uk');
  });

  it('adds the associates tag only when configured', () => {
    const fbPaint = paint({ brand: 'Farrow & Ball', retailerUrl: '' });
    expect(amazonSearchUrl(fbPaint, LIVE)).not.toContain('tag=');
    expect(amazonSearchUrl(fbPaint, APPROVED)).toContain('&tag=colourdet-21');
  });

  it('routes B&Q/Wickes through Awin once the flag is flipped', () => {
    const link = buyLinkFor(paint(), APPROVED);
    expect(link.via).toBe('awin');
    expect(link.retailer).toBe('B&Q');
    expect(link.url).toContain('https://www.awin1.com/cread.php?awinmid=1234&awinaffid=99999');
    expect(link.url).toContain(encodeURIComponent(paint().retailerUrl));

    const wickes = buyLinkFor(
      paint({ brand: 'Farrow & Ball', retailerUrl: 'https://www.wickes.co.uk/p/456' }),
      APPROVED
    );
    expect(wickes.retailer).toBe('Wickes');
    expect(wickes.url).toContain('awinmid=5678');
  });

  it('falls back to B&Q search for B&Q brand when Awin is on but retailer is unknown', () => {
    // Dulux + Screwfix URL: Awin won't match, but Dulux is a B&Q brand → B&Q search
    const link = buyLinkFor(paint({ retailerUrl: 'https://www.screwfix.com/p/9' }), APPROVED);
    expect(link.via).toBe('bandq');
  });

  it('falls back to Amazon when Awin is on but non-B&Q brand and retailer is unknown', () => {
    const fbPaint = paint({ brand: 'Farrow & Ball', retailerUrl: 'https://www.screwfix.com/p/9' });
    const link = buyLinkFor(fbPaint, APPROVED);
    expect(link.via).toBe('amazon');
  });

  it('always produces a link — B&Q brands get B&Q search even without retailerUrl', () => {
    const link = buyLinkFor(paint({ retailerUrl: '' }), LIVE);
    expect(link.via).toBe('bandq');
    expect(link.url).toContain('diy.com/search');
    expect(directLinkFor(paint({ retailerUrl: '' }))).toBeNull();
  });

  it('direct link is null for B&Q brands (primary is already B&Q search)', () => {
    // Dulux is a B&Q brand — no secondary link needed
    expect(directLinkFor(paint())).toBeNull();
  });

  it('direct link for non-B&Q brand labels as brand site (not exact page)', () => {
    const fbPaint = paint({ brand: 'Farrow & Ball', name: 'Stiffkey Blue', retailerUrl: 'https://farrow-ball.com/x' });
    const direct = directLinkFor(fbPaint);
    expect(direct).not.toBeNull();
    expect(direct!.via).toBe('direct');
    expect(direct!.url).toBe('https://farrow-ball.com/x');
    expect(direct!.retailer).toBe('Farrow & Ball site');
  });

  it('direct link is null when no retailerUrl', () => {
    expect(directLinkFor(paint({ retailerUrl: '' }))).toBeNull();
  });

  it('deep-link builder URL-encodes the target', () => {
    const url = awinDeepLink('https://www.diy.com/a b?c=d&e=f', '1', '2');
    expect(url).toContain('ued=https%3A%2F%2Fwww.diy.com%2Fa%20b%3Fc%3Dd%26e%3Df');
  });
});

describe('link-out log (CD-8 SC: logged locally)', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('records clicks newest-first with brand/colour/via', async () => {
    const p = paint();
    await logLinkOut(p, buyLinkFor(p, LIVE), 1000);
    const after = await logLinkOut(
      paint({ name: 'Willow Tree' }),
      buyLinkFor(paint({ name: 'Willow Tree' }), LIVE),
      2000
    );
    expect(after).toHaveLength(2);
    expect(after[0].name).toBe('Willow Tree');
    expect(after[0].timestamp).toBe(2000);
    expect(after[1].brand).toBe('Dulux');
    expect(after[1].via).toBe('bandq'); // Dulux is a B&Q-stocked brand

    const persisted = await loadLinkOuts();
    expect(persisted).toEqual(after);
  });

  it('caps the log length', async () => {
    const p = paint();
    const link = buyLinkFor(p, LIVE);
    let entries = await loadLinkOuts();
    for (let i = 0; i < MAX_LINKOUTS + 5; i++) {
      entries = await logLinkOut(p, link, i);
    }
    expect(entries).toHaveLength(MAX_LINKOUTS);
    expect(entries[0].timestamp).toBe(MAX_LINKOUTS + 4);
  });

  it('survives corrupt storage', async () => {
    await AsyncStorage.setItem('linkOuts.v1', 'not-json');
    expect(await loadLinkOuts()).toEqual([]);
  });
});
