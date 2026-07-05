import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadSavedColors,
  addSavedColor,
  removeSavedColor,
  setSavedColorLabel,
  newSavedColorId,
} from '../savedColors';

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
