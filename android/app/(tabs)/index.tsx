import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import type { AppTask, Routine, TaskStatus } from '../../src/types';
import { routineFrequencyLabel, taskStatusLabel } from '../../src/types';

const STATUS_ORDER: TaskStatus[] = ['scheduled'];
const DROPDOWN_STATUS_ORDER: TaskStatus[] = ['readyToZap', 'readyToReZap', 'waitingAck'];

const STATUS_COLOR: Record<TaskStatus, string> = {
  readyToZap: '#d32f2f',
  readyToReZap: '#d32f2f',
  waitingAck: '#f57c00',
  scheduled: '#007aff',
  closed: '#2e7d32',
};

const DAY_OF_WEEK = ['日', '月', '火', '水', '木', '金', '土'];

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

function formatRoutineSchedule(routine: Routine): string {
  if (!routine.next_run_at) return routineFrequencyLabel[routine.frequency];
  const date = new Date(routine.next_run_at);
  const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  switch (routine.frequency) {
    case 'daily': return `毎日 ${time}`;
    case 'weekly': return `毎週${DAY_OF_WEEK[date.getDay()]}曜 ${time}`;
    case 'monthly': return `毎月${date.getDate()}日 ${time}`;
    case 'custom': return 'カスタム';
  }
}

function TaskRow({ task, onPress }: { task: AppTask; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {task.title}
        </Text>
        <View style={[styles.badge, { backgroundColor: STATUS_COLOR[task.status] + '33' }]}>
          <Text style={[styles.badgeText, { color: STATUS_COLOR[task.status] }]}>
            {taskStatusLabel[task.status]}
          </Text>
        </View>
      </View>
      <Text style={styles.rowDue}>{formatRelative(task.due_at)}</Text>
    </Pressable>
  );
}

function RoutineRow({ routine, onPress }: { routine: Routine; onPress: () => void }) {
  return (
    <Pressable style={styles.row} onPress={onPress}>
      <View style={styles.rowTop}>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {routine.title}
        </Text>
        <View style={[styles.badge, { backgroundColor: routine.is_active ? '#007aff33' : '#88888833' }]}>
          <Text style={[styles.badgeText, { color: routine.is_active ? '#007aff' : '#888' }]}>
            {routineFrequencyLabel[routine.frequency]}
          </Text>
        </View>
      </View>
      <View style={styles.routineBottom}>
        <Text style={styles.rowDue}>{formatRoutineSchedule(routine)}</Text>
        {!routine.is_active && <Text style={styles.inactiveLabel}>停止中</Text>}
        {routine.is_active && routine.next_run_at && (
          <Text style={styles.rowDue}>
            次回: {new Date(routine.next_run_at).toLocaleString('ja-JP')}
          </Text>
        )}
      </View>
    </Pressable>
  );
}

type Tab = 'tasks' | 'routines';

export default function OwnerHomeScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<Tab>('tasks');
  const [tasks, setTasks] = useState<AppTask[]>([]);
  const [routines, setRoutines] = useState<Routine[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showOthers, setShowOthers] = useState(false);

  const loadTasks = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await APIClient.getTasks();
      setTasks(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadRoutines = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await APIClient.getRoutines();
      setRoutines(result);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const [tasksResult, routinesResult] = await Promise.all([
        APIClient.getTasks(),
        APIClient.getRoutines(),
      ]);
      setTasks(tasksResult);
      setRoutines(routinesResult);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const activeTasks = tasks.filter((t) => t.status !== 'closed');
  const otherTasks = DROPDOWN_STATUS_ORDER.flatMap((status) =>
    activeTasks.filter((t) => t.status === status)
  );

  const handleTabSwitch = (tab: Tab) => {
    setActiveTab(tab);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>マイタスク</Text>
        <Pressable
          onPress={() =>
            router.push(activeTab === 'tasks' ? '/create-task' : '/create-routine')
          }
        >
          <Text style={styles.headerAction}>＋ 作成</Text>
        </Pressable>
      </View>

      {/* セグメントコントロール */}
      <View style={styles.segmentBar}>
        <Pressable
          style={[styles.segmentBtn, activeTab === 'tasks' && styles.segmentBtnActive]}
          onPress={() => handleTabSwitch('tasks')}
        >
          <Text style={[styles.segmentText, activeTab === 'tasks' && styles.segmentTextActive]}>
            タスク
          </Text>
        </Pressable>
        <Pressable
          style={[styles.segmentBtn, activeTab === 'routines' && styles.segmentBtnActive]}
          onPress={() => handleTabSwitch('routines')}
        >
          <Text style={[styles.segmentText, activeTab === 'routines' && styles.segmentTextActive]}>
            ルーティーン
          </Text>
        </Pressable>
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {activeTab === 'tasks' ? (
        activeTasks.length === 0 && !isLoading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>タスクがありません</Text>
            <Pressable onPress={() => router.push('/create-task')}>
              <Text style={styles.emptyAction}>タスクを作成</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={STATUS_ORDER.flatMap((status) => activeTasks.filter((t) => t.status === status))}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadTasks} />}
            renderItem={({ item }) => (
              <TaskRow task={item} onPress={() => router.push(`/task/${item.id}`)} />
            )}
            ListFooterComponent={
              otherTasks.length > 0 ? (
                <View>
                  <Pressable style={styles.dropdownHeader} onPress={() => setShowOthers((v) => !v)}>
                    <Text style={styles.dropdownHeaderText}>その他</Text>
                    <Text style={styles.dropdownHeaderCount}>{otherTasks.length}件</Text>
                  </Pressable>
                  {showOthers &&
                    otherTasks.map((task) => (
                      <TaskRow key={task.id} task={task} onPress={() => router.push(`/task/${task.id}`)} />
                    ))}
                </View>
              ) : null
            }
          />
        )
      ) : (
        routines.length === 0 && !isLoading ? (
          <View style={styles.empty}>
            <Text style={styles.emptyText}>ルーティーンがありません</Text>
            <Pressable onPress={() => router.push('/create-routine')}>
              <Text style={styles.emptyAction}>ルーティーンを作成</Text>
            </Pressable>
          </View>
        ) : (
          <FlatList
            data={routines}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadRoutines} />}
            renderItem={({ item }) => (
              <RoutineRow routine={item} onPress={() => router.push(`/routine/${item.id}`)} />
            )}
          />
        )
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
  },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerAction: { color: '#007aff', fontSize: 16 },
  segmentBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingBottom: 10,
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  segmentBtn: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#f2f2f7',
  },
  segmentBtnActive: { backgroundColor: '#007aff' },
  segmentText: { fontSize: 14, color: '#555' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  error: { color: '#d32f2f', textAlign: 'center', padding: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 },
  emptyText: { color: '#888', fontSize: 16 },
  emptyAction: { color: '#007aff', fontSize: 16 },
  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
    gap: 6,
  },
  rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  rowTitle: { flex: 1, fontSize: 16 },
  badge: { borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3 },
  badgeText: { fontSize: 11 },
  rowDue: { color: '#888', fontSize: 12 },
  routineBottom: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  inactiveLabel: { fontSize: 12, color: '#d32f2f' },
  dropdownHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  dropdownHeaderText: { color: '#888', fontSize: 14 },
  dropdownHeaderCount: { color: '#888', fontSize: 12 },
});
