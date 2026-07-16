// CD-41: Saved tab rebuilt — compact 3-column grid + full-screen Polaroid detail view.
// Every save auto-adds to Planner (shown unconditionally as "In Planner ✓" in detail).
// Favourite boolean persisted on SavedColorEntry; heart turns purple when set.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ScrollView,
  FlatList,
  Image,
  Dimensions,
} from 'react-native';

import { PaintFilters, toggleFilter } from '../utils/filters';
import {
  SavedColorEntry,
  loadSavedColors,
  addSavedColor,
  removeSavedColor,
  setSavedColorLabel,
  setSavedColorFilters,
  setFavourite,
} from '../utils/savedColors';
import { matchPaintsLab, PaintMatch, PAINTS } from '../utils/paintMatcher';
import { applyFilters } from '../utils/filters';
import { hexToRgb, rgbToLab } from '../utils/colorMath';
import { COLORS } from '../theme';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Column layout: 3 columns with 12px outer margin and 6px gutter between cols
const GRID_PADDING = 12;
const GRID_GAP = 6;
const CARD_WIDTH = (SCREEN_WIDTH - GRID_PADDING * 2 - GRID_GAP * 2) / 3;

// Brand pills shown in header and detail view (label → filter value)
const BRAND_PILLS: { label: string; value: string | null }[] = [
  { label: 'All', value: null },
  { label: 'Dulux', value: 'Dulux' },
  { label: 'F&B', value: 'Farrow & Ball' },
  { label: 'Crown', value: 'Crown' },
];

// Type pills (label → finishes filter value)
const TYPE_PILLS: { label: string; value: string | null }[] = [
  { label: 'Any', value: null },
  { label: 'Matt', value: 'matt' },
  { label: 'Silk', value: 'silk' },
  { label: 'Eggshell', value: 'eggshell' },
  { label: 'Gloss', value: 'gloss' },
];

function formatSavedDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

// Loads the persisted saved-colours list and exposes mutators that keep
// storage and state in sync.
export function useSavedColors() {
  const [savedColors, setSavedColors] = useState<SavedColorEntry[]>([]);

  useEffect(() => {
    loadSavedColors().then(setSavedColors);
  }, []);

  const save = useCallback(
    (entry: Omit<SavedColorEntry, 'thumbnailUri'>, tempThumbnailUri?: string) => {
      addSavedColor(entry, tempThumbnailUri).then(setSavedColors);
    },
    []
  );
  const remove = useCallback((id: string) => {
    removeSavedColor(id).then(setSavedColors);
  }, []);
  const setLabel = useCallback((id: string, label: string) => {
    setSavedColorLabel(id, label).then(setSavedColors);
  }, []);
  const setFilters = useCallback((id: string, filters: PaintFilters) => {
    setSavedColorFilters(id, filters).then(setSavedColors);
  }, []);
  const toggleFavourite = useCallback((id: string, current: boolean) => {
    setFavourite(id, !current).then(setSavedColors);
  }, []);

  return { savedColors, save, remove, setLabel, setFilters, toggleFavourite };
}

// --- Grid card: thumbnail + swatch dot + name ---
function GridCard({
  sc,
  onPress,
}: {
  sc: SavedColorEntry;
  onPress: (sc: SavedColorEntry) => void;
}) {
  return (
    <TouchableOpacity
      style={styles.gridCard}
      onPress={() => onPress(sc)}
      activeOpacity={0.8}
    >
      <View style={styles.gridThumbWrap}>
        {sc.thumbnailUri ? (
          <Image source={{ uri: sc.thumbnailUri }} style={styles.gridThumb} />
        ) : (
          <View style={[styles.gridThumb, { backgroundColor: sc.hex }]} />
        )}
        {/* Swatch dot bottom-left with white ring */}
        <View style={[styles.gridDotRing, { bottom: 4, left: 4 }]}>
          <View style={[styles.gridDot, { backgroundColor: sc.hex }]} />
        </View>
      </View>
      <Text style={styles.gridName} numberOfLines={2}>{sc.name}</Text>
    </TouchableOpacity>
  );
}

