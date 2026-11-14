"use client";

import { useEffect, useRef, useState } from "react";
import MobileHeader from "@/components/MobileHeader";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/lib/authContext";
import { db } from "@/lib/firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import {
    startStandaloneSimulation,
    type SessionSimulationPlayer,
    type StandaloneSimulationController
} from "./standaloneSimulation";
import { getActiveEffects, type ActiveEffect } from "@/lib/activeEffectsService";

const SIM_EFFECT_META: Record<string, { name: string; emoji: string; pros: string[]; cons: string[] }> = {
    wide_wave_30m: {
        name: "Široká vlna",
        emoji: "🌊",
        pros: ["Větší oblast vlivu"],
        cons: ["Slabší tlak na každou buňku"],
    },
    laser_focus_30m: {
        name: "Laserové zaměření",
        emoji: "🎯",
        pros: ["Silnější přímý tlak", "Rychlejší konverze postojů"],
        cons: ["Menší dosah ovlivnění"],
    },
    echo_chamber_20m: {
        name: "Echo komora",
        emoji: "📣",
        pros: ["Silnější online šíření vlivu"],
        cons: ["Větší chaos v mapě", "Slabší kotva k původním postojům"],
    },
    civic_shield_30m: {
        name: "Občanský štít",
        emoji: "🧱",
        pros: ["Méně náhodného chaosu", "Stabilnější mapa"],
        cons: ["Slabší dominance hráčů", "Méně přesvědčivé přátelské vazby"],
    },
    viral_spread_25m: {
        name: "Virální šíření",
        emoji: "🦠",
        pros: ["Vliv se šíří dál bez přímé přítomnosti"],
        cons: ["Efekt se postupně rozřeďuje"],
    },
    deep_roots_30m: {
        name: "Hluboké kořeny",
        emoji: "🌱",
        pros: ["Váš vliv v mapě přetrvá déle"],
        cons: ["I nepřátelský tlak vydrží déle"],
    },
    social_fracture_15m: {
        name: "Společenská trhlina",
        emoji: "⚡",
        pros: ["Krajně smýšlející oblasti konvertují rychleji"],
        cons: ["Střed mapy se stává odolnějším"],
    },
    mind_fog_20m: {
        name: "Mentální mlha",
        emoji: "🌫️",
        pros: ["Lidé jsou náchylnější ke změně postoje"],
        cons: ["Mapa je nestabilní a těžko předvídatelná"],
    },
    grassroots_30m: {
        name: "Místní síť",
        emoji: "🌿",
        pros: ["Sousedé silněji ovlivňují své okolí"],
        cons: ["Online kontakty mají menší váhu"],
    },
};

type LiveGame = {
    id: string;
    code?: string;
    players: string[];
    playerInfo: Array<{ userId: string; displayName: string }>;
};

type LiveScore = {
    userId: string;
    positivePoints: number;
    negativePoints: number;
};

export default function SimulationPage() {
    return (
        <ProtectedRoute>
            <SimulationContent />
        </ProtectedRoute>
    );
}

