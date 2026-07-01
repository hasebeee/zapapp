import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect, useRouter } from 'expo-router';
import { APIClient } from '../src/services/apiClient';
import type { Invite, InviteStatus } from '../src/types';

const STATUS_LABEL: Record<InviteStatus, string> = {
  pending: '保留中',
  accepted: '承諾済み',
  expired: '期限切れ',
  revoked: 'キャンセル',
};

const STATUS_COLOR: Record<InviteStatus, string> = {
  pending: '#007aff',
  accepted: '#2e7d32',
  expired: '#888',
  revoked: '#d32f2f',
};

export default function InviteScreen() {
  const router = useRouter();
  const [inviteeEmail, setInviteeEmail] = useState('');
  const [invites, setInvites] = useState<Invite[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadInvites = useCallback(async () => {
    setIsLoading(true);
    try {
      setInvites(await APIClient.getInvites());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadInvites();
    }, [loadInvites])
  );

  const sendInvite = async () => {
    setIsSending(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      await APIClient.createInvite(inviteeEmail);
      setSuccessMessage(`${inviteeEmail} に招待を送りました`);
      setInviteeEmail('');
      await loadInvites();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSending(false);
    }
  };

  return (
    <FlatList
      style={styles.container}
      contentContainerStyle={styles.content}
      data={invites}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.gap}>
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>招待を送信</Text>
            <TextInput
              style={styles.input}
              placeholder="招待したい相手のメールアドレス"
              keyboardType="email-address"
              autoCapitalize="none"
              value={inviteeEmail}
              onChangeText={setInviteeEmail}
            />
            <Pressable
              style={[styles.button, (isSending || !inviteeEmail) && styles.buttonDisabled]}
              onPress={sendInvite}
              disabled={isSending || !inviteeEmail}
            >
              {isSending ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>招待を送る</Text>}
            </Pressable>
            {successMessage && <Text style={styles.success}>{successMessage}</Text>}
            {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
          </View>

          <View style={styles.section}>
            <Pressable style={styles.acceptRow} onPress={() => router.push('/accept-invite')}>
              <Text style={styles.acceptText}>🔗 招待トークンを入力して受諾する</Text>
            </Pressable>
          </View>

          <Text style={styles.sectionHeader}>送信済み招待</Text>
        </View>
      }
      ListEmptyComponent={!isLoading ? <Text style={styles.emptyText}>送信済みの招待はありません</Text> : null}
      renderItem={({ item }) => (
        <View style={styles.inviteRow}>
          <View style={styles.inviteTop}>
            <Text style={styles.inviteEmail}>{item.invitee_email}</Text>
            <Text style={[styles.statusBadge, { color: STATUS_COLOR[item.status], backgroundColor: STATUS_COLOR[item.status] + '22' }]}>
              {STATUS_LABEL[item.status]}
            </Text>
          </View>
          <Text style={styles.inviteDate}>{new Date(item.created_at).toLocaleDateString('ja-JP')}</Text>
          {item.status === 'pending' && (
            <View style={styles.tokenRow}>
              <Text style={styles.tokenLabel}>トークン:</Text>
              <Text style={styles.tokenValue} numberOfLines={1}>
                {item.token}
              </Text>
              <Pressable onPress={() => Clipboard.setStringAsync(item.token)}>
                <Text style={styles.copyIcon}>📋</Text>
              </Pressable>
            </View>
          )}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 16, gap: 8 },
  gap: { gap: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 13, color: '#888', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  button: { backgroundColor: '#007aff', borderRadius: 8, height: 44, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  success: { color: '#2e7d32', fontSize: 13 },
  error: { color: '#d32f2f', fontSize: 13 },
  acceptRow: { paddingVertical: 4 },
  acceptText: { fontSize: 15, color: '#007aff' },
  sectionHeader: { fontSize: 13, color: '#888' },
  emptyText: { textAlign: 'center', color: '#888', marginTop: 12 },
  inviteRow: { backgroundColor: '#fff', borderRadius: 10, padding: 12, gap: 6, marginBottom: 8 },
  inviteTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inviteEmail: { fontWeight: '700' },
  statusBadge: { fontSize: 11, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  inviteDate: { fontSize: 12, color: '#888' },
  tokenRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  tokenLabel: { fontSize: 12, color: '#888' },
  tokenValue: { flex: 1, fontSize: 12, fontFamily: 'monospace' },
  copyIcon: { fontSize: 14 },
});
