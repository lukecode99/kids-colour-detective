import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  Platform,
  Linking,
  Animated,
  PanResponder,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';

// vision-camera scan loop (CD-10): a frame processor reads the centre
// pixels straight off the preview stream — no shutter, no photo files.
// Native-only modules, so the requires stay guarded for the web bundle.
let VisionCamera: any = null;
let WorkletsCore: any = null;
let ImageManipulator: any = null;

if (Platform.OS !== 'web') {
  VisionCamera = require('react-native-vision-camera');
  WorkletsCore = require('react-native-worklets-core');
  ImageManipulator = require('expo-image-manipulator');
}

import * as Haptics from 'expo-haptics';
import { getColorInfo, ColorInfo } from '../utils/colorNames';
import { matchPaintsLab, PaintMatch } from '../utils/paintMatcher';
import { rgbToLab } from '../utils/colorMath';
import { Rgb, medianRgb } from '../utils/photoSample';
import {
  WhiteRef,
  pushReading,
  isStable,
  stabilizedRgb,
  applyWhiteRef,
  isPlausibleWhiteRef,
  lightingHint,
} from '../utils/scanQuality';
import {
  bestMatchLabel,
  useScanFilters,
  FilterToggleLine,
  FiltersPanel,
  FilterEmptyNotice,
} from '../components/paintMatchUI';
import { bestMatchInfo } from '../utils/matchLabel';
import {
  CalibrationSurface,
  GREY_CARD_PRODUCT_NAME,
  GREY_CARD_LINK_ENABLED,
  greyCardUrl,
  calibratedLabel,
  recordSurfaceChoice,
  usePreferredSurface,
} from '../utils/calibrationSurface';
import CaptureReticle from '../components/CaptureReticle';
import PhotoPickerScreen from './PhotoPickerScreen';
import { addSavedColor, loadSavedColors, newSavedColorId } from '../utils/savedColors';
import { recordCaptureHintSave } from '../utils/captureHint';
import { setCurrentColour } from '../utils/currentColour';
import { SCAN_FOOTER_HINT } from '../utils/scanCopy';
import { COLORS, FONTS } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SCAN_INTERVAL_MS = 1500;
const SCAN_FPS = 5;
const SAMPLE_N = 9;

// CD-41 drawer constants — drawer is inside the screen view, which ends at the tab bar top.
// Do NOT add TAB_BAR_HEIGHT to any bottom values; the screen view bottom IS the tab bar top.
const PEEK_HEIGHT = 64; // 64px docked result bar flush to the bottom of the screen view
const EXPANDED_HEIGHT = Math.min(SCREEN_HEIGHT * 0.68, 480);
const DRAWER_TRANSLATE_COLLAPSED = EXPANDED_HEIGHT - PEEK_HEIGHT;
const BUTTON_SIZE = 88;
const BUTTON_DISC = 66; // CD-41: white inner disc diameter

type WhiteRefMode = 'off' | 'choosing' | 'calibrating' | 'locked';

function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hintLabel(hint: 'dim' | 'warm', hasTorch: boolean): string {
  if (hint === 'dim') {
    return hasTorch ? '💡 Low light — try the torch' : '💡 Low light — add more light';
  }
  return hasTorch
    ? '🔦 Warm light — use the torch or Calibrate matching'
    : '🎨 Warm light — try Calibrate matching';
}

function whiteRefPillLabel(mode: WhiteRefMode, surface: CalibrationSurface | null): string {
  if (mode === 'locked' && surface) return calibratedLabel(surface);
  if (mode === 'locked') return 'Calibrate matching ✓';
  if (mode === 'calibrating' || mode === 'choosing') return 'Calibrate matching …';
  return 'Calibrate matching';
}

