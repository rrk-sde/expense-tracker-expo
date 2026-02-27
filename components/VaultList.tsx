import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  FlatList,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';

import { shadows, theme } from '../theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || '';

type Space = {
  id: string;
  name: string;
  memberCount?: number;
};

type Summary = {
  spaceCount: number;
  totalAmount7d: number;
  transactionCount7d: number;
  activeSpaces: number;
};

type FeedItem = {
  id: string;
  text: string;
  time: string;
};

export default function VaultList({ user, onSelectVault }: { user: any; onSelectVault: (vaultId: string) => void }) {
  const { width } = useWindowDimensions();
  const isLarge = width >= 1200;
  const isTablet = width >= 760;
  const numColumns = isLarge ? 3 : isTablet ? 2 : 1;

  const [vaults, setVaults] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<Summary>({ spaceCount: 0, totalAmount7d: 0, transactionCount7d: 0, activeSpaces: 0 });
  const [newVaultName, setNewVaultName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [actionMode, setActionMode] = useState<'create' | 'join'>('create');
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [recentFeed, setRecentFeed] = useState<FeedItem[]>([]);

  const ctaPulse = useRef(new Animated.Value(1)).current;

  const templates = ['Trip', 'Flat', 'Family', 'Office', 'Groceries'];

  const canCreate = Boolean(newVaultName.trim()) && !isCreating;
  const canJoin = Boolean(joinCode.trim()) && !isJoining;
  const isPrimaryEnabled = (actionMode === 'create' && canCreate) || (actionMode === 'join' && canJoin);

  const addFeed = (text: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    setRecentFeed((prev) => [{ id: String(Date.now()), text, time }, ...prev].slice(0, 5));
  };

  const loadVaults = async () => {
    setLoading(true);
    try {
      const [vaultRes, summaryRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/users/${user.id}/vaults`),
        fetch(`${API_BASE_URL}/api/users/${user.id}/summary`),
      ]);

      const vaultData = await vaultRes.json();
      const summaryData = summaryRes.ok ? await summaryRes.json() : null;

      setVaults(Array.isArray(vaultData) ? vaultData : []);
      if (summaryData) setSummary(summaryData);
    } catch (error) {
      console.error('Failed to load spaces', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadVaults();
  }, [user.id]);

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(ctaPulse, { toValue: 1.04, duration: 800, useNativeDriver: true }),
        Animated.timing(ctaPulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    );
    animation.start();
    return () => animation.stop();
  }, [ctaPulse]);

  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const invite = new URLSearchParams((globalThis as any)?.location?.search || '').get('invite');
    if (!invite) return;
    setActionMode('join');
    setJoinCode(String(invite).toUpperCase());
  }, []);

  const createVault = async (rawName: string) => {
    const name = rawName.trim();
    if (!name) return;
    setFeedback(null);
    setIsCreating(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vaults`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, userId: user.id }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: payload?.error || 'Could not create space.' });
        return;
      }
      setVaults((prev) => [{ ...payload, memberCount: 1 }, ...prev]);
      setNewVaultName('');
      addFeed(`Created ${payload.name}`);
      loadVaults();
    } catch {
      setFeedback({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setIsCreating(false);
    }
  };

  const joinVault = async () => {
    if (!joinCode.trim()) return;
    setFeedback(null);
    setIsJoining(true);

    try {
      const res = await fetch(`${API_BASE_URL}/api/vaults/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: joinCode.replace(/\s+/g, '').toUpperCase(), userId: user.id }),
      });

      const raw = await res.text();
      let payload: any = {};
      try {
        payload = raw ? JSON.parse(raw) : {};
      } catch {
        payload = { error: raw || 'Join failed' };
      }

      if (!res.ok) {
        setFeedback({ type: 'error', message: payload?.error || 'Invalid invite code.' });
        return;
      }

      setVaults((prev) => {
        if (prev.some((item) => item.id === payload.id)) return prev;
        return [{ ...payload, memberCount: payload.memberCount || 1 }, ...prev];
      });
      setJoinCode('');
      setFeedback({ type: 'success', message: `Joined "${payload.name}"` });
      addFeed(`Joined ${payload.name}`);
      loadVaults();
    } catch {
      setFeedback({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setIsJoining(false);
    }
  };

  const insights = useMemo(
    () => [
      { title: 'Weekly total', value: `₹${Number(summary.totalAmount7d || 0).toFixed(0)}` },
      { title: 'Transactions', value: `${summary.transactionCount7d || 0}` },
      { title: 'Active spaces', value: `${summary.activeSpaces || 0}` },
    ],
    [summary.activeSpaces, summary.totalAmount7d, summary.transactionCount7d]
  );

  const renderSpace = ({ item }: { item: Space }) => {
    const inviteCode = String(item.id).slice(0, 8).toUpperCase();
    const initials = item.name?.trim()?.charAt(0)?.toUpperCase() || 'S';

    return (
      <View style={[styles.cardWrap, numColumns > 1 && styles.cardWrapGrid]}>
        <TouchableOpacity style={styles.spaceCard} onPress={() => onSelectVault(item.id)}>
          <View style={styles.spaceTop}>
            <View style={styles.spaceAvatar}>
              <Text style={styles.spaceAvatarText}>{initials}</Text>
            </View>
            <View style={styles.spaceTitleWrap}>
              <Text style={styles.spaceTitle}>{item.name}</Text>
              <Text style={styles.spaceCode}>INV {inviteCode}</Text>
            </View>
          </View>

          <View style={styles.spaceMetaRow}>
            <View style={styles.spaceChip}>
              <Text style={styles.spaceChipText}>Members {item.memberCount || 1}</Text>
            </View>
            <View style={styles.spaceChip}>
              <Text style={styles.spaceChipText}>Live tracking</Text>
            </View>
          </View>

          <TouchableOpacity
            style={styles.copyBtn}
            onPress={async (event: any) => {
              event?.stopPropagation?.();
              const clipboard = (globalThis as any)?.navigator?.clipboard;
              if (clipboard?.writeText) {
                await clipboard.writeText(inviteCode);
                setFeedback({ type: 'success', message: 'Invite code copied.' });
              } else {
                setFeedback({ type: 'error', message: `Copy unavailable. Share: ${inviteCode}` });
              }
            }}
          >
            <Text style={styles.copyBtnText}>Copy code</Text>
          </TouchableOpacity>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.container, isLarge && styles.containerWide]}>
        <View style={styles.heroCard}>
          <Text style={styles.heroKicker}>WORKSPACES</Text>
          <Text style={styles.heroTitle}>Create and manage money spaces for every group.</Text>
          <Text style={styles.heroSubtitle}>
            Build a dedicated board for trips, home expenses, teams, and events. Everything updates in real time.
          </Text>

          <View style={styles.insightRow}>
            {insights.map((item) => (
              <View key={item.title} style={styles.insightItem}>
                <Text style={styles.insightValue}>{item.value}</Text>
                <Text style={styles.insightTitle}>{item.title}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.composerCard}>
          <View style={styles.segmented}>
            <TouchableOpacity style={[styles.segmentBtn, actionMode === 'create' && styles.segmentBtnActive]} onPress={() => setActionMode('create')}>
              <Text style={[styles.segmentText, actionMode === 'create' && styles.segmentTextActive]}>Create space</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.segmentBtn, actionMode === 'join' && styles.segmentBtnActive]} onPress={() => setActionMode('join')}>
              <Text style={[styles.segmentText, actionMode === 'join' && styles.segmentTextActive]}>Join space</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.composerRow}>
            <TextInput
              style={styles.composerInput}
              placeholder={actionMode === 'create' ? 'Name your space' : 'Enter invite code'}
              placeholderTextColor={theme.colors.textMuted}
              value={actionMode === 'create' ? newVaultName : joinCode}
              onChangeText={actionMode === 'create' ? setNewVaultName : setJoinCode}
              onSubmitEditing={actionMode === 'create' ? () => createVault(newVaultName) : joinVault}
              autoCapitalize={actionMode === 'create' ? 'words' : 'characters'}
            />

            <Animated.View style={{ transform: [{ scale: isPrimaryEnabled ? ctaPulse : 1 }] }}>
              <TouchableOpacity
                style={[
                  styles.composerBtn,
                  actionMode === 'join' && styles.composerBtnJoin,
                  !isPrimaryEnabled && styles.composerBtnDisabled,
                ]}
                onPress={actionMode === 'create' ? () => createVault(newVaultName) : joinVault}
                disabled={!isPrimaryEnabled}
              >
                {(actionMode === 'create' && isCreating) || (actionMode === 'join' && isJoining) ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.composerBtnText}>{actionMode === 'create' ? '+ Create Space' : 'Join Now'}</Text>
                )}
              </TouchableOpacity>
            </Animated.View>
          </View>

          {feedback && <Text style={feedback.type === 'error' ? styles.feedbackError : styles.feedbackSuccess}>{feedback.message}</Text>}

          {actionMode === 'create' && (
            <View style={styles.templateRow}>
              {templates.map((name) => (
                <TouchableOpacity key={name} style={styles.templateChip} onPress={() => createVault(name)}>
                  <Text style={styles.templateChipText}>+ {name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>

        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 26 }} />
        ) : (
          <FlatList
            key={numColumns}
            data={vaults}
            keyExtractor={(item) => item.id}
            renderItem={renderSpace}
            numColumns={numColumns}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyTitle}>No spaces yet</Text>
                <Text style={styles.emptyText}>Create your first shared space to start tracking expenses.</Text>
              </View>
            }
            ListFooterComponent={
              <View style={styles.footerWrap}>
                <Text style={styles.footerTitle}>Recent activity</Text>
                {recentFeed.length ? (
                  recentFeed.map((item) => (
                    <View key={item.id} style={styles.feedRow}>
                      <Text style={styles.feedText}>{item.text}</Text>
                      <Text style={styles.feedTime}>{item.time}</Text>
                    </View>
                  ))
                ) : (
                  <Text style={styles.footerMuted}>Actions from this screen appear here.</Text>
                )}
              </View>
            }
          />
        )}
      </View>

      <View style={styles.bottomBar}>
        <Text style={styles.bottomText}>{summary.spaceCount || vaults.length} spaces</Text>
        <Text style={styles.bottomDot}>•</Text>
        <Text style={styles.bottomText}>₹{Number(summary.totalAmount7d || 0).toFixed(0)} this week</Text>
        <Text style={styles.bottomDot}>•</Text>
        <Text style={styles.bottomText}>{summary.activeSpaces || 0} active</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  containerWide: {
    maxWidth: 1220,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 30,
  },
  heroCard: {
    borderRadius: theme.radius.xl,
    backgroundColor: '#123527',
    borderWidth: 1,
    borderColor: '#2A5C47',
    padding: 18,
    marginBottom: 12,
    ...shadows.card,
  },
  heroKicker: {
    color: '#90DDBA',
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '800',
    fontFamily: theme.typography.body,
  },
  heroTitle: {
    marginTop: 8,
    color: '#FFFFFF',
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  heroSubtitle: {
    marginTop: 8,
    color: '#CAE7DA',
    fontSize: 14,
    lineHeight: 20,
    fontFamily: theme.typography.body,
  },
  insightRow: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  insightItem: {
    flex: 1,
    backgroundColor: '#1E4736',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: '#2D614A',
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  insightValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  insightTitle: {
    color: '#A7D6BF',
    marginTop: 2,
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  composerCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 12,
    marginBottom: 12,
    ...shadows.card,
  },
  segmented: {
    flexDirection: 'row',
    backgroundColor: theme.colors.surfaceAlt,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 4,
  },
  segmentBtn: {
    flex: 1,
    borderRadius: theme.radius.pill,
    paddingVertical: 8,
    alignItems: 'center',
  },
  segmentBtnActive: {
    backgroundColor: '#FFFFFF',
  },
  segmentText: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  segmentTextActive: {
    color: theme.colors.textPrimary,
  },
  composerRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    alignItems: 'stretch',
  },
  composerInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.md,
    backgroundColor: '#FBFDFB',
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 11,
    minHeight: 52,
    fontFamily: theme.typography.body,
  },
  composerBtn: {
    minWidth: 144,
    minHeight: 52,
    borderRadius: theme.radius.pill,
    backgroundColor: '#1B925B',
    borderWidth: 1,
    borderColor: '#187A4D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
    ...shadows.float,
  },
  composerBtnJoin: {
    backgroundColor: '#0F6A40',
    borderColor: '#0A5733',
  },
  composerBtnDisabled: {
    opacity: 1,
    backgroundColor: '#95BEA8',
    borderColor: '#8AB19C',
    shadowOpacity: 0,
    elevation: 0,
  },
  composerBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 0.2,
    fontFamily: theme.typography.body,
  },
  feedbackError: {
    marginTop: 8,
    color: theme.colors.danger,
    fontFamily: theme.typography.body,
    fontSize: 13,
  },
  feedbackSuccess: {
    marginTop: 8,
    color: theme.colors.success,
    fontFamily: theme.typography.body,
    fontSize: 13,
  },
  templateRow: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  templateChip: {
    borderWidth: 1,
    borderColor: '#CDE2D3',
    borderRadius: theme.radius.pill,
    backgroundColor: '#EEF6F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  templateChipText: {
    color: theme.colors.brandStrong,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  listContent: {
    paddingBottom: 120,
  },
  cardWrap: {
    marginBottom: 10,
  },
  cardWrapGrid: {
    flex: 1,
    marginHorizontal: 5,
  },
  spaceCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    padding: 14,
    ...shadows.card,
  },
  spaceTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  spaceAvatar: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E5F2E8',
    borderWidth: 1,
    borderColor: '#C9DDCD',
    justifyContent: 'center',
    alignItems: 'center',
  },
  spaceAvatarText: {
    color: theme.colors.brandStrong,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  spaceTitleWrap: {
    marginLeft: 10,
    flex: 1,
  },
  spaceTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  spaceCode: {
    marginTop: 2,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.mono,
    fontSize: 12,
  },
  spaceMetaRow: {
    marginTop: 10,
    flexDirection: 'row',
    gap: 6,
  },
  spaceChip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: '#D2E1D6',
    backgroundColor: '#F0F6F2',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  spaceChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  copyBtn: {
    marginTop: 12,
    borderRadius: theme.radius.md,
    backgroundColor: '#EDF6F0',
    borderWidth: 1,
    borderColor: '#CDE2D3',
    paddingVertical: 8,
    alignItems: 'center',
  },
  copyBtnText: {
    color: theme.colors.brandStrong,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  emptyWrap: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  emptyText: {
    marginTop: 6,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontFamily: theme.typography.body,
  },
  footerWrap: {
    marginTop: 8,
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FBFDFB',
    padding: 12,
  },
  footerTitle: {
    color: theme.colors.textPrimary,
    fontWeight: '800',
    fontFamily: theme.typography.display,
    marginBottom: 6,
  },
  footerMuted: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.body,
  },
  feedRow: {
    paddingVertical: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  feedText: {
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.body,
  },
  feedTime: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.body,
    fontSize: 12,
  },
  bottomBar: {
    position: 'absolute',
    left: 12,
    right: 12,
    bottom: 12,
    borderRadius: theme.radius.pill,
    backgroundColor: '#123527',
    borderWidth: 1,
    borderColor: '#2A5C47',
    paddingHorizontal: 14,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    ...shadows.float,
  },
  bottomText: {
    color: '#D0E9DD',
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  bottomDot: {
    color: '#80B99E',
    fontSize: 12,
  },
});
