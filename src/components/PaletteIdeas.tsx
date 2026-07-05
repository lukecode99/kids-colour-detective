// Palette ideas for a saved colour: a 60-30-10 room plan plus
// complementary / analogous / triadic suggestions, every one mapped to a
// real paint (brand + code + swatch) — never a bare hex.
import React, { useMemo } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import { hexToRgb } from '../utils/colorMath';
import {
  harmonySuggestions,
  roomScheme,
  PaintSuggestion,
  HarmonyRole,
} from '../utils/colorHarmony';
import { Paint } from '../utils/paintMatcher';
import { COLORS } from '../theme';

const ROLE_LABELS: Record<HarmonyRole, string> = {
  complementary: 'Complementary — the opposite, maximum pop',
  analogous: 'Analogous — neighbours, calm and harmonious',
  triadic: 'Triadic — balanced three-way contrast',
};

function PaintRow({ paint }: { paint: Paint }) {
  return (
    <View style={pStyles.paintRow}>
      <View style={[pStyles.swatch, { backgroundColor: paint.hex }]} />
      <View style={{ flex: 1 }}>
        <Text style={pStyles.paintName} numberOfLines={1}>
          {paint.brand} — {paint.name}
        </Text>
        <Text style={pStyles.paintCode}>
          {paint.code ? `${paint.code} · ` : ''}{paint.hex.toUpperCase()}
        </Text>
      </View>
    </View>
  );
}

export default function PaletteIdeas({ hex }: { hex: string }) {
  const rgb = useMemo(() => hexToRgb(hex), [hex]);
  const scheme = useMemo(() => roomScheme(rgb), [rgb]);
  const suggestions = useMemo(() => harmonySuggestions(rgb), [rgb]);

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
          <PaintRow paint={p.paint} />
        </View>
      ))}
      {byRole.map(group => (
        <View key={group.role} style={{ marginTop: 12 }}>
          <Text style={pStyles.sectionTitle}>{ROLE_LABELS[group.role]}</Text>
          {group.items.map(s => (
            <PaintRow key={`${s.role}${s.angle}`} paint={s.paint} />
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
