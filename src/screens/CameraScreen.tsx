import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Animated,
  Dimensions,
  SafeAreaView,
  Platform,
  ScrollView,
  TextInput,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

let CameraView: any = null;
let useCameraPermissions: any = null;
let ImageManipulator: any = null;

if (Platform.OS !== 'web') {
  const cam = require('expo-camera');
  CameraView = cam.CameraView;
  useCameraPermissions = cam.useCameraPermissions;
  ImageManipulator = require('expo-image-manipulator');
}

import { getColorInfo, ColorInfo } from '../utils/colorNames';
import { extractPixelFromPng, extractAllPixelsFromPng } from '../utils/pngPixel';
import { matchPaintsLab, PaintMatch } from '../utils/paintMatcher';
import { rgbToLab } from '../utils/colorMath';
import {
  bestMatchLabel,
  MatchList,
  FiltersPanel,
  FilterToggleLine,
  FilterEmptyNotice,
  activeFilterCount,
  usePaintFilters,
} from '../components/paintMatchUI';
import PhotoPickerScreen from './PhotoPickerScreen';
import {
  SavedColorEntry,
  loadSavedColors,
  addSavedColor,
  removeSavedColor,
  setSavedColorLabel,
  newSavedColorId,
} from '../utils/savedColors';
import { COLORS, FONTS } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SCAN_INTERVAL_MS = 1500;
const CROSSHAIR_SIZE = 140;
const GRID_SIZE = 16;
const WHITE_REF_BOX = 90;
const CORNER_LEN = 18;
const CORNER_THICK = 3;

interface WhiteRef {
  r: number;
  g: number;
  b: number;
  gridX: number;
  gridY: number;
}

function findWhiteRegion(pixels: [number, number, number][][]): WhiteRef | null {
  if (!pixels.length || !pixels[0].length) return null;
  let bestScore = -Infinity;
  let best: WhiteRef | null = null;

  for (let y = 0; y < pixels.length; y++) {
    for (let x = 0; x < pixels[y].length; x++) {
      const [r, g, b] = pixels[y][x];
      const brightness = (r + g + b) / 3;
      const colorCast = Math.max(r, g, b) - Math.min(r, g, b);
      const score = brightness - colorCast * 2;
      if (score > bestScore) {
        bestScore = score;
        best = { r, g, b, gridX: x, gridY: y };
      }
    }
  }

  return bestScore >= 150 ? best : null;
}