// --- Full-screen Polaroid detail view ---
function ColourDetail({
  sc,
  onBack,
  onRemove,
  onToggleFavourite,
  filterBrand,
  filterType,
  onFilterBrand,
  onFilterType,
}: {
  sc: SavedColorEntry;
  onBack: () => void;
  onRemove: (id: string) => void;
  onToggleFavourite: (id: string, current: boolean) => void;
  filterBrand: string | null;
  filterType: string | null;
  onFilterBrand: (v: string | null) => void;
  onFilterType: (v: string | null) => void;
}) {
  const [showAll, setShowAll] = useState(false);

  const filteredCandidates = useMemo(() => {
    const filters: PaintFilters = {
      brands: filterBrand ? [filterBrand] : [],
      surfaces: [],
      finishes: filterType ? [filterType] : [],
    };
    return applyFilters(PAINTS, filters);
  }, [filterBrand, filterType]);

  const matches = useMemo(() => {
    const lab = sc.lab ?? rgbToLab(...((sc.rgb ?? hexToRgb(sc.hex)) as [number, number, number]));
    return matchPaintsLab(lab, 50, filteredCandidates);
  }, [sc, filteredCandidates]);

  const topMatch = matches[0] ?? null;
  const displayedMatches = showAll ? matches : matches.slice(0, 5);

  const finishLabel = topMatch?.paint.finishes[0]
    ? topMatch.paint.finishes[0].charAt(0).toUpperCase() + topMatch.paint.finishes[0].slice(1)
    : '';

  const savedLine = [
    `Saved ${formatSavedDate(sc.timestamp)}`,
    sc.label,
    'In Planner ✓',
  ].filter(Boolean).join(' · ');

  return (
    <ScrollView style={styles.detailScroll} contentContainerStyle={{ paddingBottom: 40 }}>
      {/* Back button */}
      <SafeAreaView>
        <TouchableOpacity
          style={styles.backBtn}
          onPress={onBack}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
        >
          <Text style={styles.backText}>← Saved</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Polaroid card */}
      <View style={styles.polaroidCard}>
        {/* Photo */}
        <View style={styles.polaroidPhotoWrap}>
          {sc.thumbnailUri ? (
            <Image source={{ uri: sc.thumbnailUri }} style={styles.polaroidPhoto} resizeMode="cover" />
          ) : (
            <View style={[styles.polaroidPhoto, { backgroundColor: sc.hex }]} />
          )}
        </View>

        {/* Bottom info strip */}
        <View style={styles.polaroidStrip}>
          <View style={[styles.stripSwatch, { backgroundColor: sc.hex }]} />
          <View style={{ flex: 1 }}>
            <Text style={styles.stripName} numberOfLines={1}>
              {topMatch ? topMatch.paint.name : sc.name}
            </Text>
            <Text style={styles.stripBrand} numberOfLines={1}>
              {topMatch
                ? `${topMatch.paint.brand} · ${sc.hex}${finishLabel ? ` · ${finishLabel}` : ''}`
                : sc.hex}
            </Text>
            <Text style={styles.stripMeta} numberOfLines={1}>{savedLine}</Text>
          </View>
          <View style={styles.stripActions}>
            <TouchableOpacity
              onPress={() => onToggleFavourite(sc.id, !!sc.favourite)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={[styles.actionIcon, sc.favourite && styles.actionIconActive]}>♥</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onRemove(sc.id)}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Text style={styles.actionIcon}>🗑</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* Matching colours section */}
      <View style={styles.matchSection}>
        <Text style={styles.matchSectionTitle}>MATCHING COLOURS</Text>

        {/* Brand pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {BRAND_PILLS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.filterPill, filterBrand === p.value && styles.filterPillActive]}
              onPress={() => onFilterBrand(p.value)}
            >
              <Text style={[styles.filterPillText, filterBrand === p.value && styles.filterPillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Type pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {TYPE_PILLS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.filterPill, filterType === p.value && styles.filterPillActive]}
              onPress={() => onFilterType(p.value)}
            >
              <Text style={[styles.filterPillText, filterType === p.value && styles.filterPillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Match rows */}
        {displayedMatches.length === 0 ? (
          <Text style={styles.matchEmpty}>No paints match those filters.</Text>
        ) : (
          displayedMatches.map((m, i) => (
            <MatchRow key={`${m.paint.brand}-${m.paint.name}-${i}`} match={m} />
          ))
        )}

        {/* Show all / less toggle */}
        {matches.length > 5 && (
          <TouchableOpacity
            style={styles.showAllBtn}
            onPress={() => setShowAll(v => !v)}
          >
            <Text style={styles.showAllText}>
              {showAll ? 'Show fewer' : `Show all ${matches.length}`}
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );
}

