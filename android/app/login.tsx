import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AuthService } from '../src/services/authService';
import { useAuth } from '../src/contexts/AuthContext';

export default function LoginScreen() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFormValid = email.length > 0 && password.length > 0;

  useEffect(() => {
    if (isLoggedIn) {
      // '/' 経由にすることで、起動時と同じ合否判定/パッケージ選択の分岐を通す
      router.replace('/');
    }
  }, [isLoggedIn]);

  const signIn = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    try {
      await AuthService.signIn(email, password);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : String(error));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.titleEmoji}>⚡️</Text>
        <Text style={styles.title}>ちゅーぶあぷり</Text>
      </View>

      <View style={styles.form}>
        <TextInput
          style={styles.input}
          placeholder="メールアドレス"
          keyboardType="email-address"
          autoCapitalize="none"
          value={email}
          onChangeText={setEmail}
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Pressable
        style={[styles.button, (!isFormValid || isLoading) && styles.buttonDisabled]}
        onPress={signIn}
        disabled={!isFormValid || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>ログイン</Text>
        )}
      </Pressable>

      <Pressable onPress={() => router.push('/signup')}>
        <Text style={styles.link}>アカウントを作成</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    gap: 24,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 8,
  },
  titleEmoji: {
    fontSize: 56,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
  },
  form: {
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: '#ccc',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  error: {
    color: '#d32f2f',
    fontSize: 13,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#007aff',
    borderRadius: 8,
    height: 50,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    opacity: 0.5,
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  link: {
    color: '#007aff',
    textAlign: 'center',
  },
});
