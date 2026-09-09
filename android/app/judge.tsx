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

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await APIClient.getPendingJudgments();
      setTasks(result);
      if (result.length === 0) {
        router.replace('/(tabs)');
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

  if (isLoading && tasks.length === 0) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>合否判定</Text>
        <Pressable onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.skip}>あとで</Text>
        </Pressable>
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <FlatList
        contentContainerStyle={styles.list}
        data={tasks}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <JudgeTaskCard
            task={item}
            ownerName={item.owner_display_name}
            isZapping={actingTaskId === item.id && actingKind === 'zap'}
            isApproving={actingTaskId === item.id && actingKind === 'approve'}
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
  error: { color: '#d32f2f', textAlign: 'center', padding: 8 },
  list: { padding: 12, gap: 12 },
});
