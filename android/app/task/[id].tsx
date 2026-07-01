import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import { useAuth } from '../../src/contexts/AuthContext';
import type { AppTask, Relationship, ZapRequest, ZapRequestStatus } from '../../src/types';
import { taskStatusLabel } from '../../src/types';

const ZAP_STATUS_LABEL: Record<ZapRequestStatus, string> = {
  created: '実行待ち',
  executed: '実行済み',
  not_started: '未開始',
  acknowledged: '受領済み',
  expired: '期限切れ',
};

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

export default function TaskDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { dbUserId } = useAuth();

  const [task, setTask] = useState<AppTask | null>(null);
  const [zapRequest, setZapRequest] = useState<ZapRequest | null>(null);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedControllerId, setSelectedControllerId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isActing, setIsActing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [taskResult, relResult] = await Promise.all([
        APIClient.getTask(id),
        APIClient.getRelationships(),
      ]);
      setTask(taskResult);
      setSelectedControllerId(taskResult.controller_user_id);
      setRelationships(relResult);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
    try {
      setZapRequest(await APIClient.getLatestZapRequest(id));
    } catch {
      setZapRequest(null);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh])
  );

  if (isLoading && !task) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!task) {
    return (
      <View style={styles.centered}>
        <Text>{errorMessage ?? 'タスクが見つかりません'}</Text>
      </View>
    );
  }

  const controllerRelationships = relationships.filter((r) => r.owner_user_id === dbUserId);
  const controllerName = (controllerUserId: string) =>
    relationships.find((r) => r.controller_user_id === controllerUserId)?.controller_user?.display_name ??
    relationships.find((r) => r.controller_user_id === controllerUserId)?.controller_user?.email ??
    controllerUserId.slice(0, 8);

  const setController = async () => {
    if (!selectedControllerId || selectedControllerId === task.controller_user_id) return;
    setIsActing(true);
    setErrorMessage(null);
    try {
      const updated = await APIClient.updateTaskController(task.id, selectedControllerId);
      setTask(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsActing(false);
    }
  };

  const ack = async () => {
    if (!zapRequest) return;
    setIsActing(true);
    try {
      await APIClient.ackZapRequest(zapRequest.id);
      await refresh();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsActing(false);
    }
  };

  const selfComplete = () => {
    Alert.alert('完了自己申告', '本当にタスクを完了済みとして申告しますか？\nZap は送信されなくなります。', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '申告する',
        style: 'destructive',
        onPress: async () => {
          setIsActing(true);
          try {
            setTask(await APIClient.selfCompleteTask(task.id));
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          } finally {
            setIsActing(false);
          }
        },
      },
    ]);
  };

  const canChangeController = task.status !== 'closed' && task.status !== 'waitingAck';
  const canSelfComplete = ['readyToZap', 'readyToReZap', 'waitingAck'].includes(task.status);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Text style={styles.title}>{task.title}</Text>
        <View style={styles.divider} />
        <InfoRow label="ステータス" value={taskStatusLabel[task.status]} />
        <InfoRow label="締切" value={new Date(task.due_at).toLocaleString('ja-JP')} />
        <InfoRow label="作成日" value={new Date(task.created_at).toLocaleDateString('ja-JP')} />
        {task.closed_at && (
          <InfoRow label="完了日" value={new Date(task.closed_at).toLocaleString('ja-JP')} />
        )}
        {task.zap_criteria && (
          <View style={styles.criteriaSection}>
            <Text style={styles.infoLabel}>Zapの基準</Text>
            <View style={styles.criteriaBox}>
              <Text style={styles.criteriaText}>{task.zap_criteria}</Text>
            </View>
          </View>
        )}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeading}>監視者</Text>
        <View style={styles.divider} />
        <InfoRow
          label="現在"
          value={task.controller_user_id ? controllerName(task.controller_user_id) : '未設定'}
        />
        {!canChangeController ? (
          <Text style={styles.note}>このステータスでは監視者を変更できません。</Text>
        ) : controllerRelationships.length === 0 ? (
          <View>
            <Text style={styles.note}>設定できる監視者がいません。先に監視者を招待してください。</Text>
            <Pressable style={styles.inviteLink} onPress={() => router.push('/invite')}>
              <Text style={styles.inviteLinkText}>👤➕ 監視者を招待</Text>
            </Pressable>
          </View>
        ) : (
          <View style={styles.controllerPicker}>
            {controllerRelationships.map((rel) => (
              <Pressable
                key={rel.id}
                style={[
                  styles.controllerOption,
                  selectedControllerId === rel.controller_user_id && styles.controllerOptionSelected,
                ]}
                onPress={() => setSelectedControllerId(rel.controller_user_id)}
              >
                <Text>{rel.controller_user?.display_name ?? rel.controller_user?.email ?? rel.controller_user_id}</Text>
              </Pressable>
            ))}
            <Pressable
              style={[styles.button, (isActing || selectedControllerId === task.controller_user_id) && styles.buttonDisabled]}
              onPress={setController}
              disabled={isActing || selectedControllerId === task.controller_user_id}
            >
              <Text style={styles.buttonText}>
                {task.controller_user_id == null ? '監視者を設定' : '監視者を変更'}
              </Text>
            </Pressable>
            <Pressable style={styles.inviteLink} onPress={() => router.push('/invite')}>
              <Text style={styles.inviteLinkText}>👤➕ 新しい監視者を招待</Text>
            </Pressable>
          </View>
        )}
      </View>

      {zapRequest && (
        <View style={styles.card}>
          <Text style={styles.cardHeading}>最新の Zap リクエスト</Text>
          <View style={styles.divider} />
          <InfoRow label="ステータス" value={ZAP_STATUS_LABEL[zapRequest.status]} />
          <InfoRow label="試行回数" value={`${zapRequest.attempted_zaps} 回`} />
          <InfoRow label="成功回数" value={`${zapRequest.succeeded_zaps} 回`} />
          {zapRequest.status === 'not_started' && (
            <Text style={styles.warn}>
              送信できませんでした。Pavlok連携が未設定か、Pavlok APIへの送信に失敗した可能性があります。
            </Text>
          )}
          {zapRequest.last_error_message && (
            <Text style={styles.error}>エラー: {zapRequest.last_error_message}</Text>
          )}
        </View>
      )}

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {task.status === 'waitingAck' && (
        <Pressable style={[styles.button, styles.ackButton, isActing && styles.buttonDisabled]} onPress={ack} disabled={isActing}>
          <Text style={styles.buttonText}>受けました（ACK）</Text>
        </Pressable>
      )}

      {canSelfComplete && (
        <Pressable
          style={[styles.button, styles.completeButton, isActing && styles.buttonDisabled]}
          onPress={selfComplete}
          disabled={isActing}
        >
          <Text style={styles.buttonText}>完了自己申告</Text>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 16, gap: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  cardHeading: { fontSize: 16, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#e5e5ea' },
  infoRow: { flexDirection: 'row', gap: 12 },
  infoLabel: { width: 80, color: '#888' },
  infoValue: { flex: 1 },
  note: { color: '#888', fontSize: 13 },
  inviteLink: { paddingVertical: 6 },
  inviteLinkText: { color: '#007aff', fontSize: 14 },
  warn: { color: '#f57c00', fontSize: 13 },
  error: { color: '#d32f2f', fontSize: 13 },
  controllerPicker: { gap: 8 },
  controllerOption: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  controllerOptionSelected: { borderColor: '#007aff', backgroundColor: '#007aff1a' },
  button: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  ackButton: { backgroundColor: '#007aff' },
  completeButton: { backgroundColor: '#2e7d32' },
  criteriaSection: { gap: 6 },
  criteriaBox: {
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    padding: 10,
  },
  criteriaText: { fontSize: 14, color: '#333', lineHeight: 20 },
});
