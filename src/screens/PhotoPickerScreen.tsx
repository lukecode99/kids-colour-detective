import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Image,
  SafeAreaView,
  Platform,
  PanResponder,
  ScrollView,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';

// Native-only module, so the require stays guarded for the web bundle.
let ImageManipulator: any = null;
if (Platform.OS !== 'web') {
  ImageManipulator = require('expo-image-manipulator');
}

import { getColorInfo, ColorInfo } from '../utils/colorNames';
import { matchPaintsLab, PaintMatch, Paint } from '../utils/paintMatcher';
import { rgbToLab } from '../utils/colorMath';
import { addSavedColor, newSavedColorId } from '../utils/savedColors';
import { bestMatchInfo } from '../utils/matchLabel';
import { sampleMedianAt } from '../utils/photoPixels';
import {
  Rgb,
  ViewTransform,
  containFit,
  displayToImageCoords,
  clampTransform,
  MIN_ZOOM,
  MAX_ZOOM,
} from '../utils/photoSample';
import {
  MatchList,
  FiltersPanel,
  FilterToggleLine,
  FilterEmptyNotice,
  usePaintFilters,
  bestMatchLabel,
} from '../components/paintMatchUI';
import { setCurrentColour } from '../utils/currentColour';
import { COLORS } from '../theme';

const LOUPE_SIZE = 120;
const LOUPE_MAG = 3; // extra magnification on top of the current zoom
const ZOOM_STEP = 1.5;

interface PickedPhoto {
  uri: string;
  width: number;
  height: number;
}

interface SampleResult {
  rgb: Rgb;
  info: ColorInfo;
  matches: PaintMatch[];
  coords: { x: number; y: number }; // image-pixel position of the pick, for the thumbnail crop
}

// Square crop around the picked pixel, shrunk to thumbnail size — so the
// saved card shows the actual patch of wall, like the camera save does.
// Returns undefined on any failure; the entry still saves without a photo.
async function makeThumbnail(
  photo: PickedPhoto,
  ix: number,
  iy: number
): Promise<string | undefined> {
  const size = Math.max(48, Math.round(Math.min(photo.width, photo.height) * 0.25));
  const originX = Math.round(Math.min(Math.max(ix - size / 2, 0), photo.width - size));
  const originY = Math.round(Math.min(Math.max(iy - size / 2, 0), photo.height - size));
  if (Platform.OS === 'web') {
    // savedColors keeps data URLs as-is on web.
    return new Promise(resolve => {
      const img = new (globalThis as any).Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = 96;
          c.height = 96;
          const ctx = c.getContext('2d');
          if (!ctx) return resolve(undefined);
          ctx.drawImage(img, originX, originY, size, size, 0, 0, 96, 96);
          resolve(c.toDataURL('image/jpeg', 0.7));
        } catch {
          resolve(undefined);
        }
      };
      img.onerror = () => resolve(undefined);
      img.src = photo.uri;
    });
  }
  const t = await ImageManipulator.manipulateAsync(
    photo.uri,
    [{ crop: { originX, originY, width: size, height: size } }, { resize: { width: 96 } }],
    { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
  );
  return t.uri;
}

// Circular magnifier centred over the image pixel (ix, iy). Renders the
// full photo scaled so that pixel sits under the crosshair dot.
function Loupe({
  photo,
  ix,
  iy,
  left,
  top,
  magScale,
}: {
  photo: PickedPhoto;
  ix: number;
  iy: number;
  left: number;
  top: number;
  magScale: number; // magnified view px per image px
}) {
  const half = LOUPE_SIZE / 2;
  return (
    <View style={[styles.loupe, { left, top }]} pointerEvents="none">
      <Image
        source={{ uri: photo.uri }}
        style={{
          position: 'absolute',
          width: photo.width * magScale,
          height: photo.height * magScale,
          left: half - ix * magScale,
          top: half - iy * magScale,
        }}
        resizeMode="stretch"
      />
      <View style={styles.loupeDot} />
    </View>
  );
}

