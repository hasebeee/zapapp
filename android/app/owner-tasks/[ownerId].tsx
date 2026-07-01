import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import { SwipeJudgeControl } from '../../src/components/SwipeJudgeControl';
import type { AppTask } from '../../src/types';

function formatRelative(dueAt: string): string {
  const diffMs = new Date(dueAt).getTime() - Date.now();
  const abs = Math.abs(diffMs);
  const minutes = Math.round(abs / 60000);
  const hours = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  let value: string;
  if (minutes < 60) value = `${minutes}分`;
  else if (hours < 24) value = `${hours}時間`;
  else value = `${days}日`;
  return diffMs >= 0 ? `${value}後 締切` : `${value}前 締切超過`;
}

function TaskCard({
  task,
  isZapping,
  isApproving,
  isDeleting,
  onApprove,
  onZap,
  onDelete,
}: {
  task: AppTask;
  isZapping: boolean;
  isApproving: boolean;
  isDeleting: boolean;
  onApprove: () => void;
  onZap: () => void;
  onDelete: () => void;
}) {
  const isJudgeable = task.status === 'readyToZap' || task.status === 'readyToReZap';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <Text style={styles.cardTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <Text style={styles.cardDue}>{formatRelative(task.due_at)}</Text>
      </View>

      {!!task.zap_criteria && (
        <View style={styles.criteriaBox}>
          <Text style={styles.criteriaText}>{task.zap_criteria}</Text>
        </View>
      )}

      {isJudgeable && (
        <SwipeJudgeControl isLoading={isZapping || isApproving} onApprove={onApprove} onZap={onZap} />
      )}

      {task.status === 'scheduled' && <Text style={styles.note}>締切後に押せます</Text>}
      {task.status === 'waitingAck' && <Text style={styles.warn}>未報告</Text>}
      {task.status === 'closed' && <Text style={styles.done}>完了済み</Text>}

      {task.status !== 'closed' && task.status !== 'waitingAck' && (
        <Pressable style={styles.deleteButton} onPress={onDelete} disabled={isDeleting}>
          {isDeleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteButtonText}>タスクを削除</Text>}
        </Pressable>
      )}
    </View>
  );
}

export default function OwnerTaskListScreen() {
  const { ownerId, ownerName } = useLocalSearchParams<{ ownerId: string; ownerName: string }>();

  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);
  const [actingKind, setActingKind] = useState<'approve' | 'zap' | 'delete' | null>(null);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setTasks(await APIClient.getOwnerTasks(ownerId));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [ownerId]);

  useFocusEffect(
    useCallback(() => {
      loadTasks();
    }, [loadTasks])
  );

  const approve = async (task: AppTask) => {
    setActingTaskId(task.id);
    setActingKind('approve');
    try {
      await APIClient.approveTask(task.id);
      await loadTasks();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingTaskId(null);
      setActingKind(null);
    }
  };

  const zap = async (task: AppTask) => {
    setActingTaskId(task.id);
    setActingKind('zap');
    try {
      await APIClient.sendZap(task.id);
      await loadTasks();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingTaskId(null);
      setActingKind(null);
    }
  };

  const confirmZap = (task: AppTask) => {
    Alert.alert('Zapを送信しますか？', `「${task.title}」に Zap を送信します。\n本当に Zap しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'Zapする', style: 'destructive', onPress: () => zap(task) },
    ]);
  };

  const confirmApprove = (task: AppTask) => {
    Alert.alert('合格にしますか？', `「${task.title}」を合格にします。\nZapせずにタスクを完了します。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '合格にする', onPress: () => approve(task) },
    ]);
  };

  const deleteTask = async (task: AppTask) => {
    setActingTaskId(task.id);
    setActingKind('delete');
    try {
      await APIClient.deleteTask(task.id);
      await loadTasks();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingTaskId(null);
      setActingKind(null);
    }
  };

  const confirmDelete = (task: AppTask) => {
    Alert.alert('タスクを削除しますか？', `「${task.title}」を削除します。\nOwnerに通知が送られます。この操作は取り消せません。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除する', style: 'destructive', onPress: () => deleteTask(task) },
    ]);
  };

  const activeTasks = tasks.filter((t) => t.status !== 'closed');

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: `${ownerName ?? ''} のタスク`, headerBackTitle: '戻る' }} />

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {activeTasks.length === 0 && !isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>タスクがありません</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={activeTasks}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadTasks} />}
          renderItem={({ item }) => (
            <TaskCard
              task={item}
              isZapping={actingTaskId === item.id && actingKind === 'zap'}
              isApproving={actingTaskId === item.id && actingKind === 'approve'}
              isDeleting={actingTaskId === item.id && actingKind === 'delete'}
              onApprove={() => confirmApprove(item)}
              onZap={() => confirmZap(item)}
              onDelete={() => confirmDelete(item)}
            />
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  list: { padding: 12, gap: 12 },
  error: { color: '#d32f2f', textAlign: 'center', padding: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', fontSize: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10, marginBottom: 12 },
  cardTop: { gap: 4 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  cardDue: { color: '#888', fontSize: 12 },
  criteriaBox: { backgroundColor: '#f2f2f7', borderRadius: 8, padding: 8 },
  criteriaText: { color: '#666', fontSize: 13 },
  note: { color: '#888', fontSize: 12 },
  warn: { color: '#f57c00', fontSize: 12 },
  done: { color: '#2e7d32', fontSize: 12 },
  deleteButton: {
    backgroundColor: '#d32f2f',
    borderRadius: 16,
    paddingVertical: 6,
    paddingHorizontal: 12,
    alignSelf: 'flex-start',
  },
  deleteButtonText: { color: '#fff', fontSize: 13, fontWeight: '600' },
});
