import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  CompareItem,
  addToCompare,
  removeFromCompare,
} from '../utils/compareSearch';

const STORAGE_KEY = 'compareSet.v1';

export async function loadCompareSet(): Promise<CompareItem[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as CompareItem[]) : [];
  } catch {
    return [];
  }
}

async function persist(items: CompareItem[]): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export async function addToCompareSet(item: CompareItem): Promise<CompareItem[]> {
  const current = await loadCompareSet();
  const next = addToCompare(current, item);
  if (next !== current) await persist(next);
  return next;
}

export async function removeFromCompareSet(id: string): Promise<CompareItem[]> {
  const current = await loadCompareSet();
  const next = removeFromCompare(current, id);
  await persist(next);
  return next;
}

export async function clearCompareSet(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEY);
}
