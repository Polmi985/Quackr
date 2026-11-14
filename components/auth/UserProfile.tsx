'use client';

import { useAuth } from '@/lib/authContext';
import { useRouter } from 'next/navigation';

export default function UserProfile() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logout();
      router.push('/auth/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  if (!user) return null;

  return (
    <div className="flex items-center gap-4">
      
      <button
        onClick={handleLogout}
        className="px-4 py-2 text-sm font-medium text-white bg-red-600 hover:bg-red-700 rounded-md transition-colors"
      >
        Odhlásit se
      </button>
    </div>
  );
}