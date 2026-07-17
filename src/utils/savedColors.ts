import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

import { BestMatchInfo } from './matchLabel';
import { hexToRgb, rgbToLab, Lab } from './colorMath';
import { PaintFilters, loadFilters } from './filters';

export interface SavedColorEntry {
  id: string;
  hex: string; // corrected colour (post white-balance)
  rgb?: [number, number, number]; // stored at save time (CD-13); derived from hex for legacy entries
  lab?: Lab; // precomputed for match recomputation without a per-render conversion
  name: string;
  emoji: string;
  match: string; // legacy frozen label ("Brand — Name (96%)"), kept so pre-CD-14 entries still render
  bestMatch?: BestMatchInfo; // structured best match at save time (CD-14)
  timestamp: number;
  label?: string; // optional room label, e.g. "Kitchen"
  thumbnailUri?: string; // FileSystem file on native, data URL on web
  filters?: PaintFilters; // per-capture filter set (CD-20) — room-level preferences
  favourite?: boolean; // CD-41: heart-marked by user
}

// CD-13: entries persisted before rgb/lab existed carry only hex. Both are
// recoverable from it (hex is itself derived from the corrected rgb), so
// fill them in rather than versioning the storage key.
export function withColourData(entry: SavedColorEntry): SavedColorEntry {
  if (entry.rgb && entry.lab) return entry;
  const rgb = entry.rgb ?? hexToRgb(entry.hex);
  const lab = entry.lab ?? rgbToLab(rgb[0], rgb[1], rgb[2]);
  return { ...entry, rgb, lab };
}

// CD-20: filters moved from global state onto each capture (room-level
// preferences, e.g. kitchen = washable silk, bedroom = matt). Entries saved
// before that inherit the current global set once, at load — the same lazy
// migration CD-13 used for rgb/lab.
export function withCaptureFilters(
  entry: SavedColorEntry,
  globalFilters: PaintFilters
): SavedColorEntry {
  const f = entry.filters;
  if (f && Array.isArray(f.brands) && Array.isArray(f.surfaces) && Array.isArray(f.finishes)) {
    return entry;
  }
  return { ...entry, filters: globalFilters };
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
    if (!Array.isArray(parsed)) return [];
    const entries: SavedColorEntry[] = parsed.filter(e => e && typeof e.id === 'string');
    // Lazy migration: persist rgb/lab (CD-13) and a per-capture filter set
    // inherited from the globals (CD-20) for legacy entries on first load.
    const globalFilters = await loadFilters();
    const migrated = entries.map(e => withCaptureFilters(withColourData(e), globalFilters));
    if (migrated.some((e, i) => e !== entries[i])) await persist(migrated);
    return migrated;
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

// Persists a thumbnail so it survives app restarts.
// Native callers now pass a data: URI (base64 from ImageManipulator) which is
// self-contained and stored inline in AsyncStorage — no file-copy needed.
// The file-copy path below is kept as a legacy fallback for any file:// URIs
// stored by older builds.
async function storeThumbnail(id: string, tempUri: string): Promise<string | undefined> {
  // Data URIs are self-contained; store as-is on every platform.
  if (tempUri.startsWith('data:')) return tempUri;
  if (Platform.OS === 'web' || !FileSystem) return undefined;
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
  const next = [withColourData({ ...entry, thumbnailUri }), ...current.slice(0, MAX_SAVED - 1)];
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

// CD-20: edit one capture's filter set without touching any other card's.
export async function setSavedColorFilters(
  id: string,
  filters: PaintFilters
): Promise<SavedColorEntry[]> {
  const current = await loadSavedColors();
  const next = current.map(e => (e.id === id ? { ...e, filters } : e));
  await persist(next);
  return next;
}

export async function setFavourite(id: string, fav: boolean): Promise<SavedColorEntry[]> {
  const current = await loadSavedColors();
  const next = current.map(e => (e.id === id ? { ...e, favourite: fav } : e));
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
