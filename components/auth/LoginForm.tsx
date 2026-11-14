'use client';

import React, { useState } from 'react';
import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';

export default function LoginForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { signIn, signInWithGoogle } = useAuth();
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
      router.push('/feed');
    } catch (err: any) {
      setError(err.message || 'Failed to sign in');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoading(true);

    try {
      await signInWithGoogle();
      router.push('/feed');
    } catch (err: any) {
      setError(err.message || 'Chyba při přihlášení přes Google');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md p-8 bg-white dark:bg-card dark:border dark:border-border rounded-lg shadow-md transition-colors duration-300">
      <h2 className="text-2xl font-bold mb-6 text-center text-gray-900 dark:text-card-foreground">Přihlášení</h2>

      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded">
          <p className="text-red-800 font-semibold mb-2">⚠️ {error}</p>
          <p className="text-sm text-red-700">
            {error.includes('nesprávné') && "Zkontrolujte svůj e-mail a heslo. Neexistující účet se přihlásit nemůže."}
            {error.includes('neexistuje') && "Nejdříve si musíte vytvořit účet na stránce Registrace."}
            {error.includes('Příliš mnoho') && "Počkejte chvíli a zkuste znovu."}
          </p>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-input text-gray-900 dark:text-foreground placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
            placeholder="vas-email@email.com"
          />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-gray-700 dark:text-foreground mb-1">
            Heslo
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="w-full px-3 py-2 border border-gray-300 dark:border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary bg-white dark:bg-input text-gray-900 dark:text-foreground placeholder-gray-400 dark:placeholder-gray-500 transition-colors"
            placeholder="••••••••"
          />
        </div>

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 px-4 bg-primary hover:bg-primary/90 text-primary-foreground font-medium rounded-md disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-sm"
        >
          {loading ? 'Přihlašovaní...' : 'Přihlásit se'}
        </button>
      </form>
    </div>
  );
}
