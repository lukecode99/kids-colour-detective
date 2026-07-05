import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  SafeAreaView,
  Platform,
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
import { bestMatchLabel, usePaintFilters } from '../components/paintMatchUI';
import { bestMatchInfo } from '../utils/matchLabel';
import CaptureReticle from '../components/CaptureReticle';
import PhotoPickerScreen from './PhotoPickerScreen';
import { addSavedColor, newSavedColorId } from '../utils/savedColors';
import { setCurrentColour } from '../utils/currentColour';
import { COLORS, FONTS } from '../theme';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const SCAN_INTERVAL_MS = 1500; // web fallback loop only
const SCAN_FPS = 5; // native frame-processor readings — one every 200ms
const SAMPLE_N = 9; // 9×9 median window for the centre reading

type WhiteRefMode = 'off' | 'calibrating' | 'locked';

function rgbToHex([r, g, b]: Rgb): string {
  return '#' + [r, g, b].map(c => c.toString(16).padStart(2, '0')).join('').toUpperCase();
}

function hintLabel(hint: 'dim' | 'warm', hasTorch: boolean): string {
  if (hint === 'dim') {
    return hasTorch ? '💡 Low light — try the torch' : '💡 Low light — add more light';
  }
  return hasTorch
    ? '🔦 Warm light — use the torch or ⬜ white-card calibrate'
    : '🎨 Warm light — try ⬜ white-card calibrate';
}

