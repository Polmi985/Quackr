"use client"

import { Heart, X } from "lucide-react"
import { useRouter } from "next/navigation"
import UserProfile from "@/components/auth/UserProfile"
import { useEffect, useState } from "react"
import { useAuth } from "@/lib/authContext"
import { getUserGameScore, type UserGameScore } from "@/lib/swipeScoreService"
import { getUserGames } from "@/lib/gameService"
import MobileHeader from "@/components/MobileHeader"
import { getUserStreak } from "@/lib/userStreakService"
import { BarChart3, PieChart } from "lucide-react"
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts"

import { SkeletonProfile } from "@/components/Skeletons"

export default function ProfilePage() {
  const router = useRouter()
  const { user } = useAuth()

  const [ready, setReady] = useState(false)
  const [userScore, setUserScore] = useState<UserGameScore | null>(null)
  const [userRank, setUserRank] = useState<number | null>(null)
  const [loading, setLoading] = useState(true)
  const [hasGame, setHasGame] = useState<boolean>(false)
  const [streak, setStreak] = useState<number>(0)


  // načtení skóre + pořadí v game
  useEffect(() => {
    const loadUserData = async () => {
      if (!user) {
        setLoading(false)
        return
      }

      try {
        const score = await getUserGameScore(user.uid)
        setUserScore(score)

        const games = await getUserGames(user.uid)

        if (games.length > 0) {
          setHasGame(true)
          const currentGame = games[0]

          const playerScores: { userId: string; totalArticles: number }[] = []

          for (const playerId of currentGame.players) {
            const playerScore = await getUserGameScore(playerId)
            if (playerScore) {
              const totalArticles = playerScore.positivePoints + playerScore.negativePoints
              playerScores.push({ userId: playerId, totalArticles })
            }
          }

          playerScores.sort((a, b) => b.totalArticles - a.totalArticles)

          const rank = playerScores.findIndex((p) => p.userId === user.uid) + 1
          setUserRank(rank > 0 ? rank : null)
        } else {
          setHasGame(false)
        }

      } catch (error) {
        console.error("Error loading user data:", error)
      } finally {
        setLoading(false)
      }
    }

    loadUserData()
  }, [user])

  // načtení streaku z DB při otevření profilu
  useEffect(() => {
    const loadStreak = async () => {
      if (!user) return
      try {
        const value = await getUserStreak(user.uid)
        setStreak(value || 0)
      } catch (err) {
        console.error("[Profile] Failed to load streak:", err)
        setStreak(0)
      }
    }

    loadStreak()
  }, [user])

  // reakce na event z game (aby se streak přepsal hned po swipu)
  useEffect(() => {
    if (typeof window === "undefined") return

    const handler = (event: Event) => {
      const custom = event as CustomEvent<number>
      const newStreak = typeof custom.detail === "number" ? custom.detail : 0
      setStreak(newStreak)
    }

    window.addEventListener("user-streak-updated", handler)
    return () => {
      window.removeEventListener("user-streak-updated", handler)
    }
  }, [])

  // ready flag
  useEffect(() => {
    setReady(true)
  }, [])

  if (!ready || loading) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
          <SkeletonProfile />
        </main>
      </div>
    )
  }

  // není přihlášen
  if (!user) {
    return (
      <div className="flex items-center justify-center min-h-[100dvh] p-6">
        <div className="max-w-md w-full bg-white p-8 rounded-xl shadow">
          <h2 className="text-xl font-semibold mb-4">Nejste přihlášen</h2>
          <p className="mb-6 text-sm text-muted-foreground">
            Pro zobrazení profilu se prosím přihlaste.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push("/auth/login")}
              className="px-4 py-2 rounded bg-indigo-600 text-white"
            >
              Přihlásit se
            </button>
            <button
              onClick={() => router.push("/")}
              className="px-4 py-2 rounded border"
            >
              Zpět
            </button>
          </div>
        </div>
      </div>
    )
  }

  // statistiky z game
  const correct = userScore?.positivePoints ?? 0
  const incorrect = userScore?.negativePoints ?? 0
  const total = correct + incorrect
  const accuracy = total === 0 ? 0 : Math.round((correct / total) * 100)
  const displayName =
    userScore?.displayName ??
    (user as any).displayName ??
    (user as any).name ??
    "Uživatel"
  const email = (user as any).email ?? ""

  const creationTime = (user as any).metadata?.creationTime
  const memberSince = creationTime
    ? new Date(creationTime).toLocaleDateString("cs-CZ", {
        month: "short",
        year: "numeric",
      })
    : "—"

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
        <div className="w-full bg-card rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden border border-transparent">
          {/* Avatar */}
          <div className="w-full h-32 bg-gradient-to-br from-muted to-muted/50 flex items-center justify-center">
            <div className="w-24 h-24 rounded-full bg-foreground text-background flex items-center justify-center text-4xl font-bold">
              {String(displayName).charAt(0)}
            </div>
          </div>

          {/* Info */}
          <div className="p-8">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-semibold text-foreground mb-2">
                {displayName}
              </h2>
              <p className="text-muted-foreground text-sm">{email}</p>
            </div>

            {hasGame && (
              <>
                {/* Stats */}
                <div className="bg-muted/40 rounded-xl p-6">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-[0.15em] mb-4 text-center">
                    Statistiky
                  </p>

                  {/* 🔥 streak badge */}
                  <div className="flex justify-center mb-6">
                    <div className="flex items-center gap-2 bg-orange-500/15 text-orange-600 px-4 py-2 rounded-full font-semibold">
                      <span className="text-xl">🔥</span>
                      <span>{streak}</span>
                    </div>
                  </div>

                  <div className="flex justify-center gap-8">
                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1.5 mb-2">
                        <Heart
                          className="w-5 h-5 text-green-600"
                          fill="currentColor"
                          strokeWidth={0}
                        />
                        <span className="text-2xl font-bold text-green-600">
                          {correct}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        Správně
                      </span>
                    </div>

                    <div className="w-px bg-border" />

                    <div className="flex flex-col items-center">
                      <div className="flex items-center gap-1.5 mb-2">
                        <X className="w-5 h-5 text-red-600" strokeWidth={3} />
                        <span className="text-2xl font-bold text-red-600">
                          {incorrect}
                        </span>
                      </div>
                      <span className="text-xs text-muted-foreground uppercase tracking-wider">
                        Špatně
                      </span>
                    </div>
                  </div>

                  {/* Přesnost */}
                  <div className="mt-6 pt-6 border-t border-border">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">
                        Přesnost
                      </p>
                      <p className="text-3xl font-bold text-foreground">
                        {accuracy}%
                      </p>
                    </div>
                  </div>
                </div>

                {/* Extra info */}
                <div className="mt-6 space-y-4">
                  {/* ── Level / Tier ── */}
                  {(() => {
                    const TIERS = [
                      { name: "Nováček", minScore: 0, icon: "🌱", color: "text-green-600" },
                      { name: "Čtenář", minScore: 20, icon: "📖", color: "text-blue-600" },
                      { name: "Analytik", minScore: 50, icon: "🔍", color: "text-indigo-600" },
                      { name: "Expert", minScore: 100, icon: "💡", color: "text-purple-600" },
                      { name: "Factchecker", minScore: 200, icon: "🛡️", color: "text-amber-600" },
                    ]
                    const currentTier = [...TIERS].reverse().find(t => total >= t.minScore) || TIERS[0]
                    const nextTier = TIERS.find(t => t.minScore > total)
                    const progress = nextTier
                      ? Math.round(((total - currentTier.minScore) / (nextTier.minScore - currentTier.minScore)) * 100)
                      : 100
                    return (
                      <div className="mb-4 bg-muted/30 rounded-xl p-4">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-2xl">{currentTier.icon}</span>
                            <div>
                              <p className={`font-bold text-sm ${currentTier.color}`}>{currentTier.name}</p>
                              <p className="text-xs text-muted-foreground">Úroveň</p>
                            </div>
                          </div>
                          {nextTier && (
                            <p className="text-xs text-muted-foreground">{total} / {nextTier.minScore} do dalšího</p>
                          )}
                        </div>
                        <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                          <div className="h-full bg-foreground/70 rounded-full transition-all duration-700" style={{ width: `${progress}%` }} />
                        </div>
                      </div>
                    )
                  })()}
                  <div className="flex justify-between items-center py-3 border-b border-border">
                    <span className="text-sm text-muted-foreground">
                      Celkem hodnoceno
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {total}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3 border-b border-border">
                    <span className="text-sm text-muted-foreground">
                      Členem od
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {memberSince}
                    </span>
                  </div>
                  <div className="flex justify-between items-center py-3">
                    <span className="text-sm text-muted-foreground">
                      Pořadí
                    </span>
                    <span className="text-sm font-semibold text-foreground">
                      {userRank ? `#${userRank}` : "—"}
                    </span>
                  </div>
                </div>

                {/* Analyza Presnosti */}
                <div className="mt-8 bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <BarChart3 className="w-5 h-5 text-foreground" />
                      <h3 className="font-semibold text-foreground">Vývoj úspěšnosti</h3>
                    </div>
                    {userScore?.accuracyHistory && userScore.accuracyHistory.length > 0 ? (
                      <div className="h-40 w-full mt-4">
                        <ResponsiveContainer width="100%" height="100%">
                          <AreaChart data={userScore.accuracyHistory.map((acc, i) => ({ index: i + 1, accuracy: acc }))} margin={{ top: 10, right: 0, left: 0, bottom: 0 }}>
                            <defs>
                              <linearGradient id="colorAccuracy" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.8}/>
                                <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                            <XAxis dataKey="index" hide />
                            <YAxis domain={[0, 100]} hide />
                            <Tooltip
                              contentStyle={{ backgroundColor: 'hsl(var(--card))', borderRadius: '8px', border: '1px solid hsl(var(--border))', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.5)' }}
                              itemStyle={{ color: 'hsl(var(--foreground))', fontWeight: 'bold' }}
                              formatter={(value: any) => [`${value}%`, 'Přesnost']}
                              labelStyle={{ display: 'none' }}
                              cursor={{ stroke: 'hsl(var(--muted-foreground))', strokeWidth: 1, strokeDasharray: '4 4' }}
                            />
                            <Area type="monotone" dataKey="accuracy" stroke="hsl(var(--primary))" fillOpacity={1} fill="url(#colorAccuracy)" strokeWidth={3} activeDot={{ r: 6, fill: 'hsl(var(--primary))', strokeWidth: 0 }} />
                          </AreaChart>
                        </ResponsiveContainer>
                      </div>
                    ) : (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        Zatím nemáme dostatek dat. Hrajte dál!
                      </div>
                    )}
                  </div>
                </div>

                {/* Rozpad Kategorii */}
                <div className="mt-6 bg-card border border-border rounded-xl p-6 shadow-sm overflow-hidden">
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <PieChart className="w-5 h-5 text-foreground" />
                      <h3 className="font-semibold text-foreground">Kategorie témat</h3>
                    </div>
                    {userScore?.categoryStats && Object.keys(userScore.categoryStats).length > 0 ? (
                      <div className="space-y-4">
                        {Object.entries(userScore.categoryStats)
                          .map(([name, stats]) => {
                            const total = stats.correct + stats.incorrect;
                            const val = total === 0 ? 0 : Math.round((stats.correct / total) * 100);
                            return { name, val, total };
                          })
                          .sort((a, b) => b.total - a.total)
                          .map((cat, i) => {
                            const colors = ["bg-gray-400", "bg-gray-500", "bg-gray-600", "bg-gray-700", "bg-gray-800"];
                            const color = colors[i % colors.length];
                            return (
                              <div key={cat.name}>
                                <div className="flex justify-between text-xs mb-1.5 font-medium">
                                  <span>{cat.name} <span className="text-muted-foreground ml-1">({cat.total}x)</span></span>
                                  <span>{cat.val}%</span>
                                </div>
                                <div className="w-full h-2 bg-muted rounded-full overflow-hidden">
                                  <div className={`h-full ${color} rounded-full transition-all duration-1000`} style={{ width: `${cat.val}%` }} />
                                </div>
                              </div>
                            );
                          })}
                      </div>
                    ) : (
                      <div className="text-center text-sm text-muted-foreground py-8">
                        Zatím žádné kategorie. Hrajte dál zprávy!
                      </div>
                    )}
                  </div>
                </div>
              </>
            )}

            {/* Bez hry */}
            {!hasGame && (
              <div className="mt-6 bg-card border border-border rounded-xl p-6 text-center shadow-sm">
                <h3 className="text-lg font-semibold text-foreground mb-2">
                  Připojit se ke hře
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  Soutěžte s ostatními a stoupejte v žebříčku!
                </p>
                <button
                  onClick={() => router.push("/game")}
                  className="w-full px-6 py-3 bg-foreground text-background rounded-xl font-medium hover:scale-105 transition-transform"
                >
                  Přejít do hry
                </button>
              </div>
            )}
          </div>
        </div>

      </main>
    </div>
  )
}
