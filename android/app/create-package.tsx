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

interface DraftItem {
  key: string;
  title: string;
  zapCriteria: string;
}

function makeItem(): DraftItem {
  return { key: `${Date.now()}-${Math.random()}`, title: '', zapCriteria: '' };
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
}

function toTimeOfDay(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}:00`;
}

export default function CreatePackageScreen() {
  const router = useRouter();
  const { dbUserId } = useAuth();

  const [title, setTitle] = useState('');
  const [time, setTime] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [selectedControllerId, setSelectedControllerId] = useState<string | null>(null);
  const [reminderMinutes, setReminderMinutes] = useState(5);
  const [items, setItems] = useState<DraftItem[]>([makeItem()]);
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
  const validItems = items.filter((item) => item.title.trim().length > 0);
  const isFormValid = title.trim().length > 0 && validItems.length > 0;

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const addItem = () => setItems((prev) => [...prev, makeItem()]);

  const removeItem = (key: string) => {
    setItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));
  };

  const createPackage = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await APIClient.createPackage({
        title: title.trim(),
        controllerUserId: selectedControllerId,
        timeOfDay: toTimeOfDay(time),
        reminderMinutes,
        items: validItems.map((item) => ({
          title: item.title.trim(),
          zapCriteria: item.zapCriteria.trim() || null,
        })),
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

  const openTimePicker = () => {
    if (Platform.OS === 'android') {
      DateTimePickerAndroid.open({
        value: time,
        mode: 'time',
        onChange: (_, selected) => {
          if (selected) setTime(selected);
        },
      });
    } else {
      setShowTimePicker(true);
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>パッケージ情報</Text>
        <TextInput style={styles.input} placeholder="パッケージ名" value={title} onChangeText={setTitle} />
        <Pressable style={styles.input} onPress={openTimePicker}>
          <Text>作成当日 {formatTime(time)}</Text>
        </Pressable>
        {Platform.OS === 'ios' && showTimePicker && (
          <DateTimePicker
            value={time}
            mode="time"
            onChange={(_, selected) => {
              setShowTimePicker(false);
              if (selected) setTime(selected);
            }}
          />
        )}
        <Text style={styles.footer}>このパッケージを使った日の、この時刻を締切にタスクを作成します。</Text>
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
            <Text style={styles.footer}>監視してもらうには、作成後にタスク詳細から設定してください。</Text>
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

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>タスク一覧</Text>
        {items.map((item, index) => (
          <View key={item.key} style={styles.itemBlock}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemLabel}>タスク {index + 1}</Text>
              {items.length > 1 && (
                <Pressable onPress={() => removeItem(item.key)}>
                  <Text style={styles.itemRemove}>削除</Text>
                </Pressable>
              )}
            </View>
            <TextInput
              style={styles.input}
              placeholder="タスク名"
              value={item.title}
              onChangeText={(text) => updateItem(item.key, { title: text })}
            />
            <TextInput
              style={[styles.input, styles.multiline]}
              placeholder="Zapの基準（任意）"
              value={item.zapCriteria}
              onChangeText={(text) => updateItem(item.key, { zapCriteria: text })}
              multiline
            />
          </View>
        ))}
        <Pressable style={styles.addItemButton} onPress={addItem}>
          <Text style={styles.addItemButtonText}>＋ タスクを追加</Text>
        </Pressable>
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <View style={styles.actions}>
        <Pressable onPress={() => router.back()}>
          <Text style={styles.cancel}>キャンセル</Text>
        </Pressable>
        <Pressable
          style={[styles.createButton, (!isFormValid || isLoading) && styles.buttonDisabled]}
          onPress={createPackage}
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
  multiline: { minHeight: 60, textAlignVertical: 'top' },
  footer: { fontSize: 12, color: '#888' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: '#ccc', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6 },
  chipSelected: { backgroundColor: '#007aff', borderColor: '#007aff' },
  chipText: { color: '#333' },
  chipTextSelected: { color: '#fff' },
  itemBlock: { gap: 8, borderTopWidth: 1, borderTopColor: '#e5e5ea', paddingTop: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  itemRemove: { color: '#d32f2f', fontSize: 13 },
  addItemButton: { alignItems: 'center', paddingVertical: 8 },
  addItemButtonText: { color: '#007aff', fontSize: 14, fontWeight: '600' },
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
