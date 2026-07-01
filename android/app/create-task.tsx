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
import type { Relationship } from '../src/types';

const REMINDER_OPTIONS = [
  { label: 'なし', value: 0 },
  { label: '5分前', value: 5 },
  { label: '10分前', value: 10 },
  { label: '15分前', value: 15 },
  { label: '30分前', value: 30 },
  { label: '1時間前', value: 60 },
];

export default function CreateTaskScreen() {
  const router = useRouter();
  const { dbUserId } = useAuth();

  const [title, setTitle] = useState('');
  const [zapCriteria, setZapCriteria] = useState('');
  const [dueAt, setDueAt] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
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
  const isFormValid = title.trim().length > 0 && dueAt.getTime() > Date.now();

  const createTask = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await APIClient.createTask({
        title: title.trim(),
        zapCriteria: zapCriteria.trim(),
        dueAt,
        controllerUserId: selectedControllerId,
        reminderMinutes,
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

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
      // Android のネイティブピッカーは datetime モードに対応していないため、
      // 日付選択 → 時刻選択の順にダイアログを2回開いて1つの Date に合成する。
      DateTimePickerAndroid.open({
        value: dueAt,
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
              setDueAt(combined);
            },
          });
        },
      });
    } else {
      setShowDatePicker(true);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>タスク情報</Text>
        <TextInput style={styles.input} placeholder="タスク名" value={title} onChangeText={setTitle} />
        <Pressable style={styles.input} onPress={openDatePicker}>
          <Text>{dueAt.toLocaleString('ja-JP')}</Text>
        </Pressable>
        {Platform.OS === 'ios' && showDatePicker && (
          <DateTimePicker
            value={dueAt}
            mode="datetime"
            minimumDate={new Date()}
            onChange={(_, selected) => {
              setShowDatePicker(false);
              if (selected) setDueAt(selected);
            }}
          />
        )}
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
        <Text style={styles.footer}>監視者がZapするかどうかの判断材料になります。</Text>
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
          <View>
            <Text>まだ監視者がいません</Text>
            <Text style={styles.footer}>監視してもらうには、作成後に監視者を招待してタスク詳細から設定してください。</Text>
          </View>
        ) : (
          <View style={styles.chipRow}>
            <Pressable
              style={[styles.chip, selectedControllerId === null && styles.chipSelected]}
              onPress={() => setSelectedControllerId(null)}
            >
              <Text style={selectedControllerId === null ? styles.chipTextSelected : styles.chipText}>選択しない</Text>
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
          onPress={createTask}
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
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 70, textAlignVertical: 'top' },
  footer: { fontSize: 12, color: '#888' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: '#007aff', borderColor: '#007aff' },
  chipText: { color: '#333' },
  chipTextSelected: { color: '#fff' },
  error: { color: '#d32f2f', textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  cancel: { color: '#888', fontSize: 16 },
  createButton: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonDisabled: { opacity: 0.5 },
  createButtonText: { color: '#fff', fontWeight: '600' },
});
