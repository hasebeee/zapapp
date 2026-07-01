import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import DateTimePicker, { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';

export default function UseGiftScreen() {
  const router = useRouter();
  const { giftId } = useLocalSearchParams<{ giftId: string }>();

  const [title, setTitle] = useState('');
  const [dueAt, setDueAt] = useState(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFormValid = title.trim().length > 0 && dueAt.getTime() > Date.now();

  const openDatePicker = () => {
    if (Platform.OS === 'android') {
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

  const useGift = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await APIClient.useGift(giftId, title.trim(), dueAt);
      Alert.alert('タスクを作成しました！', 'オーナーさんに通知が送られます。', [
        { text: 'OK', onPress: () => router.back() },
      ]);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.cardTitle}>🎁 ギフトからタスクを作成</Text>
      </View>

      <View style={styles.section}>
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

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Pressable
        style={[styles.button, (!isFormValid || isLoading) && styles.buttonDisabled]}
        onPress={useGift}
        disabled={!isFormValid || isLoading}
      >
        {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>タスクを作成</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7', padding: 16, gap: 16 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16 },
  cardTitle: { fontSize: 16, fontWeight: '700' },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  error: { color: '#d32f2f', textAlign: 'center' },
  button: { backgroundColor: '#e91e8c', borderRadius: 8, height: 48, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
