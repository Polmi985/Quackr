"use client"

import { useState, useEffect, useCallback } from "react"
import { Newspaper, Gamepad2, Trophy, ShoppingBag, MoreHorizontal, Home, UserCircle, Monitor, Settings, X } from "lucide-react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useAuth } from "@/lib/authContext"
import { getUserStreak } from "@/lib/userStreakService"
import { getUserCoins } from "@/lib/coinService"
import { getUserInventory } from "@/lib/userInventoryService"
import { getEffectsSummary } from "@/lib/activeEffectsService"

const MAIN_NAV = [
  { href: "/game", label: "Hra", icon: Gamepad2 },
  { href: "/ranking", label: "Žebříček", icon: Trophy },
  { href: "/feed", label: "Feed", icon: Newspaper },
  { href: "/shop", label: "Obchod", icon: ShoppingBag },
  { href: "/simulation", label: "Simulace", icon: Monitor },
]

const MORE_NAV = [
  { href: "/", label: "Domů", icon: Home, desc: "Úvodní stránka" },
  { href: "/profile", label: "Profil", icon: UserCircle, desc: "Statistiky a úroveň" },
  { href: "/settings", label: "Nastavení", icon: Settings, desc: "Vzhled, zvuk, účet" },
]

export default function MobileHeader() {
  const { user } = useAuth()
  const pathname = usePathname()
  const [moreOpen, setMoreOpen] = useState(false)

  const [streak, setStreak] = useState<number>(0)
  const [loadingStreak, setLoadingStreak] = useState(false)
  const [coins, setCoins] = useState<number>(0)
  const [loadingCoins, setLoadingCoins] = useState(false)
  
  const [hasProtection, setHasProtection] = useState(false)
  const [coinMult, setCoinMult] = useState(1)
  const [scoreMult, setScoreMult] = useState(1)

  useEffect(() => {
    const load = async () => {
      if (!user) {
        setStreak(0)
        setCoins(0)
        return
      }

      try {
        setLoadingStreak(true)
        setLoadingCoins(true)
        const [streakValue, coinData, inv, fx] = await Promise.all([
          getUserStreak(user.uid),
          getUserCoins(user.uid),
          getUserInventory(user.uid),
          getEffectsSummary(user.uid)
        ])
        setStreak(streakValue || 0)
        setCoins(coinData.coins || 0)
        
        const freezeCount = (inv.items?.['streak_freeze_1']?.quantity || 0) + (inv.items?.['streak_freeze_3']?.quantity || 0)
        setHasProtection(freezeCount > 0 || fx.hasSafetyNet)
        setCoinMult(fx.coinMultiplier)
        setScoreMult(fx.scoreMultiplier)
      } catch (e) {
        console.error("[Header] load error:", e)
        setStreak(0)
        setCoins(0)
        setHasProtection(false)
        setCoinMult(1)
        setScoreMult(1)
      } finally {
        setLoadingStreak(false)
        setLoadingCoins(false)
      }
    }

    load()
  }, [user])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handler = (event: Event) => {
      const custom = event as CustomEvent<number>
      const newStreak =
        typeof custom.detail === "number" ? custom.detail : 0
      setStreak(newStreak)
    }

    window.addEventListener("user-streak-updated", handler)
    return () => {
      window.removeEventListener("user-streak-updated", handler)
    }
  }, [])

  useEffect(() => {
    if (typeof window === "undefined") return

    const handler = (event: Event) => {
      const custom = event as CustomEvent<number>
      const newCoins = typeof custom.detail === "number" ? custom.detail : 0
      setCoins(newCoins)
    }

    window.addEventListener("user-coins-updated", handler)
    return () => {
      window.removeEventListener("user-coins-updated", handler)
    }
  }, [])

  const isMoreActive = MORE_NAV.some(
    (item) => pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href + "/"))
  )

  return (
    <>
      {/* TOP BAR */}
      <header className="sticky top-0 z-50 bg-white dark:bg-background border-b border-gray-200 dark:border-border">
        <div className="flex items-center justify-between h-[3.8rem] px-6 md:px-8 lg:px-20">

          {/* LEFT: LOGO + TITLE */}
          <Link href="/feed" className="flex items-center gap-2 group -ml-2 px-2 py-1.5 rounded-xl hover:bg-black/5 dark:hover:bg-white/5 transition-all duration-300">
            <div className="relative flex items-center justify-center">
              <Image
                src="/Logo3.svg"
                alt="Logo"
                width={50}
                height={50}
                className="h-[50px] w-auto object-contain invert dark:invert-0 transition-transform duration-300 group-hover:scale-105 group-hover:-rotate-3"
                priority
              />
            </div>
            <span className="font-bold text-[15px] md:text-base tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-gray-900 to-gray-600 dark:from-white dark:to-gray-300 transition-all duration-300 group-hover:opacity-90">
              Quackr
            </span>
          </Link>

          {/* CENTER: DESKTOP NAV (hidden on mobile) */}
          <nav className="hidden md:flex items-center gap-1">
            {MAIN_NAV.map((item) => {
              const isActive = pathname === item.href || pathname?.startsWith(item.href + "/")
              const Icon = item.icon
              const isFeatured = 'featured' in item && item.featured
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isFeatured
                      ? isActive
                        ? "bg-foreground text-background font-bold shadow-md"
                        : "bg-foreground/10 dark:bg-foreground/15 text-foreground font-semibold hover:bg-foreground/20"
                      : isActive
                        ? "bg-foreground/5 text-foreground font-bold"
                        : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                  }`}
                >
                  <Icon className={`w-4 h-4 ${isActive || isFeatured ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                  <span>{item.label}</span>
                </Link>
              )
            })}
            {/* MORE (desktop) */}
            <div className="relative">
              <button
                onClick={() => setMoreOpen((v) => !v)}
                className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                  isMoreActive || moreOpen
                    ? "bg-foreground/5 text-foreground font-bold"
                    : "text-muted-foreground hover:text-foreground hover:bg-black/5 dark:hover:bg-white/5"
                }`}
              >
                <MoreHorizontal className={`w-4 h-4 ${isMoreActive || moreOpen ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                <span>Více</span>
              </button>
              {/* desktop dropdown */}
              {moreOpen && (
                <>
                  <div className="fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)} />
                  <div className="absolute right-0 top-full mt-2 z-[70] bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-gray-200 dark:border-neutral-700 w-56">
                    <div className="flex flex-col py-2">
                      {MORE_NAV.map((item) => {
                        const Icon = item.icon
                        const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href + "/"))
                        return (
                          <Link
                            key={item.href}
                            href={item.href}
                            onClick={() => setMoreOpen(false)}
                            className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${
                              active ? "bg-foreground/5 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                            }`}
                          >
                            <Icon className={`w-5 h-5 ${active ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                            <span className={`text-sm ${active ? "font-bold" : "font-medium"}`}>{item.label}</span>
                          </Link>
                        )
                      })}
                    </div>
                  </div>
                </>
              )}
            </div>
          </nav>

          {/* RIGHT: COINS + STREAK */}
          <div className="flex items-center gap-4">

            {/* 🪙 COINS */}
            {user && !loadingCoins && (
              <Link href="/shop" className={`flex items-center gap-1.5 text-sm font-semibold transition-all px-2 py-1 rounded-lg ${coinMult > 1 || scoreMult > 1 ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 shadow-[0_0_10px_rgba(245,158,11,0.3)] border border-amber-200 dark:border-amber-800' : 'text-amber-500 hover:text-amber-600'}`}>
                <span className={`text-lg leading-none ${coinMult > 1 ? 'animate-pulse' : ''}`}>🪙</span>
                <span>{coins}</span>
                {(coinMult > 1 || scoreMult > 1) && (
                  <span className="text-[10px] font-black uppercase text-amber-700 dark:text-amber-300 ml-0.5">
                    {coinMult > 1 ? `${coinMult}x` : `${scoreMult}x`}
                  </span>
                )}
              </Link>
            )}

            {/* 🔥 STREAK */}
            {user && !loadingStreak && (
              <div className={`flex items-center gap-1.5 text-sm font-semibold transition-all px-2 py-1 rounded-lg ${hasProtection ? 'bg-cyan-50 dark:bg-cyan-950/40 text-cyan-600 dark:text-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.3)] border border-cyan-200 dark:border-cyan-800' : 'text-orange-500'}`}>
                <span className="text-lg leading-none drop-shadow-sm">{hasProtection ? '🧊' : '🔥'}</span>
                <span>{streak}</span>
              </div>
            )}

            {user && (loadingStreak || loadingCoins) && (
              <div className="w-6 h-3 rounded-full bg-gray-200 dark:bg-gray-700 animate-pulse" />
            )}
          </div>
        </div>
      </header>

      {/* MOBILE BOTTOM NAV BAR (hidden on desktop) */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-background border-t border-gray-200 dark:border-border pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-center justify-around h-14 max-w-lg mx-auto">
          {MAIN_NAV.map((item) => {
            const isActive = pathname === item.href || pathname?.startsWith(item.href + "/")
            const Icon = item.icon
            const isFeatured = 'featured' in item && item.featured
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
                  isFeatured
                    ? isActive
                      ? "text-foreground -mt-3"
                      : "text-foreground/80 -mt-3 hover:text-foreground"
                    : isActive
                      ? "text-foreground"
                      : "text-muted-foreground hover:text-foreground/70"
                }`}
              >
                {isFeatured ? (
                  <div className={`flex items-center justify-center w-11 h-11 rounded-full transition-all ${
                    isActive
                      ? "bg-foreground text-background shadow-lg scale-110"
                      : "bg-foreground/10 dark:bg-foreground/15 hover:bg-foreground/20"
                  }`}>
                    <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[2]"}`} />
                  </div>
                ) : (
                  <Icon className={`w-5 h-5 ${isActive ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                )}
                <span className={`text-[10px] leading-none ${isFeatured ? (isActive ? "font-extrabold" : "font-bold") : (isActive ? "font-bold" : "font-medium")}`}>
                  {item.label}
                </span>
              </Link>
            )
          })}
          {/* MORE BUTTON (mobile) */}
          <button
            onClick={() => setMoreOpen((v) => !v)}
            className={`flex flex-col items-center justify-center gap-0.5 w-full h-full transition-colors ${
              isMoreActive || moreOpen
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground/70"
            }`}
          >
            <MoreHorizontal className={`w-5 h-5 ${isMoreActive || moreOpen ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
            <span className={`text-[10px] leading-none ${isMoreActive || moreOpen ? "font-bold" : "font-medium"}`}>
              Více
            </span>
          </button>
        </div>
        {/* mobile more bottom sheet */}
        {moreOpen && (
          <>
            <div className="fixed inset-0 z-[60]" onClick={() => setMoreOpen(false)} />
            <div className="fixed bottom-0 left-0 right-0 z-[70] bg-white dark:bg-neutral-900 rounded-t-2xl shadow-2xl border-t border-gray-200 dark:border-neutral-700 pb-[env(safe-area-inset-bottom)]">
              <div className="flex items-center justify-between px-5 pt-4 pb-2">
                <h3 className="text-sm font-bold uppercase tracking-widest text-muted-foreground">Další</h3>
                <button onClick={() => setMoreOpen(false)} className="p-1.5 rounded-full hover:bg-muted transition-colors">
                  <X className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>
              <div className="grid grid-cols-4 gap-2 px-4 pb-5">
                {MORE_NAV.map((item) => {
                  const Icon = item.icon
                  const active = pathname === item.href || (item.href !== "/" && pathname?.startsWith(item.href + "/"))
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      onClick={() => setMoreOpen(false)}
                      className={`flex flex-col items-center gap-1.5 py-4 px-2 rounded-xl transition-colors ${
                        active ? "bg-foreground/10 text-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      <Icon className={`w-6 h-6 ${active ? "stroke-[2.5]" : "stroke-[1.5]"}`} />
                      <span className={`text-[11px] leading-tight text-center ${active ? "font-bold" : "font-medium"}`}>{item.label}</span>
                    </Link>
                  )
                })}
              </div>
            </div>
          </>
        )}
      </nav>
    </>
  )
}

