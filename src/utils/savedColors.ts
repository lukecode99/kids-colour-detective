import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

export interface SavedColorEntry {
  id: string;
  hex: string; // corrected colour (post white-balance)
  name: string;
  emoji: string;
  match: string; // best paint match label at save time
  timestamp: number;
  label?: string; // optional room label, e.g. "Kitchen"
  thumbnailUri?: string; // FileSystem file on native, data URL on web
}

const STORAGE_KEY = 'savedColors.v1';
const MAX_SAVED = 50;

let FileSystem: any = null;
if (Platform.OS !== 'web') {
  FileSystem = require('expo-file-system');
}

function thumbnailDir(): string {
  return `${FileSystem.documentDirectory}thumbnails/`;
}

export function newSavedColorId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export async function loadSavedColors(): Promise<SavedColorEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(e => e && typeof e.id === 'string') : [];
  } catch {
    return [];
  }
}

async function persist(entries: SavedColorEntry[]): Promise<void> {
  try {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // saving must never crash the camera flow
  }
}

// Copies a temporary photo (camera cache) into permanent app storage so the
// thumbnail survives app restarts. Returns undefined if anything fails —
// the colour entry is still saved without a photo.
async function storeThumbnail(id: string, tempUri: string): Promise<string | undefined> {
  if (Platform.OS === 'web' || !FileSystem) {
    // On web the caller passes a self-contained data URL; keep it as-is.
    return tempUri.startsWith('data:') ? tempUri : undefined;
  }
  try {
    await FileSystem.makeDirectoryAsync(thumbnailDir(), { intermediates: true });
    const ext = tempUri.includes('.png') ? 'png' : 'jpg';
    const dest = `${thumbnailDir()}${id}.${ext}`;
    await FileSystem.copyAsync({ from: tempUri, to: dest });
    return dest;
  } catch {
    return undefined;
  }
}

export async function addSavedColor(
  entry: Omit<SavedColorEntry, 'thumbnailUri'>,
  tempThumbnailUri?: string
): Promise<SavedColorEntry[]> {
  const thumbnailUri = tempThumbnailUri
    ? await storeThumbnail(entry.id, tempThumbnailUri)
    : undefined;
  const current = await loadSavedColors();
  const dropped = current.slice(MAX_SAVED - 1);
  for (const old of dropped) void deleteThumbnail(old);
  const next = [{ ...entry, thumbnailUri }, ...current.slice(0, MAX_SAVED - 1)];
  await persist(next);
  return next;
}

async function deleteThumbnail(entry: SavedColorEntry): Promise<void> {
  if (Platform.OS === 'web' || !FileSystem) return;
  if (!entry.thumbnailUri || !entry.thumbnailUri.startsWith(thumbnailDir())) return;
  try {
    await FileSystem.deleteAsync(entry.thumbnailUri, { idempotent: true });
  } catch {}
}

export async function removeSavedColor(id: string): Promise<SavedColorEntry[]> {
  const current = await loadSavedColors();
  const removed = current.find(e => e.id === id);
  if (removed) void deleteThumbnail(removed);
  const next = current.filter(e => e.id !== id);
  await persist(next);
  return next;
}

export async function setSavedColorLabel(id: string, label: string): Promise<SavedColorEntry[]> {
  const current = await loadSavedColors();
  const next = current.map(e =>
    e.id === id ? { ...e, label: label.trim() || undefined } : e
  );
  await persist(next);
  return next;
}
