import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Keyboard,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
  useWindowDimensions,
  KeyboardAvoidingView,
} from 'react-native';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import * as ImagePicker from 'expo-image-picker';
import Pusher from 'pusher-js';

import { shadows, theme } from '../theme';

interface Transaction {
  id: string;
  title: string;
  amount: number;
  type?: string;
  description?: string;
  creatorId: string;
  createdAt: string;
  items?: { name: string; price: number }[];
  splitWith?: string[];
  creator?: {
    id: string;
    name?: string | null;
    email?: string;
  };
}

interface VelocityData {
  totalAmount7d: number;
  count7d: number;
}

interface TransactionPage {
  items: Transaction[];
  nextCursor: string | null;
  hasMore: boolean;
  totalCount: number;
}

const API_BASE_URL = Platform.OS === 'web' && typeof globalThis !== 'undefined'
  ? `http://${globalThis.location.hostname}:4000`
  : (process.env.EXPO_PUBLIC_API_URL || '');
const PAGE_SIZE = 30;

const monthOptions = [
  { value: 'all', label: 'All' },
  { value: '1', label: 'Jan' },
  { value: '2', label: 'Feb' },
  { value: '3', label: 'Mar' },
  { value: '4', label: 'Apr' },
  { value: '5', label: 'May' },
  { value: '6', label: 'Jun' },
  { value: '7', label: 'Jul' },
  { value: '8', label: 'Aug' },
  { value: '9', label: 'Sep' },
  { value: '10', label: 'Oct' },
  { value: '11', label: 'Nov' },
  { value: '12', label: 'Dec' },
];

const calendarMonthOptions = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const parsePayload = async (res: Response) => {
  const raw = await res.text();
  try {
    const parsed = raw ? JSON.parse(raw) : {};
    if (parsed.error && typeof parsed.error === 'object') {
      return { error: parsed.error.message || JSON.stringify(parsed.error) };
    }
    return parsed;
  } catch {
    if (raw.trim().startsWith('<')) {
      if (res.status === 413) return { error: 'Image too large. Try a smaller photo.' };
      return { error: `Server error (${res.status})` };
    }
    return { error: raw || `Request failed (${res.status})` };
  }
};

const formatDateToYmd = (date: Date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const parseYmd = (value: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  if (Number.isNaN(date.getTime())) return null;
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
};

const buildCalendarDays = (monthDate: Date) => {
  const start = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
  const startWeekday = start.getDay();
  const end = new Date(monthDate.getFullYear(), monthDate.getMonth() + 1, 0);
  const totalCells = Math.ceil((startWeekday + end.getDate()) / 7) * 7;
  const gridStart = new Date(start);
  gridStart.setDate(start.getDate() - startWeekday);

  const days: Array<{ key: string; date: Date; inMonth: boolean }> = [];
  for (let i = 0; i < totalCells; i += 1) {
    const date = new Date(gridStart);
    date.setDate(gridStart.getDate() + i);
    days.push({ key: formatDateToYmd(date), date, inMonth: date.getMonth() === monthDate.getMonth() });
  }
  return days;
};

const fetchTransactionsPage = async ({
  vaultId,
  userId,
  cursor,
  q,
  month,
  year,
  from,
  to,
}: {
  vaultId: string;
  userId: string;
  cursor?: string | null;
  q: string;
  month: string;
  year: string;
  from: string;
  to: string;
}) => {
  const params = new URLSearchParams();
  params.set('userId', userId);
  params.set('limit', String(PAGE_SIZE));
  if (cursor) params.set('cursor', cursor);
  if (q) params.set('q', q);
  if (month !== 'all') params.set('month', month);
  if (year !== 'all') params.set('year', year);
  if (from) params.set('from', from);
  if (to) params.set('to', to);

  const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}/transactions?${params.toString()}`);
  const payload = await parsePayload(res);
  if (!res.ok) throw new Error(payload?.error || 'Failed to fetch transactions');
  return payload as TransactionPage;
};

const fetchVelocity = async (vaultId: string, userId: string) => {
  const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}/velocity?userId=${encodeURIComponent(userId)}`);
  const payload = await parsePayload(res);
  if (!res.ok) throw new Error(payload?.error || 'Failed to fetch velocity');
  return payload as VelocityData;
};

const MarkdownText = ({ content, theme, textStyle }: { content: string; theme: any; textStyle?: any }) => {
  if (!content) return null;
  const lines = content.split('\n');
  return (
    <View style={{ gap: 12 }}>
      {lines.map((line, idx) => {
        let trimmed = line.trim();
        if (!trimmed) return <View key={idx} style={{ height: 2 }} />;

        let isBullet = false;
        if (trimmed.startsWith('* ') || trimmed.startsWith('- ')) {
          isBullet = true;
          trimmed = trimmed.substring(2);
        }

        // Match bold parts
        const parts = trimmed.split(/(\*\*.*?\*\*)/g);
        return (
          <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
            {isBullet && <Text style={{ color: theme.colors.brand, marginRight: 8, fontSize: 18, fontWeight: '900' }}>•</Text>}
            <Text style={[
              {
                flex: 1,
                fontSize: 15,
                lineHeight: 24,
                color: theme.colors.textPrimary,
                fontFamily: theme.typography.body
              },
              textStyle
            ]}>
              {parts.map((part, pidx) => {
                if (part.startsWith('**') && part.endsWith('**')) {
                  return (
                    <Text key={pidx} style={{ fontWeight: '800', color: textStyle?.color || theme.colors.brand }}>
                      {part.slice(2, -2)}
                    </Text>
                  );
                }
                return part;
              })}
            </Text>
          </View>
        );
      })}
    </View>
  );
};

