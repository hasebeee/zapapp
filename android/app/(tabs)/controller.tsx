import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { APIClient } from '../../src/services/apiClient';
import { useAuth } from '../../src/contexts/AuthContext';
import type { Relationship } from '../../src/types';

export default function ControllerHomeScreen() {
  const router = useRouter();
  const { dbUserId } = useAuth();
  const [relationships, setRelationships] = useState<Relationship[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadRelationships = useCallback(async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      setRelationships(await APIClient.getRelationships());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      loadRelationships();
    }, [loadRelationships])
  );

  const ownerRelationships = relationships.filter((r) => r.controller_user_id === dbUserId);

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>監視する</Text>
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      {ownerRelationships.length === 0 && !isLoading ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>監視対象がいません</Text>
          <Text style={styles.emptySubText}>相手からの招待を受諾するか、招待を送って接続しましょう。</Text>
        </View>
      ) : (
        <FlatList
          data={ownerRelationships}
          keyExtractor={(item) => item.id}
          refreshControl={<RefreshControl refreshing={isLoading} onRefresh={loadRelationships} />}
          renderItem={({ item }) => {
            const name = item.owner_user?.display_name ?? item.owner_user?.email ?? item.owner_user_id;
            const email = item.owner_user?.email ?? item.owner_user_id;
            return (
              <Pressable
                style={styles.row}
                onPress={() =>
                  router.push({
                    pathname: '/owner-tasks/[ownerId]',
                    params: { ownerId: item.owner_user_id, ownerName: name },
                  })
                }
              >
                <View style={styles.avatar}>
                  <Text style={styles.avatarText}>{name.slice(0, 1)}</Text>
                </View>
                <View style={styles.rowText}>
                  <Text style={styles.rowName}>{name}</Text>
                  <Text style={styles.rowEmail}>{email}</Text>
                </View>
              </Pressable>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  error: { color: '#d32f2f', textAlign: 'center', padding: 8 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8, paddingHorizontal: 32 },
  emptyText: { fontSize: 16, color: '#888' },
  emptySubText: { fontSize: 13, color: '#aaa', textAlign: 'center' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#fff',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e5ea',
  },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#007aff',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontWeight: '700', fontSize: 18 },
  rowText: { flex: 1 },
  rowName: { fontWeight: '700', fontSize: 16 },
  rowEmail: { color: '#888', fontSize: 12 },
});
