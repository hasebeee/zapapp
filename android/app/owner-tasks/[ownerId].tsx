import { useCallback, useState } from 'react';
import {
  Alert,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import { JudgeTaskCard } from '../../src/components/JudgeTaskCard';
import type { AppTask } from '../../src/types';

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
            <JudgeTaskCard
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
});