// CD-34: surface chooser before entering calibration.
function CalibrationChooser({
  onChoose,
  onCancel,
}: {
  onChoose: (surface: CalibrationSurface) => void;
  onCancel: () => void;
}) {
  const preferred = usePreferredSurface();
  return (
    <View style={styles.calibOverlay} pointerEvents="box-none">
      <View style={styles.calibCard}>
        <Text style={styles.calibTitle}>🎯 Calibrate matching</Text>
        <Text style={styles.calibText}>What will you hold up to the camera?</Text>
        <TouchableOpacity
          style={[styles.chooserBtn, preferred === 'paper' && styles.chooserBtnPreferred]}
          onPress={() => onChoose('paper')}
        >
          <Text style={styles.chooserBtnTitle}>📄 Ordinary white paper</Text>
          <Text style={styles.chooserBtnSub}>Any plain sheet — quick and easy</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.chooserBtn, preferred === 'card' && styles.chooserBtnPreferred]}
          onPress={() => onChoose('card')}
        >
          <Text style={styles.chooserBtnTitle}>🎞 {GREY_CARD_PRODUCT_NAME}</Text>
          <Text style={styles.chooserBtnSub}>The most accurate reference</Text>
        </TouchableOpacity>
        {GREY_CARD_LINK_ENABLED && (
          <TouchableOpacity
            style={styles.chooserGetOne}
            onPress={() => Linking.openURL(greyCardUrl()).catch(() => {})}
            hitSlop={{ top: 6, bottom: 6 }}
          >
            <Text style={styles.chooserGetOneText}>🛒 Get one · Amazon</Text>
          </TouchableOpacity>
        )}
        <View style={styles.calibBtnRow}>
          <TouchableOpacity style={styles.calibCancel} onPress={onCancel}>
            <Text style={styles.calibCancelText}>Cancel</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// CD-27: guided calibration — hold chosen surface, lock the stabilised reading.
