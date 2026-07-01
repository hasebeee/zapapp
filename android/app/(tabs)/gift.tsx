import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import { useAuth } from '../../src/contexts/AuthContext';
import type { Gift, Relationship } from '../../src/types';

type GiftTab = 'send' | 'receive';

function GiftRow({
  name,
  message,
  createdAt,
  used,
  actionLabel,
  onAction,
}: {
  name: string;
  message: string;
  createdAt: string;
  used: boolean;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.giftRow}>
      <Text style={styles.giftIcon}>{used ? '🎁' : '🎀'}</Text>
      <View style={styles.giftInfo}>
        <Text style={styles.giftName}>{name}</Text>
        {!!message && (
          <Text style={styles.giftMessage} numberOfLines={1}>
            {message}
          </Text>
        )}
        <Text style={styles.giftDate}>{new Date(createdAt).toLocaleDateString('ja-JP')}</Text>
      </View>
      {actionLabel && onAction ? (
        <Pressable style={styles.useButton} onPress={onAction}>
          <Text style={styles.useButtonText}>{actionLabel}</Text>
        </Pressable>
      ) : (
        <Text style={used ? styles.usedBadge : styles.pendingBadge}>{used ? '使用済み' : '未使用'}</Text>
      )}
    </View>
  );
}

function SendGiftTab() {
  const { dbUserId } = useAuth();
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [message, setMessage] = useState('');
  const [sentGifts, setSentGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [rels, gifts] = await Promise.all([APIClient.getRelationships(), APIClient.getSentGifts()]);
      setRelationships(rels);
      setSentGifts(gifts);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const ownerRelationships = relationships.filter((r) => r.owner_user_id === dbUserId);

  const sendGift = async () => {
    if (!selectedId) return;
    setIsSending(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await APIClient.sendGift(selectedId, message);
      const rel = ownerRelationships.find((r) => r.controller_user_id === selectedId);
      const name = rel?.controller_user?.display_name ?? rel?.controller_user?.email ?? '相手';
      setSuccessMessage(`${name}さんにギフトを送りました`);
      setMessage('');
      setSelectedId(null);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <FlatList
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
      data={sentGifts}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.formCard}>
          <Text style={styles.formLabel}>送り先</Text>
          <View style={styles.chipRow}>
            {ownerRelationships.map((rel) => (
              <Pressable
                key={rel.id}
                style={[styles.chip, selectedId === rel.controller_user_id && styles.chipSelected]}
                onPress={() => setSelectedId(rel.controller_user_id)}
              >
                <Text style={selectedId === rel.controller_user_id ? styles.chipTextSelected : styles.chipText}>
                  {rel.controller_user?.display_name ?? rel.controller_user?.email ?? rel.controller_user_id}
                </Text>
              </Pressable>
            ))}
          </View>
          <TextInput
            style={styles.input}
            placeholder="メッセージ（任意）"
            value={message}
            onChangeText={setMessage}
          />
          {successMessage && <Text style={styles.success}>{successMessage}</Text>}
          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
          <Pressable
            style={[styles.sendButton, (!selectedId || isSending) && styles.buttonDisabled]}
            onPress={sendGift}
            disabled={!selectedId || isSending}
          >
            {isSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.sendButtonText}>🎁 ギフトを送る</Text>}
          </Pressable>
          <Text style={styles.sectionHeader}>送信済みギフト</Text>
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={styles.emptyText}>送ったギフトはありません</Text> : null}
      renderItem={({ item }) => (
        <GiftRow
          name={item.controller_user?.display_name ?? item.controller_user?.email ?? '相手'}
          message={item.message}
          createdAt={item.created_at}
          used={item.status === 'used'}
        />
      )}
    />
  );
}

function ReceiveGiftTab() {
  const router = useRouter();
  const [receivedGifts, setReceivedGifts] = useState<Gift[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      setReceivedGifts(await APIClient.getReceivedGifts());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <FlatList
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={isLoading} onRefresh={load} />}
      data={receivedGifts}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={errorMessage ? <Text style={styles.error}>{errorMessage}</Text> : null}
      ListEmptyComponent={!isLoading ? <Text style={styles.emptyText}>受け取ったギフトはありません</Text> : null}
      renderItem={({ item }) => (
        <GiftRow
          name={item.owner_user?.display_name ?? item.owner_user?.email ?? 'オーナー'}
          message={item.message}
          createdAt={item.created_at}
          used={item.status === 'used'}
          actionLabel={item.status === 'pending' ? '使う' : undefined}
          onAction={item.status === 'pending' ? () => router.push(`/use-gift/${item.id}`) : undefined}
        />
      )}
    />
  );
}

export default function GiftScreen() {
  const [tab, setTab] = useState<GiftTab>('send');

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ギフト</Text>
      </View>
      <View style={styles.segment}>
        <Pressable style={[styles.segmentButton, tab === 'send' && styles.segmentButtonActive]} onPress={() => setTab('send')}>
          <Text style={tab === 'send' ? styles.segmentTextActive : styles.segmentText}>送る</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentButton, tab === 'receive' && styles.segmentButtonActive]}
          onPress={() => setTab('receive')}
        >
          <Text style={tab === 'receive' ? styles.segmentTextActive : styles.segmentText}>受け取る</Text>
        </Pressable>
      </View>
      {tab === 'send' ? <SendGiftTab /> : <ReceiveGiftTab />}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, gap: 8 },
  segmentButton: { flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8, backgroundColor: '#f2f2f7' },
  segmentButtonActive: { backgroundColor: '#007aff' },
  segmentText: { color: '#333' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  tabContent: { padding: 16, gap: 8 },
  formCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10, marginBottom: 8 },
  formLabel: { fontSize: 13, color: '#888', fontWeight: '600' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: '#007aff', borderColor: '#007aff' },
  chipText: { color: '#333' },
  chipTextSelected: { color: '#fff' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  success: { color: '#2e7d32', fontSize: 13 },
  error: { color: '#d32f2f', fontSize: 13 },
  sendButton: { backgroundColor: '#e91e8c', borderRadius: 8, height: 46, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  sendButtonText: { color: '#fff', fontWeight: '700' },
  sectionHeader: { fontSize: 13, color: '#888', marginTop: 8 },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 24 },
  giftRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    padding: 12,
    borderRadius: 10,
  },
  giftIcon: { fontSize: 28 },
  giftInfo: { flex: 1 },
  giftName: { fontWeight: '700' },
  giftMessage: { color: '#888', fontSize: 12 },
  giftDate: { color: '#aaa', fontSize: 11 },
  usedBadge: { fontSize: 11, color: '#888' },
  pendingBadge: { fontSize: 11, color: '#e91e8c' },
  useButton: { backgroundColor: '#e91e8c', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 6 },
  useButtonText: { color: '#fff', fontWeight: '700', fontSize: 13 },
});
