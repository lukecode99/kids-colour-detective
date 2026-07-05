// Matches tab: the full paint-match workspace for whatever colour is
// currently under the crosshair (or was last pinpointed on a photo) —
// top-5 matches with buy links, brand/surface/finish filters, and the
// coverage calculator, all with room to breathe.
import React, { useState, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  ScrollView,
} from 'react-native';

import { useCurrentColour } from '../utils/currentColour';
import { matchPaintsLab } from '../utils/paintMatcher';
import { rgbToLab } from '../utils/colorMath';
import {
  MatchList,
  FiltersPanel,
  FilterToggleLine,
  FilterEmptyNotice,
  usePaintFilters,
} from '../components/paintMatchUI';
import { COLORS } from '../theme';

export default function MatchesScreen() {
  const current = useCurrentColour();
  const [showFilters, setShowFilters] = useState(false);
  const { filters, onToggle: onToggleFilter, candidates } = usePaintFilters();

  const matches = useMemo(() => {
    if (!current) return [];
    const [r, g, b] = current.rgb;
    return matchPaintsLab(rgbToLab(r, g, b), 5, candidates);
  }, [current, candidates]);

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Paint Matches</Text>
        </View>
        {!current ? (
          <Text style={styles.empty}>
            Nothing scanned yet.{'\n\n'}Point the camera at a wall in the Scan tab — or pick a
            spot on a photo — and the closest paints show up here.
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            <View style={styles.colourCard}>
              <View style={[styles.swatch, { backgroundColor: current.hex }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.colourName}>{current.name}</Text>
                <Text style={styles.colourHex}>{current.hex.toUpperCase()}</Text>
              </View>
            </View>
            <FilterToggleLine
              filters={filters}
              candidateCount={candidates.length}
              expanded={showFilters}
              onPress={() => setShowFilters(s => !s)}
            />
            {showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilter} />}
            {candidates.length === 0 ? <FilterEmptyNotice /> : <MatchList matches={matches} />}
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
});
