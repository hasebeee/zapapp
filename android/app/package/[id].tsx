import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import { todayAtTimeOfDay } from '../../src/types';
import type { Package } from '../../src/types';

interface DraftItem {
  key: string;
  title: string;
  zapCriteria: string;
}

function toDraftItems(pkg: Package): DraftItem[] {
  return pkg.items.map((item) => ({ key: item.id, title: item.title, zapCriteria: item.zap_criteria ?? '' }));
}

function formatTimeOfDay(timeOfDay: string): string {
  const [hours, minutes] = timeOfDay.split(':');
  return `作成当日 ${hours}:${minutes}`;
}

export default function PackageDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [pkg, setPkg] = useState<Package | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isUsing, setIsUsing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editItems, setEditItems] = useState<DraftItem[]>([]);

  const load = useCallback(async () => {
    if (!id) return;
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await APIClient.getPackage(id);
      setPkg(result);
      setEditTitle(result.title);
      setEditItems(toDraftItems(result));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const updateItem = (key: string, patch: Partial<DraftItem>) => {
    setEditItems((prev) => prev.map((item) => (item.key === key ? { ...item, ...patch } : item)));
  };

  const addItem = () => setEditItems((prev) => [...prev, { key: `new-${Date.now()}`, title: '', zapCriteria: '' }]);

  const removeItem = (key: string) => {
    setEditItems((prev) => (prev.length > 1 ? prev.filter((item) => item.key !== key) : prev));
  };

  const startEditing = () => {
    if (!pkg) return;
    setEditTitle(pkg.title);
    setEditItems(toDraftItems(pkg));
    setIsEditing(true);
  };

  const saveEdits = async () => {
    if (!pkg) return;
    const validItems = editItems.filter((item) => item.title.trim().length > 0);
    if (editTitle.trim().length === 0 || validItems.length === 0) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const updated = await APIClient.updatePackage(pkg.id, {
        title: editTitle.trim(),
        items: validItems.map((item) => ({ title: item.title.trim(), zapCriteria: item.zapCriteria.trim() || null })),
      });
      setPkg(updated);
      setIsEditing(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const usePackageNow = () => {
    if (!pkg) return;
    Alert.alert('パッケージを使いますか？', `「${pkg.title}」の${pkg.items.length}件のタスクを今すぐ作成します。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '作成する',
        onPress: async () => {
          setIsUsing(true);
          setErrorMessage(null);
          try {
            await APIClient.usePackage(pkg.id, todayAtTimeOfDay(pkg.time_of_day));
            router.replace('/(tabs)');
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          } finally {
            setIsUsing(false);
          }
        },
      },
    ]);
  };

  const deletePackage = () => {
    if (!pkg) return;
    Alert.alert('パッケージを削除しますか？', `「${pkg.title}」を削除します。この操作は取り消せません。`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除する',
        style: 'destructive',
        onPress: async () => {
          try {
            await APIClient.deletePackage(pkg.id);
            router.back();
          } catch (error) {
            setErrorMessage(error instanceof Error ? error.message : String(error));
          }
        },
      },
    ]);
  };

  if (isLoading && !pkg) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!pkg) {
    return (
      <View style={styles.centered}>
        <Text>{errorMessage ?? 'パッケージが見つかりません'}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        {isEditing ? (
          <TextInput style={styles.input} value={editTitle} onChangeText={setEditTitle} placeholder="パッケージ名" />
        ) : (
          <Text style={styles.title}>{pkg.title}</Text>
        )}
        <Text style={styles.subtitle}>{formatTimeOfDay(pkg.time_of_day)}</Text>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardHeading}>タスク一覧（{(isEditing ? editItems : pkg.items).length}件）</Text>
        <View style={styles.divider} />
        {isEditing
          ? editItems.map((item, index) => (
              <View key={item.key} style={styles.itemBlock}>
                <View style={styles.itemHeader}>
                  <Text style={styles.itemLabel}>タスク {index + 1}</Text>
                  {editItems.length > 1 && (
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
            ))
          : pkg.items.map((item, index) => (
              <View key={item.id} style={styles.itemRow}>
                <Text style={styles.itemRowTitle}>
                  {index + 1}. {item.title}
                </Text>
                {!!item.zap_criteria && <Text style={styles.itemRowCriteria}>{item.zap_criteria}</Text>}
              </View>
            ))}
        {isEditing && (
          <Pressable style={styles.addItemButton} onPress={addItem}>
            <Text style={styles.addItemButtonText}>＋ タスクを追加</Text>
          </Pressable>
        )}
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {isEditing ? (
        <View style={styles.actions}>
          <Pressable onPress={() => setIsEditing(false)}>
            <Text style={styles.cancel}>キャンセル</Text>
          </Pressable>
          <Pressable style={[styles.button, isSaving && styles.buttonDisabled]} onPress={saveEdits} disabled={isSaving}>
            {isSaving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>保存</Text>}
          </Pressable>
        </View>
      ) : (
        <>
          <Pressable style={[styles.button, styles.useButton, isUsing && styles.buttonDisabled]} onPress={usePackageNow} disabled={isUsing}>
            {isUsing ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>今すぐこのパッケージでタスク作成</Text>}
          </Pressable>
          <Pressable style={styles.editLink} onPress={startEditing}>
            <Text style={styles.editLinkText}>編集する</Text>
          </Pressable>
          <Pressable style={[styles.button, styles.deleteButton]} onPress={deletePackage}>
            <Text style={styles.buttonText}>パッケージを削除</Text>
          </Pressable>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { padding: 16, gap: 16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 8 },
  title: { fontSize: 20, fontWeight: '700' },
  subtitle: { color: '#888', fontSize: 13 },
  cardHeading: { fontSize: 16, fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#e5e5ea' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  multiline: { minHeight: 50, textAlignVertical: 'top' },
  itemBlock: { gap: 8, borderTopWidth: 1, borderTopColor: '#e5e5ea', paddingTop: 10 },
  itemHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  itemLabel: { fontSize: 13, color: '#555', fontWeight: '600' },
  itemRemove: { color: '#d32f2f', fontSize: 13 },
  itemRow: { paddingVertical: 6, gap: 4 },
  itemRowTitle: { fontSize: 15 },
  itemRowCriteria: { fontSize: 12, color: '#888' },
  addItemButton: { alignItems: 'center', paddingVertical: 8 },
  addItemButtonText: { color: '#007aff', fontSize: 14, fontWeight: '600' },
  error: { color: '#d32f2f', fontSize: 13, textAlign: 'center' },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  cancel: { color: '#888', fontSize: 16 },
  button: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  useButton: { backgroundColor: '#2e7d32' },
  deleteButton: { backgroundColor: '#d32f2f' },
  editLink: { alignItems: 'center', paddingVertical: 8 },
  editLinkText: { color: '#007aff', fontSize: 15 },
});
