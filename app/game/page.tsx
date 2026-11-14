"use client";

import { useState, useEffect } from "react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/lib/authContext";
import {
  createGameSession,
  joinOrganization,
  getUserGames,
  leaveGame,
} from "@/lib/gameService";
import type { Organization } from "@/lib/gameService";
import { Users, Gamepad2, Copy, Check, AlertCircle, LogOut, Play } from "lucide-react";
import MobileHeader from "@/components/MobileHeader";
import { useRouter } from "next/navigation";

export default function GamePage() {
  return (
    <ProtectedRoute>
      <GameContent />
    </ProtectedRoute>
  );
}

function GameContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [gameCode, setGameCode] = useState<string>("");
  const [orgCode, setOrgCode] = useState<string>("");
  const [copied, setCopied] = useState(false);
  const [joining, setJoining] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string>("");
  const [success, setSuccess] = useState<string>("");
  const [currentGame, setCurrentGame] = useState<Organization | null>(null);
  const [loading, setLoading] = useState(true);

  // Name input modal states
  const [showNameModal, setShowNameModal] = useState(false);
  const [playerName, setPlayerName] = useState("");
  const [nameAction, setNameAction] = useState<"create" | "join" | "solo">("create");

  // Leave game state
  const [leaving, setLeaving] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);

  useEffect(() => {
    const checkUserGame = async () => {
      if (!user) return;

      setLoading(true);
      try {
        const games = await getUserGames(user.uid);
        if (games.length > 0) {
          setCurrentGame(games[0]); // User can only be in one game
        }
      } catch (error) {
        console.error("Error checking user game:", error);
      } finally {
        setLoading(false);
      }
    };

    checkUserGame();
  }, [user]);

  const refreshUserGame = async () => {
    if (!user) return;
    const games = await getUserGames(user.uid);
    if (games.length > 0) {
      setCurrentGame(games[0]);
    } else {
      setCurrentGame(null);
    }
  };

  const initiateCreateGame = () => {
    setNameAction("create");
    setPlayerName("");
    setShowNameModal(true);
  };

  const initiateSoloGame = () => {
    setNameAction("solo");
    setPlayerName("");
    setShowNameModal(true);
  };

  const generateGameCode = async () => {
    if (!user || !playerName.trim()) return;

    setGenerating(true);
    setError("");
    setSuccess("");
    setShowNameModal(false);

    try {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();

      // multiplayer mód
      await createGameSession(
        code,
        user.uid,
        user.email || "unknown",
        playerName.trim(),
        "multi"
      );

      setGameCode(code);
      setCopied(false);
      setSuccess("Herní relace byla úspěšně vytvořena!");

      await refreshUserGame();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error creating game session:", err);
      setError(
        err.message || "Nepodařilo se vytvořit herní relaci. Zkuste to prosím znovu."
      );
      if (err.message?.includes("already exists")) {
        setTimeout(() => generateGameCode(), 1000);
      }
    } finally {
      setGenerating(false);
    }
  };

  const startSoloGame = async () => {
    if (!user || !playerName.trim()) return;

    setGenerating(true);
    setError("");
    setSuccess("");
    setShowNameModal(false);

    try {
      // kód nepotřebuješ sdílet, ale ať má nějaký tvar
      const code = `SOLO-${Math.random()
        .toString(36)
        .substring(2, 6)
        .toUpperCase()}`;

      await createGameSession(
        code,
        user.uid,
        user.email || "unknown",
        playerName.trim(),
        "solo"
      );

      setGameCode(code);
      setCopied(false);
      setSuccess("Solo hra byla vytvořena a uložena.");

      await refreshUserGame();
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error creating solo session:", err);
      setError(
        err.message || "Nepodařilo se vytvořit solo hru. Zkuste to prosím znovu."
      );
      setTimeout(() => setError(""), 5000);
    } finally {
      setGenerating(false);
    }
  };

  const copyToClipboard = () => {
    if (!gameCode && !currentGame?.code) return;
    const codeToCopy = gameCode || currentGame?.code;
    if (!codeToCopy) return;

    navigator.clipboard.writeText(codeToCopy);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const initiateJoinGame = () => {
    if (!orgCode.trim()) {
      setError("Zadejte prosím kód organizace");
      setTimeout(() => setError(""), 3000);
      return;
    }
    setNameAction("join");
    setPlayerName("");
    setShowNameModal(true);
  };

  const handleJoinOrganization = async () => {
    if (!user || !playerName.trim()) return;

    setJoining(true);
    setError("");
    setSuccess("");
    setShowNameModal(false);

    try {
      await joinOrganization(
        orgCode,
        user.uid,
        user.email || "unknown",
        playerName.trim()
      );
      setSuccess(`Úspěšně připojeno k organizaci s kódem: ${orgCode}`);
      setOrgCode("");

      await refreshUserGame();
      setTimeout(() => setSuccess(""), 5000);
    } catch (err: any) {
      console.error("Error joining organization:", err);
      setError(
        err.message || "Nepodařilo se připojit k organizaci. Zkuste to prosím znovu."
      );
      setTimeout(() => setError(""), 5000);
    } finally {
      setJoining(false);
    }
  };

  const handleLeaveGame = async () => {
    if (!user || !currentGame?.id) return;

    setLeaving(true);
    setError("");
    setSuccess("");
    setShowLeaveConfirm(false);

    try {
      await leaveGame(currentGame.id, user.uid);
      setSuccess("Hra byla úspěšně opuštěna");
      setCurrentGame(null);
      setGameCode("");
      setTimeout(() => setSuccess(""), 3000);
    } catch (err: any) {
      console.error("Error leaving game:", err);
      setError(err.message || "Nepodařilo se opustit hru. Zkuste to prosím znovu.");
      setTimeout(() => setError(""), 5000);
    } finally {
      setLeaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">

      {/* Hamburger menu */}
      <MobileHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 pb-24">
        {/* Info o userovi */}
        {user?.email && (
          <div className="mb-6 text-sm text-gray-500 dark:text-muted-foreground text-center">
            <span className="text-gray-600 dark:text-foreground">Přihlášen jako </span>

            <span className="font-medium">{user.email}</span>
          </div>
        )}

        {loading ? (
          <div className="flex items-center justify-center min-h-[320px]">
            <div className="text-center">
              <div className="mx-auto mb-4 h-12 w-12 animate-spin rounded-full border-4 border-gray-200 border-t-gray-900 dark:border-border dark:border-t-gray-100" />
              <p className="text-gray-600 dark:text-foreground font-medium">

                Načítání herní relace...
              </p>
            </div>
          </div>
        ) : currentGame ? (
          <>
            <div className="text-center mb-10">
              <span className="inline-flex items-center gap-2 rounded-full bg-gray-100 text-gray-700 dark:bg-card dark:text-gray-200 px-4 py-1 text-xs font-semibold">

                <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                Aktivní relace
                {currentGame.mode && (
                  <span className="ml-2 text-[10px] uppercase tracking-wide px-2 py-0.5 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200">
                    {currentGame.mode === "solo" ? "Solo" : "Multiplayer"}
                  </span>
                )}
              </span>
              <h2 className="mt-4 text-3xl font-bold text-gray-900 dark:text-foreground">
                {currentGame.name || "Aktuální relace"}
              </h2>
              <p className="mt-2 text-gray-600 dark:text-foreground text-sm">

                Jste připojeni k živé herní relaci.
              </p>
            </div>

            <div className="max-w-3xl mx-auto">
              <div className="rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border shadow-sm p-6 sm:p-8">
                {/* Game Code */}
                <div className="mb-8 text-center">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-muted-foreground mb-2">

                    Herní kód
                  </p>
                  <div className="inline-flex items-center gap-3">
                    <span className="font-mono text-3xl sm:text-4xl tracking-[0.25em] text-gray-900 dark:text-foreground">
                      {currentGame.code}
                    </span>
                  </div>
                  <div className="mt-4 flex justify-center">
                    <button
                      onClick={copyToClipboard}
                      className="inline-flex items-center gap-2 rounded-xl bg-gray-900 px-4 py-2 text-xs font-semibold text-white hover:bg-black"
                    >
                      {copied ? (
                        <>
                          <Check className="h-4 w-4" strokeWidth={2.5} />
                          Zkopírováno
                        </>
                      ) : (
                        <>
                          <Copy className="h-4 w-4" strokeWidth={2.5} />
                          Kopírovat kód
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Go to Feed Button */}
                <div className="mb-6">
                  <button
                    onClick={() => router.push("/feed")}
                    className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-6 py-4 text-base font-semibold text-white hover:bg-emerald-700 transition-colors shadow-sm"
                  >
                    <Play className="h-5 w-5" strokeWidth={2.5} />
                    Začít hrát
                  </button>
                </div>

                {/* Players List */}
                <div className="mb-6">
                  <h4 className="flex items-center gap-2 text-lg font-semibold text-gray-900 dark:text-foreground mb-3">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-muted">
                      <Users className="h-5 w-5 text-gray-600 dark:text-muted-foreground" />
                    </span>
                    Hráči{" "}
                    <span className="text-sm font-normal text-gray-500 dark:text-muted-foreground">

                      ({currentGame.players?.length || 0})
                    </span>
                  </h4>
                  <div className="space-y-2">
                    {currentGame.playerInfo && currentGame.playerInfo.length > 0 ? (
                      currentGame.playerInfo.map((player) => (
                        <div
                          key={player.userId}
                          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm transition-colors ${
                            player.userId === user?.uid
                              ? "border-gray-400 bg-gray-100 dark:border-gray-500 dark:bg-card"
                              : "border-gray-200 bg-gray-50 dark:border-border dark:bg-card/80"

                          }`}
                        >
                          <span
                            className={`h-2.5 w-2.5 rounded-full ${
                              player.userId === user?.uid
                                ? "bg-emerald-500"
                                : "bg-gray-400"
                            }`}
                          />
                          <span className="font-medium text-gray-800 dark:text-foreground">
                            {player.displayName}
                            {player.userId === user?.uid && (
                              <span className="ml-2 text-xs text-gray-600 dark:text-foreground">

                                (Ty)
                              </span>
                            )}
                          </span>
                        </div>
                      ))
                    ) : (
                      <div className="rounded-xl border border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-card/80 py-6 text-center">
                        <Users className="h-7 w-7 mx-auto mb-2 text-gray-400 dark:text-gray-500" />
                        <p className="text-gray-500 dark:text-muted-foreground font-medium text-sm">

                          Zatím žádní hráči
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-gray-50 dark:bg-card border border-gray-200 dark:border-border px-4 py-3 text-sm text-gray-800 dark:text-gray-100 mb-4">

                  <p>
                    💡 Můžete být součástí pouze jedné hry najednou. Pro připojení k jiné nebo
                    vytvoření nové musíte opustit aktuální relaci.
                  </p>
                </div>

                {/* Leave Game Button */}
                <button
                  onClick={() => setShowLeaveConfirm(true)}
                  disabled={leaving}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:cursor-not-allowed"
                >
                  <LogOut className="h-4 w-4" strokeWidth={2.5} />
                  {leaving ? "Opouštění..." : "Opustit hru"}
                </button>
              </div>
            </div>
          </>
        ) : (
          <>
            {(success || error) && (
              <div className="max-w-3xl mx-auto mb-8 space-y-3">
                {success && (
                  <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-900 px-4 py-3 text-sm">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-500 text-white">
                      <Check className="h-5 w-5" strokeWidth={2.5} />
                    </span>
                    <p className="font-medium">{success}</p>
                  </div>
                )}
                {error && (
                  <div className="flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 text-red-900 px-4 py-3 text-sm">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-red-500 text-white">
                      <AlertCircle className="h-5 w-5" strokeWidth={2.5} />
                    </span>
                    <p className="font-medium">{error}</p>
                  </div>
                )}
              </div>
            )}

            <div className="grid gap-6 md:grid-cols-2 max-w-5xl mx-auto">
              {/* Create Game Card */}
              <div className="rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border shadow-sm p-6 sm:p-8">

                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white">
                    <Gamepad2 className="h-6 w-6" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-foreground">
                    Vytvořit hru (multiplayer)
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-foreground">

                    Vygenerujte unikátní kód a sdílejte ho s hráči.
                  </p>
                </div>

                {gameCode && !gameCode.startsWith("SOLO-") ? (
                  <div className="space-y-4">
                    <div className="rounded-xl border border-gray-200 dark:border-border bg-gray-50 dark:bg-card/80 px-4 py-5 text-center">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-muted-foreground mb-2">

                        Váš kód
                      </p>
                      <p className="font-mono text-3xl tracking-[0.25em] text-gray-900 dark:text-foreground">
                        {gameCode}
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <button
                        onClick={copyToClipboard}
                        className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black"
                      >
                        {copied ? (
                          <>
                            <Check className="h-4 w-4" strokeWidth={2.5} />
                            Zkopírováno
                          </>
                        ) : (
                          <>
                            <Copy className="h-4 w-4" strokeWidth={2.5} />
                            Kopírovat kód
                          </>
                        )}
                      </button>
                      <button
                        onClick={initiateCreateGame}
                        disabled={generating}
                        className="rounded-xl border border-gray-200 dark:border-border bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-200 disabled:cursor-not-allowed dark:bg-gray-700 dark:text-gray-100 dark:hover:bg-gray-600"

                      >
                        Nová hra
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={initiateCreateGame}
                    disabled={generating}
                    className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed"
                  >
                    {generating && nameAction === "create"
                      ? "Generování..."
                      : "Vytvořit hru"}
                  </button>
                )}
              </div>

              {/* Join Game Card */}
              <div className="rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border shadow-sm p-6 sm:p-8">

                <div className="mb-6 text-center">
                  <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-gray-900 text-white">
                    <Users className="h-6 w-6" strokeWidth={2.5} />
                  </div>
                  <h3 className="text-xl font-semibold text-gray-900 dark:text-foreground">
                    Připojit se ke hře
                  </h3>
                  <p className="mt-1 text-sm text-gray-600 dark:text-foreground">

                    Zadejte kód pro připojení k existující relaci.
                  </p>
                </div>

                <div className="space-y-4">
                  <input
                    type="text"
                    value={orgCode}
                    onChange={(e) => setOrgCode(e.target.value.toUpperCase())}
                    placeholder="XXXXXX"
                    maxLength={6}
                    className="w-full rounded-xl border-2 border-gray-200 bg-gray-50 text-center font-mono text-2xl tracking-[0.3em] uppercase text-gray-900 placeholder:text-gray-300 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:border-border dark:bg-card dark:text-gray-50 dark:focus:border-gray-100 dark:focus:ring-gray-500/40"

                  />
                  <button
                    onClick={initiateJoinGame}
                    disabled={joining || !orgCode.trim()}
                    className="w-full rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed"
                  >
                    {joining ? "Připojování..." : "Připojit se ke hře"}
                  </button>
                </div>
              </div>
            </div>

            {/* Solo mód */}
            <div className="mt-6 max-w-5xl mx-auto">
              <div className="rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border shadow-sm p-6 sm:p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-2 text-center">
                  Solo mód
                </h3>
                <p className="text-sm text-gray-600 dark:text-foreground mb-4 text-center max-w-xl mx-auto">

                  Spusťte simulaci jen pro sebe. Hra se uloží do databáze stejně jako běžná
                  relace, jen s označením, že jde o <strong>solo mód</strong>.
                </p>
                <div className="flex justify-center">
                  <button
                    onClick={initiateSoloGame}
                    disabled={generating}
                    className="rounded-xl bg-gray-900 px-6 py-3 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed"
                  >
                    {generating && nameAction === "solo"
                      ? "Spouštění..."
                      : "Spustit solo hru"}
                  </button>
                </div>
              </div>
            </div>

            {/* Info Section */}
            <div className="mt-10 max-w-4xl mx-auto">
              <div className="rounded-2xl bg-white dark:bg-card border border-gray-200 dark:border-border shadow-sm p-6 sm:p-8">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50 mb-4 text-center">

                  Jak to funguje
                </h3>
                <div className="grid gap-6 md:grid-cols-3 text-sm">
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-muted font-semibold text-gray-800 dark:text-foreground">
                      1
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-foreground mb-1">
                        Vytvořte hru
                      </h4>
                      <p className="text-gray-600 dark:text-foreground">

                        Vygenerujte unikátní kód a sdílejte ho s ostatními hráči pro novou
                        relaci.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-muted font-semibold text-gray-800 dark:text-foreground">
                      2
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-foreground mb-1">
                        Připojte se ke hře
                      </h4>
                      <p className="text-gray-600 dark:text-foreground">

                        Zadejte sdílený kód pro připojení k existující hře a propojte se s
                        ostatními hráči.
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-100 dark:bg-muted font-semibold text-gray-800 dark:text-foreground">
                      3
                    </div>
                    <div>
                      <h4 className="font-semibold text-gray-900 dark:text-foreground mb-1">
                        Solo mód
                      </h4>
                      <p className="text-gray-600 dark:text-foreground">

                        Pokud nechcete sdílet kód, spusťte solo hru. Vše se uloží do databáze
                        stejně jako u běžné relace.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Name Input Modal */}
      {showNameModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-background border border-gray-200 dark:border-border shadow-2xl p-6 sm:p-8">
            <h3 className="text-xl font-semibold text-gray-900 dark:text-gray-50 mb-1">

              {nameAction === "create"
                ? "Vytvořit hru"
                : nameAction === "join"
                ? "Připojit se ke hře"
                : "Spustit solo hru"}
            </h3>
            <p className="text-sm text-gray-600 dark:text-foreground mb-5">

              Pro pokračování zadejte své jméno.
            </p>

            <input
              type="text"
              value={playerName}
              onChange={(e) => setPlayerName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && playerName.trim()) {
                  if (nameAction === "create") {
                    generateGameCode();
                  } else if (nameAction === "join") {
                    handleJoinOrganization();
                  } else {
                    startSoloGame();
                  }
                }
              }}
              placeholder="Vaše jméno"
              maxLength={20}
              className="mb-5 w-full rounded-xl border-2 border-gray-200 bg-gray-50 px-4 py-3 text-sm font-medium text-gray-900 placeholder:text-gray-400 focus:border-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-300 dark:border-border dark:bg-card dark:text-gray-50 dark:focus:border-gray-100 dark:focus:ring-gray-500/40"

              autoFocus
            />

            <div className="flex gap-3">
              <button
                onClick={() => setShowNameModal(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-200 dark:border-border dark:bg-card dark:text-gray-100 dark:hover:bg-gray-700"

              >
                Zrušit
              </button>
              <button
                onClick={() => {
                  if (nameAction === "create") {
                    generateGameCode();
                  } else if (nameAction === "join") {
                    handleJoinOrganization();
                  } else {
                    startSoloGame();
                  }
                }}
                disabled={!playerName.trim()}
                className="flex-1 rounded-xl bg-gray-900 px-4 py-3 text-sm font-semibold text-white hover:bg-black disabled:cursor-not-allowed"
              >
                Pokračovat
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Leave Game Confirmation Modal */}
      {showLeaveConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-white dark:bg-background border border-gray-200 dark:border-border shadow-2xl p-6 sm:p-8">
            <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600 dark:bg-red-900/40 dark:text-red-400">

              <AlertCircle className="h-6 w-6" strokeWidth={2.5} />
            </div>
            <h3 className="text-xl font-semibold text-gray-900 dark:text-foreground mb-2">
              Opustit hru?
            </h3>
            <p className="text-sm text-gray-600 dark:text-foreground mb-6">

              Opravdu chcete opustit tuto hru? Pokud se budete chtít vrátit, budete muset
              znovu zadat herní kód.
            </p>

            <div className="flex gap-3">
              <button
                onClick={() => setShowLeaveConfirm(false)}
                className="flex-1 rounded-xl border border-gray-200 bg-gray-100 px-4 py-3 text-sm font-semibold text-gray-800 hover:bg-gray-200 dark:border-border dark:bg-card dark:text-gray-100 dark:hover:bg-gray-700"

              >
                Zrušit
              </button>
              <button
                onClick={handleLeaveGame}
                disabled={leaving}
                className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl bg-red-600 px-4 py-3 text-sm font-semibold text-white hover:bg-red-700 disabled:cursor-not-allowed"
              >
                <LogOut className="h-4 w-4" strokeWidth={2.5} />
                {leaving ? "Opouštění..." : "Opustit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

