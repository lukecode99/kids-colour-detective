// Matches tab: the full paint-match workspace for whatever colour is
// currently under the crosshair (or was last pinpointed on a photo).
// One combined view (CD-11): top-5 matches with buy links, filters and
// the coverage calculator, then the goes-with palette for the same
// colour — no tab switch. Tapping a goes-with paint re-centres the
// screen on it; 💾 keeps the current colour in Saved.
import React, { useState, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ScrollView,
} from 'react-native';

import { useCurrentColour, setCurrentColour } from '../utils/currentColour';
import { buildCombinedView } from '../utils/combinedView';
import { hexToRgb } from '../utils/colorMath';
import { getColorInfo } from '../utils/colorNames';
import { Paint } from '../utils/paintMatcher';
import { addSavedColor, newSavedColorId } from '../utils/savedColors';
import PaletteIdeas from '../components/PaletteIdeas';
import {
  MatchList,
  FiltersPanel,
  FilterToggleLine,
  FilterEmptyNotice,
  usePaintFilters,
  bestMatchLabel,
} from '../components/paintMatchUI';
import { bestMatchInfo } from '../utils/matchLabel';
import { COLORS } from '../theme';

export default function MatchesScreen() {
  const current = useCurrentColour();
  const [showFilters, setShowFilters] = useState(false);
  const [savedHex, setSavedHex] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const { filters, onToggle: onToggleFilter, candidates } = usePaintFilters();

  const view = useMemo(
    () => (current ? buildCombinedView(current.rgb, candidates) : null),
    [current, candidates]
  );

  const onSave = useCallback(() => {
    if (!current || !view) return;
    const [r, g, b] = current.rgb;
    addSavedColor({
      id: newSavedColorId(),
      hex: current.hex,
      name: current.name,
      emoji: getColorInfo(r, g, b, true).emoji,
      match: bestMatchLabel(view.matches),
      bestMatch: bestMatchInfo(view.matches),
      timestamp: Date.now(),
    });
    setSavedHex(current.hex);
  }, [current, view]);

  // Tapping a goes-with paint makes it the colour under consideration —
  // the whole screen (matches + palette) rebuilds around it.
  const onSelectPaint = useCallback((paint: Paint) => {
    setCurrentColour({
      rgb: hexToRgb(paint.hex),
      hex: paint.hex,
      name: `${paint.brand} — ${paint.name}`,
    });
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Paint Matches</Text>
        </View>
        {!current || !view ? (
          <Text style={styles.empty}>
            Nothing scanned yet.{'\n\n'}Point the camera at a wall in the Scan tab — or pick a
            spot on a photo — and the closest paints show up here.
          </Text>
        ) : (
          <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
            <View style={styles.colourCard}>
              <View style={[styles.swatch, { backgroundColor: current.hex }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.colourName}>{current.name}</Text>
                <Text style={styles.colourHex}>{current.hex.toUpperCase()}</Text>
              </View>
              <TouchableOpacity
                style={[styles.saveBtn, savedHex === current.hex && styles.saveBtnDone]}
                onPress={onSave}
                disabled={savedHex === current.hex}
              >
                <Text style={styles.saveBtnText}>
                  {savedHex === current.hex ? '✓ Saved' : '💾 Save'}
                </Text>
              </TouchableOpacity>
            </View>
            <FilterToggleLine
              filters={filters}
              candidateCount={candidates.length}
              expanded={showFilters}
              onPress={() => setShowFilters(s => !s)}
            />
            {showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilter} />}
            {candidates.length === 0 ? (
              <FilterEmptyNotice />
            ) : (
              <MatchList matches={view.matches} />
            )}
            <View style={styles.goesWith}>
              <Text style={styles.goesWithTitle}>🎨 Goes with</Text>
              <Text style={styles.goesWithHint}>
                Scheme ideas built around this colour — tap a paint to explore it.
              </Text>
              <PaletteIdeas
                hex={current.hex}
                view={{ scheme: view.scheme, suggestions: view.suggestions }}
                onSelectPaint={onSelectPaint}
              />
            </View>
          </ScrollView>
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
  colourCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 12,
    padding: 12, borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  swatch: {
    width: 52, height: 52, borderRadius: 10, marginRight: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  colourName: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  colourHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 2 },
  saveBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.accent, marginLeft: 10,
  },
  saveBtnDone: { backgroundColor: 'rgba(255,255,255,0.12)' },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  goesWith: { paddingHorizontal: 20, paddingBottom: 24, marginTop: 8 },
  goesWithTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  goesWithHint: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: 4 },
});
