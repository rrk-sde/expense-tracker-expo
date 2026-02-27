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
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Load persisted state on mount
    if (typeof window !== 'undefined' && window.localStorage) {
      const savedUser = window.localStorage.getItem('auth_user');
      const savedVault = window.localStorage.getItem('selected_vault_id');
      if (savedUser) {
        try {
          setUser(JSON.parse(savedUser));
        } catch (e) {
          console.error('Failed to parse saved user', e);
        }
      }
      if (savedVault) setSelectedVaultId(savedVault);
    }
    setIsReady(true);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.colors.bg;
      document.documentElement.style.backgroundColor = theme.colors.bg;
    }
  }, []);

  // Sync state to storage
  useEffect(() => {
    if (!isReady) return;
    if (typeof window !== 'undefined' && window.localStorage) {
      if (user) {
        window.localStorage.setItem('auth_user', JSON.stringify(user));
      } else {
        window.localStorage.removeItem('auth_user');
      }
    }
  }, [user, isReady]);

  useEffect(() => {
    if (!isReady) return;
    if (typeof window !== 'undefined' && window.localStorage) {
      if (selectedVaultId) {
        window.localStorage.setItem('selected_vault_id', selectedVaultId);
      } else {
        window.localStorage.removeItem('selected_vault_id');
      }
    }
  }, [selectedVaultId, isReady]);

  if (!isReady) return null;

  const content = !user ? (
    <LoginScreen onLogin={setUser} />
  ) : !selectedVaultId ? (
    <VaultList user={user} onSelectVault={setSelectedVaultId} onLogout={() => setUser(null)} />
  ) : (
    <LiveTransactionList vaultId={selectedVaultId} user={user} onBack={() => setSelectedVaultId(null)} />
  );

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SafeAreaView style={styles.app}>
          <StatusBar barStyle="dark-content" backgroundColor={theme.colors.bg} />
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
  }
});
