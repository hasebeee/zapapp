import { getApps, initializeApp } from 'firebase/app';
// "firebase/auth" の exports map には react-native 条件が無く Web 用ビルドに解決されてしまうため、
// getReactNativePersistence を持つ @firebase/auth から直接 import する。
import { initializeAuth, getReactNativePersistence, getAuth } from '@firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Firebase Console > プロジェクトの設定 > 全般 > マイアプリ で
// Web アプリ（</> アイコン）を追加すると、この形式の設定値が表示されます。
// iOS と同じ Firebase プロジェクトのものを使ってください。
const firebaseConfig = {
  apiKey: 'AIzaSyCBVU8DUJFuL_yLz9kXBST55L9X65DQsIk',
  authDomain: 'zap-app-83eb8.firebaseapp.com',
  projectId: 'zap-app-83eb8',
  storageBucket: 'zap-app-83eb8.firebasestorage.app',
  messagingSenderId: '680241244039',
  appId: '1:680241244039:web:68c8f6491cb46b95751522',
};

const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApps()[0];

// Fast Refresh でこのモジュールが再評価されると initializeAuth は二重呼び出しで例外を投げるため、
// 既に初期化済みなら getAuth で既存インスタンスを取得する。
let authInstance;
try {
  authInstance = initializeAuth(app, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  authInstance = getAuth(app);
}

export const auth = authInstance;