function CalibrationOverlay({
  rgb,
  stable,
  surface,
  onLock,
  onCancel,
}: {
  rgb: Rgb;
  stable: boolean;
  surface: CalibrationSurface;
  onLock: () => void;
  onCancel: () => void;
}) {
  const ok = isPlausibleWhiteRef(rgb);
  const canLock = ok && stable;
  const hex = rgbToHex(rgb);
  const surfaceName = surface === 'card' ? 'your grey card' : 'your white paper (not glossy)';
  return (
    <View style={styles.calibOverlay} pointerEvents="box-none">
      <View style={styles.calibCard}>
        <Text style={styles.calibTitle}>🎯 Calibrate matching</Text>
        <Text style={styles.calibText}>
          Hold {surfaceName} so it fills the circle, then lock.
        </Text>
        <View style={styles.calibSwatchRow}>
          <View style={[styles.calibSwatch, { backgroundColor: hex }]} />
          <Text style={styles.calibHex}>{hex}</Text>
        </View>
        {!ok && (
          <Text style={styles.calibWarn}>
            That doesn't look like a neutral surface — fill the circle with {surfaceName}
          </Text>
        )}
        {ok && !stable && (
          <Text style={styles.calibWarn}>Hold steady…</Text>
        )}
        <View style={styles.calibBtnRow}>
          <TouchableOpacity style={styles.calibCancel} onPress={onCancel}>
            <Text style={styles.calibCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.calibLock, !canLock && styles.calibLockDisabled]}
            onPress={onLock}
            disabled={!canLock}
          >
            <Text style={styles.calibLockText}>Lock</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

// CD-41: plain white ring shutter — 88px ring (5px white border), 66px white inner disc,
// blue glow. No live-colour fill, no glyph.
function CaptureButton({
  onCapture,
  disabled,
}: {
  onCapture: () => void;
  disabled: boolean;
}) {
  const scale = useRef(new Animated.Value(1)).current;

  const handlePressIn = useCallback(() => {
    Animated.timing(scale, { toValue: 0.92, duration: 70, useNativeDriver: true }).start();
  }, [scale]);

  const handlePressOut = useCallback(() => {
    Animated.timing(scale, { toValue: 1, duration: 100, useNativeDriver: true }).start();
  }, [scale]);

  const handlePress = useCallback(() => {
    if (!disabled) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onCapture();
    }
  }, [disabled, onCapture]);

  return (
    <Animated.View style={[styles.captureBtn, { transform: [{ scale }], opacity: disabled ? 0.45 : 1 }]}>
      <TouchableOpacity
        style={styles.captureBtnTouch}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onPress={handlePress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel="Capture colour"
        activeOpacity={1}
      >
        <View style={styles.captureBtnDisc} />
      </TouchableOpacity>
    </Animated.View>
  );
}

// CD-41: swipe-up drawer — collapsed = 64px docked result bar flush to tab bar.
// Expanded = full overlay with calibration pill, filter controls, footer hint.
function ScanDrawer({
  colorInfo,
  matches,
  rawRgb,
  whiteRefMode,
  calibSurface,
  filters,
  candidates,
  showFilters,
  onToggleFilters,
  onWhiteRefPress,
  onOpenPhoto,
}: {
  colorInfo: ColorInfo;
  matches: PaintMatch[];
  rawRgb: Rgb;
  whiteRefMode: WhiteRefMode;
  calibSurface: CalibrationSurface | null;
  filters: ReturnType<typeof useScanFilters>['filters'];
  candidates: ReturnType<typeof useScanFilters>['candidates'];
  showFilters: boolean;
  onToggleFilters: () => void;
  onWhiteRefPress: () => void;
  onOpenPhoto: () => void;
}) {
  const translateY = useRef(new Animated.Value(DRAWER_TRANSLATE_COLLAPSED)).current;
  const expandedRef = useRef(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const expand = useCallback(() => {
    expandedRef.current = true;
    setIsExpanded(true);
    Animated.spring(translateY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start();
  }, [translateY]);

  const collapse = useCallback(() => {
    expandedRef.current = false;
    setIsExpanded(false);
    Animated.spring(translateY, { toValue: DRAWER_TRANSLATE_COLLAPSED, useNativeDriver: true, bounciness: 0 }).start();
  }, [translateY]);

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dy) > 6,
      onPanResponderRelease: (_, g) => {
        if (!expandedRef.current && g.dy < -25) expand();
        else if (expandedRef.current && g.dy > 25) collapse();
      },
    })
  ).current;

  const top1Match = matches[0];
  const hint = lightingHint(rawRgb);

  return (
    <Animated.View
      style={[styles.drawer, { transform: [{ translateY }] }]}
      {...panResponder.panHandlers}
    >
      {/* 64px docked result bar — always the first visible section */}
      <View style={styles.resultBar}>
        <View style={[styles.resultSwatch, { backgroundColor: colorInfo.hex }]} />
        <View style={{ flex: 1 }}>
          <Text style={styles.resultName} numberOfLines={1}>
            {top1Match ? top1Match.paint.name : colorInfo.name}
          </Text>
          <Text style={styles.resultSub} numberOfLines={1}>
            {top1Match ? `${top1Match.paint.brand} · ${colorInfo.hex}` : colorInfo.hex}
          </Text>
        </View>
        <TouchableOpacity onPress={isExpanded ? collapse : expand} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.resultChevron}>{isExpanded ? '⌄' : '⌃'}</Text>
        </TouchableOpacity>
      </View>

      {/* Drag handle — visible only in expanded state (sits below the result bar) */}
      <View style={styles.drawerHandle} />

      {/* Expanded content (calibration pill, lighting hint, filters, footer) */}
      <View style={styles.drawerExpanded}>
        {hint && whiteRefMode !== 'calibrating' && (
          <Text style={styles.lightHintText}>{hintLabel(hint, true)}</Text>
        )}
        <View style={styles.expandedControls}>
          <TouchableOpacity
            style={[styles.pill, whiteRefMode !== 'off' && styles.pillActive]}
            onPress={onWhiteRefPress}
          >
            <Text style={[styles.pillText, whiteRefMode !== 'off' && styles.pillTextActive]}>
              {whiteRefPillLabel(whiteRefMode, calibSurface)}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.pill} onPress={onOpenPhoto}>
            <Text style={styles.pillText}>🖼 Photo</Text>
          </TouchableOpacity>
        </View>
        <FilterToggleLine
          filters={filters}
          candidateCount={candidates.length}
          expanded={showFilters}
          onPress={onToggleFilters}
        />
        {showFilters && <FiltersPanel filters={filters} onToggle={onToggleFilters as any} />}
        {showFilters && candidates.length === 0 && <FilterEmptyNotice />}
        <Text style={styles.scanHintLine}>{SCAN_FOOTER_HINT}</Text>
      </View>
    </Animated.View>
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
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [whiteRefMode, setWhiteRefMode] = useState<WhiteRefMode>('off');
  const [calibSurface, setCalibSurface] = useState<CalibrationSurface | null>(null);
  const [rawRgb, setRawRgb] = useState<Rgb>([128, 128, 128]);
  const [calibRgb, setCalibRgb] = useState<Rgb>([128, 128, 128]);
  const [calibStable, setCalibStable] = useState(false);
  const { filters, onToggle, candidates } = useScanFilters();
  const [showFilters, setShowFilters] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const filtersRef = useRef(filters);
  filtersRef.current = filters;

  const historyRef = useRef<Rgb[]>([]);
  const rawRgbRef = useRef<Rgb>([128, 128, 128]);
  const stabRgbRef = useRef<Rgb>([128, 128, 128]);
  const whiteRefValueRef = useRef<WhiteRef | null>(null);
  const whiteRefModeRef = useRef<WhiteRefMode>('off');
  whiteRefModeRef.current = whiteRefMode;

  useEffect(() => {
    loadSavedColors().then(list => setSavedCount(list.length));
  }, []);

  useEffect(() => {
    let stream: any;
    (navigator as any).mediaDevices
      .getUserMedia({ video: { facingMode: 'environment' }, audio: false })
      .then((s: any) => {
        stream = s;
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; videoRef.current.play(); }
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
        canvas.width = SAMPLE_N; canvas.height = SAMPLE_N;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const vw = video.videoWidth, vh = video.videoHeight;
        const sw = vw * 0.15, sh = vh * 0.15;
        ctx.drawImage(video, vw / 2 - sw / 2, vh / 2 - sh / 2, sw, sh, 0, 0, SAMPLE_N, SAMPLE_N);
        const data = ctx.getImageData(0, 0, SAMPLE_N, SAMPLE_N).data;
        const pixels: Rgb[] = [];
        for (let i = 0; i < data.length; i += 4) {
          pixels.push([data[i], data[i + 1], data[i + 2]]);
        }
        const raw = medianRgb(pixels);
        rawRgbRef.current = raw;
        setRawRgb(raw);
        historyRef.current = pushReading(historyRef.current, raw);
        const stab = stabilizedRgb(historyRef.current);
        stabRgbRef.current = stab;
        setCalibRgb(stab);
        setCalibStable(isStable(historyRef.current));
        let [r, g, b] = stab;
        if (whiteRefModeRef.current === 'locked' && whiteRefValueRef.current) {
          [r, g, b] = applyWhiteRef([r, g, b], whiteRefValueRef.current);
        }
        const info = getColorInfo(r, g, b, true);
        setColorState({
          info,
          matches: matchPaintsLab(rgbToLab(r, g, b), 5, candidates),
          r, g, b,
        });
        setCurrentColour({ rgb: [r, g, b], hex: info.hex, name: info.name });
      } catch {}
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [candidates]);

  const handleWhiteRefPress = useCallback(() => {
    if (whiteRefModeRef.current === 'off') {
      setWhiteRefMode('choosing');
    } else {
      whiteRefValueRef.current = null;
      setCalibSurface(null);
      setWhiteRefMode('off');
    }
  }, []);

  const chooseSurface = useCallback((surface: CalibrationSurface) => {
    setCalibSurface(surface);
    recordSurfaceChoice(surface);
    setWhiteRefMode('calibrating');
  }, []);

  const lockWhiteRef = useCallback(() => {
    const [r, g, b] = stabRgbRef.current;
    whiteRefValueRef.current = { r, g, b };
    setWhiteRefMode('locked');
  }, []);

  const saveColor = useCallback(() => {
    setColorState(cs => {
      let thumb: string | undefined;
      try {
        const video = videoRef.current;
        if (video && video.readyState >= 2) {
          const c = document.createElement('canvas');
          c.width = 96; c.height = 96;
          const ctx = c.getContext('2d');
          if (ctx) {
            const vw = video.videoWidth, vh = video.videoHeight;
            const s = Math.min(vw, vh) * 0.5;
            ctx.drawImage(video, (vw - s) / 2, (vh - s) / 2, s, s, 0, 0, 96, 96);
            thumb = c.toDataURL('image/jpeg', 0.7);
          }
        }
      } catch {}
      addSavedColor(
        {
          id: newSavedColorId(),
          hex: cs.info.hex,
          name: cs.info.name,
          emoji: cs.info.emoji,
          match: bestMatchLabel(cs.matches),
          bestMatch: bestMatchInfo(cs.matches),
          timestamp: Date.now(),
          filters: filtersRef.current,
        },
        thumb
      ).then(list => setSavedCount(list.length));
      recordCaptureHintSave();
      return cs;
    });
  }, []);

  if (camError) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>📷 Camera Access Needed</Text>
        <Text style={styles.permText}>Allow camera access in your browser, then reload the page.{'\n\n'}{camError}</Text>
      </View>
    );
  }

  const { info: colorInfo, matches } = colorState;
  const calibrating = whiteRefMode === 'calibrating' || whiteRefMode === 'choosing';

  return (
    <View style={styles.container}>
      {React.createElement('video', {
        ref: videoRef,
        style: { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: 'cover' },
        autoPlay: true, playsInline: true, muted: true,
      })}
      {React.createElement('canvas', { ref: canvasRef, style: { display: 'none' } })}

      {/* Viewfinder reticle */}
      <CaptureReticle disabled={calibrating} />

      {/* Torch icon button — top right */}
      {torchSupported && (
        <SafeAreaView style={styles.torchArea} pointerEvents="box-none">
          <TouchableOpacity
            style={[styles.torchBtn, torchOn && styles.torchBtnOn]}
            onPress={toggleTorch}
          >
            <Text style={{ fontSize: 20 }}>🔦</Text>
          </TouchableOpacity>
        </SafeAreaView>
      )}

      {/* Calibration overlays */}
      {whiteRefMode === 'choosing' && (
        <CalibrationChooser onChoose={chooseSurface} onCancel={handleWhiteRefPress} />
      )}
      {whiteRefMode === 'calibrating' && calibSurface && (
        <CalibrationOverlay
          rgb={calibRgb}
          stable={calibStable}
          surface={calibSurface}
          onLock={lockWhiteRef}
          onCancel={handleWhiteRefPress}
        />
      )}

      {/* Big capture button floating over the drawer */}
      <View style={styles.captureBtnArea} pointerEvents="box-none">
        <CaptureButton
          onCapture={saveColor}
          disabled={calibrating}
        />
      </View>

      {/* Swipe-up drawer */}
      <ScanDrawer
        colorInfo={colorInfo}
        matches={matches}
        rawRgb={rawRgb}
        whiteRefMode={whiteRefMode}
        calibSurface={calibSurface}
        filters={filters}
        candidates={candidates}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(s => !s)}
        onWhiteRefPress={handleWhiteRefPress}
        onOpenPhoto={onOpenPhoto}
      />
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
  const { useCameraDevice, useCameraFormat, useCameraPermission, useFrameProcessor, runAtTargetFps } =
    VisionCamera;
  const { useRunOnJS } = WorkletsCore;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  const format = useCameraFormat(device, [{ videoResolution: { width: 1280, height: 720 } }]);
  const [colorInfo, setColorInfo] = useState<ColorInfo>({
    name: 'Detecting…',
    hex: '#808080',
    emoji: '🔍',
  });
  const [matches, setMatches] = useState<PaintMatch[]>([]);
  const [whiteRefMode, setWhiteRefMode] = useState<WhiteRefMode>('off');
  const [calibSurface, setCalibSurface] = useState<CalibrationSurface | null>(null);
  const [rawRgb, setRawRgb] = useState<Rgb>([128, 128, 128]);
  const [calibRgb, setCalibRgb] = useState<Rgb>([128, 128, 128]);
  const [torchOn, setTorchOn] = useState(false);
  const [isUnstable, setIsUnstable] = useState(false);
  const [calibStable, setCalibStable] = useState(false);
  const { filters, onToggle, candidates } = useScanFilters();
  const [showFilters, setShowFilters] = useState(false);
  const [savedCount, setSavedCount] = useState(0);

  const cameraRef = useRef<any>(null);
  const historyRef = useRef<Rgb[]>([]);
  const rawRgbRef = useRef<Rgb>([128, 128, 128]);
  const stabRgbRef = useRef<Rgb>([128, 128, 128]);
  const whiteRefValueRef = useRef<WhiteRef | null>(null);
  const whiteRefModeRef = useRef<WhiteRefMode>('off');
  whiteRefModeRef.current = whiteRefMode;

  useEffect(() => {
    loadSavedColors().then(list => setSavedCount(list.length));
  }, []);

  const onSample = useRunOnJS(
    (flat: number[]) => {
      const pixels: Rgb[] = [];
      for (let i = 0; i + 2 < flat.length; i += 3) {
        pixels.push([flat[i], flat[i + 1], flat[i + 2]]);
      }
      const raw = medianRgb(pixels);
      rawRgbRef.current = raw;
      setRawRgb(raw);
      historyRef.current = pushReading(historyRef.current, raw);
      const stable = isStable(historyRef.current);
      setIsUnstable(historyRef.current.length >= 2 && !stable);
      setCalibStable(stable);
      const stab = stabilizedRgb(historyRef.current);
      stabRgbRef.current = stab;
      setCalibRgb(stab);
      let [r, g, b] = stab;
      if (whiteRefModeRef.current === 'locked' && whiteRefValueRef.current) {
        [r, g, b] = applyWhiteRef([r, g, b], whiteRefValueRef.current);
      }
      const info = getColorInfo(r, g, b, true);
      setColorInfo(info);
      setMatches(matchPaintsLab(rgbToLab(r, g, b), 5, candidates));
      setCurrentColour({ rgb: [r, g, b], hex: info.hex, name: info.name });
    },
    [candidates]
  );

  const isIOS = Platform.OS === 'ios';
  const frameProcessor = useFrameProcessor(
    (frame: any) => {
      'worklet';
      runAtTargetFps(SCAN_FPS, () => {
        'worklet';
        const data = new Uint8Array(frame.toArrayBuffer());
        const bpr = frame.bytesPerRow;
        const rw = frame.width * 0.15;
        const rh = frame.height * 0.15;
        const x0 = (frame.width - rw) / 2;
        const y0 = (frame.height - rh) / 2;
        const flat: number[] = [];
        for (let gy = 0; gy < SAMPLE_N; gy++) {
          for (let gx = 0; gx < SAMPLE_N; gx++) {
            const x = Math.floor(x0 + ((gx + 0.5) * rw) / SAMPLE_N);
            const y = Math.floor(y0 + ((gy + 0.5) * rh) / SAMPLE_N);
            const i = y * bpr + x * 4;
            if (isIOS) {
              flat.push(data[i + 2], data[i + 1], data[i]);
            } else {
              flat.push(data[i], data[i + 1], data[i + 2]);
            }
          }
        }
        onSample(flat);
      });
    },
    [onSample, isIOS]
  );

  const handleWhiteRefPress = useCallback(() => {
    if (whiteRefModeRef.current === 'off') {
      setWhiteRefMode('choosing');
    } else {
      whiteRefValueRef.current = null;
      setCalibSurface(null);
      setWhiteRefMode('off');
    }
  }, []);

  const chooseSurface = useCallback((surface: CalibrationSurface) => {
    setCalibSurface(surface);
    recordSurfaceChoice(surface);
    setWhiteRefMode('calibrating');
  }, []);

  const lockWhiteRef = useCallback(() => {
    const [r, g, b] = stabRgbRef.current;
    whiteRefValueRef.current = { r, g, b };
    setWhiteRefMode('locked');
  }, []);

  const saveColor = useCallback(async () => {
    let thumb: string | undefined;
    try {
      const snap = await cameraRef.current?.takeSnapshot({ quality: 70 });
      if (snap?.path) {
        const uri = snap.path.startsWith('file://') ? snap.path : `file://${snap.path}`;
        const t = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 96 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG, base64: true }
        );
        if (t.base64) thumb = `data:image/jpeg;base64,${t.base64}`;
      }
    } catch {}
    addSavedColor(
      {
        id: newSavedColorId(),
        hex: colorInfo.hex,
        name: colorInfo.name,
        emoji: colorInfo.emoji,
        match: bestMatchLabel(matches),
        bestMatch: bestMatchInfo(matches),
        timestamp: Date.now(),
        filters,
      },
      thumb
    ).then(list => setSavedCount(list.length));
    recordCaptureHintSave();
  }, [colorInfo, matches, filters]);

  if (!hasPermission) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>📷 Camera Access Needed</Text>
        <Text style={styles.permText}>
          Point the camera at any wall or surface and we'll find the closest matching paint.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={requestPermission}>
          <Text style={styles.permButtonText}>Allow Camera</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={styles.centered}>
        <Text style={styles.permTitle}>📷 No camera found</Text>
        <Text style={styles.permText}>
          This device doesn't have a back camera — try picking a spot on a photo instead.
        </Text>
        <TouchableOpacity style={styles.permButton} onPress={onOpenPhoto}>
          <Text style={styles.permButtonText}>🖼 Open a Photo</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const { Camera } = VisionCamera;
  const calibrating = whiteRefMode === 'calibrating' || whiteRefMode === 'choosing';

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        format={format}
        isActive
        torch={device.hasTorch && torchOn ? 'on' : 'off'}
        frameProcessor={frameProcessor}
        pixelFormat="rgb"
      />

      {/* Viewfinder reticle */}
      <CaptureReticle disabled={calibrating} />

      {/* Stability indicator */}
      {isUnstable && !lightingHint(rawRgb) && (
        <View style={styles.stabilityBar} pointerEvents="none">
          <Text style={styles.stabilityText}>● Unstable — move closer to the surface</Text>
        </View>
      )}

      {/* Torch icon button — top right */}
      <SafeAreaView style={styles.torchArea} pointerEvents="box-none">
        <TouchableOpacity
          style={[styles.torchBtn, torchOn && styles.torchBtnOn]}
          onPress={() => setTorchOn(t => !t)}
        >
          <Text style={{ fontSize: 20 }}>🔦</Text>
        </TouchableOpacity>
      </SafeAreaView>

      {/* Calibration overlays */}
      {whiteRefMode === 'choosing' && (
        <CalibrationChooser onChoose={chooseSurface} onCancel={handleWhiteRefPress} />
      )}
      {whiteRefMode === 'calibrating' && calibSurface && (
        <CalibrationOverlay
          rgb={calibRgb}
          stable={calibStable}
          surface={calibSurface}
          onLock={lockWhiteRef}
          onCancel={handleWhiteRefPress}
        />
      )}

      {/* Big capture button floating over the drawer */}
      <View style={styles.captureBtnArea} pointerEvents="box-none">
        <CaptureButton
          onCapture={saveColor}
          disabled={calibrating}
        />
      </View>

      {/* Swipe-up drawer */}
      <ScanDrawer
        colorInfo={colorInfo}
        matches={matches}
        rawRgb={rawRgb}
        whiteRefMode={whiteRefMode}
        calibSurface={calibSurface}
        filters={filters}
        candidates={candidates}
        showFilters={showFilters}
        onToggleFilters={() => setShowFilters(s => !s)}
        onWhiteRefPress={handleWhiteRefPress}
        onOpenPhoto={onOpenPhoto}
      />
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
  permButton: { backgroundColor: COLORS.blue, paddingHorizontal: 32, paddingVertical: 14, borderRadius: 30 },
  permButtonText: { color: COLORS.text, fontSize: 16, fontWeight: '700' },

  // --- Torch button (top-right icon button) ---
  torchArea: {
    position: 'absolute', top: 0, left: 0, right: 0, zIndex: 20,
    alignItems: 'flex-end',
  },
  torchBtn: {
    width: 46, height: 46, borderRadius: 23,
    backgroundColor: 'rgba(10,14,26,0.55)',
    borderWidth: 1, borderColor: 'rgba(77,107,255,0.35)',
    alignItems: 'center', justifyContent: 'center',
    marginRight: 16, marginTop: 66,
  },
  torchBtnOn: { backgroundColor: 'rgba(212,160,23,0.75)', borderColor: '#d4a017' },

  // Stability indicator
  stabilityBar: {
    position: 'absolute',
    bottom: PEEK_HEIGHT + BUTTON_SIZE + 20,
    left: 0, right: 0,
    alignItems: 'center', zIndex: 6,
  },
  stabilityText: {
    color: '#FFD700',
    fontSize: 13, fontWeight: '700',
    backgroundColor: 'rgba(0,0,0,0.45)',
    paddingHorizontal: 14, paddingVertical: 5,
    borderRadius: 14, overflow: 'hidden',
  },

  // --- Capture button (CD-41: white ring + white disc, blue glow) ---
  captureBtnArea: {
    position: 'absolute',
    left: 0, right: 0,
    bottom: PEEK_HEIGHT + 8,
    alignItems: 'center',
    zIndex: 25,
  },
  captureBtn: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    backgroundColor: 'transparent',
    borderWidth: 5,
    borderColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#4D6BFF',
    shadowOpacity: 0.65,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 14,
  },
  captureBtnTouch: {
    width: BUTTON_SIZE,
    height: BUTTON_SIZE,
    borderRadius: BUTTON_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  captureBtnDisc: {
    width: BUTTON_DISC,
    height: BUTTON_DISC,
    borderRadius: BUTTON_DISC / 2,
    backgroundColor: '#fff',
  },

  // --- Swipe-up drawer ---
  drawer: {
    position: 'absolute',
    left: 0, right: 0,
    bottom: 0,
    height: EXPANDED_HEIGHT,
    backgroundColor: 'transparent',
    zIndex: 20,
  },

  // CD-41: 64px docked result bar (replaces peek + stats row)
  resultBar: {
    height: PEEK_HEIGHT,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    gap: 12,
    backgroundColor: '#0A0E1A',
    borderTopWidth: 1,
    borderTopColor: '#232C4A',
  },
  resultSwatch: {
    width: 32, height: 32, borderRadius: 8,
    borderWidth: 1.5, borderColor: COLORS.border,
  },
  resultName: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  resultSub: { color: COLORS.textMuted, fontSize: 11, fontWeight: '600', marginTop: 1 },
  resultChevron: { color: COLORS.purple, fontSize: 20, fontWeight: '800' },

  // Drag handle — sits below result bar, visible only when expanded
  drawerHandle: {
    width: 44, height: 5, borderRadius: 3,
    backgroundColor: COLORS.blue,
    opacity: 0.55,
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 10,
  },

  drawerExpanded: {
    flex: 1,
    backgroundColor: 'rgba(10,14,26,0.98)',
    paddingBottom: 20,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },

  // --- Calibration overlays ---
  calibOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: PEEK_HEIGHT + 20, zIndex: 30,
  },
  calibCard: {
    backgroundColor: 'rgba(13,14,26,0.94)', borderRadius: 16,
    paddingHorizontal: 20, paddingVertical: 16,
    marginHorizontal: 24, maxWidth: 420,
    borderWidth: 1, borderColor: COLORS.border,
  },
  calibTitle: { color: COLORS.text, fontSize: 17, fontWeight: '800', marginBottom: 6 },
  calibText: { color: COLORS.textMuted, fontSize: 14, lineHeight: 19 },
  calibSwatchRow: { flexDirection: 'row', alignItems: 'center', marginTop: 10, gap: 10 },
  calibSwatch: {
    width: 36, height: 36, borderRadius: 8,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  calibHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '700' },
  calibWarn: { color: '#FFD700', fontSize: 13, fontWeight: '600', marginTop: 8 },
  calibBtnRow: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 14 },
  calibCancel: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  calibCancelText: { color: COLORS.textMuted, fontSize: 14, fontWeight: '700' },
  calibLock: {
    backgroundColor: COLORS.blue, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20,
  },
  calibLockDisabled: { backgroundColor: 'rgba(255,255,255,0.15)' },
  calibLockText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  chooserBtn: {
    backgroundColor: COLORS.surface, borderRadius: 12,
    paddingHorizontal: 14, paddingVertical: 10, marginTop: 10,
    borderWidth: 1, borderColor: 'transparent',
  },
  chooserBtnPreferred: { borderColor: COLORS.border },
  chooserBtnTitle: { color: COLORS.text, fontSize: 15, fontWeight: '700' },
  chooserBtnSub: { color: COLORS.textMuted, fontSize: 12, fontWeight: '600', marginTop: 2 },
  chooserGetOne: {
    alignSelf: 'flex-start', marginTop: 10,
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 14, backgroundColor: COLORS.blue,
  },
  chooserGetOneText: { color: '#fff', fontSize: 12, fontWeight: '700' },

  // --- In-drawer controls ---
  lightHintText: {
    color: '#FFD700', fontSize: 12, fontWeight: '700',
    paddingHorizontal: 20, paddingTop: 8,
  },
  expandedControls: {
    flexDirection: 'row', paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, gap: 6,
  },
  pill: {
    paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: 14, backgroundColor: COLORS.surface,
    borderWidth: 1, borderColor: COLORS.border,
  },
  pillActive: { backgroundColor: '#d4a017', borderColor: '#d4a017' },
  pillText: { color: COLORS.textMuted, fontSize: 12, fontWeight: '700' },
  pillTextActive: { color: '#fff' },
  scanHintLine: {
    color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '600',
    lineHeight: 16,
    paddingHorizontal: 24, paddingTop: 4, paddingBottom: 2,
  },
});
