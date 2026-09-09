import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SwipeJudgeControl } from './SwipeJudgeControl';
import type { AppTask } from '../types';

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

interface Props {
  task: AppTask;
  ownerName?: string;
  isZapping: boolean;
  isApproving: boolean;
  isDeleting?: boolean;
  onApprove: () => void;
  onZap: () => void;
  onDelete?: () => void;
}

export function JudgeTaskCard({
  task,
  ownerName,
  isZapping,
  isApproving,
  isDeleting,
  onApprove,
  onZap,
  onDelete,
}: Props) {
  const isJudgeable = task.status === 'readyToZap' || task.status === 'readyToReZap';

  return (
    <View style={styles.card}>
      <View style={styles.cardTop}>
        <View style={styles.cardTopText}>
          {!!ownerName && <Text style={styles.ownerName}>{ownerName}</Text>}
          <Text style={styles.cardTitle} numberOfLines={2}>
            {task.title}
          </Text>
        </View>
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

      {onDelete && task.status !== 'closed' && task.status !== 'waitingAck' && (
        <Pressable style={styles.deleteButton} onPress={onDelete} disabled={isDeleting}>
          {isDeleting ? <ActivityIndicator color="#fff" /> : <Text style={styles.deleteButtonText}>タスクを削除</Text>}
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, gap: 10, marginBottom: 12 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  cardTopText: { flex: 1, gap: 2 },
  ownerName: { fontSize: 12, color: '#007aff', fontWeight: '600' },
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
