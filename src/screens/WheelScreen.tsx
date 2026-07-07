// Colour wheel planner tab (CD-17): pick a primary colour on an HSL wheel
// instead of capturing one — no camera. The picked colour feeds the exact
// same pipeline as a scan: buildCombinedView gives the filtered matches,
// room scheme and goes-with groups, rendered with the shared components.
// CD-22: saved captures appear as markers on the wheel at their stored
// colour's hue/saturation position; tapping one names it.
// CD-23: a persisted display filter picks what the face shows — All,
// Saved colours only (chrome hidden, markers prominent), or Wheel only
// (no markers).
// CD-25: pinch-zoom + two-finger pan for fine-grained selection. Touches
// map through the viewport into content coordinates, so picking, markers
// and hit targets all transform together; +/− buttons cover the web.
import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  SafeAreaView,
  Platform,
  ScrollView,
  PanResponder,
  TouchableOpacity,
  Image,
} from 'react-native';

import { hslToRgb, rgbToHex, rgbToHsl, hexToRgb } from '../utils/colorMath';
import {
  pointToWheel,
  wheelToPoint,
  wheelPickToRgb,
  WheelPick,
  savedColourMarkers,
  hitMarker,
  SavedMarker,
} from '../utils/colourWheel';
import { buildCombinedView } from '../utils/combinedView';
import { getColorInfo } from '../utils/colorNames';
import { loadSavedColors, SavedColorEntry } from '../utils/savedColors';
import {
  WheelDisplayMode,
  WHEEL_DISPLAY_DEFAULT,
  WHEEL_DISPLAY_OPTIONS,
  markersVisible,
  wheelChromeVisible,
  allowsPick,
  showsEmptySavedHint,
  loadWheelDisplayMode,
  saveWheelDisplayMode,
} from '../utils/wheelDisplay';
import {
  WheelViewport,
  ZOOM_STEP,
  resetViewport,
  isZoomed,
  screenToContent,
  pinchViewport,
  panViewport,
} from '../utils/wheelZoom';
import { Paint } from '../utils/paintMatcher';
import PaletteIdeas from '../components/PaletteIdeas';
import CoverageCalculator from '../components/CoverageCalculator';
import {
  MatchList,
  FiltersPanel,
  FilterToggleLine,
  FilterEmptyNotice,
  usePaintFilters,
} from '../components/paintMatchUI';
import { COLORS } from '../theme';

const WHEEL_SIZE = 260;
const RADIUS = WHEEL_SIZE / 2;
const KNOB = 26;
// CD-24: saved-colour markers grew from 14px — easier to spot and tap,
// still clearly smaller than the knob.
const MARKER = 20;
const SLIDER_H = 28;
// Rebuilding matches + palette on every move event makes rapid drags
// stutter; the preview swatch tracks every event, the heavy recompute is
// throttled to this interval (and always runs on release).
const RECOMPUTE_MS = 150;

// Distance + midpoint of the first two touches, in wheel-local coordinates.
function pinchFrom(touches: { locationX: number; locationY: number }[]) {
  const [a, b] = touches;
  return {
    dist: Math.max(1, Math.hypot(a.locationX - b.locationX, a.locationY - b.locationY)),
    cx: (a.locationX + b.locationX) / 2,
    cy: (a.locationY + b.locationY) / 2,
  };
}

// The wheel face: reference dots at every 30° hue across three saturation
// rings (plus a neutral centre), all plain Views — no gradient/SVG deps.
function WheelDots() {
  const dots: { key: string; x: number; y: number; hex: string }[] = [];
  for (const s of [0.35, 0.65, 0.95]) {
    for (let h = 0; h < 360; h += 30) {
      const { x, y } = wheelToPoint(h, s, RADIUS);
      const [r, g, b] = hslToRgb(h, s, 0.5);
      dots.push({ key: `${h}-${s}`, x, y, hex: rgbToHex(r, g, b) });
    }
  }
  dots.push({ key: 'centre', x: RADIUS, y: RADIUS, hex: '#9E9E9E' });
  return (
    <>
      {dots.map(d => (
        <View
          key={d.key}
          pointerEvents="none"
          style={[styles.dot, { left: d.x - 9, top: d.y - 9, backgroundColor: d.hex }]}
        />
      ))}
    </>
  );
}

