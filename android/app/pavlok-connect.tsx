import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { APIClient } from '../src/services/apiClient';
import { useAuth } from '../src/contexts/AuthContext';

export default function PavlokConnectScreen() {
  const router = useRouter();
  const { pavlokConnected } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [connected, setConnected] = useState(pavlokConnected);

  const connect = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await APIClient.connectPavlok(email, password);
      setConnected(true);
      router.back();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  const disconnect = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await APIClient.disconnectPavlok();
      setConnected(false);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <Text style={styles.headerIcon}>⚡</Text>
        <View style={styles.headerTextBlock}>
          <Text style={styles.headerTitle}>Pavlokアカウントを連携する</Text>
          <Text style={styles.headerSubtitle}>
            メールアドレスとパスワードでログインすると、監視者がZapボタンを押したとき自動でZapが送られます。
          </Text>
        </View>
      </View>

      {connected ? (
        <View style={styles.section}>
          <Text style={styles.connectedText}>✓ 連携済みです</Text>
          <Pressable style={[styles.button, styles.dangerButton]} onPress={disconnect} disabled={isLoading}>
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>連携を解除する</Text>}
          </Pressable>
        </View>
      ) : (
        <View style={styles.section}>
          <TextInput
            style={styles.input}
            placeholder="メールアドレス"
            keyboardType="email-address"
            autoCapitalize="none"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput style={styles.input} placeholder="パスワード" secureTextEntry value={password} onChangeText={setPassword} />
          <Pressable
            style={[styles.button, (isLoading || !email || !password) && styles.buttonDisabled]}
            onPress={connect}
            disabled={isLoading || !email || !password}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>連携する</Text>}
          </Pressable>
        </View>
      )}

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f2f2f7', padding: 16, gap: 16 },
  headerCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, flexDirection: 'row', gap: 12 },
  headerIcon: { fontSize: 36 },
  headerTextBlock: { flex: 1, gap: 4 },
  headerTitle: { fontWeight: '700', fontSize: 15 },
  headerSubtitle: { color: '#888', fontSize: 12 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, gap: 10 },
  connectedText: { color: '#2e7d32', fontWeight: '600' },
  input: { borderWidth: 1, borderColor: '#ccc', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10 },
  button: { backgroundColor: '#007aff', borderRadius: 8, height: 46, alignItems: 'center', justifyContent: 'center' },
  dangerButton: { backgroundColor: '#d32f2f' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
  error: { color: '#d32f2f', fontSize: 13, textAlign: 'center' },
});