export default function PhotoPickerScreen({ onClose }: { onClose: () => void }) {
  const [photo, setPhoto] = useState<PickedPhoto | null>(null);
  const [viewSize, setViewSize] = useState({ w: 0, h: 0 });
  const [transform, setTransform] = useState<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
  // Last committed tap (display coords) — the loupe/crosshair anchor.
  const [tapPos, setTapPos] = useState<{ px: number; py: number } | null>(null);
  // Finger position while dragging the loupe, before release commits it.
  const [dragPos, setDragPos] = useState<{ px: number; py: number } | null>(null);
  const [sample, setSample] = useState<SampleResult | null>(null);
  const [sampling, setSampling] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [pickError, setPickError] = useState<string | null>(null);
  const { filters, onToggle: onToggleFilter, candidates } = usePaintFilters();

  // Refs mirror state the PanResponder callbacks need (created once).
  const photoRef = useRef<PickedPhoto | null>(null);
  const viewRef = useRef({ w: 0, h: 0 });
  const transformRef = useRef<ViewTransform>({ scale: 1, tx: 0, ty: 0 });
  const candidatesRef = useRef<Paint[]>(candidates);
  const pinchRef = useRef<{
    dist: number;
    scale: number;
    tx: number;
    ty: number;
    mx: number;
    my: number;
  } | null>(null);

  photoRef.current = photo;
  viewRef.current = viewSize;
  transformRef.current = transform;
  candidatesRef.current = candidates;

  const pickPhoto = useCallback(async () => {
    try {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'] as any,
        quality: 1,
        allowsEditing: false,
        exif: false,
      });
      if (result.canceled || !result.assets?.length) {
        if (!photoRef.current) onClose();
        return;
      }
      const asset = result.assets[0];
      setPhoto({ uri: asset.uri, width: asset.width, height: asset.height });
      setTransform({ scale: 1, tx: 0, ty: 0 });
      setTapPos(null);
      setDragPos(null);
      setSample(null);
      setPickError(null);
    } catch (e: any) {
      setPickError(e?.message || 'Could not open the photo library');
    }
  }, [onClose]);

  useEffect(() => {
    pickPhoto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sampleAt = useCallback(async (px: number, py: number) => {
    const p = photoRef.current;
    const vs = viewRef.current;
    if (!p || !vs.w || !vs.h) return;
    const coords = displayToImageCoords(px, py, vs.w, vs.h, p.width, p.height, transformRef.current);
    if (!coords) return;
    setTapPos({ px, py });
    setSampling(true);
    try {
      const rgb = await sampleMedianAt(p.uri, p.width, p.height, coords.x, coords.y);
      const [r, g, b] = rgb;
      const info = getColorInfo(r, g, b, true);
      setSample({
        rgb,
        info,
        matches: matchPaintsLab(rgbToLab(r, g, b), 5, candidatesRef.current),
        coords: { x: coords.x, y: coords.y },
      });
      setCurrentColour({ rgb, hex: info.hex, name: info.name });
    } catch {
      // keep the previous sample; the loupe still shows where they tapped
    } finally {
      setSampling(false);
    }
  }, []);

  // CD-19: the current scan no longer renders in My Colours, so the photo
  // flow saves from here — same entry shape as the camera's tap-to-save.
  const [savedHex, setSavedHex] = useState<string | null>(null);
  const saveSample = useCallback(async () => {
    const s = sample;
    const p = photoRef.current;
    if (!s) return;
    let thumb: string | undefined;
    try {
      if (p) thumb = await makeThumbnail(p, s.coords.x, s.coords.y);
    } catch {}
    const [r, g, b] = s.rgb;
    addSavedColor(
      {
        id: newSavedColorId(),
        hex: s.info.hex,
        rgb: s.rgb,
        lab: rgbToLab(r, g, b),
        name: s.info.name,
        emoji: s.info.emoji,
        match: bestMatchLabel(s.matches),
        bestMatch: bestMatchInfo(s.matches),
        timestamp: Date.now(),
      },
      thumb
    );
    setSavedHex(s.info.hex);
  }, [sample]);

  // Re-run the match when filters change so the list follows the chips.
  useEffect(() => {
    setSample(s =>
      s
        ? { ...s, matches: matchPaintsLab(rgbToLab(s.rgb[0], s.rgb[1], s.rgb[2]), 5, candidates) }
        : s
    );
  }, [candidates]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderMove: evt => {
        const touches = evt.nativeEvent.touches;
        const vs = viewRef.current;
        if (touches.length >= 2) {
          // Pinch: zoom around the midpoint, panning with it as it moves.
          const [a, b] = touches;
          const dist = Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY) || 1;
          const mx = (a.locationX + b.locationX) / 2;
          const my = (a.locationY + b.locationY) / 2;
          if (!pinchRef.current) {
            const t = transformRef.current;
            pinchRef.current = { dist, scale: t.scale, tx: t.tx, ty: t.ty, mx, my };
            setDragPos(null);
            return;
          }
          const s0 = pinchRef.current;
          const factor = dist / s0.dist;
          const cx = vs.w / 2;
          const cy = vs.h / 2;
          // Keep the image point that started under the pinch midpoint under
          // the (possibly moved) midpoint: t1 = m1 − c − (m0 − c − t0)·factor
          const next = clampTransform(
            {
              scale: s0.scale * factor,
              tx: mx - cx - (s0.mx - cx - s0.tx) * factor,
              ty: my - cy - (s0.my - cy - s0.ty) * factor,
            },
            vs.w,
            vs.h
          );
          setTransform(next);
        } else if (touches.length === 1 && !pinchRef.current) {
          // Single finger: drag the loupe; sampling happens on release.
          const t = touches[0];
          setDragPos({ px: t.locationX, py: t.locationY });
        }
      },
      onPanResponderRelease: evt => {
        if (pinchRef.current) {
          pinchRef.current = null;
          setDragPos(null);
          return;
        }
        setDragPos(null);
        sampleAt(evt.nativeEvent.locationX, evt.nativeEvent.locationY);
      },
      onPanResponderTerminate: () => {
        pinchRef.current = null;
        setDragPos(null);
      },
    })
  ).current;

  const zoomBy = useCallback((factor: number) => {
    const vs = viewRef.current;
    setTransform(t =>
      clampTransform({ scale: t.scale * factor, tx: t.tx, ty: t.ty }, vs.w, vs.h)
    );
  }, []);

  if (pickError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.errorTitle}>🖼 Photo Library</Text>
        <Text style={styles.errorText}>{pickError}</Text>
        <TouchableOpacity style={styles.errorButton} onPress={pickPhoto}>
          <Text style={styles.errorButtonText}>Try again</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onClose} style={{ marginTop: 16 }}>
          <Text style={{ color: COLORS.textMuted, fontSize: 15 }}>Back to camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // Loupe geometry: follows the finger while dragging, otherwise sits on the
  // last tap. Hidden when the point falls outside the photo.
  const loupeAnchor = dragPos ?? tapPos;
  let loupeNode: React.ReactNode = null;
  let crosshairNode: React.ReactNode = null;
  if (photo && loupeAnchor && viewSize.w > 0) {
    const coords = displayToImageCoords(
      loupeAnchor.px,
      loupeAnchor.py,
      viewSize.w,
      viewSize.h,
      photo.width,
      photo.height,
      transform
    );
    if (coords) {
      const fit = containFit(photo.width, photo.height, viewSize.w, viewSize.h);
      const magScale = fit.scale * transform.scale * LOUPE_MAG;
      // Above the finger when there's room, below near the top edge.
      const rawTop = loupeAnchor.py - LOUPE_SIZE - 28;
      const top = rawTop < 8 ? loupeAnchor.py + 28 : rawTop;
      const left = Math.max(8, Math.min(viewSize.w - LOUPE_SIZE - 8, loupeAnchor.px - LOUPE_SIZE / 2));
      loupeNode = (
        <Loupe photo={photo} ix={coords.x} iy={coords.y} left={left} top={top} magScale={magScale} />
      );
      crosshairNode = (
        <View
          style={[styles.tapRing, { left: loupeAnchor.px - 12, top: loupeAnchor.py - 12 }]}
          pointerEvents="none"
        />
      );
    }
  }

  return (
    <View style={styles.container}>
      <SafeAreaView style={styles.topBar}>
        <TouchableOpacity onPress={onClose} style={styles.topBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
          <Text style={styles.topBtnText}>←</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={pickPhoto} style={styles.choosePill}>
          <Text style={styles.choosePillText}>🖼 Choose photo</Text>
        </TouchableOpacity>
        <View style={styles.zoomGroup}>
          <TouchableOpacity
            onPress={() => zoomBy(1 / ZOOM_STEP)}
            style={styles.topBtn}
            disabled={transform.scale <= MIN_ZOOM}
          >
            <Text style={[styles.topBtnText, transform.scale <= MIN_ZOOM && styles.topBtnDisabled]}>−</Text>
          </TouchableOpacity>
          <Text style={styles.zoomLabel}>{transform.scale.toFixed(1)}×</Text>
          <TouchableOpacity
            onPress={() => zoomBy(ZOOM_STEP)}
            style={styles.topBtn}
            disabled={transform.scale >= MAX_ZOOM}
          >
            <Text style={[styles.topBtnText, transform.scale >= MAX_ZOOM && styles.topBtnDisabled]}>+</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View
        style={styles.imageArea}
        onLayout={e => {
          const { width, height } = e.nativeEvent.layout;
          setViewSize({ w: width, h: height });
        }}
        {...panResponder.panHandlers}
      >
        {photo && viewSize.w > 0 && (
          <View
            style={{
              width: viewSize.w,
              height: viewSize.h,
              transform: [
                { translateX: transform.tx },
                { translateY: transform.ty },
                { scale: transform.scale },
              ],
            }}
            pointerEvents="none"
          >
            <Image
              source={{ uri: photo.uri }}
              style={{ width: viewSize.w, height: viewSize.h }}
              resizeMode="contain"
            />
          </View>
        )}
        {crosshairNode}
        {loupeNode}
        {photo && !tapPos && !dragPos && (
          <View style={styles.hintWrap} pointerEvents="none">
            <Text style={styles.hintText}>Tap the photo to pinpoint a colour · pinch or +/− to zoom</Text>
          </View>
        )}
      </View>

      <View style={styles.bottomPanel}>
        <View style={[styles.swatchStrip, { backgroundColor: sample?.info.hex ?? '#333' }]} />
        <ScrollView bounces={false} style={styles.bottomScroll}>
          {sample ? (
            <View style={styles.colorRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.colorName}>
                  {sample.info.emoji} {sample.info.name}
                </Text>
                <Text style={styles.colorHex}>
                  {sample.info.hex} · rgb({sample.rgb[0]}, {sample.rgb[1]}, {sample.rgb[2]})
                </Text>
              </View>
              {sampling && <Text style={styles.samplingText}>…</Text>}
              <TouchableOpacity
                style={[styles.saveBtn, savedHex === sample.info.hex && styles.saveBtnDone]}
                onPress={saveSample}
                disabled={savedHex === sample.info.hex}
              >
                <Text style={styles.saveBtnText}>
                  {savedHex === sample.info.hex ? '✓ Saved' : '💾 Save'}
                </Text>
              </TouchableOpacity>
            </View>
          ) : (
            <Text style={styles.emptyText}>
              {photo ? 'No spot picked yet' : 'Pick a photo to get started'}
            </Text>
          )}
          <FilterToggleLine
            filters={filters}
            candidateCount={candidates.length}
            expanded={showFilters}
            onPress={() => setShowFilters(s => !s)}
          />
          {showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilter} />}
          {candidates.length === 0 ? (
            <FilterEmptyNotice />
          ) : (
            sample && <MatchList matches={sample.matches} />
          )}
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.bg },
  centered: {
    flex: 1, backgroundColor: COLORS.bg,
    alignItems: 'center', justifyContent: 'center', padding: 32,
  },
  errorTitle: { color: COLORS.text, fontSize: 24, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  errorText: { color: COLORS.textMuted, fontSize: 15, textAlign: 'center', marginBottom: 20 },
  errorButton: { backgroundColor: COLORS.accent, paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  errorButtonText: { color: COLORS.text, fontSize: 15, fontWeight: '700' },

  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 12, paddingTop: Platform.OS === 'web' ? 12 : 6, paddingBottom: 6,
    zIndex: 10,
  },
  topBtn: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center', justifyContent: 'center',
  },
  topBtnText: { color: COLORS.text, fontSize: 22, fontWeight: '700' },
  topBtnDisabled: { color: 'rgba(255,255,255,0.25)' },
  choosePill: {
    paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  choosePillText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
  zoomGroup: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  zoomLabel: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700', width: 38, textAlign: 'center' },

  imageArea: { flex: 1, overflow: 'hidden', backgroundColor: '#000' },

  tapRing: {
    position: 'absolute', width: 24, height: 24, borderRadius: 12,
    borderWidth: 2, borderColor: '#fff',
    backgroundColor: 'transparent',
    shadowColor: '#000', shadowOpacity: 0.6, shadowRadius: 3, shadowOffset: { width: 0, height: 1 },
  },
  loupe: {
    position: 'absolute', width: LOUPE_SIZE, height: LOUPE_SIZE,
    borderRadius: LOUPE_SIZE / 2, overflow: 'hidden',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: '#000',
    alignItems: 'center', justifyContent: 'center',
  },
  loupeDot: {
    width: 6, height: 6, borderRadius: 3,
    borderWidth: 1, borderColor: '#000', backgroundColor: '#fff',
  },

  hintWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 16, alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.75)', fontSize: 13, fontWeight: '600',
    backgroundColor: 'rgba(0,0,0,0.5)', paddingHorizontal: 14, paddingVertical: 6,
    borderRadius: 14, overflow: 'hidden',
  },

  bottomPanel: {
    backgroundColor: 'rgba(13,14,26,0.96)',
    paddingBottom: Platform.OS === 'web' ? 16 : 28,
    maxHeight: 300,
  },
  bottomScroll: { flexGrow: 0 },
  swatchStrip: { height: 6, width: '100%' },
  colorRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 6,
  },
  colorName: { color: COLORS.text, fontSize: 24, fontWeight: '800', letterSpacing: -0.5 },
  colorHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600', marginTop: 2 },
  samplingText: { color: COLORS.textMuted, fontSize: 20, marginLeft: 8 },
  saveBtn: {
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10,
    backgroundColor: COLORS.accent, marginLeft: 10,
  },
  saveBtnDone: { backgroundColor: 'rgba(255,255,255,0.12)' },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  emptyText: {
    color: COLORS.textMuted, fontSize: 15, fontWeight: '600',
    paddingHorizontal: 20, paddingTop: 14, paddingBottom: 6,
  },
});
