import React from 'react';
import { Platform, View, Text, StyleSheet } from 'react-native';
import CameraScreen from './src/screens/CameraScreen';

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

export default function App() {
  if (Platform.OS === 'web') {
    return (
      <ErrorBoundary>
        <CameraScreen />
      </ErrorBoundary>
    );
  }
  return <CameraScreen />;
}

const styles = StyleSheet.create({
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
