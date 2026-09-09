import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useAuth } from '../src/contexts/AuthContext';
import { APIClient } from '../src/services/apiClient';

export default function Index() {
  const { isLoggedIn, isLoading } = useAuth();
  const [hasPendingJudgments, setHasPendingJudgments] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isLoggedIn) return;
    APIClient.getPendingJudgments()
      .then((result) => setHasPendingJudgments(result.length > 0))
      .catch(() => setHasPendingJudgments(false));
  }, [isLoggedIn]);

  if (isLoading || (isLoggedIn && hasPendingJudgments === null)) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator />
      </View>
    );
  }

  if (!isLoggedIn) {
    return <Redirect href="/login" />;
  }

  return <Redirect href={hasPendingJudgments ? '/judge' : '/quick-package'} />;
}
