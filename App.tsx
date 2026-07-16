import React, { useState } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import CameraScreen from './src/screens/CameraScreen';
import WheelScreen from './src/screens/WheelScreen';
import BrandMatchScreen from './src/screens/BrandMatchScreen';
import MyColoursScreen, { useSavedColors } from './src/screens/MyColoursScreen';
import { COLORS } from './src/theme';

interface State {
  hasError: boolean;
  error?: string;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.centered}>
          <Text style={styles.errorTitle}>😕 Something went wrong</Text>
          <Text style={styles.errorText}>{this.state.error}</Text>
          <Text style={styles.hintText}>
            For the best experience, open this in Expo Go on your phone.
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

// CD-40: 4 tabs — Scan · Brand Match · Planner · Saved.
// "My Colours" renamed to "Saved", Brand Match promoted to top-level.
type TabKey = 'scan' | 'brandmatch' | 'planner' | 'saved';

// Renders an SVG icon from the design mock.
// Web: native <svg> element via React.createElement (React Native Web passes it through).
// Native: Unicode/emoji fallback.
const NATIVE_ICONS: Record<TabKey, string> = {
  scan: '🔍',
  brandmatch: '⭐',
  planner: '🎡',
  saved: '🔖',
};

function TabIcon({ tab, color, size = 23 }: { tab: TabKey; color: string; size?: number }) {
  if (Platform.OS !== 'web') {
    return (
      <Text style={{ fontSize: size * 0.85, lineHeight: size + 4, color }}>
        {NATIVE_ICONS[tab]}
      </Text>
    );
  }
  // Web — inline SVG from the design mock (exact paths).
  const ce = (React.createElement as any);
  const p: Record<string, any> = {
    width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
    stroke: color, strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round',
  };
  switch (tab) {
    case 'scan':
      return ce('svg', p,
        ce('circle', { key: 'c', cx: 11, cy: 11, r: 7 }),
        ce('path', { key: 'p', d: 'M21 21l-4.3-4.3' }),
      );
    case 'brandmatch':
      return ce('svg', p,
        ce('path', { key: 'p', d: 'M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4-4.8-2.5-4.8 2.5.9-5.4L4.2 8.7l5.4-.8z' }),
      );
    case 'planner':
      return ce('svg', p,
        ce('circle', { key: 'c', cx: 12, cy: 12, r: 8.5 }),
        ce('path', { key: 'p', d: 'M12 3.5v17M3.5 12h17M6 6l12 12M18 6L6 18' }),
      );
    case 'saved':
      return ce('svg', p,
        ce('path', { key: 'p', d: 'M19 21l-7-4.5L5 21V5a2 2 0 012-2h10a2 2 0 012 2z' }),
      );
  }
}

// Active tab underline indicator (gradient on web, split view on native).
function ActiveIndicator() {
  if (Platform.OS === 'web') {
    // @ts-ignore - web-only background gradient
    const webStyle = { ...StyleSheet.flatten(styles.activeIndicatorBase), background: 'linear-gradient(90deg,#4D6BFF,#7C5CFF)' };
    return <View style={webStyle as any} />;
  }
  // Native: two-tone split approximating the gradient.
  return (
    <View style={styles.activeIndicatorBase}>
      <View style={{ flex: 1, backgroundColor: COLORS.blue }} />
      <View style={{ flex: 1, backgroundColor: COLORS.purple }} />
    </View>
  );
}

const TABS: { key: TabKey; label: string }[] = [
  { key: 'scan', label: 'Scan' },
  { key: 'brandmatch', label: 'Brand Match' },
  { key: 'planner', label: 'Planner' },
  { key: 'saved', label: 'Saved' },
];

// Inactive tabs unmount entirely: stops the camera loop when you leave Scan,
// and makes Saved re-read storage on return.
function TabRoot() {
  const [tab, setTab] = useState<TabKey>('scan');
  const { savedColors } = useSavedColors();
  const savedCount = savedColors.length;

  return (
    <View style={styles.root}>
      <View style={{ flex: 1 }}>
        {tab === 'scan' && <CameraScreen />}
        {tab === 'brandmatch' && <BrandMatchScreen />}
        {tab === 'planner' && <WheelScreen />}
        {tab === 'saved' && <MyColoursScreen />}
      </View>
      <SafeAreaView style={styles.tabBarSafe}>
        <View style={styles.tabBar}>
          {TABS.map(t => {
            const active = t.key === tab;
            const iconColor = active ? COLORS.blue : COLORS.textMuted;
            return (
              <TouchableOpacity
                key={t.key}
                style={styles.tabBtn}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                {active && <ActiveIndicator />}
                <View style={[styles.tabIconWrap, { opacity: active ? 1 : 0.75 }]}>
                  <TabIcon tab={t.key} color={iconColor} />
                </View>
                {t.key === 'saved' && savedCount > 0 && (
                  <View style={styles.badge}>
                    <Text style={styles.badgeText}>{savedCount > 99 ? '99+' : savedCount}</Text>
                  </View>
                )}
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </SafeAreaView>
    </View>
  );
}

export default function App() {
  if (Platform.OS === 'web') {
    return (
      <ErrorBoundary>
        <TabRoot />
      </ErrorBoundary>
    );
  }
  return <TabRoot />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.bg },
  tabBarSafe: {
    backgroundColor: COLORS.bg,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
  },
  tabBar: {
    flexDirection: 'row',
    height: 62,
    paddingBottom: Platform.OS === 'web' ? 10 : 0,
  },
  tabBtn: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 10,
    position: 'relative',
  },
  tabIconWrap: { marginBottom: 3 },
  tabLabel: {
    color: COLORS.textMuted,
    fontSize: 10.5,
    fontWeight: '600',
  },
  tabLabelActive: { color: '#fff' },
  activeIndicatorBase: {
    position: 'absolute',
    top: 0,
    width: 40,
    height: 3,
    borderRadius: 3,
    overflow: 'hidden',
    flexDirection: 'row',
  },
  badge: {
    position: 'absolute',
    top: 6,
    right: 18,
    backgroundColor: COLORS.purple,
    borderRadius: 8,
    paddingHorizontal: 5,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  centered: {
    flex: 1,
    backgroundColor: COLORS.bg,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: {
    color: COLORS.text,
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    color: COLORS.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'monospace',
  },
  hintText: {
    color: COLORS.purple,
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
});
