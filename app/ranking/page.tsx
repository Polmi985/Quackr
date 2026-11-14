'use client'

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/authContext";
import { getUserGames } from "@/lib/gameService";
import { getUserGameScore, type UserGameScore } from "@/lib/swipeScoreService";
import { ArrowLeft, Trophy, Medal, Award, Globe } from "lucide-react";
import MobileHeader from "@/components/MobileHeader";
import { db } from "@/lib/firebase";
import { collection, query, where, getDocs } from "firebase/firestore";
import { getWeeklyLeaderboard, getCurrentWeekKey, type WeeklyLeaderboardEntry } from "@/lib/weeklyLeaderboardService";
import { SkeletonRankingRow } from "@/components/Skeletons";

interface PlayerRanking {
  userId: string;
  displayName: string;
  positivePoints: number;
  negativePoints: number;
  totalArticles: number;
  accuracy: number;
  rank: number;
}

export default function RankingPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [rankings, setRankings] = useState<PlayerRanking[]>([]);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [gameName, setGameName] = useState<string>("");
  const [tab, setTab] = useState<"game" | "weekly">("game");
  const [weeklyRankings, setWeeklyRankings] = useState<WeeklyLeaderboardEntry[]>([]);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  useEffect(() => {
    const loadRankings = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      try {
        // Get user's current game
        const games = await getUserGames(user.uid);

        if (games.length === 0) {
          setLoading(false);
          return;
        }

        const currentGame = games[0];
        setGameName(currentGame.name || currentGame.code);

        // Get all player scores for this game
        const playerRankings: PlayerRanking[] = [];

        for (const playerId of currentGame.players) {
          const score = await getUserGameScore(playerId);

          if (score) {
            const totalArticles = score.positivePoints + score.negativePoints;
            const accuracy = totalArticles === 0 ? 0 : Math.round((score.positivePoints / totalArticles) * 100);

            playerRankings.push({
              userId: playerId,
              displayName: score.displayName || 'Neznámý hráč', // Přeloženo
              positivePoints: score.positivePoints,
              negativePoints: score.negativePoints,
              totalArticles,
              accuracy,
              rank: 0, // Will be set after sorting
            });
          }
        }

        // Sort by accuracy (descending), with minimum 5 articles threshold
        // Players below the threshold are sorted after those above it
        const MIN_ARTICLES = 5;
        playerRankings.sort((a, b) => {
          const aAbove = a.totalArticles >= MIN_ARTICLES;
          const bAbove = b.totalArticles >= MIN_ARTICLES;
          if (aAbove && !bAbove) return -1;
          if (!aAbove && bAbove) return 1;
          if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
          return b.totalArticles - a.totalArticles;
        });

        // Assign ranks
        playerRankings.forEach((player, index) => {
          player.rank = index + 1;
        });

        setRankings(playerRankings);

        // Find current user's rank
        const userRanking = playerRankings.find(p => p.userId === user.uid);
        if (userRanking) {
          setUserRank(userRanking.rank);
        }
      } catch (error) {
        console.error("Error loading rankings:", error);
      } finally {
        setLoading(false);
      }
    };

    loadRankings();
  }, [user]);

  // Load weekly leaderboard when tab switches
  useEffect(() => {
    if (tab !== "weekly" || !user) return;
    const loadWeekly = async () => {
      setWeeklyLoading(true);
      try {
        const entries = await getWeeklyLeaderboard();
        setWeeklyRankings(entries);
      } catch (err) {
        console.error("Error loading weekly leaderboard:", err);
      } finally {
        setWeeklyLoading(false);
      }
    };
    loadWeekly();
  }, [tab, user]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader />
        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
          <div className="h-8 bg-muted rounded w-40 mb-6 animate-pulse" />
          <div className="bg-card rounded-2xl shadow-sm overflow-hidden divide-y divide-border">
            {Array.from({ length: 5 }).map((_, i) => (
              <SkeletonRankingRow key={i} />
            ))}
          </div>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-md w-full bg-card p-8 rounded-xl shadow-lg">
          <h2 className="text-xl font-semibold mb-4 text-foreground">Nejste přihlášeni</h2>
          <p className="mb-6 text-sm text-muted-foreground">Pro zobrazení žebříčku se prosím přihlaste.</p>
          <div className="flex gap-3">
            <button
              onClick={() => router.push('/auth/login')}
              className="px-4 py-2 rounded-lg bg-foreground text-background font-medium"
            >
              Přihlásit se
            </button>
            <button
              onClick={() => router.push('/')}
              className="px-4 py-2 rounded-lg border border-border"
            >
              Zpět
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (rankings.length === 0) {
    return (
      <div className="min-h-screen bg-background">
        <MobileHeader />

        <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
          <header className="mb-8">
            <h1 className="text-3xl font-bold text-foreground">Žebříček</h1>
          </header>

          <div className="bg-card rounded-2xl shadow-sm p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-muted flex items-center justify-center">
              <Trophy className="w-8 h-8 text-muted-foreground" />
            </div>
            <h2 className="text-xl font-semibold text-foreground mb-2">Žádná herní relace</h2>
            <p className="text-muted-foreground mb-6">
              Připojte se nebo vytvořte hru a soutěžte s ostatními!
            </p>
            <button
              onClick={() => router.push('/game')}
              className="px-6 py-3 bg-foreground text-background rounded-xl font-medium hover:scale-105 transition-transform"
            >
              Přejít do hry
            </button>
          </div>
        </main>
      </div>
    );
  }

  const getRankIcon = (rank: number) => {
    if (rank === 1) return <Trophy className="w-5 h-5 text-yellow-500" fill="currentColor" />;
    if (rank === 2) return <Medal className="w-5 h-5 text-gray-400" fill="currentColor" />;
    if (rank === 3) return <Award className="w-5 h-5 text-amber-600" fill="currentColor" />;
    return null;
  };

  return (
    <div className="min-h-screen bg-background">
      <MobileHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
        <header className="mb-6">
          <h1 className="text-3xl font-bold text-foreground mb-2">Žebříček</h1>
        </header>

        {/* ── Tab switcher ── */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setTab("game")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "game" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Trophy className="w-4 h-4" /> Herní relace
          </button>
          <button
            onClick={() => setTab("weekly")}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              tab === "weekly" ? "bg-foreground text-background" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            <Globe className="w-4 h-4" /> Týdenní globální
          </button>
        </div>

        {tab === "game" && (
          <>
        <p className="text-muted-foreground mb-6 text-sm">Hra: {gameName}</p>

        {/* Current User Highlight */}
        {userRank && (
          <div className="mb-6 bg-card border border-border rounded-xl p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-foreground text-background flex items-center justify-center font-bold">
                  #{userRank}
                </div>
                <div>
                  <p className="font-semibold text-foreground">Vaše pořadí</p>
                  <p className="text-sm text-muted-foreground">
                    {rankings.find(r => r.userId === user.uid)?.totalArticles || 0} hodnocených článků
                  </p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold text-foreground">
                  {rankings.find(r => r.userId === user.uid)?.accuracy || 0}%
                </p>
                <p className="text-xs text-muted-foreground">Přesnost</p>
              </div>
            </div>
          </div>
        )}

        {/* Rankings List */}
        <div className="bg-card rounded-2xl shadow-sm overflow-hidden">
          <div className="p-4 border-b border-border bg-muted/30">
            <h2 className="font-semibold text-foreground">Tabulka výsledků</h2>
          </div>

          <div className="divide-y divide-border">
            {rankings.map((player) => {
              const isCurrentUser = player.userId === user?.uid;
              const rankIcon = getRankIcon(player.rank);

              return (
                <div
                  key={player.userId}
                  className={`p-4 transition-colors ${
                    isCurrentUser
                      ? 'bg-blue-500/5 border-l-4 border-blue-500'
                      : 'hover:bg-muted/30'
                  }`}
                >
                  <div className="flex items-center gap-4">
                    {/* Rank */}
                    <div className="w-12 flex items-center justify-center">
                      {rankIcon || (
                        <span className="text-xl font-bold text-muted-foreground">
                          #{player.rank}
                        </span>
                      )}
                    </div>

                    {/* Player Info */}
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold text-foreground">
                          {player.displayName}
                        </h3>
                        {isCurrentUser && (
                          <span className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">
                            Vy
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground">
                        {player.totalArticles} článků • přesnost {player.accuracy}%
                      </p>
                    </div>

                    {/* Stats */}
                    <div className="text-right">
                      <div className="flex items-center gap-3 text-sm">
                        <div className="text-green-600 font-semibold">
                          +{player.positivePoints}
                        </div>
                        <div className="text-red-600 font-semibold">
                          {player.negativePoints}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Info Card */}
        <div className="mt-6 bg-muted/30 rounded-xl p-4 text-sm text-muted-foreground">
          <p className="font-medium mb-2">Jak funguje hodnocení</p>
          <p>
            Hráči jsou řazeni podle přesnosti (procento správných odpovědí).
            Pro zařazení do žebříčku je potřeba ohodnotit minimálně 5 článků.
          </p>
        </div>
          </>
        )}

        {/* ── Weekly Global Tab ── */}
        {tab === "weekly" && (
          <>
            <p className="text-muted-foreground mb-6 text-sm">Týden: {getCurrentWeekKey()}</p>
            {weeklyLoading ? (
              <div className="text-center py-12">
                <div className="mx-auto mb-4 h-10 w-10 animate-spin rounded-full border-4 border-muted border-t-foreground" />
                <p className="text-muted-foreground text-sm">Načítám globální žebříček...</p>
              </div>
            ) : weeklyRankings.length === 0 ? (
              <div className="bg-card rounded-2xl shadow-sm p-8 text-center">
                <Globe className="w-10 h-10 mx-auto mb-3 text-muted-foreground" />
                <h2 className="text-lg font-semibold text-foreground mb-1">Zatím žádné záznamy</h2>
                <p className="text-sm text-muted-foreground">Tento týden ještě nikdo nehrál. Buďte první!</p>
              </div>
            ) : (
              <div className="bg-card rounded-2xl shadow-sm overflow-hidden">
                <div className="p-4 border-b border-border bg-muted/30">
                  <h2 className="font-semibold text-foreground">Top 100 hráčů tento týden</h2>
                </div>
                <div className="divide-y divide-border">
                  {weeklyRankings.map((entry, index) => {
                    const isMe = entry.userId === user?.uid;
                    const rankIcon = getRankIcon(index + 1);
                    return (
                      <div
                        key={entry.userId}
                        className={`p-4 transition-colors ${
                          isMe ? "bg-blue-500/5 border-l-4 border-blue-500" : "hover:bg-muted/30"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div className="w-12 flex items-center justify-center">
                            {rankIcon || <span className="text-xl font-bold text-muted-foreground">#{index + 1}</span>}
                          </div>
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-foreground">{entry.displayName}</h3>
                              {isMe && <span className="px-2 py-0.5 text-xs bg-blue-500 text-white rounded-full">Vy</span>}
                            </div>
                            <p className="text-sm text-muted-foreground">{entry.totalArticles} článků • přesnost {entry.accuracy}%</p>
                          </div>
                          <div className="text-right">
                            <div className="text-lg font-bold text-foreground">{entry.accuracy}%</div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}