// Guided white-card flow: hold paper in the centre, tap to lock. Replaces
// the old silent auto-hunt for a bright region.
function CalibrationOverlay({
  rawRgb,
  onLock,
  onCancel,
}: {
  rawRgb: Rgb;
  onLock: () => void;
  onCancel: () => void;
}) {
  const ok = isPlausibleWhiteRef(rawRgb);
  const hex = rgbToHex(rawRgb);
  return (
    <View style={styles.calibOverlay} pointerEvents="box-none">
      <View style={styles.calibCard}>
        <Text style={styles.calibTitle}>⬜ White-card calibration</Text>
        <Text style={styles.calibText}>
          Hold white paper or card so it fills the circle, then lock.
        </Text>
        <View style={styles.calibSwatchRow}>
          <View style={[styles.calibSwatch, { backgroundColor: hex }]} />
          <Text style={styles.calibHex}>{hex}</Text>
        </View>
        {!ok && (
          <Text style={styles.calibWarn}>
            That doesn't look like white paper — add light or move closer
          </Text>
        )}
        <View style={styles.calibBtnRow}>
          <TouchableOpacity style={styles.calibCancel} onPress={onCancel}>
            <Text style={styles.calibCancelText}>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.calibLock, !ok && styles.calibLockDisabled]}
            onPress={onLock}
            disabled={!ok}
          >
            <Text style={styles.calibLockText}>Lock white</Text>
          </TouchableOpacity>
        </View>
      </View>
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
  const [torchOn, setTorchOn] = useState(false);
  const [torchSupported, setTorchSupported] = useState(false);
  const [camError, setCamError] = useState<string | null>(null);
  const [whiteRefMode, setWhiteRefMode] = useState<WhiteRefMode>('off');
  const [rawRgb, setRawRgb] = useState<Rgb>([128, 128, 128]);
  const { candidates } = usePaintFilters();

  const historyRef = useRef<Rgb[]>([]);
  const rawRgbRef = useRef<Rgb>([128, 128, 128]);
  const whiteRefValueRef = useRef<WhiteRef | null>(null);
  const whiteRefModeRef = useRef<WhiteRefMode>('off');
  whiteRefModeRef.current = whiteRefMode;

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
        // 9×9 median over the centre region instead of a 1×1 mean: one
        // outlier pixel (speckle, edge, glare) can no longer swing the
        // reading.
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

        // Median over recent steady frames irons out the remaining
        // frame-to-frame wobble so the top match stays put.
        historyRef.current = pushReading(historyRef.current, raw);
        let [r, g, b] = stabilizedRgb(historyRef.current);
        if (whiteRefModeRef.current === 'locked' && whiteRefValueRef.current) {
          [r, g, b] = applyWhiteRef([r, g, b], whiteRefValueRef.current);
        }
        const info = getColorInfo(r, g, b, true);
        setColorState({
          info,
          matches: matchPaintsLab(rgbToLab(r, g, b), 5, candidates),
          r, g, b,
        });
        // Feed the My Colours tab.
        setCurrentColour({ rgb: [r, g, b], hex: info.hex, name: info.name });
      } catch {}
    }, SCAN_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [candidates]);

  const handleWhiteRefPress = useCallback(() => {
    setWhiteRefMode(mode => {
      if (mode === 'off') return 'calibrating';
      whiteRefValueRef.current = null;
      return 'off';
    });
  }, []);

  const lockWhiteRef = useCallback(() => {
    const [r, g, b] = rawRgbRef.current;
    whiteRefValueRef.current = { r, g, b };
    setWhiteRefMode('locked');
  }, []);

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
      addSavedColor(
        {
          id: newSavedColorId(),
          hex: cs.info.hex,
          name: cs.info.name,
          emoji: cs.info.emoji,
          match: bestMatchLabel(cs.matches),
          bestMatch: bestMatchInfo(cs.matches),
          timestamp: Date.now(),
        },
        thumb
      );
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
          {torchSupported && (
            <>
              <TouchableOpacity style={[styles.togglePill, torchOn && styles.toggleActiveRef]} onPress={toggleTorch}>
                <Text style={[FONTS.toggle, styles.toggleText, torchOn && styles.toggleTextActive]}>🔦</Text>
              </TouchableOpacity>
              <View style={styles.toggleDivider} />
            </>
          )}
          <TouchableOpacity
            style={[styles.togglePill, whiteRefMode !== 'off' && styles.toggleActiveRef]}
            onPress={handleWhiteRefPress}
          >
            <Text style={[FONTS.toggle, styles.toggleText, whiteRefMode !== 'off' && styles.toggleTextActive]}>
              {whiteRefMode === 'locked' ? '⬜ ✓' : whiteRefMode === 'calibrating' ? '⬜ …' : '⬜'}
            </Text>
          </TouchableOpacity>
          <View style={styles.toggleDivider} />
          <TouchableOpacity style={styles.togglePill} onPress={onOpenPhoto}>
            <Text style={[FONTS.toggle, styles.toggleText]}>🖼 Photo</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Tappable capture reticle (CD-12) */}
      <CaptureReticle onCapture={saveColor} disabled={whiteRefMode === 'calibrating'} />

      {whiteRefMode === 'calibrating' && (
        <CalibrationOverlay
          rawRgb={rawRgb}
          onLock={lockWhiteRef}
          onCancel={() => setWhiteRefMode('off')}
        />
      )}

      <TouchableOpacity style={styles.bottomPanel} onPress={saveColor} activeOpacity={0.85}>
        <View style={[styles.swatchStrip, { backgroundColor: colorInfo.hex }]} />
        {(() => {
          const hint = lightingHint(rawRgb);
          return hint && !torchOn && whiteRefMode !== 'calibrating' ? (
            <Text style={styles.lightHintText}>{hintLabel(hint, torchSupported)}</Text>
          ) : null;
        })()}
        <View style={styles.colorInfoRow}>
          <View style={styles.colorTextBlock}>
            <Text style={[FONTS.colorName, styles.colorNameText]} numberOfLines={2}>
              {matches[0] ? matches[0].paint.name : colorInfo.name}
            </Text>
            <Text style={[FONTS.colorNameSub, styles.hexText]}>
              {matches[0]
                ? `${matches[0].paint.brand} · ${matches[0].matchPercent}% match · ${matches[0].closeness}`
                : colorInfo.hex}
            </Text>
            <Text style={styles.scanSubLine}>
              {colorInfo.name} · {colorInfo.hex}
            </Text>
          </View>
          <Text style={{ color: 'rgba(255,255,255,0.35)', fontSize: 13, marginLeft: 8 }}>tap to save</Text>
        </View>
        <Text style={styles.scanHintLine}>
          All matches, filters &amp; buy links live in the My Colours tab
        </Text>
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
  const { useCameraDevice, useCameraFormat, useCameraPermission, useFrameProcessor, runAtTargetFps } =
    VisionCamera;
  const { useRunOnJS } = WorkletsCore;

  const { hasPermission, requestPermission } = useCameraPermission();
  const device = useCameraDevice('back');
  // A modest video format: the frame processor only reads 81 centre pixels,
  // so 720p keeps the per-frame buffer copy cheap without hurting accuracy.
  const format = useCameraFormat(device, [{ videoResolution: { width: 1280, height: 720 } }]);
  const [colorInfo, setColorInfo] = useState<ColorInfo>({
    name: 'Detecting…',
    hex: '#808080',
    emoji: '🔍',
  });
  const [matches, setMatches] = useState<PaintMatch[]>([]);
  const [whiteRefMode, setWhiteRefMode] = useState<WhiteRefMode>('off');
  const [rawRgb, setRawRgb] = useState<Rgb>([128, 128, 128]);
  const [torchOn, setTorchOn] = useState(false);
  const [isUnstable, setIsUnstable] = useState(false);
  const { candidates } = usePaintFilters();

  const cameraRef = useRef<any>(null);
  const historyRef = useRef<Rgb[]>([]);
  const rawRgbRef = useRef<Rgb>([128, 128, 128]);
  const whiteRefValueRef = useRef<WhiteRef | null>(null);
  const whiteRefModeRef = useRef<WhiteRefMode>('off');
  whiteRefModeRef.current = whiteRefMode;

  // JS half of the scan loop: the worklet hands over SAMPLE_N×SAMPLE_N RGB
  // triplets and the CD-6 pipeline (median → stability window → white-card
  // correction) runs exactly as it did for the old photo-based loop.
  const onSample = useRunOnJS(
    (flat: number[]) => {
      const pixels: Rgb[] = [];
      for (let i = 0; i + 2 < flat.length; i += 3) {
        pixels.push([flat[i], flat[i + 1], flat[i + 2]]);
      }
      const raw = medianRgb(pixels);
      rawRgbRef.current = raw;
      setRawRgb(raw);

      // Median over recent steady frames irons out frame-to-frame wobble
      // so the same wall keeps the same top match.
      historyRef.current = pushReading(historyRef.current, raw);
      const stable = isStable(historyRef.current);
      setIsUnstable(historyRef.current.length >= 2 && !stable);

      let [r, g, b] = stabilizedRgb(historyRef.current);
      if (whiteRefModeRef.current === 'locked' && whiteRefValueRef.current) {
        [r, g, b] = applyWhiteRef([r, g, b], whiteRefValueRef.current);
      }

      const info = getColorInfo(r, g, b, true);
      setColorInfo(info);
      setMatches(matchPaintsLab(rgbToLab(r, g, b), 5, candidates));
      // Feed the My Colours tab.
      setCurrentColour({ rgb: [r, g, b], hex: info.hex, name: info.name });
    },
    [candidates]
  );

  // With pixelFormat="rgb", iOS delivers BGRA bytes and Android RGBA —
  // hence the per-platform channel order below.
  const isIOS = Platform.OS === 'ios';
  const frameProcessor = useFrameProcessor(
    (frame: any) => {
      'worklet';
      runAtTargetFps(SCAN_FPS, () => {
        'worklet';
        const data = new Uint8Array(frame.toArrayBuffer());
        const bpr = frame.bytesPerRow;
        // 9×9 grid over the centre 15% region — same sampling window the
        // photo crop used, read directly from the preview frame.
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
    setWhiteRefMode(mode => {
      if (mode === 'off') return 'calibrating';
      whiteRefValueRef.current = null;
      return 'off';
    });
  }, []);

  const lockWhiteRef = useCallback(() => {
    const [r, g, b] = rawRgbRef.current;
    whiteRefValueRef.current = { r, g, b };
    setWhiteRefMode('locked');
  }, []);

  const saveColor = useCallback(async () => {
    // The scan loop no longer produces photo files, so grab a preview
    // snapshot (no shutter) for the thumbnail; the snapshot file is
    // temporary, so savedColors copies it to app storage.
    let thumb: string | undefined;
    try {
      const snap = await cameraRef.current?.takeSnapshot({ quality: 70 });
      if (snap?.path) {
        const uri = snap.path.startsWith('file://') ? snap.path : `file://${snap.path}`;
        const t = await ImageManipulator.manipulateAsync(
          uri,
          [{ resize: { width: 96 } }],
          { compress: 0.7, format: ImageManipulator.SaveFormat.JPEG }
        );
        thumb = t.uri;
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
      },
      thumb
    );
  }, [colorInfo, matches]);

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
  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {/* Full-screen camera with the live scan-loop frame processor */}
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

      {/* Top-left: colour name overlay — tappable to save */}
      <SafeAreaView style={styles.nTopLeft} pointerEvents="box-none">
        <TouchableOpacity onPress={saveColor} activeOpacity={0.8} style={styles.nColorNameTouchable}>
          <Text style={styles.nColorName} numberOfLines={2}>
            {matches[0] ? matches[0].paint.name : colorInfo.name}
          </Text>
          <Text style={styles.nColorHex}>
            {matches[0]
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

      {/* Centre crosshair — tappable capture control (CD-12) */}
      <CaptureReticle onCapture={saveColor} disabled={whiteRefMode === 'calibrating'} />

      {/* Stability indicator — below crosshair, above bottom panel */}
      {isUnstable && (
        <View style={styles.nStabilityBar} pointerEvents="none">
          <Text style={styles.nStabilityText}>● Unstable — move closer to the surface</Text>
        </View>
      )}

      {/* Guided white-card calibration */}
      {whiteRefMode === 'calibrating' && (
        <CalibrationOverlay
          rawRgb={rawRgb}
          onLock={lockWhiteRef}
          onCancel={() => setWhiteRefMode('off')}
        />
      )}

      {/* Bottom slim panel */}
      <View style={styles.nBottomPanel}>
        {/* Controls: White Ref + Photo */}
        <View style={styles.nControlRow}>
          <View style={{ flex: 1 }} />
          <TouchableOpacity
            style={[styles.nPill, whiteRefMode !== 'off' && styles.nPillActiveRef]}
            onPress={handleWhiteRefPress}
          >
            <Text style={[styles.nPillText, whiteRefMode !== 'off' && styles.nPillTextActive]}>
              {whiteRefMode === 'locked' ? '⬜ ✓' : whiteRefMode === 'calibrating' ? '⬜ …' : '⬜ Ref'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.nPill} onPress={onOpenPhoto}>
            <Text style={styles.nPillText}>🖼 Photo</Text>
          </TouchableOpacity>
        </View>

        {/* Colour swatch strip */}
        <View style={[styles.nSwatchStrip, { backgroundColor: colorInfo.hex }]} />

        {(() => {
          const hint = lightingHint(rawRgb);
          return hint && !torchOn && whiteRefMode !== 'calibrating' ? (
            <Text style={styles.lightHintText}>{hintLabel(hint, true)}</Text>
          ) : null;
        })()}

        {/* Underlying colour, demoted below the paint match */}
        <View style={styles.nMatchRow}>
          <Text style={styles.nMatchName} numberOfLines={1}>
            {colorInfo.name}
          </Text>
          <Text style={styles.nMatchHex}>{colorInfo.hex}</Text>
        </View>
        <Text style={styles.scanHintLine}>
          All matches, filters &amp; buy links live in the My Colours tab
        </Text>
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

  // --- White-card calibration overlay (shared) ---
  calibOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    alignItems: 'center', justifyContent: 'flex-end',
    paddingBottom: 180, zIndex: 20,
  },
  calibCard: {
    backgroundColor: 'rgba(13,14,26,0.92)', borderRadius: 16,
    paddingHorizontal: 20, paddingVertical: 16,
    marginHorizontal: 24, maxWidth: 420,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)',
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
    backgroundColor: COLORS.accent, paddingHorizontal: 20, paddingVertical: 9, borderRadius: 20,
  },
  calibLockDisabled: { backgroundColor: 'rgba(255,255,255,0.15)' },
  calibLockText: { color: '#fff', fontSize: 14, fontWeight: '700' },

  // --- Lighting hint (shared, inside bottom panel) ---
  lightHintText: {
    color: '#FFD700', fontSize: 12, fontWeight: '700',
    paddingHorizontal: 20, paddingTop: 8,
  },

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

  // --- Cross-tab hints (shared) ---
  scanSubLine: { color: 'rgba(255,255,255,0.4)', fontSize: 14, fontWeight: '600', marginTop: 4 },
  scanHintLine: {
    color: 'rgba(255,255,255,0.35)', fontSize: 12, fontWeight: '600',
    paddingHorizontal: 24, paddingTop: 4, paddingBottom: 2,
  },

  nMatchRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingTop: 10, paddingBottom: 6,
  },
  nMatchName: { color: COLORS.text, fontSize: 22, fontWeight: '800', letterSpacing: -0.5 },
  nMatchHex: { color: COLORS.textMuted, fontSize: 13, fontWeight: '600' },
});
