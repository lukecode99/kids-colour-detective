// Palettes tab: colour-scheme ideas built around a base colour — the
// 60-30-10 room plan and complementary/analogous/triadic paints. The
// base can be the live scanned colour or any saved colour.
import React, { useState } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ScrollView,
} from 'react-native';

import { useCurrentColour } from '../utils/currentColour';
import { useSavedColors } from './SavedScreen';
import PaletteIdeas from '../components/PaletteIdeas';
import { COLORS } from '../theme';

export default function PalettesScreen() {
  const current = useCurrentColour();
  const { savedColors } = useSavedColors();
  const [pickedHex, setPickedHex] = useState<string | null>(null);

  // Picked chip wins; otherwise follow the live scan; otherwise the most
  // recent saved colour.
  const baseHex = pickedHex ?? current?.hex ?? savedColors[0]?.hex ?? null;

  const chips: { key: string; hex: string; label: string }[] = [];
  if (current) chips.push({ key: 'current', hex: current.hex, label: '🎯 Current scan' });
  for (const sc of savedColors) {
    chips.push({ key: sc.id, hex: sc.hex, label: sc.label || sc.name });
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Palettes</Text>
        </View>
        {!baseHex ? (
          <Text style={styles.empty}>
            No colour to build on yet.{'\n\n'}Scan a wall in the Scan tab, or save a colour, and
            scheme ideas — 60-30-10 room plans, complementary and accent paints — appear here.
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {chips.length > 1 && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chipRow}
              >
                {chips.map(c => {
                  const active = c.hex === baseHex;
                  return (
                    <TouchableOpacity
                      key={c.key}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => setPickedHex(c.hex)}
                    >
                      <View style={[styles.chipSwatch, { backgroundColor: c.hex }]} />
                      <Text
                        style={[styles.chipText, active && styles.chipTextActive]}
                        numberOfLines={1}
                      >
                        {c.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
            <View style={styles.baseCard}>
              <View style={[styles.baseSwatch, { backgroundColor: baseHex }]} />
              <Text style={styles.baseHex}>Built around {baseHex.toUpperCase()}</Text>
            </View>
            <View style={{ paddingHorizontal: 20, paddingBottom: 24 }}>
              <PaletteIdeas hex={baseHex} />
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
  chipRow: { paddingHorizontal: 20, paddingBottom: 12, gap: 8 },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.08)', maxWidth: 180,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipSwatch: {
    width: 16, height: 16, borderRadius: 4, marginRight: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  chipText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  baseCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 4,
  },
  baseSwatch: {
    width: 28, height: 28, borderRadius: 6, marginRight: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  baseHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
});