export default function LiveTransactionList({
  vaultId,
  user,
  onBack,
}: Readonly<{
  vaultId: string;
  user: any;
  onBack: () => void;
}>) {
  const addFeed = (text: string) => {
    const now = new Date();
    const time = now.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
    const newItem = { id: String(Date.now() + Math.random()), text, time };
    if (typeof globalThis !== 'undefined' && (globalThis as any).localStorage) {
      const saved = (globalThis as any).localStorage.getItem(`recent_feed_${user.id}`);
      let feed = [];
      try {
        feed = saved ? JSON.parse(saved) : [];
      } catch (e) { }
      const next = [newItem, ...feed].slice(0, 10);
      (globalThis as any).localStorage.setItem(`recent_feed_${user.id}`, JSON.stringify(next));
    }
  };
  const queryClient = useQueryClient();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 1000;
  const CONTENT_MAX_WIDTH = 760;
  const fabPadH = width > CONTENT_MAX_WIDTH ? (width - CONTENT_MAX_WIDTH) / 2 : 20;

  const [activeUsers, setActiveUsers] = useState<number>(1);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [txnTitle, setTxnTitle] = useState('');
  const [txnType, setTxnType] = useState<'DR' | 'CR'>('DR');
  const [amountStr, setAmountStr] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [scannedItems, setScannedItems] = useState<{ name: string; price: number }[]>([]);
  const [expandedTxnId, setExpandedTxnId] = useState<string | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);
  const [editingTxnId, setEditingTxnId] = useState<string | null>(null);

  const [confirmVaultAction, setConfirmVaultAction] = useState<'leave' | 'delete' | null>(null);
  const [isActingOnVault, setIsActingOnVault] = useState(false);

  const [searchInput, setSearchInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMonth, setSelectedMonth] = useState('all');
  const [selectedYear, setSelectedYear] = useState('all');
  const [filterSheetVisible, setFilterSheetVisible] = useState(false);
  const [fromDateInput, setFromDateInput] = useState('');
  const [toDateInput, setToDateInput] = useState('');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [pickerVisible, setPickerVisible] = useState(false);
  const [pickerTarget, setPickerTarget] = useState<'from' | 'to'>('from');
  const [pickerMonth, setPickerMonth] = useState(new Date());
  const [notice, setNotice] = useState<{ type: 'error' | 'success'; message: string } | null>(null);

  const [isInsightModalVisible, setIsInsightModalVisible] = useState(false);
  const [insightLoading, setInsightLoading] = useState(false);
  const [aiInsights, setAiInsights] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'insights' | 'forecast' | 'chat'>('insights');
  const [forecastLoading, setForecastLoading] = useState(false);
  const [forecastData, setForecastData] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ role: 'user' | 'ai'; text: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatScrollRef = useRef<ScrollView>(null);

  const sendChatMessage = async () => {
    if (!chatInput.trim() || isChatLoading) return;
    const userMsg = { role: 'user' as const, text: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setIsChatLoading(true);
    try {
      const history = chatMessages.map(m => ({ role: m.role === 'user' ? 'user' : 'model', text: m.text }));
      const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id, message: userMsg.text, history })
      });
      const data = await parsePayload(res);
      const aiMsg = { role: 'ai' as const, text: data?.reply || 'Sorry, I could not answer that.' };
      setChatMessages(prev => [...prev, aiMsg]);
      setTimeout(() => chatScrollRef.current?.scrollToEnd({ animated: true }), 100);
    } catch (e: any) {
      setChatMessages(prev => [...prev, { role: 'ai', text: `Error: ${e.message}` }]);
    } finally {
      setIsChatLoading(false);
    }
  };

  const [quickAddText, setQuickAddText] = useState('');
  const [isParsingText, setIsParsingText] = useState(false);
  const [members, setMembers] = useState<any[]>([]);
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  useEffect(() => {
    if (!isModalVisible) {
      setSelectedMembers([]);
    }
  }, [isModalVisible]);

  useEffect(() => {
    const fetchMembers = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}/members?userId=${user.id}`);
        const data = await parsePayload(res);
        if (res.ok) setMembers(data);
      } catch (e) { }
    };
    if (vaultId) fetchMembers();
  }, [vaultId, user.id]);

  const handleQuickAdd = async () => {
    if (!quickAddText.trim() || isParsingText) return;
    setIsParsingText(true);
    setNotice(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/gemini/parse-text`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: quickAddText }),
      });
      const data = await parsePayload(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to parse text');

      const txns: any[] = data.transactions || [];
      if (txns.length === 0) throw new Error('Could not understand the text. Try again.');

      if (txns.length === 1) {
        // Single transaction → open modal for review
        setTxnTitle(txns[0].title || '');
        setAmountStr(String(txns[0].amount || ''));
        setTxnType(txns[0].type === 'CR' ? 'CR' : 'DR');
        setQuickAddText('');
        setIsModalVisible(true);
        setNotice({ type: 'success', message: data.joke ? `AI Parsed!\n😄 ${data.joke}` : 'AI parsed your request!' });
      } else {
        // Multiple transactions → save all directly
        let successCount = 0;
        for (const txn of txns) {
          try {
            const resTxn = await fetch(`${API_BASE_URL}/api/transactions`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                title: txn.title,
                amount: Number(txn.amount),
                type: txn.type === 'CR' ? 'CR' : 'DR',
                category: txn.category || 'Other',
                creatorId: user.id,
                vaultId,
              }),
            });
            if (resTxn.ok) successCount++;
          } catch { }
        }
        setQuickAddText('');
        if (successCount > 0) {
          const msg = data.joke ? `✅ ${successCount} added by AI!\n😄 ${data.joke}` : `✅ ${successCount} transactions added by AI!`;
          setNotice({ type: 'success', message: msg });
          queryClient.invalidateQueries({ queryKey: ['transactions', vaultId, user.id] });
          queryClient.invalidateQueries({ queryKey: ['velocity', vaultId, user.id] });
        } else {
          setNotice({ type: 'error', message: 'Failed to add transactions.' });
        }
      }
    } catch (e: any) {
      setNotice({ type: 'error', message: e.message });
    } finally {
      setIsParsingText(false);
    }
  };

  const fetchAIInsights = async () => {
    setInsightLoading(true);
    setIsInsightModalVisible(true);
    setActiveTab('insights');
    setAiInsights(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}/ai-insights?userId=${user.id}`);
      const data = await parsePayload(res);
      if (!res.ok) throw new Error(data?.error || 'Failed to fetch insights');
      setAiInsights(data.insights);
    } catch (e: any) {
      setAiInsights(`Error: ${e.message}`);
    } finally {
      setInsightLoading(false);
    }
  };

  const fetchForecast = async () => {
    setForecastLoading(true);
    setActiveTab('forecast');
    setForecastData(null);
    try {
      const res = await fetch(`${API_BASE_URL}/api/vaults/${vaultId}/forecast?userId=${user.id}`);
      const data = await parsePayload(res);
      if (!res.ok) {
        // Assuming the server returns an error message like "Add at least 3 transactions..."
        throw new Error(data?.error || 'Failed to fetch forecast');
      }
      setForecastData(data.forecast);
    } catch (e: any) {
      setForecastData(`Error: ${e.message}`);
    } finally {
      setForecastLoading(false);
    }
  };

  const canSubmit = Boolean(txnTitle.trim()) && Boolean(amountStr.trim()) && !isSubmitting;
  const calendarDays = useMemo(() => buildCalendarDays(pickerMonth), [pickerMonth]);
  const weekLabels = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
  const todayYmd = useMemo(() => formatDateToYmd(new Date()), []);

  const yearOptions = useMemo(() => {
    const y = new Date().getFullYear();
    return [
      { value: 'all', label: 'All' },
      { value: String(y), label: String(y) },
      { value: String(y - 1), label: String(y - 1) },
      { value: String(y - 2), label: String(y - 2) },
    ];
  }, []);

  const calendarYearOptions = useMemo(() => {
    const base = pickerMonth.getFullYear();
    return Array.from({ length: 11 }, (_, i) => base - 5 + i);
  }, [pickerMonth]);

  useEffect(() => {
    const timer = setTimeout(() => setSearchQuery(searchInput.trim()), 260);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const {
    data,
    isLoading,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    error,
    isRefetching,
  } = useInfiniteQuery<TransactionPage>({
    queryKey: ['transactions', vaultId, user.id, searchQuery, selectedMonth, selectedYear, appliedFromDate, appliedToDate],
    queryFn: ({ pageParam }) =>
      fetchTransactionsPage({
        vaultId,
        userId: user.id,
        cursor: (pageParam as string | null) || null,
        q: searchQuery,
        month: selectedMonth,
        year: selectedYear,
        from: appliedFromDate,
        to: appliedToDate,
      }),
    getNextPageParam: (lastPage) => lastPage.nextCursor || undefined,
    initialPageParam: null,
    staleTime: 1000 * 20,
  });

  const { data: velocity } = useQuery<VelocityData>({
    queryKey: ['velocity', vaultId, user.id],
    queryFn: () => fetchVelocity(vaultId, user.id),
    staleTime: 1000 * 60,
  });

  const transactions = useMemo(() => data?.pages.flatMap((page) => page.items) ?? [], [data]);
  const totalCount = data?.pages?.[0]?.totalCount ?? 0;

  useEffect(() => {
    const pusher = new Pusher('22f9a41b3c0441ca19be', {
      cluster: 'ap2',
      authEndpoint: `${API_BASE_URL}/api/pusher/auth`,
    });

    const channelName = `presence-vault-${vaultId}`;
    const channel = pusher.subscribe(channelName);

    channel.bind('pusher:subscription_succeeded', (members: any) => setActiveUsers(members.count));
    channel.bind('pusher:member_added', () => setActiveUsers((prev) => prev + 1));
    channel.bind('pusher:member_removed', () => setActiveUsers((prev) => Math.max(1, prev - 1)));

    channel.bind('transaction.created', () => {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ['transactions', vaultId, user.id] });
    });

    channel.bind('transaction.deleted', () => {
      queryClient.invalidateQueries({ queryKey: ['transactions', vaultId, user.id] });
    });

    channel.bind('analytics.velocity_updated', (payload: { spendingVelocity: VelocityData }) => {
      queryClient.setQueryData<VelocityData>(['velocity', vaultId, user.id], payload.spendingVelocity);
    });

    return () => {
      channel.unbind_all();
      pusher.unsubscribe(channelName);
    };
  }, [queryClient, user.id, vaultId]);

  const handleSubmit = async () => {
    if (!txnTitle.trim() || !amountStr.trim()) return;
    setNotice(null);
    setIsSubmitting(true);

    try {
      const isEditing = !!editingTxnId;
      const url = isEditing
        ? `${API_BASE_URL}/api/transactions/${editingTxnId}`
        : `${API_BASE_URL}/api/transactions`;

      const method = isEditing ? 'PATCH' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: txnTitle,
          amount: Number.parseFloat(amountStr),
          category: 'General',
          vaultId,
          creatorId: user.id,
          type: txnType,
          items: scannedItems && scannedItems.length > 0 ? scannedItems : undefined,
          splitWith: selectedMembers && selectedMembers.length > 0 ? selectedMembers : undefined,
        }),
      });

      const payload = await parsePayload(res);
      if (!res.ok) {
        setNotice({ type: 'error', message: payload?.error || (isEditing ? 'Could not edit expense' : 'Could not add expense') });
        return;
      }

      addFeed(isEditing ? `Edited expense: ${txnTitle}` : `Added expense: ${txnTitle} (₹${amountStr})`);
      setTxnTitle('');
      setAmountStr('');
      setScannedItems([]);
      setSelectedMembers([]);
      setEditingTxnId(null);
      setIsModalVisible(false);
      queryClient.invalidateQueries({ queryKey: ['transactions', vaultId, user.id] });
      queryClient.invalidateQueries({ queryKey: ['velocity', vaultId, user.id] });
    } catch (e: any) {
      setNotice({ type: 'error', message: e.message || 'Network error' });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteConfirmed = async (transactionId: string) => {
    setNotice(null);
    setIsDeletingId(transactionId);
    try {
      const res = await fetch(`${API_BASE_URL}/api/transactions/${transactionId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });
      const payload = await parsePayload(res);
      if (!res.ok) {
        setNotice({ type: 'error', message: payload?.error || 'Could not remove transaction' });
        return;
      }

      const title = (payload as any)?.title || 'Transaction';
      const amount = (payload as any)?.amount || '0';
      addFeed(`Removed: ${title} (₹${amount})`);
      setNotice({ type: 'success', message: 'Transaction removed' });
      queryClient.invalidateQueries({ queryKey: ['transactions', vaultId, user.id] });
      queryClient.invalidateQueries({ queryKey: ['velocity', vaultId, user.id] });
    } catch (e: any) {
      setNotice({ type: 'error', message: e.message || 'Network error' });
    } finally {
      setIsDeletingId(null);
      setConfirmDeleteId(null);
    }
  };

  const handleVaultAction = async () => {
    if (!confirmVaultAction) return;
    setNotice(null);
    setIsActingOnVault(true);

    try {
      const endpoint = confirmVaultAction === 'delete' ? `/api/vaults/${vaultId}` : `/api/vaults/${vaultId}/leave`;
      const method = confirmVaultAction === 'delete' ? 'DELETE' : 'POST';

      const res = await fetch(`${API_BASE_URL}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: user.id }),
      });

      const payload = await parsePayload(res);
      if (!res.ok) {
        setNotice({ type: 'error', message: payload?.error || `Could not ${confirmVaultAction} space` });
        return;
      }
      onBack(); // Successfully left/deleted, instantly navigate back
    } catch (e: any) {
      setNotice({ type: 'error', message: e.message || 'Network error' });
    } finally {
      setIsActingOnVault(false);
      setConfirmVaultAction(null);
    }
  };

  const handleScanReceipt = async () => {
    try {
      setNotice(null);
      const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        setNotice({ type: 'error', message: 'Camera roll permission required' });
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        base64: true,
        allowsEditing: true,
        quality: 0.5,
      });

      if (!result.canceled && result.assets[0].base64) {
        setIsSubmitting(true);
        setIsModalVisible(true); // Open the modal so they can see the auto-fill happening
        setNotice({ type: 'success', message: 'Scanning receipt with AI...' });

        const res = await fetch(`${API_BASE_URL}/api/gemini/receipt`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            base64: result.assets[0].base64,
            mimeType: result.assets[0].mimeType || 'image/jpeg',
          }),
        });

        const parsed = await parsePayload(res);
        if (!res.ok) throw new Error(parsed?.error || 'AI scan failed');

        if (parsed.isReceipt === false) {
          setTxnTitle('');
          setTxnType('DR');
          setAmountStr('');
          setScannedItems([]);
          setNotice({ type: 'error', message: 'This is not a receipt or invoice' });
          return;
        }

        if (parsed.title) setTxnTitle(parsed.title);
        if (parsed.amount) setAmountStr(String(parsed.amount));
        if (parsed.items) setScannedItems(parsed.items);
        setNotice({ type: 'success', message: `AI Scanned: ${parsed.category || 'Receipt'}` });
      }
    } catch (e: any) {
      // Show clean message — never dump raw JSON to the user
      const msg: string = e.message || 'Scanning error';
      const isRateLimit = msg.includes('429') || msg.includes('quota') || msg.includes('RESOURCE_EXHAUSTED');
      setNotice({
        type: 'error',
        message: isRateLimit
          ? '⏳ AI scanning quota reached. Please wait a minute and try again.'
          : msg.startsWith('{') ? 'Scanning failed. Please try again.' : msg,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const isValidDateString = (value: string) => {
    if (!value) return true;
    const regex = /^\d{4}-\d{2}-\d{2}$/;
    if (!regex.test(value)) return false;
    const parsed = parseYmd(value);
    return Boolean(parsed);
  };

  const openPicker = (target: 'from' | 'to') => {
    setPickerTarget(target);
    const source = target === 'from' ? fromDateInput : toDateInput;
    setPickerMonth(parseYmd(source) || new Date());
    setPickerVisible(true);
  };

  const renderItem = useCallback(
    ({ item }: { item: Transaction }) => {
      const isExpanded = expandedTxnId === item.id;
      const time = new Date(item.createdAt).toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      const createdBy = item.creatorId === user.id ? 'You' : (item.creator?.name || item.creator?.email || 'Unknown user');

      return (
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setExpandedTxnId(isExpanded ? null : item.id)}
          style={[styles.txnCard, isExpanded && { paddingBottom: 16 }]}
        >
          <View style={{ flexDirection: 'row', width: '100%' }}>
            <View style={styles.txnMain}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.typeBadge, item.type === 'CR' ? styles.typeBadgeCr : styles.typeBadgeDr]}>
                  <Text style={[styles.typeBadgeText, { color: item.type === 'CR' ? '#166534' : '#991B1B' }]}>
                    {item.type === 'CR' ? '↑ Income' : '↓ Spent'}
                  </Text>
                </View>
                <Text style={styles.txnTitle}>{item.title}</Text>
                {item.splitWith && item.splitWith.length > 0 && (
                  <View style={{ backgroundColor: '#DBEAFE', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 }}>
                    <Text style={{ fontSize: 10, color: '#1E40AF', fontWeight: '800' }}>SPLIT</Text>
                  </View>
                )}
              </View>
              {item.description ? (
                <Text style={styles.txnDescription}>
                  ✦ {item.description}
                </Text>
              ) : null}
              <Text style={styles.txnMeta}>{time} by {createdBy}</Text>
            </View>

            <View style={styles.txnRight}>
              <Text style={styles.txnAmount}>₹{Number(item.amount).toFixed(2)}</Text>
              {item.splitWith && item.splitWith.length > 0 && (
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 11, color: theme.colors.brandStrong, fontWeight: '700', marginTop: 2 }}>
                    Split: ₹{(Number(item.amount) / (item.splitWith.length + 1)).toFixed(2)} each
                  </Text>
                </View>
              )}
              {item.creatorId === user.id && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 5, justifyContent: 'flex-end' }}>
                  <TouchableOpacity
                    style={[styles.removeBtn, { marginTop: 0, borderColor: '#D1E8DD', backgroundColor: '#EDF5F1' }]}
                    onPress={(e) => {
                      e.stopPropagation();
                      setEditingTxnId(item.id);
                      setTxnTitle(item.title);
                      setAmountStr(String(item.amount));
                      setTxnType((item.type as 'DR' | 'CR') || 'DR');
                      setSelectedMembers(item.splitWith || []);
                      setScannedItems(item.items || []);
                      setIsModalVisible(true);
                    }}
                  >
                    <Text style={[styles.removeText, { color: theme.colors.brandStrong }]}>Edit</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.removeBtn, { marginTop: 0 }]}
                    onPress={(e) => {
                      e.stopPropagation();
                      setConfirmDeleteId(item.id);
                    }}
                    disabled={isDeletingId === item.id}
                  >
                    {isDeletingId === item.id ? (
                      <ActivityIndicator size="small" color={theme.colors.danger} />
                    ) : (
                      <Text style={styles.removeText}>Remove</Text>
                    )}
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          {isExpanded && item.items && item.items.length > 0 && (
            <View style={styles.itemAccordion}>
              <View style={styles.itemDivider} />
              {item.items.map((line, idx) => (
                <View key={line.name || idx} style={styles.itemRow}>
                  <Text style={styles.itemName}>{line.name}</Text>
                  <Text style={styles.itemPrice}>₹{Number(line.price).toFixed(2)}</Text>
                </View>
              ))}
            </View>
          )}
        </TouchableOpacity>
      );
    },
    [isDeletingId, expandedTxnId, user.id]
  );


  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.screen}>
        <View style={[styles.container, isDesktop && styles.containerWide]}>
          <View style={styles.topBar}>
            <TouchableOpacity style={styles.backBtn} onPress={onBack}>
              <Text style={styles.backBtnText}>All Spaces</Text>
            </TouchableOpacity>

            <View style={styles.topActions}>
              {isDesktop && (
                <TouchableOpacity style={styles.addBtnDesktop} onPress={() => { Keyboard.dismiss(); setEditingTxnId(null); setTxnTitle(''); setTxnType('DR'); setAmountStr(''); setSelectedMembers([]); setScannedItems([]); setIsModalVisible(true); }}>
                  <Text style={styles.addBtnDesktopText}>+ Add expense</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setConfirmVaultAction('leave')} style={styles.dangerOutlineBtn}>
                <Text style={styles.dangerOutlineText}>Leave</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => setConfirmVaultAction('delete')} style={styles.dangerOutlineBtn}>
                <Text style={styles.dangerOutlineText}>Delete</Text>
              </TouchableOpacity>
              <View style={styles.presenceBadge}>
                <View style={styles.presenceDot} />
                <Text style={styles.presenceText}>
                  {activeUsers === 1 ? '1 person online' : `${activeUsers} people online`}
                </Text>
              </View>
            </View>
          </View>

          <FlatList
            data={transactions}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            style={{ flex: 1 }}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
            onEndReachedThreshold={0.35}
            onEndReached={() => {
              if (hasNextPage && !isFetchingNextPage) fetchNextPage();
            }}
            ListHeaderComponent={
              <>
                {(isLoading && transactions.length === 0) ? (
                  <View style={[styles.loader, { marginTop: 100, marginBottom: 40 }]}>
                    <ActivityIndicator size="large" color={theme.colors.brand} />
                    <Text style={{ marginTop: 16, color: theme.colors.textMuted, fontFamily: theme.typography.body }}>
                      Loading space activity...
                    </Text>
                  </View>
                ) : (
                  <>
                    <View style={styles.heroCard}>
                      <Text style={styles.heroKicker}>SPACE ACTIVITY</Text>
                      <Text style={styles.heroTitle}>Clean history, fast search, and full control.</Text>
                      <Text style={styles.heroSubtitle}>
                        Filter by month, year, and date range while keeping real-time updates from your team.
                      </Text>
                      <View style={styles.heroStats}>
                        <View style={styles.heroStatItem}>
                          <Text style={styles.heroStatValue}>{totalCount}</Text>
                          <Text style={styles.heroStatLabel}>Total results</Text>
                        </View>
                        <View style={styles.heroStatItem}>
                          <Text style={styles.heroStatValue}>₹{velocity?.totalAmount7d?.toFixed(0) || '0'}</Text>
                          <Text style={styles.heroStatLabel}>7-day spend</Text>
                        </View>
                        <View style={styles.heroStatItem}>
                          <Text style={styles.heroStatValue}>{velocity?.count7d || 0}</Text>
                          <Text style={styles.heroStatLabel}>7-day count</Text>
                        </View>
                      </View>

                      <TouchableOpacity style={styles.aiInsightsBtn} onPress={fetchAIInsights}>
                        <Text style={styles.aiInsightsText}>✨ AI Spending Insights</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.quickAddCard}>
                      <View style={styles.quickAddInputWrap}>
                        <TextInput
                          style={styles.quickAddInput}
                          placeholder='e.g. "₹250 for travel via Uber"'
                          placeholderTextColor={theme.colors.textMuted}
                          value={quickAddText}
                          onChangeText={setQuickAddText}
                          onSubmitEditing={handleQuickAdd}
                          returnKeyType="go"
                        />
                        <TouchableOpacity
                          style={[styles.quickAddBtn, !quickAddText.trim() && { opacity: 0.5 }]}
                          onPress={handleQuickAdd}
                          disabled={isParsingText}
                        >
                          {isParsingText ? <ActivityIndicator size="small" color="#fff" /> : <Text style={styles.quickAddBtnText}>Go</Text>}
                        </TouchableOpacity>
                      </View>
                      <View style={styles.quickAddFooterRow}>
                        <Text style={styles.quickAddHint}>Natural Language: Just type and AI will fill the form 🚀</Text>
                        <TouchableOpacity style={styles.scanReceiptBtn} onPress={handleScanReceipt}>
                          <Text style={styles.scanReceiptBtnText}>📷 Scan Receipt</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    <View style={styles.filterCard}>
                      <TextInput
                        style={styles.searchInput}
                        placeholder="Search expenses"
                        placeholderTextColor={theme.colors.textMuted}
                        value={searchInput}
                        onChangeText={setSearchInput}
                        returnKeyType="search"
                        onSubmitEditing={Keyboard.dismiss}
                      />

                      <View style={styles.filterMetaRow}>
                        <TouchableOpacity style={styles.filterOpenBtn} onPress={() => { Keyboard.dismiss(); setFilterSheetVisible(true); }}>
                          <Text style={styles.filterOpenBtnText}>Filters</Text>
                        </TouchableOpacity>
                        <Text style={styles.filterMetaText}>{isRefetching ? 'Updating...' : `${totalCount} results`}</Text>
                        {Boolean(appliedFromDate || appliedToDate) && (
                          <Text style={styles.filterMetaText}>{appliedFromDate || '...'} to {appliedToDate || '...'}</Text>
                        )}
                      </View>
                    </View>

                    {notice && <Text style={notice.type === 'error' ? styles.noticeError : styles.noticeSuccess}>{notice.message}</Text>}
                    {error && <Text style={styles.noticeError}>{(error as any)?.message || 'Failed to load transactions'}</Text>}
                  </>
                )}
              </>
            }
            ListEmptyComponent={
              isLoading ? null : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyStateTitle}>No expenses found</Text>
                  <Text style={styles.emptyStateText}>Try clearing filters or add a new expense.</Text>
                </View>
              )
            }
            ListFooterComponent={
              <View style={styles.footerLoad}>
                {hasNextPage ? (
                  isFetchingNextPage ? (
                    <ActivityIndicator color={theme.colors.brand} />
                  ) : (
                    <Text style={styles.footerHint}>Scroll for more</Text>
                  )
                ) : (
                  <Text style={styles.footerHint}>End of list</Text>
                )}
              </View>
            }
          />

          <View style={[styles.fabWrap, { left: fabPadH, right: fabPadH }]}>
            <TouchableOpacity style={styles.fabBtn} onPress={() => { setEditingTxnId(null); setTxnTitle(''); setTxnType('DR'); setAmountStr(''); setSelectedMembers([]); setScannedItems([]); setIsModalVisible(true); }}>
              <Text style={styles.fabBtnText}>+ Add expense</Text>
            </TouchableOpacity>
          </View>
        </View>

        <Modal visible={isModalVisible} transparent animationType="slide">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ width: '100%', alignItems: 'center' }}
              >
                <TouchableWithoutFeedback>
                  <View style={styles.modalCard}>
                    <Text style={styles.modalTitle}>{editingTxnId ? 'Edit transaction' : 'Add transaction'}</Text>

                    <View style={styles.typeToggleRow}>
                      <TouchableOpacity
                        style={[styles.typeToggle, txnType === 'DR' && styles.typeToggleActiveDr]}
                        onPress={() => setTxnType('DR')}
                      >
                        <Text style={[styles.typeToggleText, txnType === 'DR' && styles.typeToggleTextActive]}>↓ Spent</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.typeToggle, txnType === 'CR' && styles.typeToggleActiveCr]}
                        onPress={() => setTxnType('CR')}
                      >
                        <Text style={[styles.typeToggleText, txnType === 'CR' && styles.typeToggleTextActive]}>↑ Income</Text>
                      </TouchableOpacity>
                    </View>

                    <TextInput
                      style={styles.modalInput}
                      placeholder="Amount (₹)"
                      placeholderTextColor={theme.colors.textMuted}
                      keyboardType="numeric"
                      value={amountStr}
                      onChangeText={setAmountStr}
                      autoFocus={true}
                    />

                    <TextInput
                      style={styles.modalInput}
                      placeholder="What did you buy?"
                      placeholderTextColor={theme.colors.textMuted}
                      value={txnTitle}
                      onChangeText={setTxnTitle}
                      onSubmitEditing={handleSubmit}
                    />

                    {scannedItems.length > 0 && (
                      <View style={{ marginTop: 20, backgroundColor: '#F8FBF9', padding: 12, borderRadius: 12, borderWidth: 1, borderColor: '#E8F0E9' }}>
                        <Text style={{ fontSize: 13, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 10 }}>
                          ✨ AI Line Items:
                        </Text>
                        {scannedItems.map((item, i) => (
                          <View key={`scanned-${i}`} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                            <Text style={{ fontSize: 13, color: theme.colors.textMuted }}>• {item.name}</Text>
                            <Text style={{ fontSize: 13, color: theme.colors.brand, fontWeight: '700' }}>₹{item.price.toFixed(0)}</Text>
                          </View>
                        ))}
                      </View>
                    )}

                    <View style={{ marginTop: 24, marginBottom: 8 }}>
                      <Text style={{ fontSize: 14, fontWeight: '800', color: theme.colors.textSecondary, marginBottom: 12 }}>
                        Split with team:
                      </Text>
                      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 10, paddingBottom: 4 }}>
                        {members.filter(m => m.userId !== user.id).map((m) => {
                          const isSelected = selectedMembers.includes(m.userId);
                          return (
                            <TouchableOpacity
                              key={m.userId}
                              style={[
                                { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 24, borderWidth: 1, borderColor: '#DDD' },
                                isSelected && { backgroundColor: theme.colors.brand, borderColor: theme.colors.brand }
                              ]}
                              onPress={() => {
                                setSelectedMembers(prev =>
                                  prev.includes(m.userId) ? prev.filter(id => id !== m.userId) : [...prev, m.userId]
                                );
                              }}
                            >
                              <Text style={{ fontSize: 13, fontWeight: '700', color: isSelected ? '#fff' : theme.colors.textSecondary }}>
                                {m.name || m.email?.split('@')[0]}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </ScrollView>
                      <Text style={{ fontSize: 11, color: theme.colors.textMuted, marginTop: 4 }}>
                        {selectedMembers.length > 0 ? `Splitting between ${selectedMembers.length} people` : "Not split yet"}
                      </Text>
                    </View>

                    <View style={[styles.modalActionRow, { marginTop: 20 }]}>
                      {!editingTxnId && (
                        <TouchableOpacity style={[styles.modalCancelBtn, { backgroundColor: '#F0F5F1', borderColor: 'transparent' }]} onPress={handleScanReceipt} disabled={isSubmitting}>
                          <Text style={[styles.modalCancelText, { color: theme.colors.brand }]}>🎥 Scan Receipt</Text>
                        </TouchableOpacity>
                      )}
                      <View style={{ flex: 1 }} />
                      <TouchableOpacity style={styles.modalCancelBtn} onPress={() => { setIsModalVisible(false); setEditingTxnId(null); }} disabled={isSubmitting}>
                        <Text style={styles.modalCancelText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.modalSaveBtn, !canSubmit && styles.modalSaveBtnDisabled]} onPress={handleSubmit} disabled={!canSubmit}>
                        {isSubmitting ? <ActivityIndicator color="#fff" /> : <Text style={styles.modalSaveText}>Save</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal visible={filterSheetVisible} transparent animationType="slide">
          <View style={styles.sheetOverlay}>
            <Pressable style={styles.sheetBackdrop} onPress={() => setFilterSheetVisible(false)} />
            <View style={styles.sheetCard}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>Filters</Text>

              <Text style={styles.sheetLabel}>Year</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {yearOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.filterChip, selectedYear === opt.value && styles.filterChipActive]}
                    onPress={() => setSelectedYear(opt.value)}
                  >
                    <Text style={[styles.filterChipText, selectedYear === opt.value && styles.filterChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.sheetLabel}>Month</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                {monthOptions.map((opt) => (
                  <TouchableOpacity
                    key={opt.value}
                    style={[styles.filterChip, selectedMonth === opt.value && styles.filterChipActive]}
                    onPress={() => setSelectedMonth(opt.value)}
                  >
                    <Text style={[styles.filterChipText, selectedMonth === opt.value && styles.filterChipTextActive]}>{opt.label}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <Text style={styles.sheetLabel}>Date range</Text>
              <View style={styles.dateRow}>
                <TouchableOpacity style={[styles.dateBtn]} onPress={() => openPicker('from')}>
                  <Text style={fromDateInput ? styles.dateText : styles.datePlaceholder}>{fromDateInput || 'From date'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.dateBtn]} onPress={() => openPicker('to')}>
                  <Text style={toDateInput ? styles.dateText : styles.datePlaceholder}>{toDateInput || 'To date'}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sheetActionRow}>
                <TouchableOpacity
                  style={styles.applyBtn}
                  onPress={() => {
                    if (!isValidDateString(fromDateInput) || !isValidDateString(toDateInput)) {
                      setNotice({ type: 'error', message: 'Use YYYY-MM-DD format.' });
                      return;
                    }
                    if (fromDateInput && toDateInput && new Date(fromDateInput) > new Date(toDateInput)) {
                      setNotice({ type: 'error', message: 'From date must be before To date.' });
                      return;
                    }
                    setNotice(null);
                    setAppliedFromDate(fromDateInput.trim());
                    setAppliedToDate(toDateInput.trim());
                    setFilterSheetVisible(false);
                  }}
                >
                  <Text style={styles.applyBtnText}>Apply</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.clearBtn}
                  onPress={() => {
                    setFromDateInput('');
                    setToDateInput('');
                    setAppliedFromDate('');
                    setAppliedToDate('');
                    setNotice(null);
                  }}
                >
                  <Text style={styles.clearBtnText}>Clear</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.clearBtn} onPress={() => setFilterSheetVisible(false)}>
                  <Text style={styles.clearBtnText}>Close</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        <Modal visible={Boolean(confirmVaultAction)} transparent animationType="fade">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.confirmOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.confirmCard}>
                  <Text style={styles.confirmTitle}>{confirmVaultAction === 'delete' ? 'Delete space?' : 'Leave space?'}</Text>
                  <Text style={styles.confirmSubtitle}>
                    {confirmVaultAction === 'delete'
                      ? 'This space and all its transactions will be permanently deleted.'
                      : 'You will lose access to this space and its transactions.'}
                  </Text>
                  <View style={styles.confirmActions}>
                    <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmVaultAction(null)}>
                      <Text style={styles.confirmCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmDelete}
                      onPress={handleVaultAction}
                      disabled={isActingOnVault}
                    >
                      {isActingOnVault ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.confirmDeleteText}>{confirmVaultAction === 'delete' ? 'Delete' : 'Leave'}</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal visible={Boolean(confirmDeleteId)} transparent animationType="fade">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.confirmOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.confirmCard}>
                  <Text style={styles.confirmTitle}>Delete transaction?</Text>
                  <Text style={styles.confirmSubtitle}>This cannot be undone.</Text>
                  <View style={styles.confirmActions}>
                    <TouchableOpacity style={styles.confirmCancel} onPress={() => setConfirmDeleteId(null)}>
                      <Text style={styles.confirmCancelText}>Keep it</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.confirmDelete}
                      onPress={() => confirmDeleteId && handleDeleteConfirmed(confirmDeleteId)}
                      disabled={Boolean(isDeletingId)}
                    >
                      {isDeletingId === confirmDeleteId ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.confirmDeleteText}>Remove</Text>
                      )}
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal visible={isInsightModalVisible} transparent animationType="fade">
          <TouchableWithoutFeedback onPress={() => { Keyboard.dismiss(); if (!insightLoading && !forecastLoading) setIsInsightModalVisible(false); }}>
            <View style={styles.modalOverlay}>
              <KeyboardAvoidingView
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
                style={{ width: '100%', alignItems: 'center' }}
              >
                <TouchableWithoutFeedback>
                  <View style={[styles.modalCard, { maxHeight: '85%', maxWidth: 640, width: '100%', alignSelf: 'center' }]}>
                    <View style={styles.modalHeaderRow}>
                      <Text style={styles.modalTitle}>Vault Intelligence</Text>
                      <TouchableOpacity onPress={() => setIsInsightModalVisible(false)} style={styles.modalCloseIcon}>
                        <Text style={{ fontSize: 24, color: theme.colors.textMuted }}>×</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.tabRow}>
                      <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'insights' && styles.tabBtnActive]}
                        onPress={() => { setActiveTab('insights'); if (!aiInsights) fetchAIInsights(); }}
                      >
                        <Text style={[styles.tabText, activeTab === 'insights' && styles.tabTextActive]}>✨ Insights</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'forecast' && styles.tabBtnActive]}
                        onPress={() => { setActiveTab('forecast'); setForecastData(null); fetchForecast(); }}
                      >
                        <Text style={[styles.tabText, activeTab === 'forecast' && styles.tabTextActive]}>📈 Forecast</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.tabBtn, activeTab === 'chat' && styles.tabBtnActive]}
                        onPress={() => { setActiveTab('chat'); }}
                      >
                        <Text style={[styles.tabText, activeTab === 'chat' && styles.tabTextActive]}>💬 Chat</Text>
                      </TouchableOpacity>
                    </View>

                    {activeTab === 'chat' ? (
                      <View style={{ flex: 1 }}>
                        {chatMessages.length === 0 && (
                          <View style={{ padding: 16 }}>
                            <Text style={{ fontSize: 13, color: theme.colors.textMuted, marginBottom: 12, textAlign: 'center' }}>
                              Ask anything about your expenses! 🤖
                            </Text>
                            {['Who spent the most?', 'How much on food?', 'Total this month?'].map(q => (
                              <TouchableOpacity
                                key={q}
                                style={styles.chatSuggestion}
                                onPress={() => { setChatInput(q); }}
                              >
                                <Text style={styles.chatSuggestionText}>{q}</Text>
                              </TouchableOpacity>
                            ))}
                          </View>
                        )}
                        <ScrollView
                          ref={chatScrollRef}
                          style={{ flex: 1, maxHeight: 320 }}
                          contentContainerStyle={{ padding: 12, gap: 10 }}
                          showsVerticalScrollIndicator={false}
                          keyboardShouldPersistTaps="handled"
                        >
                          {chatMessages.map((msg, i) => (
                            <View
                              key={`chat-${i}`}
                              style={[
                                styles.chatBubble,
                                msg.role === 'user' ? styles.chatBubbleUser : styles.chatBubbleAI
                              ]}
                            >
                              <MarkdownText
                                content={msg.text}
                                theme={theme}
                                textStyle={msg.role === 'user' ? { color: '#fff' } : undefined}
                              />
                            </View>
                          ))}
                          {isChatLoading && (
                            <View style={styles.chatBubbleAI}>
                              <ActivityIndicator size="small" color={theme.colors.brand} />
                            </View>
                          )}
                        </ScrollView>
                        <View style={styles.chatInputRow}>
                          <TextInput
                            style={styles.chatInput}
                            placeholder="Ask about your expenses..."
                            placeholderTextColor={theme.colors.textMuted}
                            value={chatInput}
                            onChangeText={setChatInput}
                            onSubmitEditing={sendChatMessage}
                            returnKeyType="send"
                            multiline={false}
                          />
                          <TouchableOpacity
                            style={[styles.chatSendBtn, (!chatInput.trim() || isChatLoading) && { opacity: 0.5 }]}
                            onPress={sendChatMessage}
                            disabled={!chatInput.trim() || isChatLoading}
                          >
                            <Text style={styles.chatSendText}>↑</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    ) : (activeTab === 'insights' ? insightLoading : forecastLoading) ? (
                      <View style={{ padding: 40, alignItems: 'center' }}>
                        <ActivityIndicator color={theme.colors.brand} size="large" />
                        <Text style={{ marginTop: 12, color: theme.colors.textMuted, textAlign: 'center' }}>
                          {activeTab === 'insights' ? 'AI is analyzing your spending...' : 'Predicting future spending trends...'}
                        </Text>
                      </View>
                    ) : (
                      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 20 }} keyboardShouldPersistTaps="handled">
                        <MarkdownText content={(activeTab === 'insights' ? aiInsights : forecastData) || ''} theme={theme} />
                        <TouchableOpacity
                          style={[styles.modalSaveBtn, { marginTop: 24, alignSelf: 'center', width: '100%' }]}
                          onPress={() => setIsInsightModalVisible(false)}
                        >
                          <Text style={styles.modalSaveText}>Done</Text>
                        </TouchableOpacity>
                      </ScrollView>
                    )}
                  </View>
                </TouchableWithoutFeedback>
              </KeyboardAvoidingView>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

        <Modal visible={pickerVisible} transparent animationType="fade">
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={styles.confirmOverlay}>
              <TouchableWithoutFeedback>
                <View style={styles.calendarCard}>
                  <Text style={styles.confirmTitle}>{pickerTarget === 'from' ? 'From date' : 'To date'}</Text>
                  <Text style={styles.calendarHint}>Pick a day from the calendar</Text>

                  <View style={styles.calendarHeader}>
                    <TouchableOpacity
                      style={styles.calendarNavBtn}
                      onPress={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() - 1, 1))}
                    >
                      <Text style={styles.calendarNavText}>‹</Text>
                    </TouchableOpacity>

                    <Text style={styles.calendarMonthTitle}>
                      {pickerMonth.toLocaleString(undefined, { month: 'long' })} {pickerMonth.getFullYear()}
                    </Text>

                    <TouchableOpacity
                      style={styles.calendarNavBtn}
                      onPress={() => setPickerMonth((prev) => new Date(prev.getFullYear(), prev.getMonth() + 1, 1))}
                    >
                      <Text style={styles.calendarNavText}>›</Text>
                    </TouchableOpacity>
                  </View>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {calendarMonthOptions.map((label, idx) => {
                      const selected = idx === pickerMonth.getMonth();
                      return (
                        <TouchableOpacity
                          key={label}
                          style={[styles.filterChip, selected && styles.filterChipActive]}
                          onPress={() => setPickerMonth((prev) => new Date(prev.getFullYear(), idx, 1))}
                        >
                          <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{label}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
                    {calendarYearOptions.map((year) => {
                      const selected = year === pickerMonth.getFullYear();
                      return (
                        <TouchableOpacity
                          key={String(year)}
                          style={[styles.filterChip, selected && styles.filterChipActive]}
                          onPress={() => setPickerMonth((prev) => new Date(year, prev.getMonth(), 1))}
                        >
                          <Text style={[styles.filterChipText, selected && styles.filterChipTextActive]}>{year}</Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  <View style={styles.weekRow}>
                    {weekLabels.map((w) => (
                      <Text key={w} style={styles.weekLabel}>
                        {w}
                      </Text>
                    ))}
                  </View>

                  <View style={styles.dayGrid}>
                    {calendarDays.map((item) => {
                      const ymd = formatDateToYmd(item.date);
                      const targetValue = pickerTarget === 'from' ? fromDateInput : toDateInput;
                      const isSelected = ymd === targetValue;
                      const isToday = ymd === todayYmd;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          style={[
                            styles.dayCell,
                            !item.inMonth && styles.dayCellMuted,
                            isToday && styles.dayCellToday,
                            isSelected && styles.dayCellSelected,
                          ]}
                          onPress={() => {
                            if (pickerTarget === 'from') setFromDateInput(ymd);
                            else setToDateInput(ymd);
                            setPickerVisible(false);
                          }}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              !item.inMonth && styles.dayTextMuted,
                              isToday && styles.dayTextToday,
                              isSelected && styles.dayTextSelected,
                            ]}
                          >
                            {item.date.getDate()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  <View style={styles.confirmActions}>
                    <TouchableOpacity
                      style={styles.confirmCancel}
                      onPress={() => {
                        if (pickerTarget === 'from') setFromDateInput('');
                        else setToDateInput('');
                        setPickerVisible(false);
                      }}
                    >
                      <Text style={styles.confirmCancelText}>Clear</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.confirmDelete} onPress={() => setPickerVisible(false)}>
                      <Text style={styles.confirmDeleteText}>Done</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, overflow: 'hidden' as any },
  container: {
    flex: 1,
    paddingHorizontal: 16,
    paddingTop: 10,
    overflow: 'hidden' as any,
  },
  containerWide: {
    maxWidth: 760,
    width: '100%',
    alignSelf: 'center',
    paddingHorizontal: 20,
  },
  loader: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    flexWrap: 'wrap',
    gap: 10,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: 10,
  },
  backBtn: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  backBtnText: {
    color: theme.colors.textPrimary,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  addBtnDesktop: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  addBtnDesktopText: {
    color: '#fff',
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  dangerOutlineBtn: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: '#E8C8C6',
    backgroundColor: '#FDF1F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  dangerOutlineText: {
    color: theme.colors.danger,
    fontWeight: '700',
    fontFamily: theme.typography.body,
    fontSize: 13,
  },
  presenceBadge: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: '#BFDDCA',
    backgroundColor: '#EAF7EE',
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  presenceDot: {
    width: 8,
    height: 8,
    borderRadius: 8,
    backgroundColor: theme.colors.success,
  },
  presenceText: {
    color: theme.colors.brandStrong,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  heroCard: {
    borderRadius: theme.radius.xl,
    backgroundColor: '#123527',
    borderWidth: 1,
    borderColor: '#2A5C47',
    padding: 16,
    marginBottom: 10,
    ...shadows.card,
  },
  heroKicker: {
    color: '#8FDDB9',
    fontSize: 11,
    letterSpacing: 1.1,
    fontWeight: '800',
    fontFamily: theme.typography.body,
  },
  heroTitle: {
    color: '#FFFFFF',
    marginTop: 8,
    fontSize: 28,
    lineHeight: 33,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  heroSubtitle: {
    color: '#CAE7DA',
    marginTop: 8,
    fontSize: 14,
    lineHeight: 20,
    fontFamily: theme.typography.body,
  },
  heroStats: {
    marginTop: 14,
    flexDirection: 'row',
    gap: 8,
  },
  heroStatItem: {
    flex: 1,
    backgroundColor: '#1F4837',
    borderWidth: 1,
    borderColor: '#2D614A',
    borderRadius: theme.radius.md,
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  heroStatValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  heroStatLabel: {
    marginTop: 2,
    color: '#A7D6BF',
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  filterCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 12,
    marginBottom: 8,
    ...shadows.card,
  },
  searchInput: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FBFDFB',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body,
  },
  filterMetaRow: {
    marginTop: 9,
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 10,
  },
  filterOpenBtn: {
    borderRadius: theme.radius.pill,
    backgroundColor: '#EDF6F0',
    borderWidth: 1,
    borderColor: '#CDE2D3',
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  filterOpenBtnText: {
    color: theme.colors.brandStrong,
    fontWeight: '700',
    fontFamily: theme.typography.body,
    fontSize: 12,
  },
  filterMetaText: {
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  noticeError: {
    color: theme.colors.danger,
    marginBottom: 6,
    fontFamily: theme.typography.body,
  },
  noticeSuccess: {
    color: theme.colors.success,
    marginBottom: 6,
    fontFamily: theme.typography.body,
  },
  listContent: {
    paddingBottom: 120,
  },
  txnCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface,
    padding: 14,
    marginBottom: 10,
    flexDirection: 'column',
    ...shadows.card,
  },
  txnMain: {
    flex: 1,
    paddingRight: 12,
  },
  txnTitle: {
    color: theme.colors.textPrimary,
    fontSize: 17,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  txnMeta: {
    marginTop: 3,
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  txnDescription: {
    marginTop: 4,
    marginBottom: 2,
    color: theme.colors.brandStrong,
    fontSize: 12,
    fontStyle: 'italic',
    fontFamily: theme.typography.body,
    opacity: 0.85,
  },
  txnRight: {
    alignItems: 'flex-end',
  },
  txnAmount: {
    color: theme.colors.brandStrong,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  removeBtn: {
    marginTop: 5,
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: '#E8C8C6',
    backgroundColor: '#FDF1F0',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  removeText: {
    color: theme.colors.danger,
    fontSize: 12,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  emptyState: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    padding: 24,
    alignItems: 'center',
  },
  emptyStateTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  emptyStateText: {
    marginTop: 6,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    fontFamily: theme.typography.body,
  },
  footerLoad: {
    paddingVertical: 16,
    alignItems: 'center',
  },
  footerHint: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.body,
  },
  fabWrap: {
    ...Platform.select({
      web: { position: 'fixed' as 'absolute' },
      default: { position: 'absolute' },
    }),
    bottom: 20,
    left: 20,
    right: 20,
    zIndex: 50,
  },
  fabBtn: {
    borderRadius: theme.radius.pill,
    backgroundColor: theme.colors.brand,
    paddingVertical: 12,
    alignItems: 'center',
    ...shadows.float,
  },
  fabBtnText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '800',
    fontFamily: theme.typography.body,
  },
  aiInsightsBtn: {
    marginTop: 18,
    backgroundColor: '#1B4D36',
    borderRadius: theme.radius.md,
    paddingVertical: 11,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: '#2D614A',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  aiInsightsText: {
    color: '#D0E9DD',
    fontSize: 14,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  insightBody: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    fontFamily: theme.typography.body,
    marginTop: 8,
  },
  quickAddCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: theme.radius.lg,
    padding: 14,
    borderWidth: 1,
    borderColor: theme.colors.border,
    marginBottom: 16,
    ...shadows.sm,
  },
  quickAddInputWrap: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
  },
  quickAddInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F7FAF8',
    borderRadius: theme.radius.md,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#E8F0E9',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body,
  },
  quickAddBtn: {
    backgroundColor: theme.colors.brand,
    borderRadius: theme.radius.md,
    height: 44,
    width: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  quickAddBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontSize: 14,
  },
  quickAddHint: {
    fontSize: 11,
    color: theme.colors.textMuted,
    fontFamily: theme.typography.body,
    opacity: 0.8,
    flex: 1,
  },
  quickAddFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  scanReceiptBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EEF5EF',
    borderRadius: theme.radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  scanReceiptBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: theme.colors.brand,
    fontFamily: theme.typography.body,
  },
  tabRow: {
    flexDirection: 'row',
    backgroundColor: '#F0F4F1',
    borderRadius: theme.radius.md,
    padding: 4,
    marginBottom: 16,
  },
  tabBtn: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: theme.radius.sm,
  },
  tabBtnActive: {
    backgroundColor: '#FFFFFF',
    ...shadows.sm,
  },
  tabText: {
    fontSize: 13,
    fontWeight: '700',
    color: theme.colors.textMuted,
    fontFamily: theme.typography.body,
  },
  tabTextActive: {
    color: theme.colors.brand,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  modalCloseIcon: {
    padding: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    padding: 18,
  },
  modalCard: {
    borderRadius: theme.radius.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
    padding: 24,
    ...shadows.float,
    maxWidth: 580,
    width: '100%',
    alignSelf: 'center',
  },
  modalTitle: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: '800',
    fontFamily: theme.typography.display,
    marginBottom: 10,
  },
  modalInput: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FBFDFB',
    paddingHorizontal: 12,
    paddingVertical: 11,
    color: theme.colors.textPrimary,
    marginBottom: 10,
    fontFamily: theme.typography.body,
  },
  modalActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
  },
  modalCancelBtn: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  modalCancelText: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  modalSaveBtn: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minWidth: 80,
    alignItems: 'center',
  },
  modalSaveBtnDisabled: {
    opacity: 0.55,
  },
  modalSaveText: {
    color: '#fff',
    fontWeight: '800',
    fontFamily: theme.typography.body,
  },
  sheetOverlay: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  sheetBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: theme.colors.overlay,
  },
  sheetCard: {
    borderTopLeftRadius: theme.radius.xl,
    borderTopRightRadius: theme.radius.xl,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 14,
    paddingBottom: 20,
    paddingTop: 8,
    maxHeight: '86%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 42,
    height: 5,
    borderRadius: 99,
    backgroundColor: '#CFDACE',
    marginVertical: 8,
  },
  sheetTitle: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: '800',
    fontFamily: theme.typography.display,
    marginBottom: 8,
  },
  sheetLabel: {
    marginTop: 8,
    marginBottom: 6,
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  chipRow: {
    gap: 8,
    paddingBottom: 4,
  },
  filterChip: {
    borderRadius: theme.radius.pill,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#F1F6F2',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  filterChipActive: {
    backgroundColor: '#DFF0E4',
    borderColor: '#AFCDB9',
  },
  filterChipText: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  filterChipTextActive: {
    color: theme.colors.brandStrong,
    fontWeight: '700',
  },
  dateRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 2,
  },
  dateBtn: {
    flex: 1,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FBFDFB',
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  dateText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body,
  },
  datePlaceholder: {
    color: theme.colors.textMuted,
    fontFamily: theme.typography.body,
  },
  sheetActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  applyBtn: {
    flex: 1,
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
  },
  applyBtnText: {
    color: '#fff',
    fontWeight: '800',
    fontFamily: theme.typography.body,
  },
  clearBtn: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  clearBtnText: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  confirmOverlay: {
    flex: 1,
    backgroundColor: theme.colors.overlay,
    justifyContent: 'center',
    paddingHorizontal: 18,
  },
  confirmCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    padding: 24,
    ...shadows.float,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  confirmTitle: {
    color: theme.colors.textPrimary,
    fontSize: 21,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  confirmSubtitle: {
    marginTop: 5,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.body,
  },
  confirmActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 8,
    marginTop: 12,
  },
  confirmCancel: {
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  confirmCancelText: {
    color: theme.colors.textSecondary,
    fontWeight: '700',
    fontFamily: theme.typography.body,
  },
  confirmDelete: {
    borderRadius: theme.radius.md,
    backgroundColor: theme.colors.danger,
    paddingVertical: 10,
    paddingHorizontal: 13,
    minWidth: 82,
    alignItems: 'center',
  },
  confirmDeleteText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontFamily: theme.typography.body,
  },
  calendarCard: {
    borderRadius: theme.radius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#FFFFFF',
    padding: 20,
    ...shadows.float,
    maxWidth: 440,
    width: '100%',
    alignSelf: 'center',
  },
  calendarHint: {
    marginTop: 5,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.body,
  },
  calendarHeader: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  calendarNavBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: '#F4F8F5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarNavText: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  calendarMonthTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: '800',
    fontFamily: theme.typography.display,
  },
  weekRow: {
    marginTop: 8,
    flexDirection: 'row',
  },
  weekLabel: {
    flex: 1,
    textAlign: 'center',
    color: theme.colors.textMuted,
    fontSize: 12,
    fontFamily: theme.typography.body,
  },
  dayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 6,
  },
  dayCell: {
    width: '14.28%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 8,
  },
  dayCellMuted: {
    opacity: 0.35,
  },
  dayCellToday: {
    borderWidth: 1,
    borderColor: '#B7D5C0',
  },
  dayCellSelected: {
    backgroundColor: '#DFF0E4',
  },
  dayText: {
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body,
  },
  dayTextMuted: {
    color: theme.colors.textMuted,
  },
  dayTextToday: {
    color: theme.colors.brandStrong,
    fontWeight: '700',
  },
  dayTextSelected: {
    color: theme.colors.brandStrong,
    fontWeight: '800',
  },
  itemAccordion: {
    marginTop: 12,
    width: '100%',
  },
  itemDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginBottom: 8,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  itemName: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.body,
    flex: 1,
    paddingRight: 8,
  },
  itemPrice: {
    fontSize: 14,
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body,
    fontWeight: '600',
    marginLeft: 12,
  },
  typeToggleRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  typeToggle: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.colors.border,
    alignItems: 'center',
    backgroundColor: '#F9FAFB',
  },
  typeToggleActiveDr: {
    backgroundColor: '#FDF1F0',
    borderColor: '#E8C8C6',
  },
  typeToggleActiveCr: {
    backgroundColor: '#EAF7EE',
    borderColor: '#BFDDCA',
  },
  typeToggleText: {
    fontSize: 14,
    fontWeight: '700',
    color: theme.colors.textSecondary,
    fontFamily: theme.typography.body,
  },
  typeToggleTextActive: {
    color: theme.colors.textPrimary,
  },
  typeBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  typeBadgeDr: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FEE2E2',
  },
  typeBadgeCr: {
    backgroundColor: '#F0FDF4',
    borderColor: '#DCFCE7',
  },
  typeBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    fontFamily: theme.typography.body,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  chatSuggestion: {
    backgroundColor: '#F0F5F1',
    borderRadius: theme.radius.md,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DCE8DC',
  },
  chatSuggestionText: {
    color: theme.colors.brandStrong,
    fontSize: 13,
    fontWeight: '600',
    fontFamily: theme.typography.body,
  },
  chatBubble: {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    maxWidth: '85%',
    marginBottom: 4,
  },
  chatBubbleUser: {
    backgroundColor: theme.colors.brand,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 4,
  },
  chatBubbleAI: {
    backgroundColor: '#F0F5F1',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 4,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#DCE8DC',
  },
  chatInputRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'center',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    marginTop: 8,
  },
  chatInput: {
    flex: 1,
    height: 44,
    backgroundColor: '#F7FAF8',
    borderRadius: theme.radius.lg,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#E0EBE1',
    color: theme.colors.textPrimary,
    fontFamily: theme.typography.body,
    fontSize: 14,
  },
  chatSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chatSendText: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '800',
    lineHeight: 24,
  },
});
