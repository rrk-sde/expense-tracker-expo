import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Keyboard,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
  ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { useQueryClient } from '@tanstack/react-query';
import Markdown from 'react-native-markdown-display';

import { shadows, theme } from '../theme';

const API_BASE_URL = process.env.EXPO_PUBLIC_API_URL || (
  Platform.OS === 'web' && typeof globalThis !== 'undefined' && (globalThis.location.hostname === 'localhost' || globalThis.location.hostname === '127.0.0.1')
    ? `http://${globalThis.location.hostname}:4000`
    : ''
);

type Space = {
  id: string;
  name: string;
  memberCount?: number;
  totalAmount?: number;
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

export default function VaultList({
  user,
  onSelectVault,
  onLogout,
}: Readonly<{
  user: any;
  onSelectVault: (vaultId: string) => void;
  onLogout: () => void;
}>) {
  const { width } = useWindowDimensions();
  const isLarge = width >= 1200;
  const isTablet = width >= 760;
  let numColumns: number;
  if (isLarge) { numColumns = 3; }
  else if (isTablet) { numColumns = 2; }
  else { numColumns = 1; }
  const CONTENT_MAX_WIDTH = 800;
  const bottomPadH = width > CONTENT_MAX_WIDTH ? (width - CONTENT_MAX_WIDTH) / 2 : 12;

  const [vaults, setVaults] = useState<Space[]>([]);
  const [loading, setLoading] = useState(true);
  const [isKeyboardVisible, setKeyboardVisible] = useState(false);

  useEffect(() => {
    const showSub = Keyboard.addListener('keyboardDidShow', () => setKeyboardVisible(true));
    const hideSub = Keyboard.addListener('keyboardDidHide', () => setKeyboardVisible(false));
    return () => {
      showSub.remove();
      hideSub.remove();
    };
  }, []);
  const [summary, setSummary] = useState<Summary>({ spaceCount: 0, totalAmount7d: 0, transactionCount7d: 0, activeSpaces: 0 });
  const [newVaultName, setNewVaultName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [actionMode, setActionMode] = useState<'create' | 'join' | 'freeform'>('freeform');
  const [freeformText, setFreeformText] = useState('');
  const [isProcessingFreeform, setIsProcessingFreeform] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
  const [recentFeed, setRecentFeed] = useState<FeedItem[]>([]);
  const [feedExpanded, setFeedExpanded] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  const [membersModalVisible, setMembersModalVisible] = useState(false);
  const [membersData, setMembersData] = useState<any[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersVaultName, setMembersVaultName] = useState('');

  const [editingVaultId, setEditingVaultId] = useState<string | null>(null);
  const [editingVaultName, setEditingVaultName] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  const queryClient = useQueryClient();
  const ctaPulse = useRef(new Animated.Value(1)).current;

  const templates = ['Trip', 'Flat', 'Family', 'Office', 'Groceries'];

  const canCreate = Boolean(newVaultName.trim()) && !isCreating;
  const canJoin = Boolean(joinCode.trim()) && !isJoining;
  const canFreeform = Boolean(freeformText.trim()) && !isProcessingFreeform;
  const isPrimaryEnabled = (actionMode === 'create' && canCreate) || (actionMode === 'join' && canJoin) || (actionMode === 'freeform' && canFreeform);

  const addFeed = (text: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const newItem = { id: String(Date.now() + Math.random()), text, time };
    setRecentFeed((prev) => {
      const next = [newItem, ...prev].slice(0, 30);
      if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
        (globalThis as any).localStorage.setItem(`recent_feed_${user.id}`, JSON.stringify(next));
      }
      return next;
    });
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

  const loadVaultMembers = async (vaultId: string, vaultName: string) => {
    setMembersVaultName(vaultName);
    setMembersModalVisible(true);
    setMembersLoading(true);
    setMembersData([]);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}/members?userId=${user.id}`);
      const data = await res.json();
      if (res.ok) {
        setMembersData(data);
      }
    } catch (e) {
      console.error('Failed to fetch members', e);
    } finally {
      setMembersLoading(false);
    }
  };

  const handleFreeform = async () => {
    if (!freeformText.trim() || isProcessingFreeform) return;
    setIsProcessingFreeform(true);
    setFeedback(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/freeform`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, text: freeformText }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to process request');

      if (data.type === 'SUCCESS' || data.type === 'ANSWER') {
        const rawMsg = data.type === 'SUCCESS' ? data.message : data.answer;
        setFeedback({ type: 'success', message: rawMsg || '' });
        setFreeformText('');
        loadVaults(); // Refresh spaces & summary
        if (data.feed) addFeed(data.feed);

        // Refresh all potentially cached transactions in spaces
        queryClient.invalidateQueries({ queryKey: ['transactions'] });
        queryClient.invalidateQueries({ queryKey: ['summary'] });
      }
    } catch (e: any) {
      setFeedback({ type: 'error', message: e.message });
    } finally {
      setIsProcessingFreeform(false);
    }
  };

  const renameVault = async (vaultId: string) => {
    const trimmed = editingVaultName.trim();
    if (!trimmed) return;
    setIsRenaming(true);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, name: trimmed }),
      });
      const payload = await res.json();
      if (!res.ok) {
        setFeedback({ type: 'error', message: payload?.error || 'Could not rename space.' });
        return;
      }
      setVaults((prev) => prev.map((v) => v.id === vaultId ? { ...v, name: trimmed } : v));
      addFeed(`Renamed space to "${trimmed}"`);
      setFeedback({ type: 'success', message: `Renamed to "${trimmed}"` });
    } catch {
      setFeedback({ type: 'error', message: 'Network error. Please try again.' });
    } finally {
      setIsRenaming(false);
      setEditingVaultId(null);
    }
  };

  useEffect(() => {
    loadVaults();
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      const saved = (globalThis as any).localStorage.getItem(`recent_feed_${user.id}`);
      if (saved) {
        try {
          setRecentFeed(JSON.parse(saved));
        } catch (e) {
          console.error('Failed to load feed', e);
        }
      }
    }
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
        body: JSON.stringify({ code: joinCode.replaceAll(/\s+/g, '').toUpperCase(), userId: user.id }),
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
    const isEditing = editingVaultId === item.id;

    return (
      <View style={[styles.cardWrap, numColumns === 2 && styles.cardWrapGrid2, numColumns === 3 && styles.cardWrapGrid3]}>
        <TouchableOpacity style={styles.spaceCard} onPress={() => !isEditing && onSelectVault(item.id)} activeOpacity={isEditing ? 1 : 0.8}>
          <View style={styles.spaceTop}>
            <View style={styles.spaceAvatar}>
              <Text style={styles.spaceAvatarText}>{initials}</Text>
            </View>
            <View style={styles.spaceTitleWrap}>
              {isEditing ? (
                <View style={{ flex: 1 }}>
                  <TextInput
                    style={styles.renameInput}
                    value={editingVaultName}
                    onChangeText={setEditingVaultName}
                    autoFocus
                    onSubmitEditing={() => renameVault(item.id)}
                    returnKeyType="done"
                    maxLength={60}
                    placeholder="New name..."
                  />
                  <View style={[styles.renameActions, { marginTop: 8 }]}>
                    <TouchableOpacity
                      style={styles.renameSaveBtn}
                      onPress={() => renameVault(item.id)}
                      disabled={isRenaming}
                    >
                      {isRenaming
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={styles.renameSaveBtnText}>Save Changes</Text>
                      }
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.renameCancelBtn}
                      onPress={() => setEditingVaultId(null)}
                      hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    >
                      <Text style={styles.renameCancelBtnText}>Cancel</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 6 }}>
                  <Text style={[styles.spaceTitle, { flex: 1 }]}>{item.name}</Text>
                  <TouchableOpacity
                    hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                    onPress={(e) => {
                      e.stopPropagation();
                      setEditingVaultId(item.id);
                      setEditingVaultName(item.name);
                    }}
                    style={styles.pencilBtn}
                  >
                    <Text style={styles.pencilIcon}>Edit</Text>
                  </TouchableOpacity>
                </View>
              )}
              <Text style={styles.spaceCode}>INV {inviteCode}</Text>
            </View>
          </View>

          <View style={styles.spaceMetaRow}>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, flex: 1 }}>
              <TouchableOpacity
                style={styles.spaceChip}
                onPress={(e) => {
                  e.stopPropagation();
                  loadVaultMembers(item.id, item.name);
                }}
              >
                <Text style={styles.spaceChipText}>Members {item.memberCount || 1}</Text>
              </TouchableOpacity>
              <View style={styles.spaceChip}>
                <Text style={styles.spaceChipText}>Live</Text>
              </View>
            </View>
            <View style={[styles.spaceChip, { backgroundColor: '#FDF1F0', borderColor: '#FEE2E2' }]}>
              <Text style={[styles.spaceChipText, { color: '#B91C1C', fontWeight: '800' }]}>
                ₹{Number(item.totalAmount || 0).toLocaleString()}
              </Text>
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
                addFeed(`Copied code: ${inviteCode} (${item.name})`);
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
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 20}
      >
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={Keyboard.dismiss}
        >
          <View style={[styles.container, isLarge && styles.containerWide]}>
            <View style={styles.heroCard}>
              <View style={styles.heroHeader}>
                <Text style={styles.heroKicker}>WORKSPACES</Text>
                <TouchableOpacity onPress={onLogout} style={styles.logoutBtn}>
                  <Text style={styles.logoutBtnText}>Logout</Text>
                </TouchableOpacity>
              </View>
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

            <View style={isLarge ? styles.desktopRow : styles.mobileColumn}>
              <View style={isLarge ? styles.mainContent : styles.fullWidth}>
                <View style={styles.composerCard}>
                  <View style={styles.segmented}>
                    <TouchableOpacity style={[styles.segmentBtn, actionMode === 'create' && styles.segmentBtnActive]} onPress={() => setActionMode('create')}>
                      <Text style={[styles.segmentText, actionMode === 'create' && styles.segmentTextActive]}>Create</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.segmentBtn, actionMode === 'join' && styles.segmentBtnActive]} onPress={() => setActionMode('join')}>
                      <Text style={[styles.segmentText, actionMode === 'join' && styles.segmentTextActive]}>Join</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[styles.segmentBtn, actionMode === 'freeform' && styles.segmentBtnActive]} onPress={() => setActionMode('freeform')}>
                      <Text style={[styles.segmentText, actionMode === 'freeform' && styles.segmentTextActive]}>FreeForm ✨</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.composerBody}>
                    <Text style={styles.composerLabel}>
                      {actionMode === 'create' ? 'Space Name' : actionMode === 'join' ? 'Invite Code' : 'Try "Spent 200 on milk in Groceries"'}
                    </Text>
                    <View style={styles.composerRow}>
                      <TextInput
                        style={styles.composerInput}
                        placeholder={
                          actionMode === 'create' ? 'e.g. Goa Trip 2024' :
                            actionMode === 'join' ? 'XXXX-XXXX' :
                              'Ask anything or add an expense...'
                        }
                        placeholderTextColor={theme.colors.textMuted}
                        value={
                          actionMode === 'create' ? newVaultName :
                            actionMode === 'join' ? joinCode :
                              freeformText
                        }
                        onChangeText={
                          actionMode === 'create' ? setNewVaultName :
                            actionMode === 'join' ? setJoinCode :
                              setFreeformText
                        }
                        onSubmitEditing={
                          actionMode === 'create' ? () => createVault(newVaultName) :
                            actionMode === 'join' ? joinVault :
                              handleFreeform
                        }
                        autoCapitalize={actionMode === 'join' ? 'characters' : 'sentences'}
                        multiline={actionMode === 'freeform'}
                      />

                      <Animated.View style={{ flexShrink: 0, transform: [{ scale: isPrimaryEnabled ? ctaPulse : 1 }] }}>
                        <TouchableOpacity
                          style={[
                            styles.composerBtn,
                            actionMode === 'join' && styles.composerBtnJoin,
                            actionMode === 'freeform' && styles.composerBtnFreeform,
                            !isPrimaryEnabled && styles.composerBtnDisabled,
                          ]}
                          onPress={
                            actionMode === 'create' ? () => createVault(newVaultName) :
                              actionMode === 'join' ? joinVault :
                                handleFreeform
                          }
                          disabled={!isPrimaryEnabled}
                        >
                          {isCreating || isJoining || isProcessingFreeform ? (
                            <ActivityIndicator color="#fff" />
                          ) : (
                            <Text style={styles.composerBtnText}>
                              {actionMode === 'create' ? 'Create' : actionMode === 'join' ? 'Join' : 'Go'}
                            </Text>
                          )}
                        </TouchableOpacity>
                      </Animated.View>
                    </View>
                  </View>

                  {feedback && (
                    <View style={[
                      styles.feedbackBox,
                      feedback.type === 'error' ? styles.feedbackBoxError : styles.feedbackBoxSuccess
                    ]}>
                      <Text style={styles.feedbackEmoji}>{feedback.type === 'error' ? '⚠️' : '✨'}</Text>
                      {feedback.type === 'error' ? (
                        <Text style={styles.feedbackError}>{feedback.message}</Text>
                      ) : (
                        <View style={{ flex: 1 }}>
                          <Markdown
                            style={{
                              body: {
                                color: theme.colors.brandStrong,
                                fontFamily: theme.typography.body,
                                fontSize: 13.5,
                                fontWeight: '600',
                                lineHeight: 18,
                              },
                              strong: {
                                fontWeight: '800',
                                color: theme.colors.brand,
                              },
                              bullet_list: {
                                marginTop: 4,
                              },
                              list_item: {
                                marginBottom: 2,
                              },
                            }}
                          >
                            {feedback.message}
                          </Markdown>
                        </View>
                      )}
                    </View>
                  )}

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

                {!isLarge && (
                  <View style={[styles.footerWrap, { marginBottom: 12 }]}>
                    <Text style={styles.footerTitle}>Recent activity</Text>
                    {recentFeed.length ? (
                      <>
                        {(feedExpanded ? recentFeed : recentFeed.slice(0, 3)).map((item) => (
                          <View key={item.id} style={styles.feedRow}>
                            <Text style={styles.feedText}>{item.text}</Text>
                            <Text style={styles.feedTime}>{item.time}</Text>
                          </View>
                        ))}
                        {recentFeed.length > 3 && (
                          <TouchableOpacity style={styles.showMoreBtn} onPress={() => setFeedExpanded(!feedExpanded)}>
                            <Text style={styles.showMoreText}>
                              {feedExpanded ? 'show less' : `+ show more (${recentFeed.length - 3})`}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </>
                    ) : (
                      <Text style={styles.footerMuted}>Actions from this screen appear here.</Text>
                    )}
                  </View>
                )}

                <View style={styles.gridContainer}>
                  {loading && vaults.length === 0 ? (
                    <ActivityIndicator size="large" color={theme.colors.brand} style={{ marginTop: 40 }} />
                  ) : (
                    <>
                      {loading && vaults.length > 0 && (
                        <View style={styles.refreshIndicator}>
                          <ActivityIndicator size="small" color={theme.colors.brand} />
                          <Text style={styles.refreshText}>Updating spaces...</Text>
                        </View>
                      )}

                      {vaults.length > 0 && (
                        <View style={styles.searchBarWrap}>
                          <TextInput
                            style={styles.searchInput}
                            placeholder="Search spaces by name or code..."
                            placeholderTextColor={theme.colors.textMuted}
                            value={searchQuery}
                            onChangeText={setSearchQuery}
                            autoCapitalize="none"
                            returnKeyType="search"
                            onSubmitEditing={Keyboard.dismiss}
                          />
                        </View>
                      )}

                      {(() => {
                        const filtered = vaults.filter(v =>
                          v.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          String(v.id).slice(0, 8).toUpperCase().includes(searchQuery.toUpperCase())
                        );

                        if (vaults.length === 0) {
                          return (
                            <View style={styles.emptyWrap}>
                              <Text style={styles.emptyTitle}>No spaces yet</Text>
                              <Text style={styles.emptyText}>Create your first shared space to start tracking expenses.</Text>
                            </View>
                          );
                        }

                        if (filtered.length === 0) {
                          return (
                            <View style={styles.emptyWrap}>
                              <Text style={styles.emptyTitle}>No matches found</Text>
                              <Text style={styles.emptyText}>Try searching for something else or clear the search.</Text>
                            </View>
                          );
                        }

                        return (
                          <View style={styles.gridWrap}>
                            {filtered.map((item) => (
                              <React.Fragment key={item.id}>
                                {renderSpace({ item })}
                              </React.Fragment>
                            ))}
                          </View>
                        );
                      })()}
                    </>
                  )}
                </View>

                {isLarge && (
                  <View style={styles.sidebar}>
                    <View style={[styles.footerWrap, { marginTop: 0, flex: 1 }]}>
                      <Text style={styles.footerTitle}>Recent activity</Text>
                      {recentFeed.length ? (
                        <>
                          {(feedExpanded ? recentFeed : recentFeed.slice(0, 3)).map((item) => (
                            <View key={item.id} style={styles.feedRow}>
                              <Text style={styles.feedText}>{item.text}</Text>
                              <Text style={styles.feedTime}>{item.time}</Text>
                            </View>
                          ))}
                          {recentFeed.length > 3 && (
                            <TouchableOpacity style={styles.showMoreBtn} onPress={() => setFeedExpanded(!feedExpanded)}>
                              <Text style={styles.showMoreText}>
                                {feedExpanded ? 'show less' : `+ show more (${recentFeed.length - 3})`}
                              </Text>
                            </TouchableOpacity>
                          )}
                        </>
                      ) : (
                        <Text style={styles.footerMuted}>Actions from this screen appear here.</Text>
                      )}
                    </View>
                  </View>
                )}
              </View>
            </View>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      {!isKeyboardVisible && (
        <View style={[styles.bottomBar, { left: bottomPadH, right: bottomPadH }]}>
          <Text style={styles.bottomText}>{summary.spaceCount || vaults.length} spaces</Text>
          <Text style={styles.bottomDot}>•</Text>
          <Text style={styles.bottomText}>₹{Number(summary.totalAmount7d || 0).toFixed(0)} this week</Text>
          <Text style={styles.bottomDot}>•</Text>
          <Text style={styles.bottomText}>{summary.activeSpaces || 0} active spaces</Text>
        </View>
      )}

      <Modal visible={membersModalVisible} transparent animationType="fade">
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <View style={styles.modalOverlay}>
            <TouchableWithoutFeedback>
              <View style={styles.modalCard}>
                <Text style={styles.modalTitle}>{membersVaultName} Members</Text>
                {membersLoading ? (
                  <ActivityIndicator color={theme.colors.brand} />
                ) : (
                  <ScrollView style={styles.membersList} showsVerticalScrollIndicator={false}>
                    {membersData.map((m: any) => (
                      <View key={m.userId} style={styles.memberRow}>
                        <Text style={styles.memberName}>{m.name || 'Anonymous User'}</Text>
                        <Text style={styles.memberEmail}>{m.email || ''}</Text>
                      </View>
                    ))}
                  </ScrollView>
                )}
                <TouchableOpacity style={styles.modalCancelBtn} onPress={() => setMembersModalVisible(false)}>
                  <Text style={styles.modalCancelText}>Close</Text>
                </TouchableOpacity>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
  heroHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  logoutBtn: {
    borderRadius: theme.radius.pill,
    backgroundColor: '#1B4D36',
    borderWidth: 1,
    borderColor: '#2D614A',
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  logoutBtnText: {
    color: '#D0E9DD',
    fontSize: 12,
    fontWeight: '700',
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
  composerBody: {
    marginTop: 16,
  },
  composerLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    marginBottom: 8,
    fontFamily: theme.typography.body,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    minWidth: 0,
    fontFamily: theme.typography.body,
  },
  composerBtn: {
    minHeight: 52,
    borderRadius: theme.radius.pill,
    backgroundColor: '#1B925B',
    borderWidth: 1,
    borderColor: '#187A4D',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 14,
    ...shadows.float,
  },
  composerBtnJoin: {
    backgroundColor: '#0F6A40',
    borderColor: '#0A5733',
  },
  composerBtnFreeform: {
    backgroundColor: '#6366F1',
    borderColor: '#4F46E5',
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
    color: theme.colors.danger,
    fontFamily: theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  feedbackSuccess: {
    color: theme.colors.brandStrong,
    fontFamily: theme.typography.body,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    flex: 1,
  },
  feedbackBox: {
    marginTop: 16,
    padding: 16,
    borderRadius: theme.radius.md,
    flexDirection: 'row',
    gap: 12,
    borderWidth: 1.5,
  },
  feedbackBoxError: {
    backgroundColor: '#FFF5F5',
    borderColor: '#FED7D7',
  },
  feedbackBoxSuccess: {
    backgroundColor: '#F0F9F4',
    borderColor: '#D1EAD9',
  },
  feedbackEmoji: {
    fontSize: 18,
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
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 120,
  },
  gridWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
    paddingBottom: 20,
    width: '100%',
  },
  cardWrap: {
    marginBottom: 0,
    width: '100%',
  },
  cardWrapGrid2: {
    width: '48.5%',
  },
  cardWrapGrid3: {
    width: '32%',
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
    alignItems: 'center',
    justifyContent: 'space-between',
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
  showMoreBtn: {
    paddingVertical: 10,
    marginTop: 4,
    alignSelf: 'flex-start',
  },
  showMoreText: {
    color: theme.colors.brand,
    fontWeight: '700',
    fontSize: 13,
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
  desktopRow: {
    flexDirection: 'row',
    gap: 24,
    alignItems: 'flex-start',
    width: '100%',
  },
  mobileColumn: {
    flexDirection: 'column',
    width: '100%',
  },
  mainContent: {
    flex: 3,
  },
  sidebar: {
    flex: 1,
    minWidth: 300,
  },
  fullWidth: {
    width: '100%',
  },
  gridContainer: {
    width: '100%',
    marginTop: 12,
  },
  refreshIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 16,
    paddingVertical: 8,
    backgroundColor: '#F0F6F2',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: '#D2E1D6',
  },
  refreshText: {
    fontSize: 12,
    color: theme.colors.brandStrong,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.35)',
    justifyContent: 'center',
    padding: 20,
  },
  modalCard: {
    backgroundColor: '#fff',
    borderRadius: theme.radius.xl,
    padding: 24,
    ...shadows.float,
    maxWidth: 500,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.display,
    marginBottom: 16,
  },
  searchBarWrap: {
    marginBottom: 16,
  },
  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 15,
    fontFamily: theme.typography.body,
    ...shadows.card,
  },
  membersList: {
    maxHeight: 300,
  },
  memberRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  memberName: {
    fontSize: 16,
    fontWeight: '700',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body,
  },
  memberEmail: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.body,
  },
  modalCancelBtn: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F0F6F2',
    borderRadius: theme.radius.md,
  },
  modalCancelText: {
    fontWeight: '700',
    color: theme.colors.brandStrong,
    fontFamily: theme.typography.body,
  },
  pencilBtn: {
    backgroundColor: '#F3F8F5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: '#DCEBDF',
  },
  pencilIcon: {
    fontSize: 11,
    color: theme.colors.brandStrong,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  renameInput: {
    alignSelf: 'stretch',
    borderWidth: 1.5,
    borderColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    backgroundColor: '#F8FDFB',
    color: theme.colors.textPrimary,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontFamily: theme.typography.body,
    fontSize: 16,
    fontWeight: '700',
    minHeight: 44,
  },
  renameActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  renameSaveBtn: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 18,
    height: 38,
    justifyContent: 'center',
    alignItems: 'center',
    ...shadows.float,
  },
  renameSaveBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
    fontFamily: theme.typography.body,
  },
  renameCancelBtn: {
    paddingHorizontal: 8,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  renameCancelBtnText: {
    color: theme.colors.textMuted,
    fontWeight: '700',
    fontSize: 14,
    fontFamily: theme.typography.body,
  },
});
