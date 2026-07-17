// Brand match tab (CD-18): pick a colour you like from one brand and see
// the closest alternates every other brand sells, ranked by ΔE2000. Two
// stages in one screen: browse/search a brand's range, then a side-by-side
// comparison of the chosen colour against its cross-brand alternates.
import React, { useState, useMemo, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  SafeAreaView,
  Platform,
  ScrollView,
  FlatList,
} from 'react-native';

import * as Haptics from 'expo-haptics';
import { Paint, PaintMatch } from '../utils/paintMatcher';
import { searchBrandColours, crossBrandAlternates } from '../utils/brandMatch';
import { BRAND_OPTIONS } from '../utils/filters';
import BuyButton from '../components/BuyButton';
import { COLORS } from '../theme';

const ALTERNATES_LIMIT = 10;

function BrandChips({ brand, onPick }: { brand: string; onPick: (b: string) => void }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.chipsRow}>
      {BRAND_OPTIONS.map(b => {
        const active = b === brand;
        return (
          <TouchableOpacity
            key={b}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onPick(b)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{b}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  );
}

// One row in the brand's colour list.
function ColourRow({ paint, onPick }: { paint: Paint; onPick: (p: Paint) => void }) {
  return (
    <TouchableOpacity style={styles.colourRow} onPress={() => onPick(paint)}>
      <View style={[styles.rowSwatch, { backgroundColor: paint.hex }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{paint.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {paint.code ? `${paint.code} · ` : ''}{paint.hex.toUpperCase()}
        </Text>
      </View>
      <Text style={styles.rowChevron}>›</Text>
    </TouchableOpacity>
  );
}

// One alternate: swatch pair (source | alternate) plus ΔE and closeness.
function AlternateRow({ source, m }: { source: Paint; m: PaintMatch }) {
  return (
    <View style={styles.altRow}>
      <View style={styles.swatchPair}>
        <View style={[styles.pairHalf, { backgroundColor: source.hex }]} />
        <View style={[styles.pairHalf, { backgroundColor: m.paint.hex }]} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={styles.rowName} numberOfLines={1}>{m.paint.name}</Text>
        <Text style={styles.rowSub} numberOfLines={1}>
          {m.paint.brand}{m.paint.code ? ` · ${m.paint.code}` : ''}
        </Text>
        <Text style={styles.altCloseness} numberOfLines={1}>
          ΔE {m.deltaE.toFixed(1)} · {m.closeness}
        </Text>
      </View>
      <BuyButton paint={m.paint} compact />
    </View>
  );
}

export default function BrandMatchScreen() {
  const [brand, setBrand] = useState<string>(BRAND_OPTIONS[2]); // Farrow & Ball
  const [query, setQuery] = useState('');
  const [source, setSource] = useState<Paint | null>(null);

  const colours = useMemo(() => searchBrandColours(brand, query), [brand, query]);
  const alternates = useMemo(
    () => (source ? crossBrandAlternates(source, ALTERNATES_LIMIT) : []),
    [source]
  );

  const pickBrand = useCallback((b: string) => {
    setBrand(b);
    setQuery('');
    setSource(null);
  }, []);

  const pickColour = useCallback((paint: Paint) => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setSource(paint);
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Brand Swap</Text>
        </View>

        {source ? (
          <FlatList
            data={alternates}
            keyExtractor={m => `${m.paint.brand}-${m.paint.name}-${m.paint.code}`}
            renderItem={({ item }) => <AlternateRow source={source} m={item} />}
            ListHeaderComponent={
              <View>
                <TouchableOpacity onPress={() => setSource(null)} hitSlop={{ top: 6, bottom: 6 }}>
                  <Text style={styles.backLink}>‹ {brand} colours</Text>
                </TouchableOpacity>
                <View style={styles.sourceCard}>
                  <View style={[styles.sourceSwatch, { backgroundColor: source.hex }]} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.sourceName} numberOfLines={1}>{source.name}</Text>
                    <Text style={styles.rowSub} numberOfLines={1}>
                      {source.brand}{source.code ? ` · ${source.code}` : ''} · {source.hex.toUpperCase()}
                    </Text>
                  </View>
                </View>
                <Text style={styles.sectionTitle}>
                  Closest matches from other brands
                </Text>
                <Text style={styles.sectionHint}>
                  Ranked by ΔE colour difference — under 1 is indistinguishable, under 5 very close.
                </Text>
              </View>
            }
            contentContainerStyle={styles.listContent}
          />
        ) : (
          <FlatList
            data={colours}
            keyExtractor={p => `${p.brand}-${p.name}-${p.code}`}
            renderItem={({ item }) => <ColourRow paint={item} onPick={pickColour} />}
            ListHeaderComponent={
              <View>
                <Text style={styles.hint}>
                  Love a colour from one brand? Find its closest twin in another.
                </Text>
                <BrandChips brand={brand} onPick={pickBrand} />
                <TextInput
                  style={styles.search}
                  value={query}
                  onChangeText={setQuery}
                  placeholder={`Search ${brand} by name or code…`}
                  placeholderTextColor="rgba(255,255,255,0.35)"
                  autoCorrect={false}
                  clearButtonMode="while-editing"
                />
                <Text style={styles.countLine}>
                  {colours.length} colour{colours.length === 1 ? '' : 's'}
                </Text>
              </View>
            }
            ListEmptyComponent={
              <Text style={styles.empty}>No {brand} colours match “{query.trim()}”.</Text>
            }
            keyboardShouldPersistTaps="handled"
            initialNumToRender={20}
            windowSize={7}
            contentContainerStyle={styles.listContent}
          />
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, marginBottom: 4,
  },
  headerTitle: { color: COLORS.text, fontSize: 22, fontWeight: '800' },
  hint: { color: COLORS.textMuted, fontSize: 13, paddingHorizontal: 20, marginBottom: 12 },
  chipsRow: { paddingLeft: 20, marginBottom: 12, flexGrow: 0 },
  chip: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16, marginRight: 8,
    backgroundColor: COLORS.surface,
  },
  chipActive: { backgroundColor: COLORS.accent },
  chipText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  chipTextActive: { color: '#fff' },
  search: {
    marginHorizontal: 20, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 10, borderRadius: 12,
    backgroundColor: COLORS.surface, color: COLORS.text, fontSize: 15,
  },
  countLine: {
    color: COLORS.textMuted, fontSize: 12, fontWeight: '600',
    paddingHorizontal: 20, marginBottom: 6,
  },
  listContent: { paddingBottom: 24 },
  colourRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 9,
  },
  rowSwatch: {
    width: 38, height: 38, borderRadius: 8, marginRight: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  rowName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  rowSub: { color: COLORS.textMuted, fontSize: 12, marginTop: 1 },
  rowChevron: { color: COLORS.textMuted, fontSize: 22, marginLeft: 8 },
  empty: { color: COLORS.textMuted, fontSize: 14, paddingHorizontal: 20, paddingVertical: 16 },
  backLink: {
    color: COLORS.accent, fontSize: 14, fontWeight: '700',
    paddingHorizontal: 20, marginBottom: 10,
  },
  sourceCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 14,
    padding: 12, borderRadius: 14, backgroundColor: COLORS.surface,
  },
  sourceSwatch: {
    width: 52, height: 52, borderRadius: 10, marginRight: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  sourceName: { color: COLORS.text, fontSize: 19, fontWeight: '800', letterSpacing: -0.3 },
  sectionTitle: {
    color: COLORS.text, fontSize: 15, fontWeight: '800',
    paddingHorizontal: 20,
  },
  sectionHint: {
    color: COLORS.textMuted, fontSize: 12,
    paddingHorizontal: 20, marginTop: 2, marginBottom: 8,
  },
  altRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 9,
  },
  swatchPair: {
    flexDirection: 'row', width: 56, height: 38, borderRadius: 8,
    overflow: 'hidden', marginRight: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  pairHalf: { flex: 1, height: '100%' },
  altCloseness: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
});
