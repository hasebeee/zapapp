import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { APIClient } from '../src/services/apiClient';

export default function AcceptInviteScreen() {
  const router = useRouter();
  const [token, setToken] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSuccess, setIsSuccess] = useState(false);

  const acceptInvite = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await APIClient.acceptInvite(token);
      setIsSuccess(true);
      setTimeout(() => router.back(), 1500);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>🔗</Text>
      <Text style={styles.title}>招待を受諾する</Text>
      <Text style={styles.subtitle}>招待者から受け取ったトークンを入力してください。</Text>

      {isSuccess ? (
        <View style={styles.successBox}>
          <Text style={styles.successIcon}>✓</Text>
          <Text style={styles.successText}>招待を受諾しました！</Text>
        </View>
      ) : (
        <View style={styles.form}>
          <TextInput
            style={styles.input}
            placeholder="招待トークン"
            value={token}
            onChangeText={setToken}
            autoCapitalize="none"
            autoCorrect={false}
          />
          {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}
          <Pressable
            style={[styles.button, (isLoading || !token) && styles.buttonDisabled]}
            onPress={acceptInvite}
            disabled={isLoading || !token}
          >
            {isLoading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>受諾する</Text>}
          </Pressable>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 16 },
  icon: { fontSize: 56 },
  title: { fontSize: 22, fontWeight: '700' },
  subtitle: { color: '#888', textAlign: 'center' },
  successBox: { alignItems: 'center', gap: 8 },
  successIcon: { fontSize: 40, color: '#2e7d32' },
  successText: { fontSize: 16, fontWeight: '700', color: '#2e7d32' },
  form: { width: '100%', gap: 12, marginTop: 16 },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontFamily: 'monospace',
  },
  error: { color: '#d32f2f', fontSize: 13, textAlign: 'center' },
  button: { backgroundColor: '#007aff', borderRadius: 8, height: 50, alignItems: 'center', justifyContent: 'center' },
  buttonDisabled: { opacity: 0.5 },
  buttonText: { color: '#fff', fontWeight: '600' },
});
