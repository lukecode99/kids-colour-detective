import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadSavedColors,
  addSavedColor,
  removeSavedColor,
  setSavedColorLabel,
  newSavedColorId,
  withColourData,
  SavedColorEntry,
} from '../savedColors';
import { hexToRgb, rgbToLab } from '../colorMath';
import { matchPaintsLab } from '../paintMatcher';

jest.mock('@react-native-async-storage/async-storage', () =>
  require('@react-native-async-storage/async-storage/jest')
);

// jest runs in a node environment: exercise the web code path (data-URL
// thumbnails, no FileSystem). The native copy path runs on-device.
jest.mock('react-native', () => ({ Platform: { OS: 'web' } }), { virtual: true });

function entry(overrides: Partial<Parameters<typeof addSavedColor>[0]> = {}) {
  return {
    id: newSavedColorId(),
    hex: '#4CAF50',
    name: 'Green',
    emoji: '🟢',
    match: 'Dulux — Emerald Glade (97%)',
    timestamp: 1751700000000,
    ...overrides,
  };
}

beforeEach(() => AsyncStorage.clear());

describe('saved colours persistence', () => {
  it('starts empty', async () => {
    expect(await loadSavedColors()).toEqual([]);
  });

  it('round-trips a saved colour through storage (survives restart)', async () => {
    const e = entry({ label: 'Kitchen' });
    await addSavedColor(e);
    const loaded = await loadSavedColors();
    expect(loaded).toHaveLength(1);
    expect(loaded[0]).toMatchObject({
      hex: '#4CAF50',
      name: 'Green',
      match: 'Dulux — Emerald Glade (97%)',
      timestamp: 1751700000000,
      label: 'Kitchen',
    });
  });

  it('newest entry first', async () => {
    await addSavedColor(entry({ hex: '#111111' }));
    await addSavedColor(entry({ hex: '#222222' }));
    const loaded = await loadSavedColors();
    expect(loaded.map(e => e.hex)).toEqual(['#222222', '#111111']);
  });

  it('caps the list at 50 entries', async () => {
    for (let i = 0; i < 55; i++) {
      await addSavedColor(entry({ hex: `#${String(i).padStart(6, '0')}` }));
    }
    expect(await loadSavedColors()).toHaveLength(50);
  });

  it('keeps a web data-URL thumbnail as-is', async () => {
    const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
    await addSavedColor(entry(), dataUrl);
    const [loaded] = await loadSavedColors();
    expect(loaded.thumbnailUri).toBe(dataUrl);
  });

  it('removes an entry by id', async () => {
    const a = entry({ hex: '#AAAAAA' });
    const b = entry({ hex: '#BBBBBB' });
    await addSavedColor(a);
    await addSavedColor(b);
    await removeSavedColor(a.id);
    const loaded = await loadSavedColors();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].hex).toBe('#BBBBBB');
  });

  it('sets and clears the room label', async () => {
    const e = entry();
    await addSavedColor(e);
    let loaded = await setSavedColorLabel(e.id, 'Hallway');
    expect(loaded[0].label).toBe('Hallway');
    loaded = await setSavedColorLabel(e.id, '   ');
    expect(loaded[0].label).toBeUndefined();
  });

  it('survives corrupt stored data', async () => {
    await AsyncStorage.setItem('savedColors.v1', '{broken');
    expect(await loadSavedColors()).toEqual([]);
  });

  it('generates unique ids', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newSavedColorId()));
    expect(ids.size).toBe(100);
  });
});

describe('entry colour data & legacy migration (CD-13)', () => {
  it('new saves persist rgb and lab derived from the hex', async () => {
    await addSavedColor(entry({ hex: '#4CAF50' }));
    const [loaded] = await loadSavedColors();
    expect(loaded.rgb).toEqual(hexToRgb('#4CAF50'));
    expect(loaded.lab).toEqual(rgbToLab(...hexToRgb('#4CAF50')));
  });

  it('legacy hex-only entries gain rgb/lab on load and the migration is persisted', async () => {
    const legacy = [entry({ hex: '#C8B4A0' }), entry({ hex: '#1565C0' })];
    await AsyncStorage.setItem('savedColors.v1', JSON.stringify(legacy));

    const loaded = await loadSavedColors();
    expect(loaded).toHaveLength(2);
    for (const e of loaded) {
      expect(e.rgb).toEqual(hexToRgb(e.hex));
      expect(e.lab).toEqual(rgbToLab(...hexToRgb(e.hex)));
    }

    // persisted back, so the migration runs once, not on every load
    const raw = await AsyncStorage.getItem('savedColors.v1');
    const stored = JSON.parse(raw!);
    expect(stored[0].rgb).toEqual(hexToRgb('#C8B4A0'));
    expect(stored[0].lab).toBeDefined();
  });

  it('withColourData leaves complete entries untouched', () => {
    const complete = withColourData(entry({ hex: '#4CAF50' }) as SavedColorEntry);
    expect(withColourData(complete)).toBe(complete);
  });

  it('matches recomputed from a migrated entry equal the hex-derived ones', async () => {
    await AsyncStorage.setItem('savedColors.v1', JSON.stringify([entry({ hex: '#8CA082' })]));
    const [migrated] = await loadSavedColors();
    const fromEntry = matchPaintsLab(migrated.lab!, 5);
    const fromHex = matchPaintsLab(rgbToLab(...hexToRgb('#8CA082')), 5);
    expect(fromEntry.map(m => m.paint.hex)).toEqual(fromHex.map(m => m.paint.hex));
    expect(fromEntry).toHaveLength(5);
  });
});
