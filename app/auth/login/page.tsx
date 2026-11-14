import LoginForm from '@/components/auth/LoginForm';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-background py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-md w-full space-y-8">
        <LoginForm />
        <p className="text-center text-sm text-gray-600 dark:text-muted-foreground">
          Nemáte učet?{' '}
          <Link href="/auth/signup" className="text-primary hover:text-primary/80 dark:text-primary font-medium transition-colors">
            Registrace
          </Link>
        </p>
      </div>
    </div>
  );
}

