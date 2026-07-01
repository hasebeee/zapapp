import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from '../src/contexts/AuthContext';

export default function RootLayout() {
  return (
    <AuthProvider>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="create-task" options={{ presentation: 'modal', headerShown: true, title: 'タスク作成' }} />
        <Stack.Screen name="task/[id]" options={{ headerShown: true, title: 'タスク詳細' }} />
        <Stack.Screen name="owner-tasks/[ownerId]" options={{ headerShown: true }} />
        <Stack.Screen name="invite" options={{ presentation: 'modal', headerShown: true, title: '招待管理' }} />
        <Stack.Screen name="accept-invite" options={{ presentation: 'modal', headerShown: true, title: '招待を受諾' }} />
        <Stack.Screen name="pavlok-connect" options={{ presentation: 'modal', headerShown: true, title: 'Pavlok連携' }} />
        <Stack.Screen name="use-gift/[giftId]" options={{ presentation: 'modal', headerShown: true, title: 'ギフトを使う' }} />
        <Stack.Screen name="create-routine" options={{ presentation: 'modal', headerShown: true, title: 'ルーティーン作成' }} />
        <Stack.Screen name="routine/[id]" options={{ headerShown: true, title: 'ルーティーン詳細' }} />
      </Stack>
      <StatusBar style="auto" />
    </AuthProvider>
  );
}
