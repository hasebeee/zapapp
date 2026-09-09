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
  const [usingId, setUsingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setPackages(await APIClient.getPackages());
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

  const usePackage = async (pkg: Package) => {
    setUsingId(pkg.id);
    setErrorMessage(null);
    try {
      await APIClient.usePackage(pkg.id, todayAtTimeOfDay(pkg.time_of_day));
      router.replace('/(tabs)');
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
      setUsingId(null);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>パッケージでタスク作成</Text>
        <Text style={styles.headerSubtitle}>タップすると、すぐにタスクが作成されます</Text>
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
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => usePackage(item)}
              disabled={usingId !== null}
            >
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.title}</Text>
                <Text style={styles.rowSubtitle}>
                  {item.items.length}件 ・ 作成当日 {formatTimeOfDay(item.time_of_day)}
                </Text>
              </View>
              {usingId === item.id ? <ActivityIndicator color="#007aff" /> : <Text style={styles.rowAction}>作成 ›</Text>}
            </Pressable>
          )}
        />
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
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  rowText: { flex: 1, gap: 4 },
  rowTitle: { fontSize: 16, fontWeight: '700' },
  rowSubtitle: { fontSize: 12, color: '#888' },
  rowAction: { color: '#007aff', fontSize: 15, fontWeight: '600' },
  footer: { padding: 16, gap: 4, alignItems: 'center' },
  footerLink: { paddingVertical: 8 },
  footerLinkText: { color: '#007aff', fontSize: 15 },
  skipText: { color: '#888', fontSize: 14 },
});