// Loads the persisted saved-colours list and exposes mutators that keep
// storage and state in sync.
function useSavedColors() {
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
  const commit = () => onLabel(sc.id, label);
  return (
    <View style={styles.savedRow}>
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
        {!!sc.match && (
          <Text style={{ color: COLORS.textMuted, fontSize: 13, marginTop: 2 }}>{sc.match}</Text>
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
      </View>
      <TouchableOpacity onPress={() => onRemove(sc.id)} style={styles.savedDelete} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
        <Text style={{ color: COLORS.textMuted, fontSize: 16 }}>✕</Text>
      </TouchableOpacity>
    </View>
  );
}

function SavedColorsScreen({
  entries,
  onBack,
  onRemove,
  onLabel,
}: {
  entries: SavedColorEntry[];
  onBack: () => void;
  onRemove: (id: string) => void;
  onLabel: (id: string, label: string) => void;
}) {
  return (
    <View style={[styles.container, { backgroundColor: COLORS.bg }]}>
      <SafeAreaView style={{ flex: 1, paddingTop: Platform.OS === 'web' ? 48 : 0 }}>
        <View style={styles.savedHeader}>
          <TouchableOpacity onPress={onBack} style={{ marginRight: 12 }}>
            <Text style={{ color: COLORS.accent, fontSize: 28 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: COLORS.text, fontSize: 22, fontWeight: '800' }}>Saved Colours</Text>
        </View>
        {entries.length === 0 ? (
          <Text style={styles.savedEmpty}>No colours saved yet</Text>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled">
            {entries.map(sc => (
              <SavedColorRow key={sc.id} sc={sc} onRemove={onRemove} onLabel={onLabel} />
            ))}
          </ScrollView>
        )}
      </SafeAreaView>
    </View>
  );
}

interface WebColorState {
  info: ColorInfo;
  matches: PaintMatch[];
  r: number; g: number; b: number;
}

function WebCameraScreen({ onOpenPhoto }: { onOpenPhoto: () => void }) {
  const videoRef = useRef<any>(null);
  const canvasRef = useRef<any>(null);
  const streamRef = useRef<any>(null);
  const [colorState, setColorState] = useState<WebColorState>({
    info: { name: 'Detecting…', hex: '#808080', emoji: '🔍' }, matches: [], r: 128, g: 128, b: 128,
  });
  const [complexMode, setComplexMode] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);
  const { filters, onToggle: onToggleFilter, candidates } = usePaintFilters();
  const { savedColors, save, remove, setLabel } = useSavedColors();

  const breathScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(breathScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [breathScale]);

  useEffect(() => {
    let stream: any;
    (navigator as any).mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s: any) => {
        stream = s;
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
        // Check torch support
        const track = s.getVideoTracks()[0];
        if (track) {
          const caps = track.getCapabilities?.() as any;
          if (caps?.torch) setTorchSupported(true);
        }
      })
      .catch((e: any) => setCamError(e.message || 'Camera access denied'));
    return () => { if (stream) stream.getTracks().forEach((t: any) => t.stop()); };
  }, []);

  const toggleTorch = useCallback(async () => {
    const stream = streamRef.current;
    if (!stream) return;
    const track = stream.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({ advanced: [{ torch: next } as any] });
      setTorchOn(next);
    } catch {}
  }, [torchOn]);

  useEffect(() => {
    const interval = setInterval(() => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.readyState < 2) return;
      try {
        canvas.width = 1; canvas.height = 1;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const vw = video.videoWidth, vh = video.videoHeight;
        const sw = vw * 0.15, sh = vh * 0.15;
        ctx.drawImage(video, vw / 2 - sw / 2, vh / 2 - sh / 2, sw, sh, 0, 0, 1, 1);
        const px = ctx.getImageData(0, 0, 1, 1).data;
        const [r, g, b] = [px[0], px[1], px[2]];
        setColorState({
          info: getColorInfo(r, g, b, complexMode),
          matches: matchPaintsLab(rgbToLab(r, g, b), 5, candidates),
          r, g, b,
        });
      } catch {}
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [complexMode, candidates]);

  const saveColor = useCallback(() => {
    setColorState(cs => {
      // Centre-crop thumbnail from the live video so the saved entry shows
      // what was actually scanned.
      let thumb: string | undefined;
      try {
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const c = document.createElement('canvas');
          c.width = 96;
          c.height = 96;
          const ctx = c.getContext('2d');
          if (ctx) {
            const vw = video.videoWidth;
            const vh = video.videoHeight;
            const s = Math.min(vw, vh) * 0.5;
            ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, 96, 96);
            thumb = c.toDataURL('image/jpeg', 0.7);
          }
        }
      } catch {}
      save(
        {
          id: newSavedColorId(),
          hex: cs.info.hex,
          name: cs.info.name,
          emoji: cs.info.emoji,
          match: bestMatchLabel(cs.matches),
          timestamp: Date.now(),
        },
        thumb
      );
      return cs;
    });
  }, [save]);

  if (camError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>📷 Camera Access Needed</Text>
        <Text style={styles.permText}>Allow camera access in your browser, then reload the page.{'\n\n'}{camError}</Text>
      </View>
    );
  }

  const { info: colorInfo, matches } = colorState;

  if (showSaved) {
    return (
      <SavedColorsScreen
        entries={savedColors}
        onBack={() => setShowSaved(false)}
        onRemove={remove}
        onLabel={setLabel}
      />
    );
  }

  return (
    <View style={styles.container}>
      {React.createElement('video', {
        ref: videoRef,
        style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
        autoPlay: true, playsInline: true, muted: true,
      })}
      {React.createElement('canvas', { ref: canvasRef, style: { display: 'none' } })}

      <SafeAreaView style={styles.topOverlay} pointerEvents="box-none">
        <View style={styles.toggleContainer}>
          <TouchableOpacity style={[styles.togglePill, !complexMode && styles.toggleActive]} onPress={() => setComplexMode(false)}>
            <Text style={[FONTS.toggle, styles.toggleText, !complexMode && styles.toggleTextActive]}>Simple</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.togglePill, complexMode && styles.toggleActive]} onPress={() => setComplexMode(true)}>
            <Text style={[FONTS.toggle, styles.toggleText, complexMode && styles.toggleTextActive]}>Paints</Text>
          </TouchableOpacity>
          {torchSupported && (
            <>
              <View style={styles.toggleDivider} />
              <TouchableOpacity style={[styles.togglePill, torchOn && styles.toggleActiveRef]} onPress={toggleTorch}>
                <Text style={[FONTS.toggle, styles.toggleText, torchOn && styles.toggleTextActive]}>🔦</Text>
              </TouchableOpacity>
            </>
          )}
          <View style={styles.toggleDivider} />
          <TouchableOpacity style={styles.togglePill} onPress={onOpenPhoto}>
            <Text style={[FONTS.toggle, styles.toggleText]}>🖼</Text>
          </TouchableOpacity>
          <View style={styles.toggleDivider} />
          <TouchableOpacity style={styles.togglePill} onPress={() => setShowSaved(true)}>
            <Text style={[FONTS.toggle, styles.toggleText]}>💾 {savedColors.length > 0 ? savedColors.length : ''}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      <View style={styles.crosshairContainer} pointerEvents="none">
        <Animated.View style={[styles.crosshairOuter, { transform: [{ scale: breathScale }] }]}>
          <View style={styles.circle} />
          <View style={styles.crossHorizontal} />
          <View style={styles.crossVertical} />
        </Animated.View>
      </View>

      <TouchableOpacity style={styles.bottomPanel} onPress={saveColor} activeOpacity={0.85}>
        <View style={[styles.swatchStrip, { backgroundColor: colorInfo.hex }]} />
        <View style={styles.colorInfoRow}>
          <View style={styles.colorTextBlock}>
            <Text style={[FONTS.colorName, styles.colorNameText]}>
              {colorInfo.emoji} {colorInfo.name}
            </Text>
            <Text style={[FONTS.colorNameSub, styles.hexText]}>
              {complexMode ? bestMatchLabel(matches) : colorInfo.hex}
            </Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginLeft: 8 }}>tap to save</Text>
        </View>
        {complexMode && (
          <>
            <FilterToggleLine
              filters={filters}
              candidateCount={candidates.length}
              expanded={showFilters}
              onPress={() => setShowFilters(s => !s)}
            />
            {showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilter} />}
            {candidates.length === 0 ? <FilterEmptyNotice /> : <MatchList matches={matches} />}
          </>
        )}
      </TouchableOpacity>
    </View>
  );
}

