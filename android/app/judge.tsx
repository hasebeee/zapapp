import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { APIClient } from '../src/services/apiClient';
import { JudgeTaskCard } from '../src/components/JudgeTaskCard';
import type { PendingJudgmentTask } from '../src/types';

export default function JudgeScreen() {
  const router = useRouter();
  const [tasks, setTasks] = useState<PendingJudgmentTask[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [actingTaskId, setActingTaskId] = useState<string | null>(null);
  const [actingKind, setActingKind] = useState<'approve' | 'zap' | null>(null);
  const [bulkActing, setBulkActing] = useState<'approve' | 'zap' | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await APIClient.getPendingJudgments();
      setTasks(result);
      if (result.length === 0) {
        router.replace('/quick-package');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (task: PendingJudgmentTask) => {
    setActingTaskId(task.id);
    setActingKind('approve');
    try {
      await APIClient.approveTask(task.id);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingTaskId(null);
      setActingKind(null);
    }
  };

  const zap = async (task: PendingJudgmentTask) => {
    setActingTaskId(task.id);
    setActingKind('zap');
    try {
      await APIClient.sendZap(task.id);
      await load();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setActingTaskId(null);
      setActingKind(null);
    }
  };

  const confirmZap = (task: PendingJudgmentTask) => {
    Alert.alert('Zapを送信しますか？', `「${task.title}」に Zap を送信します。\n本当に Zap しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'Zapする', style: 'destructive', onPress: () => zap(task) },
    ]);
  };

  const confirmApprove = (task: PendingJudgmentTask) => {
    Alert.alert('合格にしますか？', `「${task.title}」を合格にします。\nZapせずにタスクを完了します。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '合格にする', onPress: () => approve(task) },
    ]);
  };

  const approveAll = async () => {
    setBulkActing('approve');
    setErrorMessage(null);
    try {
      for (const task of tasks) {
        await APIClient.approveTask(task.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBulkActing(null);
      await load();
    }
  };

  const zapAll = async () => {
    setBulkActing('zap');
    setErrorMessage(null);
    try {
      for (const task of tasks) {
        await APIClient.sendZap(task.id);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setBulkActing(null);
      await load();
    }
  };

  const confirmApproveAll = () => {
    Alert.alert('全部合格にしますか？', `表示されている${tasks.length}件すべてを合格にします。\nZapは送信されません。`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '全部合格にする', onPress: approveAll },
    ]);
  };

  const confirmZapAll = () => {
    Alert.alert('全部Zapしますか？', `表示されている${tasks.length}件すべてにZapを送信します。\n本当によろしいですか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '全部Zapする', style: 'destructive', onPress: zapAll },
    ]);
  };

  if (isLoading && tasks.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const isBulkActing = bulkActing !== null;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>合否判定</Text>
        <Pressable onPress={() => router.replace('/quick-package')}>
          <Text style={styles.skip}>あとで</Text>
        </Pressable>
      </View>

      {tasks.length > 0 && (
        <View style={styles.bulkRow}>
          <Pressable
            style={[styles.bulkButton, styles.bulkApprove, isBulkActing && styles.buttonDisabled]}
            onPress={confirmApproveAll}
            disabled={isBulkActing}
          >
            {bulkActing === 'approve' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bulkButtonText}>全部合格にする</Text>
            )}
          </Pressable>
          <Pressable
            style={[styles.bulkButton, styles.bulkZap, isBulkActing && styles.buttonDisabled]}
            onPress={confirmZapAll}
            disabled={isBulkActing}
          >
            {bulkActing === 'zap' ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.bulkButtonText}>全部不合格にする</Text>
            )}
          </Pressable>
        </View>
      )}

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <FlatList
        contentContainerStyle={styles.list}
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JudgeTaskCard
            task={item}
            ownerName={item.owner_display_name}
            isZapping={isBulkActing || (actingTaskId === item.id && actingKind === 'zap')}
            isApproving={isBulkActing || (actingTaskId === item.id && actingKind === 'approve')}
            onApprove={() => confirmApprove(item)}
            onZap={() => confirmZap(item)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f2f7' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 12,
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  skip: { color: '#888', fontSize: 15 },
  bulkRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  bulkButton: {
    flex: 1,
    height: 40,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkApprove: { backgroundColor: '#2e7d32' },
  bulkZap: { backgroundColor: '#d32f2f' },
  buttonDisabled: { opacity: 0.5 },
  bulkButtonText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  error: { color: '#d32f2f', textAlign: 'center', padding: 8 },
  list: { padding: 12, gap: 12 },
});