function MatchRow({ match }: { match: PaintMatch }) {
  const finishTag = match.paint.finishes[0] ?? '';
  return (
    <View style={styles.matchRow}>
      <View style={[styles.matchSwatch, { backgroundColor: match.paint.hex }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.matchName} numberOfLines={1}>{match.paint.name}</Text>
        <Text style={styles.matchBrand} numberOfLines={1}>
          {match.paint.brand}{finishTag ? ` · ${finishTag.charAt(0).toUpperCase()}${finishTag.slice(1)}` : ''}
        </Text>
      </View>
      <Text style={styles.matchScore}>
        {match.matchPercent}% · ΔE {match.deltaE.toFixed(1)}
      </Text>
    </View>
  );
}

export default function MyColoursScreen() {
  const { savedColors, remove, toggleFavourite } = useSavedColors();
  const [selected, setSelected] = useState<SavedColorEntry | null>(null);
  const [filterBrand, setFilterBrand] = useState<string | null>(null);
  const [filterType, setFilterType] = useState<string | null>(null);

  // Keep selected entry in sync when savedColors updates (e.g. after favourite toggle)
  useEffect(() => {
    if (selected) {
      const updated = savedColors.find(sc => sc.id === selected.id);
      if (updated) setSelected(updated);
      else setSelected(null); // was deleted
    }
  }, [savedColors]);

  const handleRemove = useCallback((id: string) => {
    remove(id);
    setSelected(null);
  }, [remove]);

  if (selected) {
    return (
      <View style={styles.container}>
        <ColourDetail
          sc={selected}
          onBack={() => setSelected(null)}
          onRemove={handleRemove}
          onToggleFavourite={toggleFavourite}
          filterBrand={filterBrand}
          filterType={filterType}
          onFilterBrand={setFilterBrand}
          onFilterType={setFilterType}
        />
      </View>
    );
  }

  const total = savedColors.length;

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Saved · {total} colour{total !== 1 ? 's' : ''}</Text>
        </View>

        {/* Brand pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.pillRow} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {BRAND_PILLS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.filterPill, filterBrand === p.value && styles.filterPillActive]}
              onPress={() => setFilterBrand(p.value)}
            >
              <Text style={[styles.filterPillText, filterBrand === p.value && styles.filterPillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Type pills */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={[styles.pillRow, { marginBottom: 8 }]} contentContainerStyle={{ paddingHorizontal: 16, gap: 6 }}>
          {TYPE_PILLS.map(p => (
            <TouchableOpacity
              key={p.label}
              style={[styles.filterPill, filterType === p.value && styles.filterPillActive]}
              onPress={() => setFilterType(p.value)}
            >
              <Text style={[styles.filterPillText, filterType === p.value && styles.filterPillTextActive]}>
                {p.label}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* Grid */}
        {total === 0 ? (
          <Text style={styles.empty}>
            Nothing saved yet.{'\n\n'}Point the camera at a wall in the Scan tab — or pick a spot on a photo — and saves appear here.
          </Text>
        ) : (
          <FlatList
            data={savedColors}
            keyExtractor={item => item.id}
            numColumns={3}
            contentContainerStyle={{ paddingHorizontal: GRID_PADDING, paddingBottom: 20 }}
            columnWrapperStyle={{ gap: GRID_GAP, marginBottom: GRID_GAP }}
            renderItem={({ item }) => (
              <GridCard sc={item} onPress={setSelected} />
            )}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },

  header: {
    paddingHorizontal: 16, paddingTop: 16, paddingBottom: 8,
  },
  headerTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800' },

  pillRow: { flexShrink: 0, marginBottom: 4 },
  filterPill: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  filterPillActive: { backgroundColor: COLORS.purple, borderColor: COLORS.purple },
  filterPillText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  filterPillTextActive: { color: '#fff' },

  empty: {
    color: COLORS.textMuted, textAlign: 'center',
    marginTop: 40, fontSize: 16,
    paddingHorizontal: 32, lineHeight: 23,
  },

  // --- Grid card ---
  gridCard: { width: CARD_WIDTH },
  gridThumbWrap: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
    borderRadius: 16,
    overflow: 'hidden',
    position: 'relative',
    backgroundColor: COLORS.surface,
  },
  gridThumb: {
    width: '100%',
    height: '100%',
    borderRadius: 16,
  },
  gridDotRing: {
    position: 'absolute',
    width: 18, height: 18,
    borderRadius: 9,
    borderWidth: 2, borderColor: '#fff',
    overflow: 'hidden',
  },
  gridDot: {
    flex: 1,
  },
  gridName: {
    color: COLORS.text,
    fontSize: 11, fontWeight: '600',
    marginTop: 4, lineHeight: 14,
  },

  // --- Detail (Polaroid) ---
  detailScroll: { flex: 1 },
  backBtn: { paddingHorizontal: 16, paddingVertical: 14 },
  backText: { color: COLORS.purple, fontSize: 15, fontWeight: '700' },

  polaroidCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    backgroundColor: COLORS.card,
    overflow: 'hidden',
    borderWidth: 1, borderColor: COLORS.border,
  },
  polaroidPhotoWrap: {
    width: '100%',
    aspectRatio: 1,
  },
  polaroidPhoto: {
    width: '100%',
    height: '100%',
  },
  polaroidStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    gap: 10,
    borderTopWidth: 2, borderTopColor: COLORS.border,
  },
  stripSwatch: {
    width: 28, height: 28, borderRadius: 6,
    borderWidth: 1.5, borderColor: 'rgba(255,255,255,0.2)',
    flexShrink: 0,
  },
  stripName: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  stripBrand: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  stripMeta: { color: COLORS.textMuted, fontSize: 10, marginTop: 2 },
  stripActions: { flexDirection: 'row', gap: 12, flexShrink: 0 },
  actionIcon: { color: COLORS.textMuted, fontSize: 18 },
  actionIconActive: { color: COLORS.purple },

  // --- Matching colours section ---
  matchSection: { marginTop: 20, paddingHorizontal: 0 },
  matchSectionTitle: {
    color: COLORS.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 0.5,
    paddingHorizontal: 16, marginBottom: 8,
  },
  matchEmpty: {
    color: COLORS.textMuted, fontSize: 13, paddingHorizontal: 16, marginTop: 8,
  },
  matchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 8,
    gap: 10,
  },
  matchSwatch: {
    width: 24, height: 24, borderRadius: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    flexShrink: 0,
  },
  matchName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  matchBrand: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  matchScore: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', flexShrink: 0 },
  showAllBtn: {
    marginHorizontal: 16, marginTop: 8,
    paddingVertical: 10, alignItems: 'center',
    borderRadius: 10, borderWidth: 1, borderColor: COLORS.border,
  },
  showAllText: { color: COLORS.purple, fontSize: 13, fontWeight: '700' },
});
