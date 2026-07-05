// My Colours tab (CD-13): the Saved and Matches tabs merged into one
// per-capture card list — thumbnail, editable room label, top-5 matches
// and an expandable goes-with palette per card. One set of filter chips
// at the top narrows the matches on every card at once.
// CD-19: the live scan renders on the Scan tab only — this screen shows
// saved captures alone (buildMyColoursCards pins that down under test).
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';

import { useCurrentColour } from '../utils/currentColour';
import { hexToRgb, rgbToLab } from '../utils/colorMath';
import { Paint, matchPaintsLab } from '../utils/paintMatcher';
import {
  SavedColorEntry,
  loadSavedColors,
  addSavedColor,
  removeSavedColor,
  setSavedColorLabel,
} from '../utils/savedColors';
import { buildMyColoursCards, isMyColoursEmpty } from '../utils/myColoursView';
import { parseMatchLabel } from '../utils/matchLabel';
import PaletteIdeas from '../components/PaletteIdeas';
import {
  MatchList,
  FiltersPanel,
  FilterToggleLine,
  FilterEmptyNotice,
  usePaintFilters,
} from '../components/paintMatchUI';
import { COLORS } from '../theme';

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

  return { savedColors, save, remove, setLabel };
}

function formatTimestamp(ts: number): string {
  const d = new Date(ts);
  return (
    d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) +
    ', ' +
    d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })
  );
}

// One card per saved capture: thumbnail, editable room label, top-5
// matches recomputed against the shared filters, expandable goes-with.
function CaptureCard({
  sc,
  candidates,
  onRemove,
  onLabel,
}: {
  sc: SavedColorEntry;
  candidates: Paint[];
  onRemove: (id: string) => void;
  onLabel: (id: string, label: string) => void;
}) {
  const [label, setLabel] = useState(sc.label ?? '');
  const [showIdeas, setShowIdeas] = useState(false);
  const commit = () => onLabel(sc.id, label);
  // Pre-CD-14 entries froze the match as one string — recover the parts so
  // the paint name gets its own full-width line on old cards too.
  const best = sc.bestMatch ?? (sc.match ? parseMatchLabel(sc.match) : undefined);
  // Matches recompute live against the shared filters. Legacy hex-only
  // entries are migrated at load, but derive here too so a card never
  // renders without its matches.
  const matches = useMemo(() => {
    const lab = sc.lab ?? rgbToLab(...(sc.rgb ?? hexToRgb(sc.hex)));
    return matchPaintsLab(lab, 5, candidates);
  }, [sc, candidates]);

  return (
    <View style={styles.card}>
      <View style={styles.cardHead}>
        {sc.thumbnailUri ? (
          <Image source={{ uri: sc.thumbnailUri }} style={styles.thumb} />
        ) : (
          <View style={[styles.thumb, { backgroundColor: sc.hex }]} />
        )}
        <View style={[styles.swatchBar, { backgroundColor: sc.hex }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.cardTitle}>
            {sc.emoji} {sc.name}
          </Text>
          {best && (
            <Text style={styles.cardMeta}>
              best: {best.name} · {best.brand} · {best.pct}%
            </Text>
          )}
          <Text style={styles.cardMeta}>
            {sc.hex} · {formatTimestamp(sc.timestamp)}
          </Text>
          <TextInput
            style={styles.labelInput}
            placeholder="Add room label…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={label}
            onChangeText={setLabel}
            onBlur={commit}
            onSubmitEditing={commit}
            returnKeyType="done"
          />
        </View>
        <TouchableOpacity
          onPress={() => onRemove(sc.id)}
          style={styles.deleteBtn}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ color: COLORS.textMuted, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {candidates.length === 0 ? <FilterEmptyNotice /> : <MatchList matches={matches} />}
      <TouchableOpacity onPress={() => setShowIdeas(v => !v)} hitSlop={{ top: 6, bottom: 6 }}>
        <Text style={styles.ideasToggle}>{showIdeas ? '▾' : '▸'} 🎨 Goes-with paints</Text>
      </TouchableOpacity>
      {showIdeas && (
        <View style={styles.ideasWrap}>
          <PaletteIdeas hex={sc.hex} candidates={candidates} />
        </View>
      )}
    </View>
  );
}

export default function MyColoursScreen() {
  const { savedColors, remove, setLabel } = useSavedColors();
  const [showFilters, setShowFilters] = useState(false);
  const { filters, onToggle: onToggleFilter, candidates } = usePaintFilters();
  // Deliberately fed through the CD-19 helpers, which ignore it: a live
  // scan must not add a card here nor suppress the empty state.
  const current = useCurrentColour();

  const cards = buildMyColoursCards(current, savedColors);
  const empty = isMyColoursEmpty(current, savedColors);

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>My Colours</Text>
        </View>
        {empty ? (
          <Text style={styles.empty}>
            Nothing here yet.{'\n\n'}Point the camera at a wall in the Scan tab — or pick a spot
            on a photo — and every capture shows up here as a card.
          </Text>
        ) : (
          <>
            <FilterToggleLine
              filters={filters}
              candidateCount={candidates.length}
              expanded={showFilters}
              onPress={() => setShowFilters(s => !s)}
            />
            {showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilter} />}
            <ScrollView keyboardShouldPersistTaps="handled">
              {cards.map(({ entry: sc }) => (
                <CaptureCard
                  key={sc.id}
                  sc={sc}
                  candidates={candidates}
                  onRemove={remove}
                  onLabel={setLabel}
                />
              ))}
            </ScrollView>
          </>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, marginBottom: 10,
  },
  headerTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  empty: {
    color: COLORS.textMuted, textAlign: 'center', marginTop: 40, fontSize: 16,
    paddingHorizontal: 32, lineHeight: 23,
  },
  card: {
    marginHorizontal: 12, marginBottom: 12,
    paddingHorizontal: 8, paddingVertical: 10,
    borderRadius: 14, backgroundColor: COLORS.surface,
  },
  cardHead: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, marginBottom: 8,
  },
  thumb: { width: 56, height: 56, borderRadius: 10 },
  swatchBar: { width: 6, height: 56, borderRadius: 3, marginLeft: 6, marginRight: 12 },
  cardTitle: { color: COLORS.text, fontSize: 17, fontWeight: '700' },
  cardMeta: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  labelInput: {
    color: COLORS.text, fontSize: 13, marginTop: 4,
    paddingVertical: 2, paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  deleteBtn: { paddingLeft: 12, paddingVertical: 8 },
  ideasToggle: {
    color: COLORS.accent, fontSize: 13, fontWeight: '700',
    paddingHorizontal: 12, marginTop: 8,
  },
  ideasWrap: { paddingHorizontal: 12 },
});
