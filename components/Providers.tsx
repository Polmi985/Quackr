'use client';

import { AuthProvider } from '@/lib/authContext'
import { ThemeProvider as NextThemesProvider } from 'next-themes'
import { SettingsProvider } from '@/lib/settingsContext'

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider attribute="class" defaultTheme="system" enableSystem>
      <SettingsProvider>
        <AuthProvider>{children}</AuthProvider>
      </SettingsProvider>
    </NextThemesProvider>
  )

}