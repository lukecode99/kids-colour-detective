// Saved tab: every colour the user has captured, with room labels and
// the goes-with palette expander. Extracted from CameraScreen when the
// app moved to tabbed navigation (CD-9).
import React, { useState, useEffect, useCallback } from 'react';
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

import PaletteIdeas from '../components/PaletteIdeas';
import {
  SavedColorEntry,
  loadSavedColors,
  addSavedColor,
  removeSavedColor,
  setSavedColorLabel,
} from '../utils/savedColors';
import { parseMatchLabel } from '../utils/matchLabel';
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

function SavedColorRow({
  sc,
  onRemove,
  onLabel,
}: {
  sc: SavedColorEntry;
  onRemove: (id: string) => void;
  onLabel: (id: string, label: string) => void;
}) {
  const [label, setLabel] = useState(sc.label ?? '');
  const [showIdeas, setShowIdeas] = useState(false);
  const commit = () => onLabel(sc.id, label);
  // Pre-CD-14 entries froze the match as one string — recover the parts so
  // the paint name gets its own full-width line on old cards too.
  const match = sc.bestMatch ?? (sc.match ? parseMatchLabel(sc.match) : undefined);
  return (
    <View style={styles.savedRow}>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        {sc.thumbnailUri ? (
          <Image source={{ uri: sc.thumbnailUri }} style={styles.savedThumb} />
        ) : (
          <View style={[styles.savedThumb, { backgroundColor: sc.hex }]} />
        )}
        <View style={[styles.savedSwatchBar, { backgroundColor: sc.hex }]} />
        <View style={{ flex: 1 }}>
          <Text style={{ color: COLORS.text, fontSize: 17, fontWeight: '700' }}>
            {sc.emoji} {sc.name}
          </Text>
          {match ? (
            <>
              <Text
                style={{ color: COLORS.text, fontSize: 13, fontWeight: '600', marginTop: 2 }}
                numberOfLines={2}
              >
                {match.name}
              </Text>
              <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 1 }}>
                {match.brand} · {match.pct}% match
              </Text>
            </>
          ) : (
            !!sc.match && (
              <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>
                {sc.match}
              </Text>
            )
          )}
          <Text style={{ color: COLORS.textMuted, fontSize: 11, marginTop: 1 }}>
            {sc.hex} · {formatTimestamp(sc.timestamp)}
          </Text>
          <TextInput
            style={styles.savedLabelInput}
            placeholder="Add room label…"
            placeholderTextColor="rgba(255,255,255,0.3)"
            value={label}
            onChangeText={setLabel}
            onBlur={commit}
            onSubmitEditing={commit}
            returnKeyType="done"
          />
          <TouchableOpacity onPress={() => setShowIdeas(v => !v)} hitSlop={{ top: 6, bottom: 6 }}>
            <Text style={styles.ideasToggle}>
              {showIdeas ? '▾' : '▸'} 🎨 Goes-with paints
            </Text>
          </TouchableOpacity>
        </View>
        <TouchableOpacity onPress={() => onRemove(sc.id)} style={styles.savedDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 16 }}>✕</Text>
        </TouchableOpacity>
      </View>
      {showIdeas && <PaletteIdeas hex={sc.hex} />}
    </View>
  );
}

export default function SavedScreen() {
  const { savedColors, remove, setLabel } = useSavedColors();
  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <View style={styles.savedHeader}>
          <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '800' }}>Saved Colours</Text>
        </View>
        {savedColors.length === 0 ? (
          <Text style={styles.savedEmpty}>
            Nothing saved yet — scan a wall in the Scan tab and tap 💾 to keep the colour here.
          </Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {savedColors.map(sc => (
              <SavedColorRow key={sc.id} sc={sc} onRemove={remove} onLabel={setLabel} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  savedHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, marginBottom: 16,
  },
  savedEmpty: {
    color: COLORS.textMuted, textAlign: 'center', marginTop: 40, fontSize: 16,
    paddingHorizontal: 32, lineHeight: 23,
  },
  savedRow: {
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  ideasToggle: { color: COLORS.accent, fontSize: 13, fontWeight: '700', marginTop: 8 },
  savedThumb: { width: 56, height: 56, borderRadius: 10 },
  savedSwatchBar: { width: 6, height: 56, borderRadius: 3, marginLeft: 6, marginRight: 12 },
  savedLabelInput: {
    color: COLORS.text, fontSize: 13, marginTop: 4,
    paddingVertical: 2, paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  savedDelete: { paddingLeft: 12, paddingVertical: 8 },
});
