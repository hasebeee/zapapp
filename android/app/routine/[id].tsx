import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import type { Routine, RoutineFrequency } from '../../src/types';
import { routineFrequencyLabel } from '../../src/types';

const DAY_OF_WEEK_OPTIONS = ['日', '月', '火', '水', '木', '金', '土'];

function formatFrequency(routine: Routine): string {
  if (!routine.next_run_at) return routineFrequencyLabel[routine.frequency];
  const date = new Date(routine.next_run_at);
  const time = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
  switch (routine.frequency) {
    case 'daily':
      return `毎日 ${time}`;
    case 'weekly':
      return `毎週${DAY_OF_WEEK_OPTIONS[date.getDay()]}曜 ${time}`;
    case 'monthly':
      return `毎月${date.getDate()}日 ${time}`;
    case 'custom':
      return 'カスタム日時';
  }
}

export default function RoutineDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [routine, setRoutine] = useState<Routine | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // 編集状態
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editZapCriteria, setEditZapCriteria] = useState('');
  const [editCustomDatetimes, setEditCustomDatetimes] = useState<Date[]>([]);

  const loadRoutine = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await APIClient.getRoutines();
      const found = result.find((r) => r.id === id);
      if (found) {
        setRoutine(found);
        setEditTitle(found.title);
        setEditZapCriteria(found.zap_criteria ?? '');
        setEditCustomDatetimes(
          (found.custom_datetimes ?? []).map((d) => new Date(d))
        );
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      loadRoutine();
    }, [loadRoutine])
  );

  const toggleActive = async () => {
    if (!routine) return;
    try {
      const updated = await APIClient.updateRoutine(routine.id, { isActive: !routine.is_active });
      setRoutine(updated);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    }
  };

  const saveEdits = async () => {
    if (!routine) return;
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const params: Parameters<typeof APIClient.updateRoutine>[1] = {
        title: editTitle.trim(),
        zapCriteria: editZapCriteria.trim() || null,
      };
      if (routine.frequency === 'custom') {
        params.customDatetimes = editCustomDatetimes;
      }
      const updated = await APIClient.updateRoutine(routine.id, params);
      setRoutine(updated);
      setIsEditing(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const deleteRoutine = () => {
    Alert.alert('ルーティーンを削除', 'このルーティーンを削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: async () => {
          if (!routine) return;
          try {
            await APIClient.deleteRoutine(routine.id);
            if (router.canGoBack()) {
              router.back();
            } else {
              router.replace('/(tabs)');
            }
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  };

  const addCustomDatetime = () => {
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: next,
        mode: 'date',
        minimumDate: new Date(),
        onChange: (_, selectedDate) => {
          if (!selectedDate) return;
          DateTimePickerAndroid.open({
            value: selectedDate,
            mode: 'time',
            onChange: (_, selectedTime) => {
              if (!selectedTime) return;
              const combined = new Date(selectedDate);
              combined.setHours(selectedTime.getHours(), selectedTime.getMinutes(), 0, 0);
              setEditCustomDatetimes((prev) =>
                [...prev, combined].sort((a, b) => a.getTime() - b.getTime())
              );
            },
          });
        },
      });
    }
  };

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!routine) {
    return (
      <View style={styles.center}>
        <Text style={{ color: '#888' }}>ルーティーンが見つかりません</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {/* 基本情報 */}
      <View style={styles.card}>
        <View style={styles.cardRow}>
          <Text style={styles.label}>タスク名</Text>
          {isEditing ? (
            <TextInput
              style={[styles.input, { flex: 1 }]}
              value={editTitle}
              onChangeText={setEditTitle}
            />
          ) : (
            <Text style={styles.value}>{routine.title}</Text>
          )}
        </View>

        <View style={styles.divider} />

        <View style={styles.cardRow}>
          <Text style={styles.label}>繰り返し</Text>
          <Text style={styles.value}>{formatFrequency(routine)}</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardRow}>
          <Text style={styles.label}>次回実行</Text>
          <Text style={styles.value}>
            {routine.next_run_at
              ? new Date(routine.next_run_at).toLocaleString('ja-JP')
              : '—'}
          </Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.cardRow}>
          <Text style={styles.label}>有効</Text>
          <Switch value={routine.is_active} onValueChange={toggleActive} />
        </View>
      </View>

      {/* Zapの基準 */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>Zapの基準</Text>
        {isEditing ? (
          <TextInput
            style={[styles.input, styles.multiline]}
            value={editZapCriteria}
            onChangeText={setEditZapCriteria}
            placeholder="（任意）"
            multiline
          />
        ) : (
          <Text style={routine.zap_criteria ? styles.value : styles.emptyText}>
            {routine.zap_criteria || '未設定'}
          </Text>
        )}
      </View>

      {/* カスタム日時 */}
      {routine.frequency === 'custom' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>実行日時リスト</Text>
          {isEditing ? (
            <>
              {editCustomDatetimes.map((dt, i) => (
                <View key={i} style={styles.customRow}>
                  <Text style={styles.customDate}>{dt.toLocaleString('ja-JP')}</Text>
                  <Pressable
                    onPress={() =>
                      setEditCustomDatetimes((prev) => prev.filter((_, idx) => idx !== i))
                    }
                  >
                    <Text style={styles.removeBtn}>削除</Text>
                  </Pressable>
                </View>
              ))}
              <Pressable style={styles.addBtn} onPress={addCustomDatetime}>
                <Text style={styles.addBtnText}>＋ 日時を追加</Text>
              </Pressable>
            </>
          ) : (
            <>
              {(routine.custom_datetimes ?? []).length === 0 ? (
                <Text style={styles.emptyText}>日時がありません</Text>
              ) : (
                routine.custom_datetimes!.map((dt, i) => (
                  <Text key={i} style={styles.value}>
                    {new Date(dt).toLocaleString('ja-JP')}
                  </Text>
                ))
              )}
            </>
          )}
        </View>
      )}

      {/* 操作ボタン */}
      <View style={styles.actions}>
        {isEditing ? (
          <>
            <Pressable onPress={() => setIsEditing(false)}>
              <Text style={styles.cancel}>キャンセル</Text>
            </Pressable>
            <Pressable
              style={[styles.saveButton, isSaving && styles.buttonDisabled]}
              onPress={saveEdits}
              disabled={isSaving}
            >
              {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveButtonText}>保存</Text>}
            </Pressable>
          </>
        ) : (
          <Pressable style={styles.editButton} onPress={() => setIsEditing(true)}>
            <Text style={styles.editButtonText}>編集</Text>
          </Pressable>
        )}
      </View>

      <Pressable style={styles.deleteButton} onPress={deleteRoutine}>
        <Text style={styles.deleteButtonText}>ルーティーンを削除</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 16, gap: 16 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  error: { color: '#d32f2f', textAlign: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 12 },
  cardTitle: { fontSize: 14, color: '#888', fontWeight: '600', marginBottom: 4 },
  cardRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  divider: { height: 1, backgroundColor: '#e5e5ea' },
  label: { fontSize: 14, color: '#888', flexShrink: 0 },
  value: { fontSize: 14, flex: 1, textAlign: 'right' },
  emptyText: { fontSize: 14, color: '#aaa' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  customRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  customDate: { fontSize: 14 },
  removeBtn: { color: '#d32f2f', fontSize: 13 },
  addBtn: {
    marginTop: 8,
    alignItems: 'center',
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: '#007aff',
    borderRadius: 8,
    borderStyle: 'dashed',
  },
  addBtnText: { color: '#007aff', fontSize: 14 },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  cancel: { color: '#888', fontSize: 16 },
  editButton: { flex: 1, backgroundColor: '#007aff', borderRadius: 8, paddingVertical: 12, alignItems: 'center' },
  editButtonText: { color: '#fff', fontWeight: '600' },
  saveButton: { backgroundColor: '#34c759', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  buttonDisabled: { opacity: 0.5 },
  saveButtonText: { color: '#fff', fontWeight: '600' },
  deleteButton: { alignItems: 'center', paddingVertical: 12 },
  deleteButtonText: { color: '#d32f2f', fontSize: 15 },
});
