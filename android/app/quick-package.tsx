import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { APIClient } from '../src/services/apiClient';
import { todayAtTimeOfDay } from '../src/types';
import type { Package } from '../src/types';

function formatTimeOfDay(timeOfDay: string): string {
  const [hours, minutes] = timeOfDay.split(':');
  return `${hours}:${minutes}`;
}

export default function QuickPackageScreen() {
  const router = useRouter();
  const [packages, setPackages] = useState<Package[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isCreating, setIsCreating] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      const result = await APIClient.getPackages();
      setPackages(result);
      // 消えたパッケージが選択に残らないようにする
      const validIds = new Set(result.map((p) => p.id));
      setSelectedIds((prev) => new Set([...prev].filter((id) => validIds.has(id))));
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const createFromSelected = async () => {
    const selectedPackages = packages.filter((p) => selectedIds.has(p.id));
    if (selectedPackages.length === 0) return;

    setIsCreating(true);
    setErrorMessage(null);
    try {
      const results = await Promise.allSettled(
        selectedPackages.map((pkg) => APIClient.usePackage(pkg.id, todayAtTimeOfDay(pkg.time_of_day)))
      );

      const failed = selectedPackages.filter((_, i) => results[i].status === 'rejected');

      if (failed.length === 0) {
        router.replace('/(tabs)');
        return;
      }

      // 失敗した分だけ選択を残し、成功した分は選択解除する
      setSelectedIds(new Set(failed.map((p) => p.id)));
      setErrorMessage(
        `${failed.length}件の作成に失敗しました（${failed.map((p) => p.title).join('、')}）。他は作成済みです。`
      );
    } finally {
      setIsCreating(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  const selectedCount = selectedIds.size;

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>パッケージでタスク作成</Text>
        <Text style={styles.headerSubtitle}>複数選んでまとめてタスクを作成できます</Text>
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {packages.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>まだパッケージがありません</Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={packages}
          keyExtractor={(item) => item.id}
          renderItem={({ item }) => {
            const selected = selectedIds.has(item.id);
            return (
              <Pressable
                style={[styles.row, selected && styles.rowSelected]}
                onPress={() => toggleSelect(item.id)}
                disabled={isCreating}
              >
                <View style={[styles.checkbox, selected && styles.checkboxSelected]}>
                  {selected && <Text style={styles.checkmark}>✓</Text>}
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowTitle}>{item.title}</Text>
                  <Text style={styles.rowSubtitle}>
                    {item.items.length}件 ・ 作成当日 {formatTimeOfDay(item.time_of_day)}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}

      {selectedCount > 0 && (
        <View style={styles.actionBar}>
          <Pressable
            style={[styles.createButton, isCreating && styles.buttonDisabled]}
            onPress={createFromSelected}
            disabled={isCreating}
          >
            {isCreating ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.createButtonText}>選択した{selectedCount}件でタスク作成</Text>
            )}
          </Pressable>
        </View>
      )}

      <View style={styles.footer}>
        <Pressable style={styles.footerLink} onPress={() => router.push('/create-package')}>
          <Text style={styles.footerLinkText}>新しいパッケージを作る</Text>
        </Pressable>
        <Pressable style={styles.footerLink} onPress={() => router.push('/create-task')}>
          <Text style={styles.footerLinkText}>通常のタスクを作成</Text>
        </Pressable>
        <Pressable style={styles.footerLink} onPress={() => router.replace('/(tabs)')}>
          <Text style={styles.skipText}>スキップしてホームへ</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f2f2f7' },
  header: { paddingHorizontal: 16, paddingTop: 56, paddingBottom: 12, backgroundColor: '#fff', gap: 4 },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  headerSubtitle: { fontSize: 13, color: '#888' },
  error: { color: '#d32f2f', textAlign: 'center', padding: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: '#888', fontSize: 16 },
  list: { padding: 12, gap: 12 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  rowSelected: { borderColor: '#007aff', backgroundColor: '#007aff0d' },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#ccc',
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkboxSelected: { borderColor: '#007aff', backgroundColor: '#007aff' },
  checkmark: { color: '#fff', fontSize: 14, fontWeight: '700' },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, color: '#888' },
  actionBar: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e5e5ea',
  },
  createButton: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  createButtonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
  footer: { padding: 16, gap: 4, alignItems: 'center' },
  footerLink: { paddingVertical: 8 },
  footerLinkText: { color: '#007aff', fontSize: 15 },
  skipText: { color: '#888', fontSize: 14 },
});
