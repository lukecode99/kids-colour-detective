// Palette ideas for a colour: a 60-30-10 room plan plus complementary /
// analogous / triadic suggestions, every one mapped to a real paint
// (brand + code + swatch) — never a bare hex. Callers that already hold
// a CombinedView pass its scheme/suggestions via `view`; otherwise the
// palette is computed here from `hex`.
import React, { useMemo } from 'react';
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
};

function PaintRow({ paint, onSelect }: { paint: Paint; onSelect?: (paint: Paint) => void }) {
  const body = (
    <>
      <View style={[pStyles.swatch, { backgroundColor: paint.hex }]} />
      <View style={{ flex: 1 }}>
        <Text style={pStyles.paintName} numberOfLines={1}>
          {paint.brand} — {paint.name}
        </Text>
        <Text style={pStyles.paintCode}>
          {paint.code ? `${paint.code} · ` : ''}{paint.hex.toUpperCase()}
        </Text>
      </View>
      <BuyButton paint={paint} compact />
    </>
  );
  if (!onSelect) return <View style={pStyles.paintRow}>{body}</View>;
  return (
    <TouchableOpacity style={pStyles.paintRow} onPress={() => onSelect(paint)}>
      {body}
    </TouchableOpacity>
  );
}

export default function PaletteIdeas({
  hex,
  view,
  onSelectPaint,
}: {
  hex: string;
  view?: { scheme: RoomScheme; suggestions: PaintSuggestion[] };
  onSelectPaint?: (paint: Paint) => void;
}) {
  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const { scheme, suggestions } = useMemo(
    () => view ?? { scheme: roomScheme(rgb), suggestions: harmonySuggestions(rgb) },
    [rgb, view]
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
    { pct: '60%', hint: 'Walls', paint: scheme.main, flex: 6 },
    { pct: '30%', hint: 'Larger accents', paint: scheme.secondary, flex: 3 },
    { pct: '10%', hint: 'The pop', paint: scheme.accent, flex: 1 },
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
          <PaintRow paint={p.paint} onSelect={onSelectPaint} />
        </View>
      ))}
      {byRole.map(group => (
        <View key={group.role} style={{ marginTop: 12 }}>
          <Text style={pStyles.sectionTitle}>{ROLE_LABELS[group.role]}</Text>
          {group.items.map(s => (
            <PaintRow key={`${s.role}${s.angle}`} paint={s.paint} onSelect={onSelectPaint} />
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
});
