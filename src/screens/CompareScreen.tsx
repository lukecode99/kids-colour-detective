// Compare tab (CD, 20-Nov): search the whole catalogue by colour name across every
// brand, and line up to four swatches side by side. Mirrors the Same Tin site's
// compare view — the signed-off st2-compare.png mock: Fraunces header + dab motif,
// a search box with "+ Add" result rows, a side-by-side strip of swatch cards with
// an × remove, a blue insight box comparing the set, and a disclaimer footer.
//
// The ranking and add/remove rules live in utils/compareSearch.ts (unit-tested); this
// file is only the screen. A slot can also be seeded from a scan or My Colours via
// `seed` — those arrive as captures (hex, no brand) and carry a "From your scan" tag.
import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
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
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Haptics from 'expo-haptics';

import { Paint } from '../utils/paintMatcher';
import { hexToRgb, rgbToLab, deltaE2000 } from '../utils/colorMath';
import {
  CompareItem,
  COMPARE_LIMIT,
  searchByName,
  paintToCompareItem,
  addToCompare,
  removeFromCompare,
  isInCompare,
  paintItemId,
} from '../utils/compareSearch';
import { COLORS, FONTS } from '../theme';

// The dab motif — the lopsided paint-blob swatch the site uses in place of a plain
// square. CSS `border-radius: 50% 50% 50% 6px`; in RN each corner is set directly.
function Dab({ color, size, style }: { color: string; size: number; style?: any }) {
  const r = size / 2;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          backgroundColor: color,
          borderTopLeftRadius: r,
          borderTopRightRadius: r,
          borderBottomRightRadius: r,
          borderBottomLeftRadius: 6,
          borderWidth: 1,
          borderColor: COLORS.hairline,
        },
        style,
      ]}
    />
  );
}

function labOf(hex: string) {
  const [r, g, b] = hexToRgb(hex);
  return rgbToLab(r, g, b);
}

// A one-line read on the chosen set: name the closest pair and how close they are.
// Returns null for fewer than two slots (nothing to compare yet).
function compareInsight(items: CompareItem[]): string | null {
  if (items.length < 2) return null;
  let best = { i: 0, j: 1, dE: Infinity };
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const dE = deltaE2000(labOf(items[i].hex), labOf(items[j].hex));
      if (dE < best.dE) best = { i, j, dE };
    }
  }
  const a = items[best.i].name;
  const b = items[best.j].name;
  const dE = best.dE;
  if (dE < 1) return `${a} and ${b} are all but indistinguishable (ΔE ${dE.toFixed(1)}).`;
  if (dE < 5) return `Closest pair: ${a} and ${b} — very close, ΔE ${dE.toFixed(1)}.`;
  if (dE <= 10) return `Closest pair: ${a} and ${b} — a usable match, ΔE ${dE.toFixed(1)}.`;
  return `Even the closest pair here (${a} and ${b}) read as different colours (ΔE ${dE.toFixed(1)}).`;
}

