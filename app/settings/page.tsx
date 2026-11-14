"use client";

import { useTheme } from "next-themes";
import { useAuth } from "@/lib/authContext";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import { LogOut, Moon, Sun, Monitor, ChevronLeft, Volume2, Bell, Sparkles } from "lucide-react";
import Link from "next/link";
import { signOut } from "firebase/auth";
import { auth } from "@/lib/firebaseAuth";
import { useSettings } from "@/lib/settingsContext";

export default function SettingsPage() {
  const { theme, setTheme, resolvedTheme } = useTheme();
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Global settings context
  const { settings, updateSetting } = useSettings();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!authLoading && !user) {
      router.push("/auth/login");
    }
  }, [authLoading, user, router]);

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      router.push("/auth/login");
    } catch (e) {
      console.error("Přihlášení selhalo", e);
    }
  };

  if (authLoading || !user || !mounted) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a]">
        <MobileHeader />
        <div className="flex items-center justify-center h-[60vh]">
          <div className="w-6 h-6 border-2 border-neutral-300 border-t-neutral-800 rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a]">
      <MobileHeader />
      
      <div className="max-w-xl mx-auto px-4 pt-6 pb-24">
        {/* ── Header ── */}
        <div className="flex items-center gap-3 mb-8">
          <Link href="/feed" className="p-2 -ml-2 text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors">
            <ChevronLeft size={24} />
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Nastavení</h1>
        </div>

        {/* ── Theme toggles ── */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3 ml-1">Vzhled</h2>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800/50">
            
            <button
              onClick={() => setTheme("light")}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${theme === 'light' ? 'bg-amber-100 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                  <Sun size={18} />
                </div>
                <span className={`text-sm font-medium ${theme === 'light' ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>Světlý režim</span>
              </div>
              {theme === 'light' && <div className="w-2 h-2 rounded-full bg-amber-500" />}
            </button>

            <button
              onClick={() => setTheme("dark")}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${theme === 'dark' ? 'bg-indigo-100 text-indigo-600 dark:bg-indigo-500/20 dark:text-indigo-400' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                  <Moon size={18} />
                </div>
                <span className={`text-sm font-medium ${theme === 'dark' ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>Tmavý režim</span>
              </div>
              {theme === 'dark' && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
            </button>

            <button
              onClick={() => setTheme("system")}
              className="w-full flex items-center justify-between px-4 py-3.5 hover:bg-neutral-50 dark:hover:bg-neutral-800/50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-md ${theme === 'system' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/20 dark:text-emerald-400' : 'bg-neutral-100 text-neutral-500 dark:bg-neutral-800 dark:text-neutral-400'}`}>
                  <Monitor size={18} />
                </div>
                <span className={`text-sm font-medium ${theme === 'system' ? 'text-neutral-900 dark:text-white' : 'text-neutral-600 dark:text-neutral-400'}`}>Podle systému</span>
              </div>
              {theme === 'system' && <div className="w-2 h-2 rounded-full bg-emerald-500" />}
            </button>

          </div>
        </section>

        {/* ── Preferences ── */}
        <section className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3 ml-1">Předvolby</h2>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden divide-y divide-neutral-100 dark:divide-neutral-800/50">
            
            {/* Sound toggle */}
            <div className="w-full flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-blue-100 text-primary dark:bg-blue-500/20 dark:text-blue-400">
                  <Volume2 size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Zvukové efekty</p>
                  <p className="text-[10px] text-neutral-500">Přehrávat zvuky při swipování</p>
                </div>
              </div>
              <button 
                onClick={() => updateSetting("soundEnabled", !settings.soundEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${settings.soundEnabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.soundEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Notifications toggle */}
            <div className="w-full flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-rose-100 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
                  <Bell size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Upozornění</p>
                  <p className="text-[10px] text-neutral-500">Upozornění na denní streak a nabídky</p>
                </div>
              </div>
              <button 
                onClick={() => updateSetting("notificationsEnabled", !settings.notificationsEnabled)}
                className={`w-11 h-6 rounded-full transition-colors relative ${settings.notificationsEnabled ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.notificationsEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

            {/* Reduced motion toggle */}
            <div className="w-full flex items-center justify-between px-4 py-3.5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-md bg-purple-100 text-purple-600 dark:bg-purple-500/20 dark:text-purple-400">
                  <Sparkles size={18} />
                </div>
                <div>
                  <p className="text-sm font-medium text-neutral-900 dark:text-white">Zjednodušené animace</p>
                  <p className="text-[10px] text-neutral-500">Vypne složitější efekty (konfety)</p>
                </div>
              </div>
              <button 
                onClick={() => updateSetting("reducedMotion", !settings.reducedMotion)}
                className={`w-11 h-6 rounded-full transition-colors relative ${settings.reducedMotion ? 'bg-emerald-500' : 'bg-neutral-300 dark:bg-neutral-700'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white absolute top-1 transition-transform ${settings.reducedMotion ? 'translate-x-6' : 'translate-x-1'}`} />
              </button>
            </div>

          </div>
        </section>

        {/* ── Account ── */}
        <section>
          <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3 ml-1">Účet</h2>
          <div className="bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3.5 flex items-center gap-3 border-b border-neutral-100 dark:border-neutral-800/50">
              <div className="w-10 h-10 bg-neutral-100 dark:bg-neutral-800 rounded-full flex items-center justify-center text-neutral-500 font-semibold uppercase shrink-0">
                {user.email?.[0] || "?"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-neutral-900 dark:text-white truncate">Přihlášen jako</p>
                <p className="text-xs text-neutral-500 truncate">{user.email}</p>
              </div>
            </div>
            
            <button
              onClick={handleSignOut}
              className="w-full flex items-center justify-between px-4 py-3.5 text-red-600 dark:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/20 transition-colors"
            >
              <span className="text-sm font-semibold">Odhlásit se</span>
              <LogOut size={18} />
            </button>
          </div>
        </section>

      </div>
    </div>
  );
}

