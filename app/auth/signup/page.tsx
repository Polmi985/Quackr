import SignUpForm from '@/components/auth/SignUpForm';
import Link from 'next/link';

export default function SignUpPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-background py-12 px-4 sm:px-6 lg:px-8 transition-colors duration-300">
      <div className="max-w-md w-full space-y-8">
        <SignUpForm />
        <p className="text-center text-sm text-gray-600 dark:text-muted-foreground">
          Už máte účet?{' '}
          <Link href="/auth/login" className="text-primary hover:text-primary/80 dark:text-primary font-medium transition-colors">
            Přihlásit se
          </Link>
        </p>
      </div>
    </div>
  );
}