// One search result row: swatch, name, brand, and a "+ Add" affordance that greys out
// once the colour is already on the strip or the strip is full.
function ResultRow({
  paint,
  added,
  full,
  onAdd,
}: {
  paint: Paint;
  added: boolean;
  full: boolean;
  onAdd: (p: Paint) => void;
}) {
  const disabled = added || full;
  return (
    <View style={styles.resultRow}>
      <Dab color={paint.hex} size={34} style={{ marginRight: 12 }} />
      <View style={{ flex: 1 }}>
        <Text style={styles.resultName} numberOfLines={1}>{paint.name}</Text>
        <Text style={styles.resultSub} numberOfLines={1}>
          {paint.brand}{paint.code ? ` · ${paint.code}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={[styles.addBtn, disabled && styles.addBtnDisabled]}
        onPress={() => onAdd(paint)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`Add ${paint.name} to compare`}
      >
        <Text style={[styles.addBtnText, disabled && styles.addBtnTextDisabled]}>
          {added ? 'Added' : full ? 'Full' : '+ Add'}
        </Text>
      </TouchableOpacity>
    </View>
  );
}

// One side-by-side card: full-bleed colour on top, name/brand/finish beneath, × to remove.
function SwatchCard({ item, onRemove }: { item: CompareItem; onRemove: (id: string) => void }) {
  const sub = item.brand
    ? `${item.brand}${item.finish ? ` · ${item.finish}` : ''}`
    : item.source === 'scan'
    ? 'From your scan'
    : 'From My Colours';
  return (
    <View style={styles.card}>
      <View style={[styles.cardColour, { backgroundColor: item.hex }]}>
        <TouchableOpacity
          style={styles.removeBtn}
          onPress={() => onRemove(item.id)}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          accessibilityRole="button"
          accessibilityLabel={`Remove ${item.name}`}
        >
          <Text style={styles.removeBtnText}>×</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.cardBody}>
        <Text style={styles.cardName} numberOfLines={2}>{item.name}</Text>
        <Text style={styles.cardSub} numberOfLines={1}>{sub}</Text>
        <Text style={styles.cardHex}>{item.hex.toUpperCase()}</Text>
      </View>
    </View>
  );
}

const STORAGE_KEY = 'compareSet.v1';

export default function CompareScreen({ seed }: { seed?: CompareItem | null }) {
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<CompareItem[]>([]);
  const initialLoadDone = useRef(false);

  // Load persisted compare set on mount.
  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(raw => {
      initialLoadDone.current = true;
      if (raw) {
        try { setItems(JSON.parse(raw)); } catch {}
      }
    });
  }, []);

  // Persist whenever items change (but not before the initial load completes).
  useEffect(() => {
    if (!initialLoadDone.current) return;
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)).catch(() => {});
  }, [items]);

  // Seed a slot handed in from a scan / My Colours ("compare this one"), once.
  useEffect(() => {
    if (seed) setItems(prev => addToCompare(prev, seed));
  }, [seed]);

  const results = useMemo(() => searchByName(query), [query]);
  const insight = useMemo(() => compareInsight(items), [items]);
  const full = items.length >= COMPARE_LIMIT;

  const onAdd = useCallback((paint: Paint) => {
    const item = paintToCompareItem(paint);
    setItems(prev => {
      const next = addToCompare(prev, item);
      if (next !== prev) Haptics.selectionAsync();
      return next;
    });
  }, []);

  const onRemove = useCallback((id: string) => {
    setItems(prev => removeFromCompare(prev, id));
  }, []);

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.header}>
            <Dab color={COLORS.accent} size={16} style={{ marginRight: 10 }} />
            <Text style={styles.headerTitle}>Compare</Text>
          </View>
          <Text style={styles.subhead}>
            Search any brand by name and line up to {COMPARE_LIMIT} side by side.
          </Text>

          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search colours by name…"
            placeholderTextColor={COLORS.placeholder}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />

          {query.trim().length > 0 && (
            <View style={styles.results}>
              {results.length === 0 ? (
                <Text style={styles.empty}>No colours match “{query.trim()}”.</Text>
              ) : (
                results.map(p => (
                  <ResultRow
                    key={paintItemId(p)}
                    paint={p}
                    added={isInCompare(items, paintItemId(p))}
                    full={full}
                    onAdd={onAdd}
                  />
                ))
              )}
            </View>
          )}

          <Text style={styles.sectionLabel}>
            SIDE BY SIDE — {items.length} COLOUR{items.length === 1 ? '' : 'S'}
          </Text>

          {items.length === 0 ? (
            <View style={styles.placeholderBox}>
              <Text style={styles.placeholderText}>
                Add colours from the search above to compare them side by side.
              </Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={i => i.id}
              renderItem={({ item }) => <SwatchCard item={item} onRemove={onRemove} />}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.strip}
            />
          )}

          {insight && (
            <View style={styles.insight}>
              <Text style={styles.insightText}>{insight}</Text>
            </View>
          )}

          <Text style={styles.disclaimer}>
            Colours shown are screen approximations from manufacturer data — always
            check a physical sample before you buy.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  scroll: { paddingBottom: 32 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16,
  },
  headerTitle: {
    color: COLORS.text, fontSize: 26, letterSpacing: -0.3,
    ...FONTS.serifBold, fontWeight: '700',
  },
  subhead: {
    color: COLORS.textMuted, fontSize: 13, ...FONTS.body,
    paddingHorizontal: 20, marginTop: 4, marginBottom: 14,
  },
  search: {
    marginHorizontal: 20, marginBottom: 8,
    paddingHorizontal: 14, paddingVertical: 11, borderRadius: 12,
    backgroundColor: COLORS.card, color: COLORS.text, fontSize: 15,
    borderWidth: 1, borderColor: COLORS.border, ...FONTS.body,
  },
  results: {
    marginHorizontal: 20, marginTop: 4, marginBottom: 6,
    borderRadius: 14, overflow: 'hidden',
    backgroundColor: COLORS.card,
    borderWidth: 1, borderColor: COLORS.border,
  },
  resultRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 9,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: COLORS.border,
  },
  resultName: { color: COLORS.text, fontSize: 15, ...FONTS.bodySemiBold, fontWeight: '700' },
  resultSub: { color: COLORS.textMuted, fontSize: 12, ...FONTS.body, marginTop: 1 },
  addBtn: {
    paddingHorizontal: 14, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.accentSoft,
  },
  addBtnDisabled: { backgroundColor: COLORS.fill },
  addBtnText: { color: COLORS.accent, fontSize: 13, ...FONTS.bodyBold, fontWeight: '700' },
  addBtnTextDisabled: { color: COLORS.textMuted },
  empty: {
    color: COLORS.textMuted, fontSize: 14, ...FONTS.body,
    paddingHorizontal: 12, paddingVertical: 14,
  },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 11, letterSpacing: 1.2,
    ...FONTS.bodyBold, fontWeight: '800',
    paddingHorizontal: 20, marginTop: 18, marginBottom: 10,
  },
  placeholderBox: {
    marginHorizontal: 20, padding: 20, borderRadius: 14,
    borderWidth: 1, borderColor: COLORS.border, borderStyle: 'dashed',
    backgroundColor: COLORS.card,
  },
  placeholderText: {
    color: COLORS.textMuted, fontSize: 14, ...FONTS.body, textAlign: 'center',
  },
  strip: { paddingHorizontal: 20, paddingRight: 8 },
  card: {
    width: 150, marginRight: 12, borderRadius: 16, overflow: 'hidden',
    backgroundColor: COLORS.card, borderWidth: 1, borderColor: COLORS.border,
  },
  cardColour: { height: 110, width: '100%' },
  removeBtn: {
    position: 'absolute', top: 6, right: 6,
    width: 26, height: 26, borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center', justifyContent: 'center',
  },
  removeBtnText: { color: '#fff', fontSize: 18, lineHeight: 20, fontWeight: '700' },
  cardBody: { padding: 12 },
  cardName: {
    color: COLORS.text, fontSize: 16, lineHeight: 20,
    ...FONTS.serif, fontWeight: '600',
  },
  cardSub: { color: COLORS.textMuted, fontSize: 12, ...FONTS.body, marginTop: 3 },
  cardHex: { color: COLORS.textFaint, fontSize: 11, ...FONTS.bodyMedium, marginTop: 4 },
  insight: {
    marginHorizontal: 20, marginTop: 18, padding: 14, borderRadius: 14,
    backgroundColor: COLORS.accentSoft,
  },
  insightText: { color: COLORS.accent, fontSize: 13, lineHeight: 19, ...FONTS.bodyMedium },
  disclaimer: {
    color: COLORS.textFaint, fontSize: 11, lineHeight: 16, ...FONTS.body,
    paddingHorizontal: 20, marginTop: 22,
  },
});
