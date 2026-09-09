import { useEffect } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { useAuth } from '../../src/contexts/AuthContext';

export default function TabsLayout() {
  const { isLoggedIn, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !isLoggedIn) {
      router.replace('/login');
    }
  }, [isLoggedIn, isLoading]);

  return (
    <Tabs>
      <Tabs.Screen name="index" options={{ title: 'マイタスク' }} />
      <Tabs.Screen name="controller" options={{ title: '監視する' }} />
      <Tabs.Screen name="history" options={{ title: '履歴' }} />
      <Tabs.Screen name="gift" options={{ title: 'ギフト' }} />
      <Tabs.Screen name="settings" options={{ title: '設定' }} />
    </Tabs>
  );
}
