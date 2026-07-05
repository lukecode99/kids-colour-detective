// Shared paint-matching UI: top-5 match list, filter chips, and the
// persisted-filters hook. Used by the live camera screens and the photo
// pinpoint picker so both feed the same matching flow.
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ScrollView } from 'react-native';

import { PaintMatch, PAINTS } from '../utils/paintMatcher';
import {
  PaintFilters,
  EMPTY_FILTERS,
  applyFilters,
  toggleFilter,
  loadFilters,
  saveFilters,
  BRAND_OPTIONS,
  SURFACE_OPTIONS,
  FINISH_OPTIONS,
} from '../utils/filters';
import { COLORS } from '../theme';

export function bestMatchLabel(matches: PaintMatch[]): string {
  const m = matches[0];
  return m ? `${m.paint.brand} — ${m.paint.name} (${m.matchPercent}%)` : '';
}

// Shared top-5 list rendered in paint mode on both platforms.
export function MatchList({ matches }: { matches: PaintMatch[] }) {
  if (!matches.length) return null;
  return (
    <View style={styles.matchList}>
      {matches.map((m, i) => (
        <View key={`${m.paint.brand}-${m.paint.name}-${i}`} style={styles.matchListRow}>
          <View style={[styles.matchListSwatch, { backgroundColor: m.paint.hex }]} />
          <Text style={styles.matchListName} numberOfLines={1}>
            {m.paint.brand} · {m.paint.name}
          </Text>
          <Text style={styles.matchListPct}>
            {m.matchPercent}% · {m.closeness}
          </Text>
        </View>
      ))}
    </View>
  );
}

const FILTER_GROUPS: { key: keyof PaintFilters; label: string; options: string[] }[] = [
  { key: 'brands', label: 'Brand', options: BRAND_OPTIONS },
  { key: 'surfaces', label: 'Surface', options: SURFACE_OPTIONS },
  { key: 'finishes', label: 'Finish', options: FINISH_OPTIONS },
];

export function activeFilterCount(filters: PaintFilters): number {
  return filters.brands.length + filters.surfaces.length + filters.finishes.length;
}

// Chip rows for brand / surface / finish, shared by both platforms.
export function FiltersPanel({
  filters,
  onToggle,
}: {
  filters: PaintFilters;
  onToggle: (group: keyof PaintFilters, value: string) => void;
}) {
  return (
    <View style={styles.filterPanel}>
      {FILTER_GROUPS.map(g => (
        <View key={g.key} style={styles.filterGroupRow}>
          <Text style={styles.filterGroupLabel}>{g.label}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {g.options.map(opt => {
              const active = filters[g.key].includes(opt);
              return (
                <TouchableOpacity
                  key={opt}
                  style={[styles.filterChip, active && styles.filterChipActive]}
                  onPress={() => onToggle(g.key, opt)}
                >
                  <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>
                    {opt}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      ))}
    </View>
  );
}

// "▾ Filters (2) · 812 paints" expander line.
export function FilterToggleLine({
  filters,
  candidateCount,
  expanded,
  onPress,
}: {
  filters: PaintFilters;
  candidateCount: number;
  expanded: boolean;
  onPress: () => void;
}) {
  const n = activeFilterCount(filters);
  return (
    <TouchableOpacity style={styles.filterToggleRow} onPress={onPress}>
      <Text style={styles.filterToggleText}>
        {expanded ? '▾' : '▸'} Filters
        {n > 0 ? ` (${n})` : ''} · {candidateCount} paints
      </Text>
    </TouchableOpacity>
  );
}

export function FilterEmptyNotice() {
  return <Text style={styles.filterEmptyText}>No paints match these filters</Text>;
}

// Loads persisted filters once and saves on every change.
export function usePaintFilters() {
  const [filters, setFilters] = useState<PaintFilters>(EMPTY_FILTERS);

  useEffect(() => {
    loadFilters().then(setFilters);
  }, []);

  const onToggle = useCallback((group: keyof PaintFilters, value: string) => {
    setFilters(f => {
      const next = toggleFilter(f, group, value);
      saveFilters(next);
      return next;
    });
  }, []);

  const candidates = useMemo(() => applyFilters(PAINTS, filters), [filters]);

  return { filters, onToggle, candidates };
}

const styles = StyleSheet.create({
  filterToggleRow: { paddingHorizontal: 24, paddingBottom: 6 },
  filterToggleText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  filterPanel: { paddingBottom: 8 },
  filterGroupRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingLeft: 20, paddingVertical: 3,
  },
  filterGroupLabel: {
    color: COLORS.textMuted, fontSize: 11, fontWeight: '700',
    width: 56, textTransform: 'uppercase', letterSpacing: 0.5,
  },
  filterChip: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)', marginRight: 6,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.2)',
  },
  filterChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  filterChipText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600' },
  filterChipTextActive: { color: '#fff' },
  filterEmptyText: {
    color: COLORS.textMuted, fontSize: 13, fontWeight: '600',
    paddingHorizontal: 20, paddingVertical: 8,
  },

  matchList: { paddingHorizontal: 20, paddingBottom: 8 },
  matchListRow: {
    flexDirection: 'row', alignItems: 'center', paddingVertical: 4,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  matchListSwatch: {
    width: 18, height: 18, borderRadius: 4, marginRight: 10,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(255,255,255,0.25)',
  },
  matchListName: { flex: 1, color: COLORS.text, fontSize: 13, fontWeight: '600' },
  matchListPct: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginLeft: 8 },
});
