import React, { useEffect, useState } from 'react';
import { Platform, StatusBar, StyleSheet } from 'react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';

import LoginScreen from './components/LoginScreen';
import LiveTransactionList from './components/LiveTransactionList';
import VaultList from './components/VaultList';
import { theme } from './theme';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,                    // Don't retry 3 times on every failure
      refetchOnWindowFocus: false, // Pusher handles real-time, no need to refetch on tab switch
      gcTime: 1000 * 60 * 5,      // Keep cache alive 5 min after component unmount
    },
  },
});

const storage = {
  getItem: (key: string): string | null => {
    try {
      if ((globalThis as any).localStorage) {
        return (globalThis as any).localStorage.getItem(key);
      }
    } catch { }
    return null;
  },
  setItem: (key: string, value: string) => {
    try {
      if ((globalThis as any).localStorage) {
        (globalThis as any).localStorage.setItem(key, value);
      }
    } catch { }
  },
  removeItem: (key: string) => {
    try {
      if ((globalThis as any).localStorage) {
        (globalThis as any).localStorage.removeItem(key);
      }
    } catch { }
  },
};

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [selectedVaultId, setSelectedVaultId] = useState<string | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // Load persisted state on mount
    const savedUser = storage.getItem('auth_user');
    const savedVault = storage.getItem('selected_vault_id');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch { }
    }
    if (savedVault) setSelectedVaultId(savedVault);
    setIsReady(true);

    if (Platform.OS === 'web' && typeof document !== 'undefined') {
      document.body.style.backgroundColor = theme.colors.bg;
      document.documentElement.style.backgroundColor = theme.colors.bg;

      const style = document.createElement('style');
      style.innerHTML = `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Outfit:wght@400;600;700;800;900&display=swap');

        *, *::before, *::after { box-sizing: border-box; }

        html, body, #root {
          height: 100%;
          margin: 0;
          padding: 0;
          overflow: hidden;
          background-color: ${theme.colors.bg};
          font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
          -webkit-font-smoothing: antialiased;
          -moz-osx-font-smoothing: grayscale;
        }

        /* Prevent iOS text size adjustment */
        body { -webkit-text-size-adjust: 100%; text-size-adjust: 100%; }

        /* Better scrollbars on web */
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: ${theme.colors.border}; border-radius: 3px; }
        ::-webkit-scrollbar-thumb:hover { background: ${theme.colors.textMuted}; }

        /* Prevent double-tap zoom on buttons */
        button, [role="button"] { touch-action: manipulation; }

        /* Remove default input/button outlines and replace with better focus rings */
        input:focus, textarea:focus, [contenteditable]:focus {
          outline: 2px solid ${theme.colors.brand};
          outline-offset: 0;
        }

        /* Prevent accidental text selection on interactive elements */
        button, [role="button"], [role="tab"] { user-select: none; }
      `;
      document.head.appendChild(style);
    }
  }, []);

  // Sync state to storage
  useEffect(() => {
    if (!isReady) return;
    if (user) {
      storage.setItem('auth_user', JSON.stringify(user));
    } else {
      storage.removeItem('auth_user');
    }
  }, [user, isReady]);

  useEffect(() => {
    if (!isReady) return;
    if (selectedVaultId) {
      storage.setItem('selected_vault_id', selectedVaultId);
    } else {
      storage.removeItem('selected_vault_id');
    }
  }, [selectedVaultId, isReady]);

  if (!isReady) return null;

  let content: React.ReactNode;
  if (user && selectedVaultId) {
    content = <LiveTransactionList vaultId={selectedVaultId} user={user} onBack={() => setSelectedVaultId(null)} />;
  } else if (user) {
    content = <VaultList user={user} onSelectVault={setSelectedVaultId} onLogout={() => setUser(null)} />;
  } else {
    content = <LoginScreen onLogin={setUser} />;
  }

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
