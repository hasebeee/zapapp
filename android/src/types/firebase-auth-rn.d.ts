// @firebase/auth の package.json exports map は "types" 条件が "react-native" 条件より先に
// 列挙されているため、tsc は常に汎用の auth-public.d.ts を型として解決してしまい、
// React Native 専用の getReactNativePersistence の型情報が欠落する（firebase-js-sdk 側の既知の問題）。
// 実行時は Metro が "react-native" exports 条件を正しく解決するため問題なく動作するので、
// ここで型だけを補完する。
import type { Persistence, ReactNativeAsyncStorage } from '@firebase/auth';

declare module '@firebase/auth' {
  export function getReactNativePersistence(storage: ReactNativeAsyncStorage): Persistence;
}
