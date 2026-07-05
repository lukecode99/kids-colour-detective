import React, { useState } from 'react';
import { Platform, View, Text, TouchableOpacity, StyleSheet, SafeAreaView } from 'react-native';
import CameraScreen from './src/screens/CameraScreen';
import MatchesScreen from './src/screens/MatchesScreen';
import SavedScreen from './src/screens/SavedScreen';
import PalettesScreen from './src/screens/PalettesScreen';

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

type TabKey = 'scan' | 'matches' | 'saved' | 'palettes';

const TABS: { key: TabKey; icon: string; label: string }[] = [
  { key: 'scan', icon: '🎯', label: 'Scan' },
  { key: 'matches', icon: '🎨', label: 'Matches' },
  { key: 'saved', icon: '💾', label: 'Saved' },
  { key: 'palettes', icon: '🧩', label: 'Palettes' },
];

// Inactive tabs unmount entirely: that stops the camera scan loop when
// you leave Scan, and makes Saved/Matches re-read storage on return.
function TabRoot() {
  const [tab, setTab] = useState<TabKey>('scan');
  return (
    <View style={styles.root}>
      <View style={{ flex: 1 }}>
        {tab === 'scan' && <CameraScreen />}
        {tab === 'matches' && <MatchesScreen />}
        {tab === 'saved' && <SavedScreen />}
        {tab === 'palettes' && <PalettesScreen />}
      </View>
      <SafeAreaView style={styles.tabBarSafe}>
        <View style={styles.tabBar}>
          {TABS.map(t => {
            const active = t.key === tab;
            return (
              <TouchableOpacity
                key={t.key}
                style={styles.tabBtn}
                onPress={() => setTab(t.key)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
              >
                <Text style={[styles.tabIcon, !active && styles.tabIconInactive]}>{t.icon}</Text>
                <Text style={[styles.tabLabel, active && styles.tabLabelActive]}>{t.label}</Text>
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
  root: { flex: 1, backgroundColor: '#0D0E1A' },
  tabBarSafe: {
    backgroundColor: 'rgba(13,14,26,0.98)',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(255,255,255,0.12)',
  },
  tabBar: {
    flexDirection: 'row',
    paddingTop: 6,
    paddingBottom: Platform.OS === 'web' ? 10 : 2,
  },
  tabBtn: { flex: 1, alignItems: 'center', paddingVertical: 2 },
  tabIcon: { fontSize: 20 },
  tabIconInactive: { opacity: 0.45 },
  tabLabel: {
    color: 'rgba(255,255,255,0.45)',
    fontSize: 11,
    fontWeight: '700',
    marginTop: 2,
  },
  tabLabelActive: { color: '#7B61FF' },
  centered: {
    flex: 1,
    backgroundColor: '#0D0E1A',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  errorTitle: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '800',
    marginBottom: 12,
    textAlign: 'center',
  },
  errorText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'monospace',
  },
  hintText: {
    color: '#7B61FF',
    fontSize: 16,
    textAlign: 'center',
    fontWeight: '600',
  },
});
