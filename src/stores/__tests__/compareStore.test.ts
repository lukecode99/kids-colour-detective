import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  loadCompareSet,
  addToCompareSet,
  removeFromCompareSet,
  clearCompareSet,
} from '../compareStore';
import { CompareItem, paintToCompareItem, captureToCompareItem, COMPARE_LIMIT } from '../../utils/compareSearch';
import { PAINTS } from '../../utils/paintMatcher';

// Mock @react-native-async-storage/async-storage with an in-memory store.
// Variable must be prefixed "mock" to be referenceable inside jest.mock() factory.
let mockStore: Record<string, string> = {};
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn((key: string) => Promise.resolve(mockStore[key] ?? null)),
  setItem: jest.fn((key: string, value: string) => { mockStore[key] = value; return Promise.resolve(); }),
  removeItem: jest.fn((key: string) => { delete mockStore[key]; return Promise.resolve(); }),
}));

const hagueBlue = PAINTS.find(p => p.brand === 'Farrow & Ball' && p.name === 'Hague Blue')!;
const anotherPaint = PAINTS.find(p => p.brand !== 'Farrow & Ball')!;

beforeEach(() => {
  mockStore = {};
  jest.clearAllMocks();
});

describe('compareStore — load', () => {
  it('returns empty array when storage is empty', async () => {
    expect(await loadCompareSet()).toEqual([]);
  });

  it('returns persisted items', async () => {
    const item = paintToCompareItem(hagueBlue);
    mockStore['compareSet.v1'] = JSON.stringify([item]);
    expect(await loadCompareSet()).toEqual([item]);
  });

  it('returns empty array on JSON parse error (corrupt storage)', async () => {
    mockStore['compareSet.v1'] = 'not-json{{{';
    expect(await loadCompareSet()).toEqual([]);
  });
});

describe('compareStore — add', () => {
  it('adds an item and persists it', async () => {
    const item = paintToCompareItem(hagueBlue);
    const result = await addToCompareSet(item);
    expect(result).toEqual([item]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('compareSet.v1', JSON.stringify([item]));
  });

  it('refuses a duplicate id — returns current without writing', async () => {
    const item = paintToCompareItem(hagueBlue);
    await addToCompareSet(item);
    const callsBefore = (AsyncStorage.setItem as jest.Mock).mock.calls.length;
    const result = await addToCompareSet(paintToCompareItem(hagueBlue));
    expect(result).toEqual([item]);
    expect((AsyncStorage.setItem as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  it(`caps at ${COMPARE_LIMIT}`, async () => {
    for (let i = 0; i < COMPARE_LIMIT; i++) {
      await addToCompareSet({ ...paintToCompareItem(hagueBlue), id: `item${i}` });
    }
    const result = await addToCompareSet({ ...paintToCompareItem(hagueBlue), id: 'overflow' });
    expect(result.length).toBe(COMPARE_LIMIT);
  });

  it('accumulates multiple different items', async () => {
    const a = paintToCompareItem(hagueBlue);
    const b = paintToCompareItem(anotherPaint);
    await addToCompareSet(a);
    const result = await addToCompareSet(b);
    expect(result.length).toBe(2);
    expect(result.map(i => i.id)).toContain(a.id);
    expect(result.map(i => i.id)).toContain(b.id);
  });
});

describe('compareStore — remove', () => {
  it('removes an item by id and persists', async () => {
    const a = paintToCompareItem(hagueBlue);
    const b = paintToCompareItem(anotherPaint);
    mockStore['compareSet.v1'] = JSON.stringify([a, b]);
    const result = await removeFromCompareSet(a.id);
    expect(result).toEqual([b]);
    expect(AsyncStorage.setItem).toHaveBeenCalledWith('compareSet.v1', JSON.stringify([b]));
  });

  it('removing a non-existent id persists an unchanged array', async () => {
    const a = paintToCompareItem(hagueBlue);
    mockStore['compareSet.v1'] = JSON.stringify([a]);
    const result = await removeFromCompareSet('no-such-id');
    expect(result).toEqual([a]);
  });

  it('removing from empty list returns empty', async () => {
    const result = await removeFromCompareSet('anything');
    expect(result).toEqual([]);
  });
});

describe('compareStore — clear', () => {
  it('removes the storage key entirely', async () => {
    mockStore['compareSet.v1'] = JSON.stringify([paintToCompareItem(hagueBlue)]);
    await clearCompareSet();
    expect(AsyncStorage.removeItem).toHaveBeenCalledWith('compareSet.v1');
    expect(await loadCompareSet()).toEqual([]);
  });
});

describe('compareStore — capture items (scan / My Colours)', () => {
  it('a scan capture item round-trips through storage', async () => {
    const cap = captureToCompareItem('#FAF7F2', 'Scanned wall', 9999, 'scan');
    await addToCompareSet(cap);
    const loaded = await loadCompareSet();
    expect(loaded[0]).toEqual(cap);
    expect(loaded[0].source).toBe('scan');
    expect(loaded[0].brand).toBeUndefined();
  });
});
