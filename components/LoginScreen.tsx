import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { shadows, theme } from '../theme';

const API_BASE_URL = 'https://expense-tracker-prisma.vercel.app';

type AuthMode = 'signin' | 'signup' | 'forgot';

export default function LoginScreen({ onLogin }: { onLogin: (user: any) => void }) {
  const { width } = useWindowDimensions();
  const isDesktop = width >= 950;

  const [mode, setMode] = useState<AuthMode>('signin');
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [message, setMessage] = useState<{ type: 'error' | 'success'; text: string } | null>(null);

  const opacity = useRef(new Animated.Value(0)).current;
  const translate = useRef(new Animated.Value(12)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 220, useNativeDriver: true }),
      Animated.timing(translate, { toValue: 0, duration: 220, useNativeDriver: true }),
    ]).start();
  }, [mode, opacity, translate]);

  const callApi = async (path: string, body: Record<string, unknown>) => {
    const res = await fetch(`${API_BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const raw = await res.text();
    let payload: any = {};
    try {
      payload = raw ? JSON.parse(raw) : {};
    } catch {
      payload = { error: raw || 'Request failed' };
    }

    if (!res.ok) throw new Error(payload?.error || 'Request failed');
    return payload;
  };

  const handleSubmit = async () => {
    setMessage(null);
    if (!email.trim()) {
      setMessage({ type: 'error', text: 'Email is required.' });
      return;
    }

    if (mode === 'forgot') {
      setLoading(true);
      try {
        const payload = await callApi('/api/auth/forgot-password', { email });
        setMessage({
          type: 'success',
          text: payload?.resetToken
            ? `Reset token (demo): ${payload.resetToken}`
            : 'If the account exists, reset instructions were sent.',
        });
        if (payload?.resetToken) setResetToken(payload.resetToken);
      } catch (e: any) {
        setMessage({ type: 'error', text: e.message || 'Reset request failed.' });
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!password.trim()) {
      setMessage({ type: 'error', text: 'Password is required.' });
      return;
    }

    if (mode === 'signup' && password.length < 8) {
      setMessage({ type: 'error', text: 'Password must be at least 8 characters.' });
      return;
    }

    setLoading(true);
    try {
      const user =
        mode === 'signup'
          ? await callApi('/api/auth/register', { email, name, password })
          : await callApi('/api/auth/login', { email, password });
      onLogin(user);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Authentication failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async () => {
    setMessage(null);
    if (!email.trim() || !resetToken.trim() || !newPassword.trim()) {
      setMessage({ type: 'error', text: 'Email, token, and new password are required.' });
      return;
    }
    if (newPassword.length < 8) {
      setMessage({ type: 'error', text: 'New password must be at least 8 characters.' });
      return;
    }

    setLoading(true);
    try {
      await callApi('/api/auth/reset-password', { email, token: resetToken, newPassword });
      setMode('signin');
      setPassword(newPassword);
      setResetToken('');
      setNewPassword('');
      setMessage({ type: 'success', text: 'Password reset successful. Sign in now.' });
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message || 'Reset failed.' });
    } finally {
      setLoading(false);
    }
  };

  const handleGuestLogin = async () => {
    Keyboard.dismiss();
    setLoading(true);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/auth/guest`, { method: 'POST' });
      const payload = await res.json();
      if (!res.ok) throw new Error(payload?.error || 'Failed to sign in as guest');
      onLogin(payload);
    } catch (e: any) {
      setMessage({ type: 'error', text: e.message });
      setLoading(false);
    }
  };

  const form = (
    <Animated.View style={[styles.formShell, { opacity, transform: [{ translateY: translate }] }]}>
      <View style={styles.modeRow}>
        <TouchableOpacity style={[styles.modeBtn, mode === 'signin' && styles.modeBtnActive]} onPress={() => setMode('signin')}>
          <Text style={[styles.modeBtnText, mode === 'signin' && styles.modeBtnTextActive]}>Sign in</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.modeBtn, mode === 'signup' && styles.modeBtnActive]} onPress={() => setMode('signup')}>
          <Text style={[styles.modeBtnText, mode === 'signup' && styles.modeBtnTextActive]}>Sign up</Text>
        </TouchableOpacity>
      </View>

      {mode === 'signup' && (
        <TextInput
          style={styles.input}
          placeholder="Full name"
          placeholderTextColor={theme.colors.textMuted}
          value={name}
          onChangeText={setName}
        />
      )}

      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={theme.colors.textMuted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        keyboardType="email-address"
      />

      {mode !== 'forgot' && (
        <View style={styles.inputRow}>
          <TextInput
            style={[styles.input, styles.inputWithAction]}
            placeholder="Password"
            placeholderTextColor={theme.colors.textMuted}
            value={password}
            onChangeText={setPassword}
            secureTextEntry={!showPassword}
          />
          <TouchableOpacity style={styles.inputAction} onPress={() => setShowPassword((v) => !v)}>
            <Text style={styles.inputActionText}>{showPassword ? 'Hide' : 'Show'}</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === 'forgot' && (
        <>
          <TextInput
            style={styles.input}
            placeholder="Reset token"
            placeholderTextColor={theme.colors.textMuted}
            value={resetToken}
            onChangeText={setResetToken}
            autoCapitalize="characters"
          />
          <View style={styles.inputRow}>
            <TextInput
              style={[styles.input, styles.inputWithAction]}
              placeholder="New password"
              placeholderTextColor={theme.colors.textMuted}
              value={newPassword}
              onChangeText={setNewPassword}
              secureTextEntry={!showNewPassword}
            />
            <TouchableOpacity style={styles.inputAction} onPress={() => setShowNewPassword((v) => !v)}>
              <Text style={styles.inputActionText}>{showNewPassword ? 'Hide' : 'Show'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}

      {message && <Text style={message.type === 'error' ? styles.errorText : styles.successText}>{message.text}</Text>}

      <TouchableOpacity style={styles.primaryBtn} onPress={handleSubmit} disabled={loading}>
        {loading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.primaryBtnText}>
            {mode === 'signin' ? 'Enter workspace' : mode === 'signup' ? 'Create account' : 'Request reset token'}
          </Text>
        )}
      </TouchableOpacity>

      {mode === 'signin' && (
        <TouchableOpacity style={styles.secondaryBtn} onPress={handleGuestLogin} disabled={loading}>
          <Text style={styles.secondaryBtnText}>Continue as guest</Text>
        </TouchableOpacity>
      )}

      {mode === 'forgot' ? (
        <TouchableOpacity style={styles.linkBtn} onPress={handleResetPassword} disabled={loading}>
          <Text style={styles.linkText}>Apply new password</Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity style={styles.linkBtn} onPress={() => setMode('forgot')}>
          <Text style={styles.linkText}>Forgot password?</Text>
        </TouchableOpacity>
      )}
    </Animated.View>
  );

  const panel = (
    <View style={styles.heroPanel}>
      <Text style={styles.badge}>SHARED EXPENSE SYSTEM</Text>
      <Text style={styles.heroTitle}>Split smarter. Track together. Stay in sync.</Text>
      <Text style={styles.heroSubtitle}>
        One workspace for roommates, travel groups, and teams with real-time spending updates.
      </Text>
      <View style={styles.heroStats}>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>Live</Text>
          <Text style={styles.statLabel}>Presence</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>Fast</Text>
          <Text style={styles.statLabel}>Filter history</Text>
        </View>
        <View style={styles.statTile}>
          <Text style={styles.statValue}>Safe</Text>
          <Text style={styles.statLabel}>Email auth</Text>
        </View>
      </View>
    </View>
  );

  if (isDesktop) {
    return (
      <View style={styles.desktopWrap}>
        <View style={styles.desktopLeft}>{panel}</View>
        <View style={styles.desktopRight}>{form}</View>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.mobileWrap} keyboardShouldPersistTaps="handled">
      {panel}
      {form}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  desktopWrap: {
    flex: 1,
    flexDirection: 'row',
  },
  desktopLeft: {
    flex: 1,
    paddingHorizontal: 56,
    justifyContent: 'center',
  },
  desktopRight: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  mobileWrap: {
    flexGrow: 1,
    paddingHorizontal: 18,
    paddingBottom: 42,
    paddingTop: 8,
    gap: 16,
  },
  heroPanel: {
    borderRadius: theme.radius.xl,
    padding: 24,
    backgroundColor: '#103325',
    borderWidth: 1,
    borderColor: '#2A5C47',
    ...shadows.card,
  },
  badge: {
    color: '#8FDDB9',
    fontWeight: '800',
    letterSpacing: 1.1,
    fontSize: 11,
    fontFamily: theme.typography.body,
    marginBottom: 14,
  },
  heroTitle: {
    color: '#FFFFFF',
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  heroSubtitle: {
    marginTop: 10,
    color: '#CBE8DA',
    lineHeight: 22,
    fontSize: 15,
    fontFamily: theme.typography.body,
  },
  heroStats: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 8,
  },
  statTile: {
    flex: 1,
    backgroundColor: '#1D4635',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: '#2D604A',
    padding: 10,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  statLabel: {
    color: '#99CDB4',
    marginTop: 2,
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  formShell: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.xl,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 18,
    ...shadows.float,
  },
  modeRow: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
    marginBottom: 12,
  },
  modeBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    borderRadius: theme.radius.pill,
  },
  modeBtnActive: {
    backgroundColor: theme.colors.surface,
  },
  modeBtnText: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontSize: 14,
    fontFamily: theme.typography.body,
  },
  modeBtnTextActive: {
    color: theme.colors.textPrimary,
  },
  inputRow: {
    position: 'relative',
  },
  input: {
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FBFDFB',
    color: theme.colors.textPrimary,
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
    marginBottom: 10,
    fontFamily: theme.typography.body,
  },
  inputWithAction: {
    paddingRight: 68,
  },
  inputAction: {
    position: 'absolute',
    right: 12,
    top: 12,
  },
  inputActionText: {
    color: theme.colors.brandStrong,
    fontWeight: '700',
    fontSize: 13,
    fontFamily: theme.typography.body,
  },
  errorText: {
    color: theme.colors.danger,
    marginTop: -2,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: theme.typography.body,
  },
  successText: {
    color: theme.colors.success,
    marginTop: -2,
    marginBottom: 8,
    fontSize: 13,
    fontFamily: theme.typography.body,
  },
  primaryBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 2,
  },
  primaryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 15,
    fontFamily: theme.typography.body,
  },
  secondaryBtn: {
    backgroundColor: '#EDF6F0',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: '#CFE1D3',
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 10,
  },
  secondaryBtnText: {
    color: theme.colors.brandStrong,
    fontWeight: '700',
    fontSize: 14,
    fontFamily: theme.typography.body,
  },
  linkBtn: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  linkText: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
});
