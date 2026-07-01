import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import { useAuth } from '../../src/contexts/AuthContext';
import type { AppTask, Relationship } from '../../src/types';

type Scope = 'owner' | 'controller';

type MonitoredSection = { ownerName: string; tasks: AppTask[] };

function formatDateTime(iso: string): string {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()} ${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function HistoryTaskRow({ task, personLabel }: { task: AppTask; personLabel?: string | null }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowTitleLine}>
        <Text style={styles.checkIcon}>✓</Text>
        <Text style={styles.rowTitle} numberOfLines={2}>
          {task.title}
        </Text>
      </View>
      <View style={styles.rowMetaLine}>
        {task.closed_at && <Text style={styles.metaGreen}>🏁 {formatDateTime(task.closed_at)}</Text>}
        <Text style={styles.metaGray}>🕐 {formatDateTime(task.due_at)}</Text>
      </View>
      {personLabel && <Text style={styles.metaGray}>⚡ {personLabel}</Text>}
    </View>
  );
}

function EmptyView({ icon, message, sub }: { icon: string; message: string; sub: string }) {
  return (
    <View style={styles.empty}>
      <Text style={styles.emptyIcon}>{icon}</Text>
      <Text style={styles.emptyText}>{message}</Text>
      <Text style={styles.emptySubText}>{sub}</Text>
    </View>
  );
}

export default function HistoryScreen() {
  const { dbUserId } = useAuth();
  const [scope, setScope] = useState<Scope>('owner');
  const [myClosedTasks, setMyClosedTasks] = useState<AppTask[]>([]);
  const [monitoredSections, setMonitoredSections] = useState<MonitoredSection[]>([]);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const loadAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const rels = await APIClient.getRelationships().catch(() => [] as Relationship[]);
      setRelationships(rels);

      const myTasks = await APIClient.getTasks(['closed']).catch(() => [] as AppTask[]);
      setMyClosedTasks(
        [...myTasks].sort(
          (a, b) => new Date(b.closed_at ?? b.due_at).getTime() - new Date(a.closed_at ?? a.due_at).getTime()
        )
      );

      const ownerRels = rels.filter((r) => r.controller_user_id === dbUserId);
      const sections = await Promise.all(
        ownerRels.map(async (rel) => {
          const name = rel.owner_user?.display_name ?? rel.owner_user?.email ?? rel.owner_user_id;
          const tasks = await APIClient.getOwnerTasks(rel.owner_user_id, ['closed']).catch(() => [] as AppTask[]);
          const sorted = [...tasks].sort(
            (a, b) => new Date(b.closed_at ?? b.due_at).getTime() - new Date(a.closed_at ?? a.due_at).getTime()
          );
          return { ownerName: name, tasks: sorted };
        })
      );
      setMonitoredSections(sections.sort((a, b) => a.ownerName.localeCompare(b.ownerName)));
    } finally {
      setIsLoading(false);
    }
  }, [dbUserId]);

  useFocusEffect(
    useCallback(() => {
      loadAll();
    }, [loadAll])
  );

  const controllerName = (task: AppTask): string | null => {
    if (!task.controller_user_id) return null;
    const rel = relationships.find((r) => r.controller_user_id === task.controller_user_id);
    return rel?.controller_user?.display_name ?? rel?.controller_user?.email ?? null;
  };

  const allMonitoredEmpty = monitoredSections.every((s) => s.tasks.length === 0);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>履歴</Text>
      </View>

      <View style={styles.segment}>
        <Pressable
          style={[styles.segmentButton, scope === 'owner' && styles.segmentButtonActive]}
          onPress={() => setScope('owner')}
        >
          <Text style={scope === 'owner' ? styles.segmentTextActive : styles.segmentText}>自分のタスク</Text>
        </Pressable>
        <Pressable
          style={[styles.segmentButton, scope === 'controller' && styles.segmentButtonActive]}
          onPress={() => setScope('controller')}
        >
          <Text style={scope === 'controller' ? styles.segmentTextActive : styles.segmentText}>監視したタスク</Text>
        </Pressable>
      </View>

      {isLoading && myClosedTasks.length === 0 && monitoredSections.length === 0 ? (
        <View style={styles.centered}>
          <ActivityIndicator />
        </View>
      ) : scope === 'owner' ? (
        myClosedTasks.length === 0 ? (
          <EmptyView icon="✓" message="完了したタスクはありません" sub="タスクを完了すると、ここに履歴が残ります。" />
        ) : (
          <FlatList
            data={myClosedTasks}
            keyExtractor={(item) => item.id}
            refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadAll} />}
            ListHeaderComponent={<Text style={styles.sectionHeader}>完了済み {myClosedTasks.length} 件</Text>}
            renderItem={({ item }) => {
              const name = controllerName(item);
              return <HistoryTaskRow task={item} personLabel={name ? `監視: ${name}` : null} />;
            }}
          />
        )
      ) : allMonitoredEmpty ? (
        <EmptyView
          icon="⚡"
          message="監視したタスクの履歴はありません"
          sub="監視中のオーナーがタスクを完了すると、ここに表示されます。"
        />
      ) : (
        <FlatList
          data={monitoredSections.filter((s) => s.tasks.length > 0)}
          keyExtractor={(item) => item.ownerName}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadAll} />}
          renderItem={({ item }) => (
            <View>
              <View style={styles.sectionHeaderRow}>
                <Text style={styles.sectionHeader}>👤 {item.ownerName}</Text>
                <Text style={styles.sectionHeaderCount}>{item.tasks.length} 件</Text>
              </View>
              {item.tasks.map((task) => (
                <HistoryTaskRow key={task.id} task={task} />
              ))}
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  segment: { flexDirection: 'row', backgroundColor: '#fff', padding: 12, gap: 8 },
  segmentButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f2f2f7',
  },
  segmentButtonActive: { backgroundColor: '#007aff' },
  segmentText: { color: '#333' },
  segmentTextActive: { color: '#fff', fontWeight: '600' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyIcon: { fontSize: 40 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#888' },
  emptySubText: { fontSize: 12, color: '#aaa', textAlign: 'center' },
  sectionHeader: { fontSize: 13, color: '#888', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  sectionHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 },
  sectionHeaderCount: { fontSize: 12, color: '#888' },
  row: {
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
    gap: 4,
  },
  rowTitleLine: { flexDirection: 'row', gap: 6, alignItems: 'flex-start' },
  checkIcon: { color: '#2e7d32' },
  rowTitle: { flex: 1, fontWeight: '700', fontSize: 15 },
  rowMetaLine: { flexDirection: 'row', gap: 14 },
  metaGreen: { fontSize: 12, color: '#2e7d32' },
  metaGray: { fontSize: 12, color: '#888' },
});
