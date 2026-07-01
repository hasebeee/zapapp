import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { User } from '@firebase/auth';
import { AuthService } from '../services/authService';
import { APIClient } from '../services/apiClient';
import { registerForPushNotifications } from '../services/pushNotifications';

interface AuthContextValue {
  user: User | null;
  isLoggedIn: boolean;
  isLoading: boolean;
  dbUserId: string | null;
  pavlokConnected: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  isLoggedIn: false,
  isLoading: true,
  dbUserId: null,
  pavlokConnected: false,
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dbUserId, setDbUserId] = useState<string | null>(null);
  const [pavlokConnected, setPavlokConnected] = useState(false);

  useEffect(() => {
    const unsubscribe = AuthService.onAuthStateChanged((nextUser) => {
      setUser(nextUser);
      setIsLoading(false);

      if (nextUser) {
        APIClient.getMyProfile()
          .then((profile) => {
            setDbUserId(profile.id);
            setPavlokConnected(profile.pavlok_connected);
          })
          .catch(() => {
            // プロフィール取得失敗時は何もしない（次回のauth状態変化で再試行される）
          });
        registerForPushNotifications().catch((err) => {
          console.warn('[AuthContext] Failed to register for push notifications:', err);
        });
      } else {
        setDbUserId(null);
        setPavlokConnected(false);
      }
    });
    return unsubscribe;
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoggedIn: user != null, isLoading, dbUserId, pavlokConnected }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  return useContext(AuthContext);
}
