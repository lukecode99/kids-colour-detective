import React from 'react';
import { View, StyleSheet } from 'react-native';

export const CROSSHAIR_SIZE = 132;

// CD-40: the reticle is now a pure viewfinder — it frames the sampled region
// but does not trigger a capture. The big shutter button (CaptureButton in
// CameraScreen) owns that action. Tap-to-save from the circle is gone; the
// capture hint (CD-28) moved to the drawer.
export default function CaptureReticle({ disabled = false }: { disabled?: boolean }) {
  return (
    <View style={styles.container} pointerEvents="none">
      <View style={[styles.circle, disabled && styles.circleDisabled]}>
        <View style={styles.crossHorizontal} />
        <View style={styles.crossVertical} />
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
  circle: {
    width: CROSSHAIR_SIZE,
    height: CROSSHAIR_SIZE,
    borderRadius: CROSSHAIR_SIZE / 2,
    borderWidth: 2.5,
    borderColor: 'rgba(255,255,255,0.9)',
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    // Soft blue glow — shadow renders on native; a CSS box-shadow is added
    // via inline style on web (see CameraScreen's reticleGlow wrapper).
    shadowColor: '#4D6BFF',
    shadowOpacity: 0.28,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  circleDisabled: {
    borderColor: 'rgba(255,255,255,0.4)',
    shadowOpacity: 0,
  },
  crossHorizontal: {
    position: 'absolute',
    width: 20,
    height: 2,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
  },
  crossVertical: {
    position: 'absolute',
    width: 2,
    height: 20,
    backgroundColor: 'rgba(255,255,255,0.9)',
    borderRadius: 1,
  },
});
