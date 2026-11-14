'use client';

import React, { createContext, useContext, useEffect, useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  GoogleAuthProvider,
  signInWithPopup,
  sendPasswordResetEmail
} from 'firebase/auth';
import { auth } from './firebaseAuth';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signUp: async () => {},
  signIn: async () => {},
  signInWithGoogle: async () => {},
  logout: async () => {},
  resetPassword: async () => {}
});

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    try {
      const unsubscribe = onAuthStateChanged(
        auth,
        (user) => {
          setUser(user);
          setLoading(false);
        },
        (error) => {
          console.error('Auth state change error:', error);
          setLoading(false);
        }
      );

      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.error('Firebase auth error:', error);
      setLoading(false);
    }
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Sign up error:', error);
      
      // Map Firebase error codes to user-friendly messages
      const errorCode = error.code || '';
      let userMessage = 'Chyba při registraci';
      
      switch (errorCode) {
        case 'auth/email-already-in-use':
          userMessage = 'Tento e-mail je už zaregistrovaný';
          break;
        case 'auth/invalid-email':
          userMessage = 'E-mail není validní';
          break;
        case 'auth/weak-password':
          userMessage = 'Heslo musí mít alespoň 6 znaků';
          break;
        case 'auth/operation-not-allowed':
          userMessage = 'Registrace momentálně není povolena';
          break;
        case 'auth/too-many-requests':
          userMessage = 'Příliš mnoho pokusů. Zkuste později';
          break;
        default:
          userMessage = error.message || 'Chyba při registraci';
      }
      
      const customError = new Error(userMessage);
      throw customError;
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      await signInWithEmailAndPassword(auth, email, password);
    } catch (error: any) {
      console.error('Sign in error:', error);
      
      // Map Firebase error codes to user-friendly messages
      const errorCode = error.code || '';
      let userMessage = 'Chyba při přihlašování';
      
      switch (errorCode) {
        case 'auth/invalid-credential':
          userMessage = 'E-mail nebo heslo je nesprávné';
          break;
        case 'auth/user-not-found':
          userMessage = 'Účet s tímto e-mailem neexistuje';
          break;
        case 'auth/wrong-password':
          userMessage = 'Heslo je nesprávné';
          break;
        case 'auth/invalid-email':
          userMessage = 'E-mail není validní';
          break;
        case 'auth/user-disabled':
          userMessage = 'Tento účet byl deaktivován';
          break;
        case 'auth/too-many-requests':
          userMessage = 'Příliš mnoho neúspěšných pokusů. Zkuste později';
          break;
        default:
          userMessage = error.message || 'Chyba při přihlašování';
      }
      
      const customError = new Error(userMessage);
      throw customError;
    }
  };

  const signInWithGoogle = async (): Promise<void> => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Google sign in error:', error);
      throw error;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
    } catch (error) {
      console.error('Logout error:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (error) {
      console.error('Reset password error:', error);
      throw error;
    }
  };

  const value = {
    user,
    loading,
    signUp,
    signIn,
    signInWithGoogle,
    logout,
    resetPassword
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
