// Palette ideas for a colour: a 60-30-10 room plan plus complementary /
// analogous / triadic / contrast suggestions, every one mapped to a real
// paint (brand + code + swatch) — never a bare hex. Callers that already
// hold a CombinedView pass its scheme/suggestions via `view`; otherwise
// the palette is computed here from `hex`.
import React, { useMemo, useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import { hexToRgb } from '../utils/colorMath';
import {
  harmonySuggestions,
  roomScheme,
  PaintSuggestion,
  RoomScheme,
  HarmonyRole,
} from '../utils/colorHarmony';
import { Paint } from '../utils/paintMatcher';
import BuyButton from './BuyButton';
import { COLORS } from '../theme';

const ROLE_LABELS: Record<HarmonyRole, string> = {
  complementary: 'Complementary — the opposite, maximum pop',
  analogous: 'Analogous — neighbours, calm and harmonious',
  triadic: 'Triadic — balanced three-way contrast',
  contrast: 'Contrast — opposite hue, light-dark flipped',
};

const suggestionKey = (s: PaintSuggestion) => `${s.role}${s.angle}`;

function PaintRow({
  paint,
  onSelect,
  outsideFilters,
  highlighted,
}: {
  paint: Paint;
  onSelect?: (paint: Paint) => void;
  outsideFilters?: boolean;
  highlighted?: boolean;
}) {
  const rowStyle = highlighted ? [pStyles.paintRow, pStyles.paintRowHighlighted] : pStyles.paintRow;
  const body = (
    <>
      <View style={[pStyles.swatch, { backgroundColor: paint.hex }]} />
      <View style={{ flex: 1 }}>
        <Text style={pStyles.paintName} numberOfLines={2}>
          {paint.name}
        </Text>
        <Text style={pStyles.paintCode}>
          {paint.brand} · {paint.code ? `${paint.code} · ` : ''}{paint.hex.toUpperCase()}
          {outsideFilters && <Text style={pStyles.outsideLabel}> · outside your filters</Text>}
        </Text>
      </View>
      <BuyButton paint={paint} compact />
    </>
  );
  if (!onSelect) return <View style={rowStyle}>{body}</View>;
  return (
    <TouchableOpacity style={rowStyle} onPress={() => onSelect(paint)}>
      {body}
    </TouchableOpacity>
  );
}

// CD-16: mini room-plan bar for one harmony group — the base colour
// dominant (as walls would be) with the group's suggested paints adjacent,
// so every goes-with type gets the same at-a-glance preview the 60-30-10
// scheme has. Tapping a suggestion segment highlights its row below.
function GroupBar({
  baseHex,
  items,
  highlightedKey,
  onSegmentPress,
}: {
  baseHex: string;
  items: PaintSuggestion[];
  highlightedKey: string | null;
  onSegmentPress: (key: string) => void;
}) {
  return (
    <View style={pStyles.schemeBar}>
      <View style={[pStyles.schemeSegment, { flex: 6, backgroundColor: baseHex }]} />
      {items.map(s => (
        <TouchableOpacity
          key={suggestionKey(s)}
          style={[
            pStyles.schemeSegment,
            { flex: 4 / items.length, backgroundColor: s.paint.hex },
            highlightedKey === suggestionKey(s) && pStyles.segmentHighlighted,
          ]}
          onPress={() => onSegmentPress(suggestionKey(s))}
          accessibilityRole="button"
          accessibilityLabel={`Highlight ${s.paint.name}`}
        />
      ))}
    </View>
  );
}

export default function PaletteIdeas({
  hex,
  view,
  candidates,
  onSelectPaint,
}: {
  hex: string;
  view?: { scheme: RoomScheme; suggestions: PaintSuggestion[] };
  candidates?: Paint[]; // the user's filtered paint pool (CD-15); full dataset when omitted
  onSelectPaint?: (paint: Paint) => void;
}) {
  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const [highlightedKey, setHighlightedKey] = useState<string | null>(null);
  const { scheme, suggestions } = useMemo(
    () => view ?? { scheme: roomScheme(rgb, candidates), suggestions: harmonySuggestions(rgb, candidates) },
    [rgb, view, candidates]
  );

  const byRole = useMemo(() => {
    const groups: { role: HarmonyRole; items: PaintSuggestion[] }[] = [];
    for (const s of suggestions) {
      const g = groups.find(x => x.role === s.role);
      if (g) g.items.push(s);
      else groups.push({ role: s.role, items: [s] });
    }
    return groups;
  }, [suggestions]);

  const parts = [
    { pct: '60%', hint: 'Walls', paint: scheme.main, flex: 6, outside: scheme.mainOutsideFilters },
    { pct: '30%', hint: 'Larger accents', paint: scheme.secondary, flex: 3, outside: scheme.secondaryOutsideFilters },
    { pct: '10%', hint: 'The pop', paint: scheme.accent, flex: 1, outside: scheme.accentOutsideFilters },
  ];

  return (
    <View style={pStyles.wrap}>
      <Text style={pStyles.sectionTitle}>60-30-10 room plan</Text>
      <View style={pStyles.schemeBar}>
        {parts.map(p => (
          <View
            key={p.pct}
            style={[pStyles.schemeSegment, { flex: p.flex, backgroundColor: p.paint.hex }]}
          />
        ))}
      </View>
      {parts.map(p => (
        <View key={p.pct} style={pStyles.schemeRow}>
          <Text style={pStyles.schemePct}>
            {p.pct} <Text style={pStyles.schemeHint}>{p.hint}</Text>
          </Text>
          <PaintRow paint={p.paint} onSelect={onSelectPaint} outsideFilters={p.outside} />
        </View>
      ))}
      {byRole.map(group => (
        <View key={group.role} style={{ marginTop: 12 }}>
          <Text style={pStyles.sectionTitle}>{ROLE_LABELS[group.role]}</Text>
          <GroupBar
            baseHex={hex}
            items={group.items}
            highlightedKey={highlightedKey}
            onSegmentPress={key => setHighlightedKey(cur => (cur === key ? null : key))}
          />
          {group.items.map(s => (
            <PaintRow
              key={suggestionKey(s)}
              paint={s.paint}
              onSelect={onSelectPaint}
              outsideFilters={s.outsideFilters}
              highlighted={highlightedKey === suggestionKey(s)}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const pStyles = StyleSheet.create({
  wrap: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
  },
  sectionTitle: {
    color: COLORS.text,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 6,
  },
  schemeBar: {
    flexDirection: 'row',
    height: 22,
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 8,
  },
  schemeSegment: { height: '100%' },
  schemeRow: { marginBottom: 4 },
  schemePct: {
    color: COLORS.textMuted,
    fontSize: 11,
    fontWeight: '800',
    marginBottom: 2,
  },
  schemeHint: { fontWeight: '400' },
  paintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  paintRowHighlighted: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 8,
  },
  segmentHighlighted: {
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.9)',
  },
  swatch: {
    width: 26,
    height: 26,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  paintName: { color: COLORS.text, fontSize: 13, fontWeight: '600' },
  paintCode: { color: COLORS.textMuted, fontSize: 11, marginTop: 1 },
  outsideLabel: { color: COLORS.accent, fontStyle: 'italic' },
});
