import React, { useEffect, useState } from 'react';
import { Platform, StatusBar, StyleSheet, View } from 'react-native';
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

  useEffect(() => {
    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.colors.bg;
      document.documentElement.style.backgroundColor = theme.colors.bg;
    }
  }, []);

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
  }
});
