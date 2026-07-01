import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
  onAuthStateChanged,
  type User,
} from '@firebase/auth';
import { auth } from '../firebase';

export const AuthService = {
  async signUp(email: string, password: string): Promise<User> {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    return result.user;
  },

  async signIn(email: string, password: string): Promise<User> {
    const result = await signInWithEmailAndPassword(auth, email, password);
    return result.user;
  },

  async signOut(): Promise<void> {
    await firebaseSignOut(auth);
  },

  get currentUser(): User | null {
    return auth.currentUser;
  },

  async getIDToken(): Promise<string> {
    const user = auth.currentUser;
    if (!user) throw new Error('ログインしていません');
    return user.getIdToken();
  },

  async sendPasswordReset(email: string): Promise<void> {
    await sendPasswordResetEmail(auth, email);
  },

  onAuthStateChanged(callback: (user: User | null) => void): () => void {
    return onAuthStateChanged(auth, callback);
  },
};
