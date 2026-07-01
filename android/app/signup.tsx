import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { AuthService } from '../src/services/authService';
import { useAuth } from '../src/contexts/AuthContext';

export default function SignUpScreen() {
  const router = useRouter();
  const { isLoggedIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const isFormValid = email.length > 0 && password.length >= 6 && password === confirmPassword;

  useEffect(() => {
    if (isLoggedIn) {
      router.replace('/(tabs)');
    }
  }, [isLoggedIn]);

  const signUp = async () => {
    if (password !== confirmPassword) {
      setErrorMessage('パスワードが一致しません');
      return;
    }

    setIsLoading(true);
    setErrorMessage(null);
    try {
      await AuthService.signUp(email, password);
    } catch (error: any) {
      switch (error?.code) {
        case 'auth/email-already-in-use':
          setErrorMessage('このメールアドレスはすでに登録されています');
          break;
        case 'auth/invalid-email':
          setErrorMessage('メールアドレスの形式が正しくありません');
          break;
        case 'auth/weak-password':
          setErrorMessage('パスワードが短すぎます（6文字以上にしてください）');
          break;
        default:
          setErrorMessage(error instanceof Error ? error.message : String(error));
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <View style={styles.titleBlock}>
        <Text style={styles.titleEmoji}>⚡️</Text>
        <Text style={styles.title}>アカウント作成</Text>
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
          placeholder="パスワード（6文字以上）"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <TextInput
          style={styles.input}
          placeholder="パスワード（確認）"
          secureTextEntry
          value={confirmPassword}
          onChangeText={setConfirmPassword}
        />
      </View>

      {errorMessage && <Text style={styles.error}>{errorMessage}</Text>}

      <Pressable
        style={[styles.button, (!isFormValid || isLoading) && styles.buttonDisabled]}
        onPress={signUp}
        disabled={!isFormValid || isLoading}
      >
        {isLoading ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>アカウントを作成</Text>
        )}
      </Pressable>

      <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace('/login'))}>
        <Text style={styles.link}>ログインに戻る</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingVertical: 40,
    gap: 24,
  },
  titleBlock: {
    alignItems: 'center',
    gap: 8,
  },
  titleEmoji: {
    fontSize: 48,
  },
  title: {
    fontSize: 24,
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
    color: '#888',
    textAlign: 'center',
  },
});
