import React, { useRef, useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, Animated, StyleSheet } from 'react-native';
import { COLORS } from '../theme';

export const CROSSHAIR_SIZE = 140;

// CD-12: the breathing crosshair reticle is the capture control — tapping
// inside the circle saves the current colour. TouchableOpacity only
// completes a press when the finger stays put, so panning the camera never
// captures by accident. Feedback is visual only (scale dip + ring flash +
// a brief "✓ saved" badge); expo-haptics isn't in the dependency set.
//
// The circle must stay exactly screen-centred — the scan loop samples the
// centre pixels — so the badge is absolutely positioned below it rather
// than flowing in the layout.
export default function CaptureReticle({
  onCapture,
  disabled = false,
}: {
  onCapture: () => void;
  // e.g. during white-card calibration, when the circle frames the card
  disabled?: boolean;
}) {
  const breathScale = useRef(new Animated.Value(1)).current;
  const pressScale = useRef(new Animated.Value(1)).current;
  const flashOpacity = useRef(new Animated.Value(0)).current;
  const [showSaved, setShowSaved] = useState(false);
  const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  useEffect(
    () => () => {
      if (savedTimer.current) clearTimeout(savedTimer.current);
    },
    []
  );

  const handlePressIn = useCallback(() => {
    Animated.timing(pressScale, { toValue: 0.9, duration: 80, useNativeDriver: true }).start();
  }, [pressScale]);

  const handlePressOut = useCallback(() => {
    Animated.timing(pressScale, { toValue: 1, duration: 120, useNativeDriver: true }).start();
  }, [pressScale]);

  const handlePress = useCallback(() => {
    if (disabled) return;
    onCapture();
    flashOpacity.setValue(1);
    Animated.timing(flashOpacity, { toValue: 0, duration: 450, useNativeDriver: true }).start();
    setShowSaved(true);
    if (savedTimer.current) clearTimeout(savedTimer.current);
    savedTimer.current = setTimeout(() => setShowSaved(false), 900);
  }, [onCapture, flashOpacity, disabled]);

  return (
    <View style={styles.container} pointerEvents="box-none">
      <Animated.View
        style={{ transform: [{ scale: Animated.multiply(breathScale, pressScale) }] }}
      >
        <TouchableOpacity
          style={styles.touchable}
          activeOpacity={0.85}
          onPressIn={handlePressIn}
          onPressOut={handlePressOut}
          onPress={handlePress}
          accessibilityRole="button"
          accessibilityLabel="Capture colour"
        >
          <View style={styles.circle} />
          <Animated.View style={[styles.flashRing, { opacity: flashOpacity }]} />
          <View style={styles.crossHorizontal} />
          <View style={styles.crossVertical} />
        </TouchableOpacity>
      </Animated.View>
      <View style={[styles.savedBadge, { opacity: showSaved ? 1 : 0 }]} pointerEvents="none">
        <Text style={styles.savedText}>✓ saved</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  touchable: {
    width: CROSSHAIR_SIZE,
    height: CROSSHAIR_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    position: 'absolute',
    width: CROSSHAIR_SIZE,
    height: CROSSHAIR_SIZE,
    borderRadius: CROSSHAIR_SIZE / 2,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.8)',
    backgroundColor: 'transparent',
  },
  flashRing: {
    position: 'absolute',
    width: CROSSHAIR_SIZE,
    height: CROSSHAIR_SIZE,
    borderRadius: CROSSHAIR_SIZE / 2,
    borderWidth: 5,
    borderColor: COLORS.accent,
  },
  crossHorizontal: {
    position: 'absolute',
    width: 20,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 1,
  },
  crossVertical: {
    position: 'absolute',
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.8)',
    borderRadius: 1,
  },
  savedBadge: {
    position: 'absolute',
    top: '50%',
    marginTop: CROSSHAIR_SIZE / 2 + 14,
    backgroundColor: 'rgba(0,0,0,0.55)',
    paddingHorizontal: 14,
    paddingVertical: 5,
    borderRadius: 14,
  },
  savedText: { color: COLORS.text, fontSize: 14, fontWeight: '700' },
});
