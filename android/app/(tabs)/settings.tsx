import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';
import { AuthService } from '../../src/services/authService';
import { APIClient } from '../../src/services/apiClient';

export default function SettingsScreen() {
  const router = useRouter();
  const { user, pavlokConnected } = useAuth();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const displayName = user?.displayName ?? user?.email ?? 'Unknown';

  const confirmLogout = () => {
    Alert.alert('ログアウトしますか？', undefined, [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: () => AuthService.signOut() },
    ]);
  };

  const confirmDeleteAccount = () => {
    Alert.alert(
      'アカウントを削除しますか？',
      'すべてのデータが完全に削除されます。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: async () => {
            setIsDeleting(true);
            setDeleteError(null);
            try {
              await APIClient.deleteAccount();
              await user?.delete();
              await AuthService.signOut();
            } catch {
              setDeleteError('削除に失敗しました。もう一度お試しください。');
            } finally {
              setIsDeleting(false);
            }
          },
        },
      ]
    );
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>設定</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>アカウント</Text>
        <View style={styles.accountRow}>
          <Text style={styles.avatar}>👤</Text>
          <View>
            <Text style={styles.accountName}>{displayName}</Text>
            {!!user?.email && <Text style={styles.accountEmail}>{user.email}</Text>}
          </View>
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>つながり</Text>
        <Pressable style={styles.linkRow} onPress={() => router.push('/invite')}>
          <Text style={styles.linkText}>👤➕ 招待管理</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Pavlok連携</Text>
        <Pressable style={styles.linkRow} onPress={() => router.push('/pavlok-connect')}>
          <Text style={styles.linkText}>⚡ Pavlokアカウント連携</Text>
          <Text style={pavlokConnected ? styles.connectedText : styles.notConnectedText}>
            {pavlokConnected ? '連携済み（Zapを受け取れます）' : '未連携'}
          </Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.logoutRow} onPress={confirmLogout}>
          <Text style={styles.logoutText}>↪ ログアウト</Text>
        </Pressable>
      </View>

      <View style={styles.section}>
        <Pressable style={styles.deleteRow} onPress={confirmDeleteAccount} disabled={isDeleting}>
          {isDeleting ? <ActivityIndicator color="#d32f2f" /> : <Text style={styles.deleteText}>🗑 アカウントを削除</Text>}
        </Pressable>
        {deleteError && <Text style={styles.error}>{deleteError}</Text>}
        <Text style={styles.footer}>
          アカウントを削除すると、すべてのタスク・つながり・データが完全に削除されます。この操作は取り消せません。
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7' },
  content: { paddingBottom: 32 },
  header: { paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff' },
  headerTitle: { fontSize: 22, fontWeight: '700' },
  section: { backgroundColor: '#fff', marginTop: 12, paddingVertical: 8 },
  sectionTitle: { fontSize: 12, color: '#888', paddingHorizontal: 16, paddingBottom: 6, textTransform: 'uppercase' },
  accountRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  avatar: { fontSize: 36 },
  accountName: { fontWeight: '700', fontSize: 16 },
  accountEmail: { color: '#888', fontSize: 12 },
  linkRow: { paddingHorizontal: 16, paddingVertical: 12, gap: 4 },
  linkText: { fontSize: 15 },
  connectedText: { fontSize: 12, color: '#2e7d32' },
  notConnectedText: { fontSize: 12, color: '#f57c00' },
  logoutRow: { paddingHorizontal: 16, paddingVertical: 12 },
  logoutText: { fontSize: 15, color: '#d32f2f' },
  deleteRow: { paddingHorizontal: 16, paddingVertical: 12, alignItems: 'flex-start' },
  deleteText: { fontSize: 15, color: '#d32f2f' },
  error: { color: '#d32f2f', fontSize: 12, paddingHorizontal: 16 },
  footer: { fontSize: 12, color: '#888', paddingHorizontal: 16, paddingTop: 4 },
});
