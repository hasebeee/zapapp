import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { APIClient } from '../src/services/apiClient';
import { useAuth } from '../src/contexts/AuthContext';
import type { Relationship, RoutineFrequency } from '../src/types';

const REMINDER_OPTIONS = [
  { label: 'なし', value: 0 },
  { label: '5分前', value: 5 },
  { label: '10分前', value: 10 },
  { label: '15分前', value: 15 },
  { label: '30分前', value: 30 },
  { label: '1時間前', value: 60 },
];

const FREQUENCY_OPTIONS: { label: string; value: RoutineFrequency }[] = [
  { label: '毎日', value: 'daily' },
  { label: '毎週', value: 'weekly' },
  { label: '毎月', value: 'monthly' },
  { label: 'カスタム', value: 'custom' },
];

const DAY_OF_WEEK_OPTIONS = ['日', '月', '火', '水', '木', '金', '土'];

export default function CreateRoutineScreen() {
  const router = useRouter();
  const { dbUserId } = useAuth();

  const [title, setTitle] = useState('');
  const [zapCriteria, setZapCriteria] = useState('');
  const [frequency, setFrequency] = useState<RoutineFrequency>('daily');
  const [firstRunAt, setFirstRunAt] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showFirstRunPicker, setShowFirstRunPicker] = useState(false);
  const [customDatetimes, setCustomDatetimes] = useState<Date[]>([]);
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedControllerId, setSelectedControllerId] = useState<string | null>(null);
  const [reminderMinutes, setReminderMinutes] = useState(5);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      APIClient.getRelationships()
        .then(setRelationships)
        .catch(() => {});
    }, [])
  );

  const controllerRelationships = relationships.filter((r) => r.owner_user_id === dbUserId);

  const isFormValid =
    title.trim().length > 0 &&
    (frequency !== 'custom'
      ? firstRunAt.getTime() > Date.now()
      : customDatetimes.length > 0 && customDatetimes.some((d) => d.getTime() > Date.now()));

  const openDatePicker = (
    current: Date,
    onSelect: (date: Date) => void,
    showSetter?: (v: boolean) => void
  ) => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: current,
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
              onSelect(combined);
            },
          });
        },
      });
    } else {
      showSetter?.(true);
    }
  };

  const addCustomDatetime = () => {
    const next = new Date(Date.now() + 24 * 60 * 60 * 1000);
    openDatePicker(next, (date) => {
      setCustomDatetimes((prev) => [...prev, date].sort((a, b) => a.getTime() - b.getTime()));
    });
  };

  const removeCustomDatetime = (index: number) => {
    setCustomDatetimes((prev) => prev.filter((_, i) => i !== index));
  };

  const createRoutine = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await APIClient.createRoutine({
        title: title.trim(),
        zapCriteria: zapCriteria.trim() || null,
        controllerUserId: selectedControllerId,
        reminderMinutes,
        frequency,
        firstRunAt: frequency !== 'custom' ? firstRunAt : undefined,
        customDatetimes: frequency === 'custom' ? customDatetimes : undefined,
      });
      if (router.canGoBack()) {
        router.back();
      } else {
        router.replace('/(tabs)');
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const frequencyLabel = (freq: RoutineFrequency, date: Date) => {
    switch (freq) {
      case 'daily':
        return `毎日 ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
      case 'weekly':
        return `毎週${DAY_OF_WEEK_OPTIONS[date.getDay()]}曜 ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
      case 'monthly':
        return `毎月${date.getDate()}日 ${date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
      case 'custom':
        return 'カスタム日時';
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>タスク情報</Text>
        <TextInput style={styles.input} placeholder="タスク名" value={title} onChangeText={setTitle} />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Zapの基準（任意）</Text>
        <TextInput
          style={[styles.input, styles.multiline]}
          placeholder="例：レポートを提出していなければZap"
          value={zapCriteria}
          onChangeText={setZapCriteria}
          multiline
        />
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>繰り返し設定</Text>
        <View style={styles.chipRow}>
          {FREQUENCY_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, frequency === opt.value && styles.chipSelected]}
              onPress={() => setFrequency(opt.value)}
            >
              <Text style={frequency === opt.value ? styles.chipTextSelected : styles.chipText}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {frequency !== 'custom' ? (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.subLabel}>最初の実行日時（次回以降は自動計算）</Text>
            <Pressable
              style={styles.input}
              onPress={() => openDatePicker(firstRunAt, setFirstRunAt, setShowFirstRunPicker)}
            >
              <Text>{firstRunAt.toLocaleString('ja-JP')}</Text>
            </Pressable>
            {Platform.OS === 'ios' && showFirstRunPicker && (
              <DateTimePicker
                value={firstRunAt}
                mode="datetime"
                minimumDate={new Date()}
                onChange={(_, selected) => {
                  setShowFirstRunPicker(false);
                  if (selected) setFirstRunAt(selected);
                }}
              />
            )}
            <Text style={styles.hint}>
              {frequencyLabel(frequency, firstRunAt)} に自動でタスクが作成されます
            </Text>
          </View>
        ) : (
          <View style={{ marginTop: 10 }}>
            <Text style={styles.subLabel}>実行する日時リスト</Text>
            {customDatetimes.map((dt, i) => (
              <View key={i} style={styles.customRow}>
                <Text style={styles.customDate}>{dt.toLocaleString('ja-JP')}</Text>
                <Pressable onPress={() => removeCustomDatetime(i)}>
                  <Text style={styles.removeBtn}>削除</Text>
                </Pressable>
              </View>
            ))}
            <Pressable style={styles.addBtn} onPress={addCustomDatetime}>
              <Text style={styles.addBtnText}>＋ 日時を追加</Text>
            </Pressable>
            {Platform.OS === 'ios' && showCustomPicker && (
              <DateTimePicker
                value={new Date(Date.now() + 24 * 60 * 60 * 1000)}
                mode="datetime"
                minimumDate={new Date()}
                onChange={(_, selected) => {
                  setShowCustomPicker(false);
                  if (selected) {
                    setCustomDatetimes((prev) =>
                      [...prev, selected].sort((a, b) => a.getTime() - b.getTime())
                    );
                  }
                }}
              />
            )}
          </View>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>締切前リマインダー</Text>
        <View style={styles.chipRow}>
          {REMINDER_OPTIONS.map((opt) => (
            <Pressable
              key={opt.value}
              style={[styles.chip, reminderMinutes === opt.value && styles.chipSelected]}
              onPress={() => setReminderMinutes(opt.value)}
            >
              <Text style={reminderMinutes === opt.value ? styles.chipTextSelected : styles.chipText}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>監視してもらう人</Text>
        {controllerRelationships.length === 0 ? (
          <Text style={styles.hint}>まだ監視者がいません</Text>
        ) : (
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, selectedControllerId === null && styles.chipSelected]}
              onPress={() => setSelectedControllerId(null)}
            >
              <Text style={selectedControllerId === null ? styles.chipTextSelected : styles.chipText}>
                選択しない
              </Text>
            </Pressable>
            {controllerRelationships.map((rel) => (
              <Pressable
                key={rel.id}
                style={[styles.chip, selectedControllerId === rel.controller_user_id && styles.chipSelected]}
                onPress={() => setSelectedControllerId(rel.controller_user_id)}
              >
                <Text style={selectedControllerId === rel.controller_user_id ? styles.chipTextSelected : styles.chipText}>
                  {rel.controller_user?.display_name ?? rel.controller_user?.email ?? rel.controller_user_id}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <View style={styles.actions}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
        <Pressable
          style={[styles.createButton, (!isFormValid || isLoading) && styles.buttonDisabled]}
          onPress={createRoutine}
          disabled={!isFormValid || isLoading}
        >
          {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.createButtonText}>作成</Text>}
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 16, gap: 16 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  sectionTitle: { fontSize: 14, color: '#888', fontWeight: '600' },
  subLabel: { fontSize: 12, color: '#888', marginBottom: 6 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  hint: { fontSize: 12, color: '#007aff', marginTop: 6 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: '#007aff', borderColor: '#007aff' },
  chipText: { color: '#333' },
  chipTextSelected: { color: '#fff' },
  customRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
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
  error: { color: '#d32f2f', textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  cancel: { color: '#888', fontSize: 16 },
  createButton: { backgroundColor: '#007aff', borderRadius: 8, paddingHorizontal: 24, paddingVertical: 12 },
  buttonDisabled: { opacity: 0.5 },
  createButtonText: { color: '#fff', fontWeight: '600' },
});