export default function CameraScreen() {
  const [showPhoto, setShowPhoto] = useState(false);
  if (showPhoto) {
    return <PhotoPickerScreen onClose={() => setShowPhoto(false)} />;
  }
  if (Platform.OS === 'web') {
    return <WebCameraScreen onOpenPhoto={() => setShowPhoto(true)} />;
  }
  return <NativeCameraScreen onOpenPhoto={() => setShowPhoto(true)} />;
}

function NativeCameraScreen({ onOpenPhoto }: { onOpenPhoto: () => void }) {
  const [permission, requestPermission] = useCameraPermissions();
  const [colorInfo, setColorInfo] = useState<ColorInfo>({
    name: 'Detecting…',
    hex: '#808080',
    emoji: '🔍',
  });
  const [matches, setMatches] = useState<PaintMatch[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [complexMode, setComplexMode] = useState(false);
  const [whiteRefEnabled, setWhiteRefEnabled] = useState(false);
  const [whiteRefPos, setWhiteRefPos] = useState<WhiteRef | null>(null);
  const [torchOn, setTorchOn] = useState(false);
  const [showSaved, setShowSaved] = useState(false);
  const [isUnstable, setIsUnstable] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const { filters, onToggle: onToggleFilter, candidates } = usePaintFilters();
  const { savedColors, save, remove, setLabel } = useSavedColors();

  const cameraRef = useRef<any>(null);
  const scanningRef = useRef(false);
  const whiteRefDataRef = useRef<WhiteRef | null>(null);
  const rgbHistoryRef = useRef<[number, number, number][]>([]);
  const lastPhotoUriRef = useRef<string | null>(null);

  const breathScale = useRef(new Animated.Value(1)).current;
  const scanOpacity = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const anim = Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, { toValue: 1.12, duration: 1000, useNativeDriver: true }),
        Animated.timing(breathScale, { toValue: 1, duration: 1000, useNativeDriver: true }),
      ])
    );
    anim.start();
    return () => anim.stop();
  }, [breathScale]);

  useEffect(() => {
    if (isScanning) {
      const pulse = Animated.loop(
        Animated.sequence([
          Animated.timing(scanOpacity, { toValue: 0.4, duration: 300, useNativeDriver: true }),
          Animated.timing(scanOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
        ])
      );
      pulse.start();
      return () => pulse.stop();
    } else {
      scanOpacity.setValue(1);
    }
  }, [isScanning, scanOpacity]);

  const scanColor = useCallback(async () => {
    if (scanningRef.current || !cameraRef.current) return;
    scanningRef.current = true;
    setIsScanning(true);

    try {
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.3,
        base64: false,
        skipProcessing: true,
      });

      if (!photo) return;
      lastPhotoUriRef.current = photo.uri;

      // Center crop → 1×1 for colour reading
      const imgW = photo.width;
      const imgH = photo.height;
      const cropW = Math.floor(imgW * 0.15);
      const cropH = Math.floor(imgH * 0.15);
      const originX = Math.floor((imgW - cropW) / 2);
      const originY = Math.floor((imgH - cropH) / 2);

      const centerResult = await ImageManipulator.manipulateAsync(
        photo.uri,
        [
          { crop: { originX, originY, width: cropW, height: cropH } },
          { resize: { width: 1, height: 1 } },
        ],
        { format: ImageManipulator.SaveFormat.PNG, base64: true }
      );

      if (centerResult.base64) {
        let [r, g, b] = extractPixelFromPng(centerResult.base64);

        // Apply white balance correction if reference is set
        if (whiteRefEnabled) {
          const ref = whiteRefDataRef.current;
          if (ref && ref.r > 20 && ref.g > 20 && ref.b > 20) {
            r = Math.min(255, Math.round((r * 255) / ref.r));
            g = Math.min(255, Math.round((g * 255) / ref.g));
            b = Math.min(255, Math.round((b * 255) / ref.b));
          }
        }

        const info = getColorInfo(r, g, b, complexMode);
        setColorInfo(info);
        setMatches(matchPaintsLab(rgbToLab(r, g, b), 5, candidates));

        // Stability: track last 5 readings, flag if avg RGB delta > 25
        const hist = rgbHistoryRef.current;
        hist.push([r, g, b]);
        if (hist.length > 5) hist.shift();
        if (hist.length >= 2) {
          let totalDelta = 0;
          for (let i = 1; i < hist.length; i++) {
            const dr = hist[i][0] - hist[i - 1][0];
            const dg = hist[i][1] - hist[i - 1][1];
            const db = hist[i][2] - hist[i - 1][2];
            totalDelta += Math.sqrt(dr * dr + dg * dg + db * db);
          }
          setIsUnstable(totalDelta / (hist.length - 1) > 25);
        }
      }

      // White region detection — resize full photo to 16×16 grid
      if (whiteRefEnabled) {
        const gridResult = await ImageManipulator.manipulateAsync(
          photo.uri,
          [{ resize: { width: GRID_SIZE, height: GRID_SIZE } }],
          { format: ImageManipulator.SaveFormat.PNG, base64: true }
        );
        if (gridResult.base64) {
          const pixels = extractAllPixelsFromPng(gridResult.base64, GRID_SIZE, GRID_SIZE);
          const region = findWhiteRegion(pixels);
          whiteRefDataRef.current = region;
          setWhiteRefPos(region);
        }
      }
    } catch {
      // Silently continue
    } finally {
      scanningRef.current = false;
      setIsScanning(false);
    }
  }, [complexMode, whiteRefEnabled, candidates]);

  useEffect(() => {
    const interval = setInterval(scanColor, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [scanColor]);

  const handleToggleWhiteRef = () => {
    const next = !whiteRefEnabled;
    setWhiteRefEnabled(next);
    if (!next) {
      setWhiteRefPos(null);
      whiteRefDataRef.current = null;
    }
  };

  const saveColor = useCallback(async () => {
    // Small centre-crop thumbnail from the most recent scan photo; the
    // camera cache file is temporary, so savedColors copies it to app storage.
    let thumb: string | undefined;
    const uri = lastPhotoUriRef.current;
    if (uri) {
      try {
        const t = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 96 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        thumb = t.uri;
      } catch {}
    }
    save(
      {
        id: newSavedColorId(),
        hex: colorInfo.hex,
        name: colorInfo.name,
        emoji: colorInfo.emoji,
        match: bestMatchLabel(matches),
        timestamp: Date.now(),
      },
      thumb
    );
  }, [colorInfo, matches, save]);

  if (!permission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permText}>Checking camera permission…</Text>
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>📷 Camera Access Needed</Text>
        <Text style={styles.permText}>We need the camera to detect colours around you!</Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (showSaved) {
    return (
      <SavedColorsScreen
        entries={savedColors}
        onBack={() => setShowSaved(false)}
        onRemove={remove}
        onLabel={setLabel}
      />
    );
  }

  // White ref framing box screen position
  const whiteBoxLeft = whiteRefPos
    ? Math.max(4, Math.min(SCREEN_WIDTH - WHITE_REF_BOX - 4,
        ((whiteRefPos.gridX + 0.5) / GRID_SIZE) * SCREEN_WIDTH - WHITE_REF_BOX / 2))
    : 0;
  const whiteBoxTop = whiteRefPos
    ? Math.max(4, Math.min(SCREEN_HEIGHT - WHITE_REF_BOX - 24,
        ((whiteRefPos.gridY + 0.5) / GRID_SIZE) * SCREEN_HEIGHT - WHITE_REF_BOX / 2))
    : 0;

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Full-screen camera */}
      <CameraView ref={cameraRef} style={StyleSheet.absoluteFill} facing="back" torch={torchOn ? 'on' : 'off'} />

      {/* White reference framing box */}
      {whiteRefEnabled && whiteRefPos && (
        <View
          style={[styles.whiteRefFrame, { left: whiteBoxLeft, top: whiteBoxTop }]}
          pointerEvents="none"
        >
          <View style={[styles.corner, { top: 0, left: 0, width: CORNER_LEN, height: CORNER_THICK }]} />
          <View style={[styles.corner, { top: 0, left: 0, width: CORNER_THICK, height: CORNER_LEN }]} />
          <View style={[styles.corner, { top: 0, right: 0, width: CORNER_LEN, height: CORNER_THICK }]} />
          <View style={[styles.corner, { top: 0, right: 0, width: CORNER_THICK, height: CORNER_LEN }]} />
          <View style={[styles.corner, { bottom: 0, left: 0, width: CORNER_LEN, height: CORNER_THICK }]} />
          <View style={[styles.corner, { bottom: 0, left: 0, width: CORNER_THICK, height: CORNER_LEN }]} />
          <View style={[styles.corner, { bottom: 0, right: 0, width: CORNER_LEN, height: CORNER_THICK }]} />
          <View style={[styles.corner, { bottom: 0, right: 0, width: CORNER_THICK, height: CORNER_LEN }]} />
          <Text style={styles.whiteRefLabel}>White reference</Text>
        </View>
      )}

      {/* Top-left: colour name overlay — tappable to save */}
      <SafeAreaView style={styles.nTopLeft} pointerEvents="box-none">
        <TouchableOpacity onPress={saveColor} activeOpacity={0.8} style={styles.nColorNameTouchable}>
          <Text style={styles.nColorName} numberOfLines={2}>
            {colorInfo.emoji} {complexMode && matches[0] ? matches[0].paint.name : colorInfo.name}
          </Text>
          <Text style={styles.nColorHex}>
            {complexMode && matches[0]
              ? `${matches[0].paint.brand} · ${matches[0].matchPercent}% · ${matches[0].closeness}`
              : colorInfo.hex}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Top-right: circular torch + save buttons */}
      <SafeAreaView style={styles.nTopRight} pointerEvents="box-none">
        <View style={styles.nCircleBtnRow}>
          <TouchableOpacity
            style={[styles.nCircleBtn, torchOn && styles.nCircleBtnTorch]}
            onPress={() => setTorchOn(t => !t)}
          >
            <Text style={styles.nCircleBtnText}>🔦</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nCircleBtn} onPress={saveColor}>
            <Text style={styles.nCircleBtnText}>💾</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Centre crosshair */}
      <View style={styles.crosshairContainer} pointerEvents="none">
        <Animated.View
          style={[styles.crosshairOuter, { transform: [{ scale: breathScale }], opacity: scanOpacity }]}
        >
          <View style={styles.circle} />
          <View style={styles.crossHorizontal} />
          <View style={styles.crossVertical} />
        </Animated.View>
      </View>

      {/* Stability indicator — below crosshair, above bottom panel */}
      {isUnstable && (
        <View style={styles.nStabilityBar} pointerEvents="none">
          <Text style={styles.nStabilityText}>● Unstable — move closer to the surface</Text>
        </View>
      )}

      {/* Bottom slim panel */}
      <View style={styles.nBottomPanel}>
        {/* Controls: Simple/Dulux + White Ref + Saved */}
        <View style={styles.nControlRow}>
          <TouchableOpacity
            style={[styles.nPill, !complexMode && styles.nPillActive]}
            onPress={() => setComplexMode(false)}
          >
            <Text style={[styles.nPillText, !complexMode && styles.nPillTextActive]}>Simple</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.nPill, complexMode && styles.nPillActive]}
            onPress={() => setComplexMode(true)}
          >
            <Text style={[styles.nPillText, complexMode && styles.nPillTextActive]}>Paints</Text>
          </TouchableOpacity>
          {complexMode && (
            <TouchableOpacity
              style={[styles.nPill, showFilters && styles.nPillActive]}
              onPress={() => setShowFilters(s => !s)}
            >
              <Text style={[styles.nPillText, showFilters && styles.nPillTextActive]}>
                ⚙{activeFilterCount(filters) > 0 ? ` ${activeFilterCount(filters)}` : ''}
              </Text>
            </TouchableOpacity>
          )}
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.nPill, whiteRefEnabled && styles.nPillActiveRef]}
            onPress={handleToggleWhiteRef}
          >
            <Text style={[styles.nPillText, whiteRefEnabled && styles.nPillTextActive]}>
              {whiteRefEnabled && !whiteRefPos ? '⬜ …' : '⬜ Ref'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nPill} onPress={onOpenPhoto}>
            <Text style={styles.nPillText}>🖼</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nPill} onPress={() => setShowSaved(true)}>
            <Text style={styles.nPillText}>
              🗂{savedColors.length > 0 ? ` ${savedColors.length}` : ''}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Colour swatch strip */}
        <View style={[styles.nSwatchStrip, { backgroundColor: colorInfo.hex }]} />

        {/* Compact match row */}
        <View style={styles.nMatchRow}>
          <Text style={styles.nMatchName}>
            {colorInfo.emoji} {complexMode && matches[0] ? matches[0].paint.name : colorInfo.name}
          </Text>
          <Text style={styles.nMatchHex}>{colorInfo.hex}</Text>
        </View>

        {/* Filter chips + top-5 paint matches with % */}
        {complexMode && showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilter} />}
        {complexMode && (candidates.length === 0 ? <FilterEmptyNotice /> : <MatchList matches={matches} />)}
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
  permTitle: { color: COLORS.text, fontSize: 28, fontWeight: '800', marginBottom: 12, textAlign: 'center' },
  permText: { color: COLORS.textMuted, fontSize: 16, textAlign: 'center', marginBottom: 24 },
  permButton: { backgroundColor: COLORS.accent, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
  permButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },

  // --- Web layout styles (WebCameraScreen) ---
  topOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    alignItems: 'flex-end', paddingTop: 12, paddingRight: 16,
  },
  toggleContainer: {
    flexDirection: 'row', backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 24, padding: 4, alignItems: 'center',
  },
  togglePill: { paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  toggleActive: { backgroundColor: COLORS.accent },
  toggleActiveRef: { backgroundColor: '#d4a017' },
  toggleDivider: { width: 1, height: 20, backgroundColor: 'rgba(255,255,255,0.25)', marginHorizontal: 2 },
  toggleText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '700' },
  toggleTextActive: { color: COLORS.text },

  bottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(13, 14, 26, 0.88)', paddingBottom: 40,
  },
  swatchStrip: { height: 8, width: '100%' },
  colorInfoRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 24, paddingTop: 16, paddingBottom: 8,
  },
  colorTextBlock: { flex: 1 },
  colorNameText: { color: COLORS.text, fontSize: 52, fontWeight: '800', letterSpacing: -1 },
  hexText: { color: COLORS.textMuted, fontSize: 22, fontWeight: '600', marginTop: 2 },

  // --- White reference framing box (shared) ---
  whiteRefFrame: {
    position: 'absolute', width: WHITE_REF_BOX, height: WHITE_REF_BOX, zIndex: 5,
  },
  corner: { position: 'absolute', backgroundColor: 'rgba(255,230,80,0.95)' },
  whiteRefLabel: {
    position: 'absolute', bottom: -20, left: 0, right: 0,
    textAlign: 'center', color: 'rgba(255,230,80,1)',
    fontSize: 10, fontWeight: '700',
    textShadowColor: 'rgba(0,0,0,0.8)', textShadowOffset: { width: 0, height: 1 }, textShadowRadius: 2,
  },

  // --- Crosshair (shared) ---
  crosshairContainer: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'center',
  },
  crosshairOuter: { width: CROSSHAIR_SIZE, height: CROSSHAIR_SIZE, alignItems: 'center', justifyContent: 'center' },
  circle: {
    position: 'absolute', width: CROSSHAIR_SIZE, height: CROSSHAIR_SIZE,
    borderRadius: CROSSHAIR_SIZE / 2, borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)', backgroundColor: 'transparent',
  },
  crossHorizontal: { position: 'absolute', width: 20, height: 2, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 1 },
  crossVertical: { position: 'absolute', width: 2, height: 20, backgroundColor: 'rgba(255,255,255,0.8)', borderRadius: 1 },

  // --- Native layout styles (NativeCameraScreen) ---
  nTopLeft: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    alignItems: 'flex-start',
  },
  nColorNameTouchable: {
    paddingLeft: 20, paddingTop: 14, maxWidth: SCREEN_WIDTH * 0.62,
  },
  nColorName: {
    color: '#FFFFFF',
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -0.5,
    lineHeight: 44,
    textShadowColor: 'rgba(0,0,0,0.8)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  nColorHex: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 15,
    fontWeight: '600',
    marginTop: 3,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 4,
  },

  nTopRight: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 10,
    alignItems: 'flex-end',
  },
  nCircleBtnRow: {
    flexDirection: 'row', gap: 10, paddingRight: 16, paddingTop: 14,
  },
  nCircleBtn: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center', justifyContent: 'center',
  },
  nCircleBtnTorch: { backgroundColor: 'rgba(212,160,23,0.75)' },
  nCircleBtnText: { fontSize: 20 },

  nStabilityBar: {
    position: 'absolute',
    bottom: 135,
    left: 0, right: 0,
    alignItems: 'center', zIndex: 6,
  },
  nStabilityText: {
    color: '#FFD700',
    fontSize: 13,
    fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
    overflow: 'hidden',
  },

  nBottomPanel: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: 'rgba(13,14,26,0.82)',
    paddingBottom: 34,
  },
  nControlRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6,
    gap: 6,
  },
  nPill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 14, backgroundColor: 'rgba(255,255,255,0.08)',
  },
  nPillActive: { backgroundColor: COLORS.accent },
  nPillActiveRef: { backgroundColor: '#d4a017' },
  nPillText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  nPillTextActive: { color: '#fff' },

  nSwatchStrip: { height: 5, width: '100%' },

  // --- Saved colours screen (shared) ---
  savedHeader: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingTop: 16, marginBottom: 16,
  },
  savedEmpty: { color: COLORS.textMuted, textAlign: 'center', marginTop: 40, fontSize: 16 },
  savedRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 10,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  savedThumb: { width: 56, height: 56, borderRadius: 10 },
  savedSwatchBar: { width: 6, height: 56, borderRadius: 3, marginLeft: 6, marginRight: 12 },
  savedLabelInput: {
    color: COLORS.text, fontSize: 13, marginTop: 4,
    paddingVertical: 2, paddingHorizontal: 0,
    borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: 'rgba(255,255,255,0.2)',
  },
  savedDelete: { paddingLeft: 12, paddingVertical: 8 },

  nMatchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6,
  },
  nMatchName: { color: COLORS.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  nMatchHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
});