export default function WheelScreen() {
  const [pick, setPick] = useState<WheelPick>({ h: 210, s: 0.6 });
  const [lightness, setLightness] = useState(0.5);
  // The throttled copy that drives the expensive combined view.
  const [committed, setCommitted] = useState<{ pick: WheelPick; lightness: number }>({
    pick: { h: 210, s: 0.6 },
    lightness: 0.5,
  });
  const [showFilters, setShowFilters] = useState(false);
  const { filters, onToggle: onToggleFilter, candidates } = usePaintFilters();
  const scrollRef = useRef<ScrollView>(null);
  const lastRecompute = useRef(0);
  const latest = useRef({ pick, lightness });
  latest.current = { pick, lightness };

  // CD-22: saved captures as wheel markers. The tab unmounts when it loses
  // focus (App.tsx TabRoot), so loading on mount also refreshes after a
  // capture is saved or deleted elsewhere.
  const [savedColors, setSavedColors] = useState<SavedColorEntry[]>([]);
  const [activeMarker, setActiveMarker] = useState<SavedMarker | null>(null);
  useEffect(() => {
    loadSavedColors().then(setSavedColors);
  }, []);
  const markers = useMemo(() => savedColourMarkers(savedColors, RADIUS), [savedColors]);

  // CD-23: display filter — persisted like the paint filters, loaded once.
  const [displayMode, setDisplayMode] = useState<WheelDisplayMode>(WHEEL_DISPLAY_DEFAULT);
  useEffect(() => {
    loadWheelDisplayMode().then(setDisplayMode);
  }, []);
  const onSelectMode = useCallback((mode: WheelDisplayMode) => {
    setDisplayMode(mode);
    saveWheelDisplayMode(mode);
    setActiveMarker(null);
  }, []);

  // Only the markers the current mode actually shows are tappable — a
  // hidden marker must not swallow a wheel touch.
  const visibleMarkers = useMemo(
    () => (markersVisible(displayMode) ? markers : []),
    [displayMode, markers]
  );
  // The PanResponder is created once — it reads markers/mode through refs.
  const markersRef = useRef(visibleMarkers);
  markersRef.current = visibleMarkers;
  const modeRef = useRef(displayMode);
  modeRef.current = displayMode;

  const commit = useCallback((force: boolean) => {
    const now = Date.now();
    if (!force && now - lastRecompute.current < RECOMPUTE_MS) return;
    lastRecompute.current = now;
    setCommitted({ ...latest.current });
  }, []);

  // CD-25: zoom viewport. The responder is created once, so it reads the
  // viewport through a ref; the ref is written synchronously in the pinch
  // handler so successive move events within one frame compose correctly.
  const [viewport, setViewport] = useState<WheelViewport>(resetViewport());
  const viewportRef = useRef(viewport);
  viewportRef.current = viewport;
  const pinchRef = useRef<{ dist: number; cx: number; cy: number } | null>(null);
  const singlePanRef = useRef<{ x: number; y: number } | null>(null);
  const applyViewport = useCallback((vp: WheelViewport) => {
    viewportRef.current = vp;
    setViewport(vp);
  }, []);
  // The +/− buttons zoom about the wheel centre — the web fallback, and a
  // no-pinch alternative anywhere.
  const zoomBy = useCallback(
    (factor: number) =>
      applyViewport(pinchViewport(viewportRef.current, RADIUS, RADIUS, factor, WHEEL_SIZE)),
    [applyViewport]
  );
  const resetZoom = useCallback(() => applyViewport(resetViewport()), [applyViewport]);

  const wheelResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        // Two fingers zoom/pan (CD-25); one finger picks, as ever.
        if (evt.nativeEvent.touches.length >= 2) {
          pinchRef.current = pinchFrom(evt.nativeEvent.touches);
          return;
        }
        pinchRef.current = null;
        singlePanRef.current = null;
        const { locationX, locationY } = evt.nativeEvent;
        singlePanRef.current = { x: locationX, y: locationY };
        const c = screenToContent(locationX, locationY, viewportRef.current);
        // A touch on a saved-colour marker selects that capture's exact
        // colour (CD-26) — pick, slider and the committed view all follow,
        // same as tapping a goes-with paint. This runs before the CD-23
        // saved-only guard: a marker tap is an explicit selection, allowed
        // in every mode that shows markers.
        const marker = hitMarker(c.x, c.y, markersRef.current);
        setActiveMarker(marker);
        if (marker) {
          const next = { pick: { h: marker.h, s: marker.s }, lightness: marker.l };
          latest.current = next;
          setPick(next.pick);
          setLightness(next.lightness);
          setCommitted(next);
          return;
        }
        if (!allowsPick(modeRef.current)) return;
        latest.current.pick = pointToWheel(c.x, c.y, RADIUS);
        setPick(latest.current.pick);
        commit(false);
      },
      onPanResponderMove: evt => {
        const { touches } = evt.nativeEvent;
        if (touches.length >= 2) {
          const next = pinchFrom(touches);
          const prev = pinchRef.current;
          pinchRef.current = next;
          if (!prev) return; // second finger just landed — baseline only
          let vp = pinchViewport(
            viewportRef.current,
            prev.cx,
            prev.cy,
            next.dist / prev.dist,
            WHEEL_SIZE
          );
          vp = panViewport(vp, next.cx - prev.cx, next.cy - prev.cy, WHEEL_SIZE);
          applyViewport(vp);
          return;
        }
        // A finger just lifted off a pinch: swallow the leftover single
        // touch so the pick doesn't jump across the wheel.
        if (pinchRef.current) return;
        const { locationX, locationY } = evt.nativeEvent;
        if (isZoomed(viewportRef.current)) {
          const prev = singlePanRef.current;
          singlePanRef.current = { x: locationX, y: locationY };
          if (!prev) return;
          applyViewport(panViewport(viewportRef.current, locationX - prev.x, locationY - prev.y, WHEEL_SIZE));
          return;
        }
        singlePanRef.current = { x: locationX, y: locationY };
        if (!allowsPick(modeRef.current)) return;
        const c = screenToContent(locationX, locationY, viewportRef.current);
        latest.current.pick = pointToWheel(c.x, c.y, RADIUS);
        setPick(latest.current.pick);
        commit(false);
      },
      onPanResponderRelease: () => {
        singlePanRef.current = null;
        pinchRef.current = null;
        commit(true);
      },
      onPanResponderTerminate: () => {
        singlePanRef.current = null;
        pinchRef.current = null;
        commit(true);
      },
    })
  ).current;

  const sliderWidth = useRef(1);
  const sliderTo = useCallback((x: number) => {
    const l = Math.min(0.95, Math.max(0.05, x / sliderWidth.current));
    latest.current.lightness = l;
    setLightness(l);
  }, []);
  const sliderResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: evt => {
        sliderTo(evt.nativeEvent.locationX);
        commit(false);
      },
      onPanResponderMove: evt => {
        sliderTo(evt.nativeEvent.locationX);
        commit(false);
      },
      onPanResponderRelease: () => commit(true),
      onPanResponderTerminate: () => commit(true),
    })
  ).current;

  // Live preview follows every touch event (cheap).
  const rgb = wheelPickToRgb(pick, lightness);
  const hex = rgbToHex(rgb[0], rgb[1], rgb[2]);
  const name = getColorInfo(rgb[0], rgb[1], rgb[2], true).name;
  const knobAt = wheelToPoint(pick.h, pick.s, RADIUS);

  // Matches + goes-with follow the throttled copy — the same call the
  // camera path makes for a scanned colour.
  const view = useMemo(() => {
    const committedRgb = wheelPickToRgb(committed.pick, committed.lightness);
    return buildCombinedView(committedRgb, candidates);
  }, [committed, candidates]);
  const committedHex = rgbToHex(...wheelPickToRgb(committed.pick, committed.lightness));

  // Tapping a goes-with paint re-centres the wheel on it.
  const onSelectPaint = useCallback((paint: Paint) => {
    const [r, g, b] = hexToRgb(paint.hex);
    const [h, s, l] = rgbToHsl(r, g, b);
    const next = { pick: { h, s }, lightness: l };
    latest.current = next;
    setPick(next.pick);
    setLightness(next.lightness);
    setCommitted(next);
    scrollRef.current?.scrollTo({ y: 0, animated: true });
  }, []);

  const lightnessStops = [0.15, 0.3, 0.45, 0.6, 0.75, 0.9];

  return (
    <View style={styles.container}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <ScrollView ref={scrollRef} keyboardShouldPersistTaps="handled">
          <View style={styles.header}>
            <Text style={styles.headerTitle}>Colour Planner</Text>
          </View>
          <Text style={styles.hint}>
            Drag around the wheel to pick a colour — no camera needed.
          </Text>

          {/* CD-23: what the wheel face shows. */}
          <View style={styles.modeRow}>
            {WHEEL_DISPLAY_OPTIONS.map(o => (
              <TouchableOpacity
                key={o.mode}
                style={[styles.modeChip, displayMode === o.mode && styles.modeChipActive]}
                onPress={() => onSelectMode(o.mode)}
              >
                <Text
                  style={[
                    styles.modeChipText,
                    displayMode === o.mode && styles.modeChipTextActive,
                  ]}
                >
                  {o.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.wheelWrap}>
            <View
              style={[styles.wheel, displayMode === 'saved' && styles.wheelDimmed]}
              {...wheelResponder.panHandlers}
            >
              {/* CD-25: everything on the face lives in this pane so dots,
                  markers and knob transform together. RN scales about the
                  view centre, so the translation is adjusted to make the
                  maths act about the top-left corner, matching wheelZoom. */}
              <View
                pointerEvents="none"
                style={{
                  width: WHEEL_SIZE,
                  height: WHEEL_SIZE,
                  transform: [
                    { translateX: viewport.tx - RADIUS * (1 - viewport.scale) },
                    { translateY: viewport.ty - RADIUS * (1 - viewport.scale) },
                    { scale: viewport.scale },
                  ],
                }}
              >
                {wheelChromeVisible(displayMode) && <WheelDots />}
                {visibleMarkers.map(m => (
                  <View
                    key={m.id}
                    pointerEvents="none"
                    style={[
                      styles.marker,
                      { left: m.x - MARKER / 2, top: m.y - MARKER / 2, backgroundColor: m.hex },
                      activeMarker?.id === m.id && styles.markerActive,
                    ]}
                  />
                ))}
                {wheelChromeVisible(displayMode) && (
                  <View
                    pointerEvents="none"
                    style={[
                      styles.knob,
                      { left: knobAt.x - KNOB / 2, top: knobAt.y - KNOB / 2, backgroundColor: hex },
                    ]}
                  />
                )}
              </View>
            </View>
            {/* CD-25: pinch on device; buttons everywhere (web fallback). */}
            <View style={styles.zoomRow}>
              <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(1 / ZOOM_STEP)}>
                <Text style={styles.zoomBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.zoomLevel}>{viewport.scale.toFixed(1)}×</Text>
              <TouchableOpacity style={styles.zoomBtn} onPress={() => zoomBy(ZOOM_STEP)}>
                <Text style={styles.zoomBtnText}>+</Text>
              </TouchableOpacity>
              {isZoomed(viewport) && (
                <TouchableOpacity style={styles.zoomReset} onPress={resetZoom}>
                  <Text style={styles.zoomResetText}>Reset</Text>
                </TouchableOpacity>
              )}
            </View>
            {showsEmptySavedHint(displayMode, markers.length) && (
              <Text style={styles.savedEmptyHint}>
                No saved colours yet — scan or pick a colour and save it to see it here.
              </Text>
            )}
            {/* CD-24: the tapped capture's own photo, not just the swatch.
                Pre-thumbnail saves fall back to a swatch block. */}
            {activeMarker && (
              <View style={styles.markerCard}>
                {activeMarker.thumbnailUri ? (
                  <Image
                    source={{ uri: activeMarker.thumbnailUri }}
                    style={styles.markerPhoto}
                  />
                ) : (
                  <View
                    style={[styles.markerPhoto, { backgroundColor: activeMarker.hex }]}
                  />
                )}
                <View style={{ flex: 1 }}>
                  <Text style={styles.markerInfo}>📍 {activeMarker.name}</Text>
                  <Text style={styles.markerHex}>{activeMarker.hex.toUpperCase()}</Text>
                </View>
              </View>
            )}
          </View>

          <View style={styles.sliderRow}>
            <Text style={styles.sliderLabel} numberOfLines={1}>Darker</Text>
            <View
              style={styles.slider}
              onLayout={e => {
                sliderWidth.current = e.nativeEvent.layout.width || 1;
              }}
              {...sliderResponder.panHandlers}
            >
              {lightnessStops.map(l => {
                const [r, g, b] = hslToRgb(pick.h, pick.s, l);
                return (
                  <View
                    key={l}
                    pointerEvents="none"
                    style={{ flex: 1, backgroundColor: rgbToHex(r, g, b) }}
                  />
                );
              })}
              <View
                pointerEvents="none"
                style={[styles.sliderThumb, { left: `${lightness * 100}%` }]}
              />
            </View>
            <Text style={styles.sliderLabel} numberOfLines={1}>Lighter</Text>
          </View>

          <View style={styles.previewCard}>
            <View style={[styles.previewSwatch, { backgroundColor: hex }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.previewName}>{name}</Text>
              <Text style={styles.previewHex}>{hex.toUpperCase()}</Text>
            </View>
          </View>

          <FilterToggleLine
            filters={filters}
            candidateCount={candidates.length}
            expanded={showFilters}
            onPress={() => setShowFilters(s => !s)}
          />
          {showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilter} />}
          {candidates.length === 0 ? <FilterEmptyNotice /> : <MatchList matches={view.matches} />}
          <View style={styles.goesWith}>
            <Text style={styles.goesWithTitle}>🎨 Goes with</Text>
            <Text style={styles.goesWithHint}>
              Scheme ideas built around this colour — tap a paint to explore it.
            </Text>
            <PaletteIdeas
              hex={committedHex}
              view={{ scheme: view.scheme, suggestions: view.suggestions }}
              onSelectPaint={onSelectPaint}
            />
          </View>

          {/* CD-21: the paint-quantity calculator lives here as its own
              section — it used to be an accordion on every capture card.
              The top match only supplies the buy link. */}
          <View style={styles.calcSection}>
            <CoverageCalculator paint={view.matches[0]?.paint} />
          </View>
        </ScrollView>
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
  // CD-23 display-mode chips, same visual language as the paint-filter chips.
  modeRow: {
    flexDirection: 'row', justifyContent: 'center',
    paddingHorizontal: 20, marginBottom: 12, gap: 8,
  },
  modeChip: {
    paddingHorizontal: 14, paddingVertical: 6, borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  modeChipActive: { backgroundColor: COLORS.accent, borderColor: COLORS.accent },
  modeChipText: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  modeChipTextActive: { color: '#fff' },
  wheelWrap: { alignItems: 'center', marginBottom: 14 },
  wheel: {
    width: WHEEL_SIZE, height: WHEEL_SIZE, borderRadius: RADIUS,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
    overflow: 'hidden', // CD-25: the zoomed pane clips to the wheel circle
  },
  // Saved-only mode: the face recedes so the markers carry the tab.
  wheelDimmed: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderColor: 'rgba(255,255,255,0.08)',
  },
  savedEmptyHint: {
    color: COLORS.textMuted, fontSize: 13, marginTop: 8,
    textAlign: 'center', paddingHorizontal: 32,
  },
  dot: {
    position: 'absolute', width: 18, height: 18, borderRadius: 9,
    borderWidth: StyleSheet.hairlineWidth, borderColor: 'rgba(0,0,0,0.3)',
  },
  knob: {
    position: 'absolute', width: KNOB, height: KNOB, borderRadius: KNOB / 2,
    borderWidth: 3, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 4, shadowOffset: { width: 0, height: 1 },
    elevation: 4,
  },
  // Saved-capture markers (CD-22, enlarged CD-24): smaller than the knob,
  // white-ringed so they read as "yours" against the borderless reference dots.
  marker: {
    position: 'absolute', width: MARKER, height: MARKER, borderRadius: MARKER / 2,
    borderWidth: 2, borderColor: '#fff',
    shadowColor: '#000', shadowOpacity: 0.35, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
    elevation: 3,
  },
  markerActive: { borderColor: COLORS.accent, transform: [{ scale: 1.3 }] },
  // CD-24: tapped-marker detail — the capture's photo beside its name/hex.
  markerCard: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, marginHorizontal: 20, alignSelf: 'stretch',
    padding: 10, borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  markerPhoto: {
    width: 72, height: 72, borderRadius: 10, marginRight: 12,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  markerInfo: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  markerHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 2 },
  // CD-25 zoom controls.
  zoomRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    marginTop: 10, gap: 10,
  },
  zoomBtn: {
    width: 34, height: 34, borderRadius: 17,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  zoomBtnText: { color: COLORS.text, fontSize: 18, fontWeight: '700', lineHeight: 20 },
  zoomLevel: {
    color: COLORS.textMuted, fontSize: 13, fontWeight: '700',
    width: 44, textAlign: 'center',
  },
  zoomReset: {
    paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16,
    backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
  },
  zoomResetText: { color: COLORS.text, fontSize: 13, fontWeight: '700' },
  sliderRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, marginBottom: 14,
  },
  sliderLabel: { color: COLORS.textMuted, fontSize: 11, fontWeight: '700', flexShrink: 0, textAlign: 'center' },
  slider: {
    flex: 1, height: SLIDER_H, borderRadius: SLIDER_H / 2, overflow: 'hidden',
    flexDirection: 'row', marginHorizontal: 4,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  sliderThumb: {
    position: 'absolute', top: 2, bottom: 2, width: 4, marginLeft: -2,
    borderRadius: 2, backgroundColor: '#fff',
  },
  previewCard: {
    flexDirection: 'row', alignItems: 'center',
    marginHorizontal: 20, marginBottom: 12,
    padding: 12, borderRadius: 14,
    backgroundColor: COLORS.surface,
  },
  previewSwatch: {
    width: 52, height: 52, borderRadius: 10, marginRight: 14,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)',
  },
  previewName: { color: COLORS.text, fontSize: 20, fontWeight: '800', letterSpacing: -0.3 },
  previewHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 2 },
  goesWith: { paddingHorizontal: 20, marginTop: 8 },
  calcSection: { paddingHorizontal: 20, paddingBottom: 24, marginTop: 4 },
  goesWithTitle: { color: COLORS.text, fontSize: 16, fontWeight: '800' },
  goesWithHint: { color: COLORS.textMuted, fontSize: 12, marginTop: 2, marginBottom: 4 },
});