function SimulationContent() {
    const { user } = useAuth();
    const simControllerRef = useRef<StandaloneSimulationController | null>(null);

    const [activeRoomCode, setActiveRoomCode] = useState<string>("-");
    const [syncStatus, setSyncStatus] = useState<string>("Waiting for active room...");
    const [activeSimEffects, setActiveSimEffects] = useState<ActiveEffect[]>([]);

    useEffect(() => {
        if (!user) {
            return;
        }

        const START_RETRY_DELAY_MS = 90;
        const MAX_START_RETRIES = 35;

        let cancelled = false;
        let activeGame: LiveGame | null = null;
        let scoreByUser = new Map<string, LiveScore>();
        let unsubscribeGames: (() => void) | null = null;
        let unsubscribeScores: (() => void) | null = null;
        let retryHandle: ReturnType<typeof setTimeout> | null = null;
        let effectsRefreshHandle: ReturnType<typeof setInterval> | null = null;
        let retryCount = 0;

        const clearRetry = () => {
            if (retryHandle) {
                clearTimeout(retryHandle);
                retryHandle = null;
            }
        };

        const clearEffectsRefresh = () => {
            if (effectsRefreshHandle) {
                clearInterval(effectsRefreshHandle);
                effectsRefreshHandle = null;
            }
        };

        const stopScoreListener = () => {
            if (unsubscribeScores) {
                unsubscribeScores();
                unsubscribeScores = null;
            }
        };

        const stopGamesListener = () => {
            if (unsubscribeGames) {
                unsubscribeGames();
                unsubscribeGames = null;
            }
        };

        const connectRoomStreams = (controller: StandaloneSimulationController) => {
            const publishEffectsToSimulation = async () => {
                try {
                    const effects = await getActiveEffects(user.uid);
                    const simEffects = effects.filter((e) => e.itemId in SIM_EFFECT_META);
                    controller.setSimulationEffects(simEffects.map((e) => e.itemId));
                    setActiveSimEffects(simEffects);
                } catch {
                    controller.setSimulationEffects([]);
                    setActiveSimEffects([]);
                }
            };

            const publishPlayersToSimulation = () => {
                if (!activeGame) {
                    controller.setPlayers([]);
                    return;
                }

                const basePlayers = activeGame.playerInfo.length
                    ? activeGame.playerInfo.map((player) => ({
                        id: player.userId,
                        name: player.displayName || `Player ${player.userId.slice(0, 6)}`
                    }))
                    : activeGame.players.map((playerId) => ({
                        id: playerId,
                        name: `Player ${playerId.slice(0, 6)}`
                    }));

                const simulationPlayers: SessionSimulationPlayer[] = basePlayers.map((player) => {
                    const score = scoreByUser.get(player.id);
                    return {
                        id: player.id,
                        name: player.name,
                        positivePoints: score?.positivePoints ?? 0,
                        negativePoints: score?.negativePoints ?? 0
                    };
                });

                controller.setPlayers(simulationPlayers);

                const scoredPlayers = simulationPlayers.filter(
                    (player) => (player.positivePoints ?? 0) + (player.negativePoints ?? 0) > 0
                ).length;

                setSyncStatus(
                    `Realtime sync active: ${simulationPlayers.length} players, ${scoredPlayers} with score updates.`
                );
            };

            void publishEffectsToSimulation();
            effectsRefreshHandle = setInterval(() => {
                void publishEffectsToSimulation();
            }, 15000);

            const gamesQuery = query(
                collection(db, "games"),
                where("players", "array-contains", user.uid)
            );

            unsubscribeGames = onSnapshot(
                gamesQuery,
                (gamesSnapshot) => {
                    if (cancelled) {
                        return;
                    }

                    if (gamesSnapshot.empty) {
                        activeGame = null;
                        scoreByUser = new Map<string, LiveScore>();
                        stopScoreListener();
                        setActiveRoomCode("-");
                        setSyncStatus("No active room found. Join or create a game first.");
                        controller.setPlayers([]);
                        return;
                    }

                    const gameDoc = gamesSnapshot.docs[0];
                    const gameData = gameDoc.data() as {
                        code?: string;
                        players?: string[];
                        playerInfo?: Array<{ userId?: string; displayName?: string }>;
                    };

                    const normalizedPlayers = Array.isArray(gameData.players)
                        ? gameData.players.filter((playerId): playerId is string => typeof playerId === "string")
                        : [];

                    const normalizedPlayerInfo = Array.isArray(gameData.playerInfo)
                        ? gameData.playerInfo
                            .filter(
                                (entry): entry is { userId: string; displayName: string } =>
                                    !!entry &&
                                    typeof entry.userId === "string" &&
                                    entry.userId.length > 0 &&
                                    typeof entry.displayName === "string"
                            )
                        : [];

                    const previousGameId = activeGame?.id;
                    activeGame = {
                        id: gameDoc.id,
                        code: typeof gameData.code === "string" ? gameData.code : undefined,
                        players: normalizedPlayers,
                        playerInfo: normalizedPlayerInfo
                    };

                    setActiveRoomCode(activeGame.code || activeGame.id || "-");

                    if (previousGameId !== activeGame.id) {
                        stopScoreListener();
                        scoreByUser = new Map<string, LiveScore>();

                        const scoresQuery = query(
                            collection(db, "user_game_scores"),
                            where("sessionId", "==", activeGame.id)
                        );

                        unsubscribeScores = onSnapshot(
                            scoresQuery,
                            (scoresSnapshot) => {
                                if (cancelled) {
                                    return;
                                }

                                const nextScores = new Map<string, LiveScore>();
                                for (let i = 0; i < scoresSnapshot.docs.length; i += 1) {
                                    const scoreDoc = scoresSnapshot.docs[i];
                                    const scoreData = scoreDoc.data() as {
                                        userId?: string;
                                        positivePoints?: number;
                                        negativePoints?: number;
                                    };

                                    const userId = typeof scoreData.userId === "string" && scoreData.userId.length > 0
                                        ? scoreData.userId
                                        : scoreDoc.id;

                                    nextScores.set(userId, {
                                        userId,
                                        positivePoints: Number.isFinite(scoreData.positivePoints)
                                            ? Number(scoreData.positivePoints)
                                            : 0,
                                        negativePoints: Number.isFinite(scoreData.negativePoints)
                                            ? Number(scoreData.negativePoints)
                                            : 0
                                    });
                                }

                                scoreByUser = nextScores;
                                publishPlayersToSimulation();
                            },
                            () => {
                                if (!cancelled) {
                                    setSyncStatus("Score stream disconnected.");
                                }
                            }
                        );
                    }

                    publishPlayersToSimulation();
                },
                () => {
                    if (!cancelled) {
                        setSyncStatus("Room stream disconnected.");
                    }
                }
            );
        };

        const startSimulationWhenReady = () => {
            if (cancelled) {
                return;
            }

            const controller = startStandaloneSimulation();
            if (!controller) {
                retryCount += 1;
                if (retryCount <= MAX_START_RETRIES) {
                    setSyncStatus("Preparing simulation...");
                    retryHandle = setTimeout(startSimulationWhenReady, START_RETRY_DELAY_MS);
                    return;
                }

                setSyncStatus("Simulation UI not ready. Reload page.");
                return;
            }

            simControllerRef.current = controller;
            setSyncStatus("Connecting to active room...");
            connectRoomStreams(controller);
        };

        startSimulationWhenReady();

        return () => {
            cancelled = true;
            clearRetry();
            clearEffectsRefresh();
            stopGamesListener();
            stopScoreListener();
            simControllerRef.current?.stop();
            simControllerRef.current = null;
        };
    }, [user]);

    return (
        <div className="min-h-screen bg-background text-foreground">
            <MobileHeader />

            <main className="mx-auto w-full max-w-[1600px] p-4 lg:p-6 pb-24">
                <style jsx global>{`
                    .sim-layout {
                        display: grid;
                        gap: 16px;
                        align-items: stretch;
                    }

                    @media (min-width: 1100px) {
                        .sim-layout {
                            grid-template-columns: minmax(0, 1fr) 360px;
                        }
                    }

                    .sim-map-card,
                    .sim-list-card {
                        border: 1px solid var(--border);
                        border-radius: 16px;
                        background: color-mix(in oklab, var(--card) 94%, var(--muted) 6%);
                        color: var(--card-foreground);
                        box-shadow: 0 8px 30px rgba(0, 0, 0, 0.09);
                        padding: 14px;
                    }

                    .dark .sim-map-card,
                    .dark .sim-list-card {
                        background: color-mix(in oklab, var(--card) 90%, var(--muted) 10%);
                        border-color: color-mix(in oklab, var(--border) 75%, var(--muted) 25%);
                        box-shadow: 0 8px 22px rgba(0, 0, 0, 0.35);
                    }

                    .sim-map-card {
                        display: flex;
                        flex-direction: column;
                        align-items: center;
                    }

                    .sim-list-card {
                        display: flex;
                        flex-direction: column;
                        min-height: 0;
                        overflow-y: auto;
                    }

                    #simWrap {
                        position: relative;
                        display: block;
                        width: min(100%, 78vh);
                        max-width: 860px;
                        border-radius: 14px;
                        overflow: hidden;
                        margin-inline: auto;
                    }

                    #simCanvas {
                        width: 100%;
                        aspect-ratio: 1 / 1;
                        display: block;
                        image-rendering: pixelated;
                        background: color-mix(in oklab, var(--muted) 80%, var(--card) 20%);
                    }

                    .dark #simCanvas {
                        background: color-mix(in oklab, var(--muted) 40%, var(--card) 60%);
                    }

                    #playerOverlay {
                        position: absolute;
                        inset: 0;
                        z-index: 5;
                    }

                    .player-marker {
                        position: absolute;
                        transform: translate(-50%, -50%);
                        width: 16px;
                        height: 16px;
                        border-radius: 999px;
                        background: #00f7c2;
                        border: 2px solid rgba(0, 28, 36, 0.85);
                        box-shadow: 0 0 0 2px rgba(255, 255, 255, 0.86), 0 0 16px rgba(0, 247, 194, 0.92);
                        pointer-events: auto;
                        cursor: pointer;
                        transition: transform 120ms ease, box-shadow 120ms ease, border-color 120ms ease;
                    }

                    .dark .player-marker {
                        border-color: rgba(255, 255, 255, 0.72);
                        box-shadow: 0 0 0 2px rgba(15, 23, 42, 0.92), 0 0 18px rgba(0, 247, 194, 0.96);
                    }

                    .player-marker.is-highlighted {
                        transform: translate(-50%, -50%) scale(1.85);
                        z-index: 12;
                        box-shadow: 0 0 0 3px rgba(255, 255, 255, 0.98), 0 0 0 9px rgba(0, 247, 194, 0.56), 0 0 32px rgba(0, 247, 194, 1);
                    }

                    .dark .player-marker.is-highlighted {
                        box-shadow: 0 0 0 3px rgba(15, 23, 42, 0.98), 0 0 0 9px rgba(0, 247, 194, 0.64), 0 0 36px rgba(0, 247, 194, 1);
                    }

                    #playerTooltip {
                        position: absolute;
                        display: none;
                        z-index: 10;
                        pointer-events: none;
                        background: color-mix(in oklab, var(--card) 88%, var(--muted) 12%);
                        color: var(--foreground);
                        border: 1px solid var(--border);
                        border-radius: 10px;
                        padding: 4px 8px;
                        white-space: nowrap;
                        font-size: 12px;
                        line-height: 1.3;
                        font-weight: 600;
                        box-shadow: 0 8px 18px rgba(0, 0, 0, 0.16);
                    }

                    #status {
                        margin-top: 10px;
                        font-size: 12px;
                        color: var(--muted-foreground);
                        text-align: right;
                    }

                    .dark #status {
                        color: var(--muted-foreground);
                    }

                    .sim-list-header {
                        display: flex;
                        justify-content: space-between;
                        align-items: baseline;
                        gap: 10px;
                        margin-bottom: 10px;
                    }

                    .sim-list-title {
                        margin: 0;
                        font-size: 14px;
                        font-weight: 700;
                        letter-spacing: 0.02em;
                        text-transform: uppercase;
                        color: var(--muted-foreground);
                    }

                    .dark .sim-list-title {
                        color: var(--muted-foreground);
                    }

                    .sim-room-code {
                        font-size: 12px;
                        color: var(--muted-foreground);
                        font-weight: 600;
                    }

                    .dark .sim-room-code {
                        color: var(--muted-foreground);
                    }

                    #playersList {
                        margin: 0;
                        padding: 0;
                        list-style: none;
                        display: flex;
                        flex-direction: column;
                        gap: 8px;
                        height: 420px;
                        max-height: 420px;
                        overflow: auto;
                    }

                    .player-row {
                        border: 1px solid color-mix(in oklab, var(--border) 85%, var(--muted) 15%);
                        border-radius: 12px;
                        padding: 10px;
                        transition: border-color 120ms ease, background-color 120ms ease, box-shadow 120ms ease;
                        background: color-mix(in oklab, var(--card) 90%, var(--muted) 10%);
                    }

                    .dark .player-row {
                        border-color: color-mix(in oklab, var(--border) 72%, var(--muted) 28%);
                        background: color-mix(in oklab, var(--card) 84%, var(--muted) 16%);
                    }

                    .player-row.is-highlighted {
                        border-color: color-mix(in oklab, var(--chart-2) 78%, var(--border) 22%);
                        background: color-mix(in oklab, var(--chart-2) 18%, var(--card) 82%);
                        box-shadow: 0 0 0 2px color-mix(in oklab, var(--chart-2) 52%, transparent);
                    }

                    .player-row-top {
                        display: flex;
                        justify-content: space-between;
                        align-items: center;
                        gap: 8px;
                    }

                    .player-row-name {
                        font-size: 14px;
                        font-weight: 700;
                        color: var(--foreground);
                    }

                    .dark .player-row-name {
                        color: var(--foreground);
                    }

                    .player-row-balance {
                        font-size: 13px;
                        font-weight: 700;
                    }

                    .player-row-balance.positive {
                        color: color-mix(in oklab, var(--chart-4) 65%, var(--foreground) 35%);
                    }

                    .dark .player-row-balance.positive {
                        color: color-mix(in oklab, var(--chart-4) 65%, var(--foreground) 35%);
                    }

                    .player-row-balance.negative {
                        color: color-mix(in oklab, var(--destructive) 70%, var(--foreground) 30%);
                    }

                    .dark .player-row-balance.negative {
                        color: color-mix(in oklab, var(--destructive) 70%, var(--foreground) 30%);
                    }

                    .player-row-values {
                        margin-top: 6px;
                        display: grid;
                        grid-template-columns: repeat(3, minmax(0, 1fr));
                        gap: 8px;
                        font-size: 12px;
                        color: var(--muted-foreground);
                    }

                    .dark .player-row-values {
                        color: var(--muted-foreground);
                    }

                    .players-empty {
                        border: 1px dashed color-mix(in oklab, var(--border) 75%, var(--muted) 25%);
                        border-radius: 12px;
                        padding: 12px;
                        font-size: 13px;
                        color: var(--muted-foreground);
                        text-align: center;
                    }

                    .dark .players-empty {
                        color: var(--muted-foreground);
                        border-color: color-mix(in oklab, var(--border) 68%, var(--muted) 32%);
                    }

                    .sim-sync-footer {
                        margin-top: 12px;
                        font-size: 11px;
                        color: var(--muted-foreground);
                        text-align: right;
                    }

                    .dark .sim-sync-footer {
                        color: var(--muted-foreground);
                    }
                `}</style>

                <div className="sim-layout">
                    <section className="sim-map-card">
                        <div id="simWrap">
                            <canvas id="simCanvas" width={256} height={256}></canvas>
                            <div id="playerOverlay"></div>
                            <div id="playerTooltip"></div>
                        </div>
                        <div id="status">Booting...</div>
                    </section>

                    <aside className="sim-list-card">
                        <div className="sim-list-header">
                            <p className="sim-list-title">Players</p>
                            <span className="sim-room-code">Room {activeRoomCode}</span>
                        </div>
                        <ul id="playersList"></ul>

                        {/* ── Active simulation modifiers panel ── */}
                        <div style={{ marginTop: 16 }}>
                            <p style={{
                                fontSize: 11,
                                fontWeight: 700,
                                letterSpacing: "0.08em",
                                textTransform: "uppercase",
                                color: "var(--muted-foreground)",
                                marginBottom: 8,
                            }}>
                                Aktivní modifikátory simulace
                            </p>
                            {activeSimEffects.length === 0 ? (
                                <p style={{
                                    fontSize: 12,
                                    color: "var(--muted-foreground)",
                                    border: "1px dashed color-mix(in oklab, var(--border) 75%, var(--muted) 25%)",
                                    borderRadius: 10,
                                    padding: "10px 12px",
                                    textAlign: "center",
                                }}>
                                    Žádné aktivní modifikátory — nakup je v Obchodě.
                                </p>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                                    {activeSimEffects.map((fx) => {
                                        const meta = SIM_EFFECT_META[fx.itemId];
                                        if (!meta) return null;
                                        const expiresAt = fx.expiresAt ? new Date(fx.expiresAt) : null;
                                        const msLeft = expiresAt ? expiresAt.getTime() - Date.now() : null;
                                        const minLeft = msLeft !== null ? Math.max(0, Math.ceil(msLeft / 60000)) : null;
                                        return (
                                            <div
                                                key={fx.itemId}
                                                style={{
                                                    border: "1px solid color-mix(in oklab, var(--border) 80%, var(--muted) 20%)",
                                                    borderRadius: 12,
                                                    padding: "10px 12px",
                                                    background: "color-mix(in oklab, var(--card) 88%, var(--muted) 12%)",
                                                }}
                                            >
                                                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                                                    <span style={{ fontSize: 13, fontWeight: 700, color: "var(--foreground)", display: "flex", alignItems: "center", gap: 6 }}>
                                                        {meta.emoji} {meta.name}
                                                    </span>
                                                    {minLeft !== null && (
                                                        <span style={{
                                                            fontSize: 10,
                                                            fontWeight: 700,
                                                            background: "color-mix(in oklab, var(--chart-2) 18%, var(--card) 82%)",
                                                            color: "color-mix(in oklab, var(--chart-2) 80%, var(--foreground) 20%)",
                                                            border: "1px solid color-mix(in oklab, var(--chart-2) 35%, transparent)",
                                                            borderRadius: 6,
                                                            padding: "2px 7px",
                                                        }}>
                                                            {minLeft} min
                                                        </span>
                                                    )}
                                                </div>
                                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                                    {meta.pros.map((pro) => (
                                                        <span key={pro} style={{ fontSize: 11, color: "#16a34a", display: "flex", alignItems: "flex-start", gap: 5 }}>
                                                            <span style={{ marginTop: 1, flexShrink: 0 }}>✦</span>{pro}
                                                        </span>
                                                    ))}
                                                    {meta.cons.map((con) => (
                                                        <span key={con} style={{ fontSize: 11, color: "#dc2626", display: "flex", alignItems: "flex-start", gap: 5 }}>
                                                            <span style={{ marginTop: 1, flexShrink: 0 }}>✦</span>{con}
                                                        </span>
                                                    ))}
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </aside>
                </div>

                <p className="sim-sync-footer">{syncStatus}</p>
            </main>
        </div>
    );
}
