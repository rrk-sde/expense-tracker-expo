import React, { useEffect, useRef, useState } from 'react';
import { Animated, Platform, StatusBar, StyleSheet, Text, View } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import LoginScreen from './components/LoginScreen';
import LiveTransactionList from './components/LiveTransactionList';
import VaultList from './components/VaultList';
import { theme } from './theme';

const queryClient = new QueryClient();

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const ringA = useRef(new Animated.Value(0)).current;
  const ringB = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const run = (value: Animated.Value, distance: number, duration: number) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(value, { toValue: distance, duration, useNativeDriver: true }),
          Animated.timing(value, { toValue: 0, duration, useNativeDriver: true }),
        ])
      );

    const a = run(ringA, 14, 3600);
    const b = run(ringB, -12, 3100);
    a.start();
    b.start();
    return () => {
      a.stop();
      b.stop();
    };
  }, [ringA, ringB]);

  const content = !user ? (
    <LoginScreen onLogin={setUser} />
  ) : !selectedVaultId ? (
    <VaultList user={user} onSelectVault={setSelectedVaultId} />
  ) : (
    <LiveTransactionList vaultId={selectedVaultId} user={user} onBack={() => setSelectedVaultId(null)} />
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={styles.app}>
          <StatusBar barStyle="dark-content" backgroundColor={theme.colors.bg} />
          <View style={styles.topFade} />
          <View style={styles.bottomFade} />
          <View pointerEvents="none" style={styles.decorationLayer}>
            <Animated.View style={[styles.ring, styles.ringOne, { transform: [{ translateY: ringA }] }]}>
              <Text style={styles.ringText}>TRACK</Text>
            </Animated.View>
            <Animated.View style={[styles.ring, styles.ringTwo, { transform: [{ translateY: ringB }] }]}>
              <Text style={styles.ringText}>SHARE</Text>
            </Animated.View>
          </View>
          {content}
        </SafeAreaView>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  app: {
    flex: 1,
    backgroundColor: theme.colors.bg,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  topFade: {
    position: 'absolute',
    top: -130,
    left: -80,
    width: 340,
    height: 260,
    borderRadius: 220,
    backgroundColor: theme.colors.bgDeep,
  },
  bottomFade: {
    position: 'absolute',
    right: -100,
    bottom: -150,
    width: 380,
    height: 310,
    borderRadius: 240,
    backgroundColor: theme.colors.bgSoft,
  },
  decorationLayer: {
    ...StyleSheet.absoluteFillObject,
  },
  ring: {
    position: 'absolute',
    paddingHorizontal: 2,
    paddingVertical: 1,
  },
  ringOne: {
    top: '20%',
    right: 18,
  },
  ringTwo: {
    bottom: '20%',
    left: 18,
  },
  ringText: {
    color: '#7FA08B',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 2.4,
    opacity: 0.5,
    fontFamily: theme.typography.body,
  },
});
