// @ts-nocheck
const SIM_WIDTH = 256;
const SIM_HEIGHT = 256;
const SIM_SCALE = SIM_WIDTH * SIM_HEIGHT;

// Compact simulation tuning.
const BASE_SIM = {
    stepsPerSecond: 10,    // Target simulation speed: about 10 state updates per second.
    maxCatchUpSteps: 4,    // Prevent long frame stalls from fast-forwarding too much at once.
    internetWeight: 1.0,   // Higher = stronger remote/friend influence vs local neighborhood influence.
    internetContactChance: 0.20, // Chance of an extra long-range online contact per day.
    socialPull: 0.14,      // Higher = people conform to nearby average more quickly.
    driftStrength: 1.25,   // Higher = more random day-to-day mood swings (more noisy/chaotic behavior).
    npcAutonomy: 0.24,     // Lower = NPCs change less on their own (map stays closer to generated state).
    baselineHold: 0.08,    // Higher = stronger pull back to initial generated regional stance.
    playerDominance: 2.8,  // Higher = player influence overrides NPC self-dynamics more strongly.
    playerLocalPull: 1.15, // Higher = nearby players dominate local social blending more strongly.
    playerFriendBoost: 2.9,// Higher = friend links to players are much more persuasive.
    pressureRadius: 4,     // Higher = players seed influence into a wider local area.
    pressureSeed: 0.95,    // Higher = stronger initial ideological push around players.
    pressureDecay: 0.987,  // Lower = influence dies out faster, higher = long-lived ideological memory.
    pressureMix: 0.30,     // Higher = smoother broad fronts, lower = patchy/local pockets.
    pressureToStance: 0.38, // Higher = stored pressure converts into actual stance changes faster.
    playerOppositionBoost: 1.10, // Higher = players can convert opposite-aligned areas more equally.
    playerManipulationMinRange: 6,  // Full-strength manipulation radius around players.
    playerManipulationMaxRange: 128  // Outer edge where manipulation fades to zero.
};

let SIM = { ...BASE_SIM };

// Initialization tuning for society generation.
const INIT = {
    urbanScale: 12.0,
    economyScale: 8.2,
    ageScale: 6.6,
    ideologyMacroScale: 7.2,
    ideologyMesoScale: 12.4,

    ideologyMacroContrast: 72,
    ideologyMesoContrast: 34,
    personalContrast: 16,
    microNoiseContrast: 13,

    populationMin: 0.02,
    populationBase: 0.1,
    populationUrbanWeight: 0.94,
    populationGrainWeight: 0.05,

    localFriendChance: 0.8,
    localFriendRadius: 24,
    deadCellChance: 0.018,

    stubbornStrongChance: 0.985,
    stubbornMediumChance: 0.945
};

const NEIGHBORS = [
    [-1, -1], [0, -1], [1, -1],
    [-1, 0],           [1, 0],
    [-1, 1],  [0, 1],  [1, 1]
];

export type SessionSimulationPlayer = {
    id: string;
    name: string;
    positivePoints?: number;
    negativePoints?: number;
    stance?: number;
};

export type StandaloneSimulationController = {
    stop: () => void;
    setPlayers: (players: SessionSimulationPlayer[]) => void;
    setSimulationEffects: (effectIds: string[]) => void;
};

function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
}

function applySimulationEffectModifiers(effectIds) {
    SIM = { ...BASE_SIM };

    if (effectIds.includes("wide_wave_30m")) {
        SIM.pressureRadius = Math.round(BASE_SIM.pressureRadius * 1.65);
        SIM.pressureSeed = BASE_SIM.pressureSeed * 0.72;
    }

    if (effectIds.includes("laser_focus_30m")) {
        SIM.pressureRadius = Math.max(2, Math.round(SIM.pressureRadius * 0.68));
        SIM.pressureSeed = SIM.pressureSeed * 1.42;
        SIM.pressureToStance = SIM.pressureToStance * 1.12;
    }

    if (effectIds.includes("echo_chamber_20m")) {
        SIM.internetWeight = SIM.internetWeight * 1.35;
        SIM.internetContactChance = clamp(SIM.internetContactChance * 1.55, 0, 1);
        SIM.driftStrength = SIM.driftStrength * 1.22;
        SIM.baselineHold = SIM.baselineHold * 0.85;
    }

    if (effectIds.includes("civic_shield_30m")) {
        SIM.driftStrength = SIM.driftStrength * 0.74;
        SIM.baselineHold = SIM.baselineHold * 1.18;
        SIM.playerDominance = SIM.playerDominance * 0.83;
        SIM.playerFriendBoost = SIM.playerFriendBoost * 0.88;
    }

    if (effectIds.includes("viral_spread_25m")) {
        SIM.internetContactChance = clamp(SIM.internetContactChance * 1.60, 0, 1);
        SIM.internetWeight = SIM.internetWeight * 1.20;
        SIM.pressureSeed = SIM.pressureSeed * 0.85;
    }

    if (effectIds.includes("deep_roots_30m")) {
        SIM.pressureDecay = Math.min(0.998, SIM.pressureDecay * 1.009);
        SIM.pressureMix = SIM.pressureMix * 1.15;
    }

    if (effectIds.includes("social_fracture_15m")) {
        SIM.playerOppositionBoost = SIM.playerOppositionBoost * 1.40;
        SIM.socialPull = SIM.socialPull * 0.78;
    }

    if (effectIds.includes("mind_fog_20m")) {
        SIM.baselineHold = SIM.baselineHold * 0.65;
        SIM.npcAutonomy = SIM.npcAutonomy * 1.18;
        SIM.driftStrength = SIM.driftStrength * 1.15;
    }

    if (effectIds.includes("grassroots_30m")) {
        SIM.socialPull = SIM.socialPull * 1.30;
        SIM.internetWeight = SIM.internetWeight * 0.72;
        SIM.internetContactChance = clamp(SIM.internetContactChance * 0.78, 0, 1);
    }
}

function lerp(a, b, t) {
    return a + (b - a) * t;
}

function stanceToSignal(value) {
    const denom = value >= 0 ? 127 : 128;
    return clamp(value / denom, -1, 1);
}

function idx(x, y) {
    return y * SIM_WIDTH + x;
}

function hash01(seed) {
    let x = seed >>> 0;
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    return (x >>> 0) / 4294967296;
}

function smooth01(t) {
    const v = clamp(t, 0, 1);
    return v * v * (3 - 2 * v);
}

// Value noise on integer lattice (Perlin-like smooth random field).
function valueNoise2D(x, y, seed) {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const x1 = x0 + 1;
    const y1 = y0 + 1;

    const fx = smooth01(x - x0);
    const fy = smooth01(y - y0);

    const h00 = hash01((x0 * 73856093) ^ (y0 * 19349663) ^ seed);
    const h10 = hash01((x1 * 73856093) ^ (y0 * 19349663) ^ seed);
    const h01 = hash01((x0 * 73856093) ^ (y1 * 19349663) ^ seed);
    const h11 = hash01((x1 * 73856093) ^ (y1 * 19349663) ^ seed);

    const nx0 = lerp(h00, h10, fx);
    const nx1 = lerp(h01, h11, fx);
    return lerp(nx0, nx1, fy);
}

function fbm2D(x, y, seed) {
    let sum = 0;
    let amp = 0.56;
    let freq = 1;
    let norm = 0;
    for (let octave = 0; octave < 4; octave += 1) {
        sum += valueNoise2D(x * freq, y * freq, seed + octave * 7919) * amp;
        norm += amp;
        amp *= 0.5;
        freq *= 2;
    }
    return norm > 0 ? sum / norm : 0.5;
}

export function startStandaloneSimulation(): StandaloneSimulationController | null {
    const canvas = document.getElementById("simCanvas");
    const statusEl = document.getElementById("status");
    const toggleBtn = document.getElementById("toggleBtn");
    const playerOverlay = document.getElementById("playerOverlay");
    const playerTooltip = document.getElementById("playerTooltip");
    const playersList = document.getElementById("playersList");

    if (!(canvas instanceof HTMLCanvasElement) ||
        !(statusEl instanceof HTMLElement) ||
        !(playerOverlay instanceof HTMLDivElement) ||
        !(playerTooltip instanceof HTMLDivElement)) {
        return null;
    }

    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) {
        return null;
    }

    ctx.imageSmoothingEnabled = false;

    // Simulation data.
    const population = new Float32Array(SIM_SCALE);       // 0..1
    const age = new Float32Array(SIM_SCALE);              // 0..100
    const education = new Float32Array(SIM_SCALE);        // 0..1
    const impressionability = new Float32Array(SIM_SCALE);// 0..1
    const baselineStance = new Float32Array(SIM_SCALE);   // initial generated stance memory
    const stance = new Float32Array(SIM_SCALE);           // -128..127
    const nextStance = new Float32Array(SIM_SCALE);
    const mask = new Uint8Array(SIM_SCALE);               // 0/1
    const friendIndex = new Uint32Array(SIM_SCALE);
    const neighborBudget = new Uint8Array(SIM_SCALE);     // 0..8
    const isPlayer = new Uint8Array(SIM_SCALE);           // 0/1
    const isDeadCell = new Uint8Array(SIM_SCALE);         // 0/1 immutable stance cells
    const pressure = new Float32Array(SIM_SCALE);         // -1..1
    const nextPressure = new Float32Array(SIM_SCALE);
    const playerInfluenceMask = new Float32Array(SIM_SCALE); // 0..1 smooth manipulation influence weight
    const baseFriendIndex = new Uint32Array(SIM_SCALE);
    const baseNeighborBudget = new Uint8Array(SIM_SCALE);
    const baseIsDeadCell = new Uint8Array(SIM_SCALE);

    let simReady = false;
    let isRunning = true;
    let simulationDay = 0;
    let hoveredPlayerIndex = null;
    let playerOverlayDirty = true;
    let stopped = false;
    let frameHandle = 0;
    let listHeightSyncRaf = 0;
    let stepAccumulatorMs = 0;
    let lastFrameTimeMs = 0;
    let pendingSessionPlayers: SessionSimulationPlayer[] | null = null;
    let lastSessionPlayersSignature = "";
    let resizeObserver: ResizeObserver | null = null;

    const playersByIndex = new Map();
    const markerElementsByIndex = new Map();
    const listElementsByIndex = new Map();

    function susceptibility(i) {
        const ageFactor = 1 - 0.45 * clamp(age[i] / 100, 0, 1);
        const openFactor = 0.35 + 0.65 * impressionability[i];
        const eduFactor = 1 - 0.60 * education[i];
        return clamp(ageFactor * openFactor * eduFactor, 0.05, 1.0);
    }

    function playerNameFor(index, suppliedName) {
        if (suppliedName) {
            return suppliedName;
        }
        const existing = playersByIndex.get(index);
        if (existing) {
            return existing.name;
        }
        return `Player ${index}`;
    }

    function buildPlayerTooltipText(index) {
        const player = playersByIndex.get(index);
        if (!player) {
            return "";
        }
        return `${player.name}`;
    }

    function showPlayerTooltip(index, clientX, clientY) {
        const overlayRect = playerOverlay.getBoundingClientRect();
        const x = clamp(clientX - overlayRect.left + 12, 0, Math.max(0, overlayRect.width - 4));
        const y = clamp(clientY - overlayRect.top + 12, 0, Math.max(0, overlayRect.height - 4));
        playerTooltip.textContent = buildPlayerTooltipText(index);
        playerTooltip.style.left = `${x}px`;
        playerTooltip.style.top = `${y}px`;
        playerTooltip.style.display = "block";
    }

    function hidePlayerTooltip() {
        playerTooltip.style.display = "none";
    }

    function syncPlayersListHeight() {
        if (!(playersList instanceof HTMLUListElement)) {
            return;
        }

        const canvasRect = canvas.getBoundingClientRect();
        const targetHeight = Math.max(220, Math.floor(canvasRect.height));
        playersList.style.height = `${targetHeight}px`;
        playersList.style.maxHeight = `${targetHeight}px`;
    }

    function ensurePlayerRowVisible(index) {
        if (!(playersList instanceof HTMLUListElement)) {
            return;
        }

        const row = listElementsByIndex.get(index);
        if (!(row instanceof HTMLElement)) {
            return;
        }

        const listRect = playersList.getBoundingClientRect();
        const rowRect = row.getBoundingClientRect();
        const outsideTop = rowRect.top < listRect.top;
        const outsideBottom = rowRect.bottom > listRect.bottom;

        if (outsideTop || outsideBottom) {
            row.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
    }

    function setHoveredPlayer(index, clientX, clientY, showTooltip, scrollToVisible = false) {
        hoveredPlayerIndex = index;

        markerElementsByIndex.forEach((marker, markerIndex) => {
            marker.classList.toggle("is-highlighted", index === markerIndex);
        });
        listElementsByIndex.forEach((row, rowIndex) => {
            row.classList.toggle("is-highlighted", index === rowIndex);
        });

        if (index !== null && showTooltip) {
            showPlayerTooltip(index, clientX, clientY);
        } else {
            hidePlayerTooltip();
        }

        if (index !== null && scrollToVisible) {
            ensurePlayerRowVisible(index);
        }
    }

    function rebuildPlayerOverlay() {
        setHoveredPlayer(null, 0, 0, false);
        playerOverlay.innerHTML = "";
        markerElementsByIndex.clear();

        const players = Array.from(playersByIndex.values()).sort((a, b) => a.index - b.index);
        for (let i = 0; i < players.length; i += 1) {
            const p = players[i];
            const x = p.index % SIM_WIDTH;
            const y = Math.floor(p.index / SIM_WIDTH);

            const marker = document.createElement("span");
            marker.className = "player-marker";
            marker.style.left = `${((x + 0.5) / SIM_WIDTH) * 100}%`;
            marker.style.top = `${((y + 0.5) / SIM_HEIGHT) * 100}%`;
            marker.addEventListener("mouseenter", (ev) => {
                setHoveredPlayer(p.index, ev.clientX, ev.clientY, true, true);
            });
            marker.addEventListener("mousemove", (ev) => {
                setHoveredPlayer(p.index, ev.clientX, ev.clientY, true);
            });
            marker.addEventListener("mouseleave", () => {
                setHoveredPlayer(null, 0, 0, false);
            });

            playerOverlay.appendChild(marker);
            markerElementsByIndex.set(p.index, marker);
        }

        playerOverlayDirty = false;
    }

    function renderPlayersUi() {
        if (!(playersList instanceof HTMLUListElement)) {
            return;
        }

        playersList.innerHTML = "";
        listElementsByIndex.clear();

        const players = Array.from(playersByIndex.values()).sort((a, b) => a.index - b.index);
        if (players.length === 0) {
            const empty = document.createElement("li");
            empty.className = "players-empty";
            empty.textContent = "No active players in this room yet.";
            playersList.appendChild(empty);
            return;
        }

        for (let i = 0; i < players.length; i += 1) {
            const p = players[i];
            const li = document.createElement("li");
            li.className = "player-row";
            li.setAttribute("data-player-index", String(p.index));

            const positivePoints = Number(p.positivePoints ?? 0);
            const negativePoints = Number(p.negativePoints ?? 0);
            const total = positivePoints + negativePoints;
            const accuracy = total > 0 ? Math.round((positivePoints / total) * 100) : 0;
            const balance = positivePoints - negativePoints;

            const topRow = document.createElement("div");
            topRow.className = "player-row-top";

            const name = document.createElement("span");
            name.className = "player-row-name";
            name.textContent = p.name;

            const net = document.createElement("span");
            net.className = `player-row-balance ${balance >= 0 ? "positive" : "negative"}`;
            net.textContent = balance >= 0 ? `+${balance}` : `${balance}`;

            topRow.appendChild(name);
            topRow.appendChild(net);

            const valuesRow = document.createElement("div");
            valuesRow.className = "player-row-values";

            const plus = document.createElement("span");
            plus.textContent = `+${positivePoints}`;
            const minus = document.createElement("span");
            minus.textContent = `-${negativePoints}`;
            const pct = document.createElement("span");
            pct.textContent = `${accuracy}%`;

            valuesRow.appendChild(plus);
            valuesRow.appendChild(minus);
            valuesRow.appendChild(pct);

            li.appendChild(topRow);
            li.appendChild(valuesRow);

            li.addEventListener("mouseenter", () => {
                setHoveredPlayer(p.index, 0, 0, false);
            });
            li.addEventListener("mouseleave", () => {
                setHoveredPlayer(null, 0, 0, false);
            });

            playersList.appendChild(li);
            listElementsByIndex.set(p.index, li);

            if (hoveredPlayerIndex === p.index) {
                li.classList.add("is-highlighted");
            }
        }

        if (hoveredPlayerIndex !== null) {
            ensurePlayerRowVisible(hoveredPlayerIndex);
        }
    }

    function addPlayerAtIndex(rawIndex, rawStance, rawName, options = {}) {
        const silent = !!options.silent;

        if (!simReady) {
            if (!silent) {
                statusEl.textContent = "Simulation not ready yet.";
            }
            return;
        }

        const index = Math.floor(rawIndex);
        if (!Number.isFinite(index) || index < 0 || index >= SIM_SCALE) {
            if (!silent) {
                statusEl.textContent = `Invalid index. Use 0..${SIM_SCALE - 1}.`;
            }
            return;
        }
        if (!mask[index]) {
            if (!silent) {
                statusEl.textContent = "Selected index is outside map alpha area.";
            }
            return;
        }

        const fixedStance = clamp(Number.isFinite(rawStance) ? rawStance : 127, -128, 127);
        const name = playerNameFor(index, rawName);

        isPlayer[index] = 1;
        isDeadCell[index] = 0;
        stance[index] = fixedStance;
        nextStance[index] = fixedStance;
        pressure[index] = stanceToSignal(fixedStance);
        neighborBudget[index] = 8;

        playersByIndex.set(index, {
            index,
            id: options.playerId || name,
            name,
            positivePoints: Number(options.positivePoints ?? 0),
            negativePoints: Number(options.negativePoints ?? 0)
        });
        playerOverlayDirty = true;

        const px = index % SIM_WIDTH;
        const py = Math.floor(index / SIM_WIDTH);
        for (let oy = -1; oy <= 1; oy += 1) {
            for (let ox = -1; ox <= 1; ox += 1) {
                if (ox === 0 && oy === 0) {
                    continue;
                }
                const nx = px + ox;
                const ny = py + oy;
                if (nx < 0 || ny < 0 || nx >= SIM_WIDTH || ny >= SIM_HEIGHT) {
                    continue;
                }
                const ni = idx(nx, ny);
                if (!mask[ni] || isPlayer[ni]) {
                    continue;
                }
                friendIndex[ni] = index;
                neighborBudget[ni] = 8;
            }
        }

        renderPlayersUi();
        if (!silent) {
            statusEl.textContent = `Player ${name} added at index ${index} with stance ${fixedStance.toFixed(0)}.`;
        }
    }

    function hashString(value: string) {
        let hash = 2166136261;
        for (let i = 0; i < value.length; i += 1) {
            hash ^= value.charCodeAt(i);
            hash = Math.imul(hash, 16777619);
        }
        return hash >>> 0;
    }

    function getStanceFromServerPlayer(player: SessionSimulationPlayer) {
        if (Number.isFinite(player.stance)) {
            return clamp(Number(player.stance), -128, 127);
        }

        const positive = Number(player.positivePoints ?? 0);
        const negative = Number(player.negativePoints ?? 0);
        const total = positive + negative;
        if (total <= 0) {
            return 0;
        }

        const normalized = (positive - negative) / total;
        return clamp(Math.round(normalized * 127), -128, 127);
    }

    function getPlayersSignature(players: SessionSimulationPlayer[]) {
        return players
            .map((player) => `${player.id}:${player.name}:${player.positivePoints ?? 0}:${player.negativePoints ?? 0}:${player.stance ?? ""}`)
            .sort()
            .join("|");
    }

    function pickIndexForPlayer(seed: number, occupied: Set<number>) {
        for (let probe = 0; probe < SIM_SCALE; probe += 1) {
            const candidate = (seed + probe * 7919) % SIM_SCALE;
            if (mask[candidate] && !occupied.has(candidate)) {
                return candidate;
            }
        }
        return -1;
    }

    function clearSessionPlayers() {
        isPlayer.fill(0);
        isDeadCell.set(baseIsDeadCell);
        friendIndex.set(baseFriendIndex);
        neighborBudget.set(baseNeighborBudget);
        playersByIndex.clear();
        markerElementsByIndex.clear();
        listElementsByIndex.clear();
        playerOverlayDirty = true;
        setHoveredPlayer(null, 0, 0, false);
    }

    function syncSessionPlayers(sessionPlayers: SessionSimulationPlayer[]) {
        const players = Array.isArray(sessionPlayers)
            ? sessionPlayers
                .filter((player) => !!player && typeof player.id === "string")
                .map((player) => ({
                    id: String(player.id),
                    name: String(player.name || `Player ${player.id.slice(0, 6)}`),
                    positivePoints: Number(player.positivePoints ?? 0),
                    negativePoints: Number(player.negativePoints ?? 0),
                    stance: player.stance
                }))
            : [];

        if (!simReady) {
            pendingSessionPlayers = players;
            return;
        }

        const signature = getPlayersSignature(players);
        if (signature === lastSessionPlayersSignature) {
            return;
        }
        lastSessionPlayersSignature = signature;

        clearSessionPlayers();
        const occupied = new Set<number>();

        const sortedPlayers = players.slice().sort((a, b) => a.id.localeCompare(b.id));
        for (let i = 0; i < sortedPlayers.length; i += 1) {
            const player = sortedPlayers[i];
            const seed = hashString(`${player.id}:${player.name}`);
            const index = pickIndexForPlayer(seed, occupied);
            if (index < 0) {
                continue;
            }

            occupied.add(index);
            addPlayerAtIndex(index, getStanceFromServerPlayer(player), player.name, {
                silent: true,
                playerId: player.id,
                positivePoints: player.positivePoints,
                negativePoints: player.negativePoints
            });
        }

        renderPlayersUi();
    }

    async function loadMask() {
        const candidates = ["/simulation/map.png", "/map.png", "map.png"];

        const loadImage = (src: string) => {
            return new Promise<HTMLImageElement>((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error(`Failed to load ${src}`));
                img.src = src;
            });
        };

        for (let c = 0; c < candidates.length; c += 1) {
            try {
                const img = await loadImage(candidates[c]);

                const offscreen = document.createElement("canvas");
                offscreen.width = SIM_WIDTH;
                offscreen.height = SIM_HEIGHT;
                const offCtx = offscreen.getContext("2d", { willReadFrequently: true });
                if (!offCtx) {
                    continue;
                }
                offCtx.drawImage(img, 0, 0, SIM_WIDTH, SIM_HEIGHT);

                const pixels = offCtx.getImageData(0, 0, SIM_WIDTH, SIM_HEIGHT).data;
                for (let i = 0; i < SIM_SCALE; i += 1) {
                    mask[i] = pixels[i * 4 + 3] > 80 ? 1 : 0;
                }
                return true;
            } catch (_err) {
                // Try next candidate path.
            }
        }

        return false;
    }

    function initArrays() {
        for (let i = 0; i < SIM_SCALE; i += 1) {
            if (!mask[i]) {
                population[i] = 0;
                age[i] = 0;
                education[i] = 0;
                impressionability[i] = 0;
                baselineStance[i] = 0;
                stance[i] = 0;
                nextStance[i] = 0;
                pressure[i] = 0;
                nextPressure[i] = 0;
                friendIndex[i] = i;
                neighborBudget[i] = 0;
                isPlayer[i] = 0;
                isDeadCell[i] = 0;
                continue;
            }

            // 2D position from 1D index.
            const x = i % SIM_WIDTH;
            const y = Math.floor(i / SIM_WIDTH);
            const nx = x / SIM_WIDTH;
            const ny = y / SIM_HEIGHT;

            // Region fields (Perlin-like): coherent areas instead of white noise.
            const urban = fbm2D(nx * INIT.urbanScale + 11.3, ny * INIT.urbanScale + 7.7, 101);
            const economy = fbm2D(nx * INIT.economyScale + 3.9, ny * INIT.economyScale + 27.1, 211);
            const ageRegion = fbm2D(nx * INIT.ageScale + 39.0, ny * INIT.ageScale + 5.0, 307);
            const ideologyMacro = fbm2D(nx * INIT.ideologyMacroScale + 17.0, ny * INIT.ideologyMacroScale + 13.0, 401);
            const ideologyMeso = fbm2D(nx * INIT.ideologyMesoScale + 29.0, ny * INIT.ideologyMesoScale + 19.0, 503);
            const grain = (hash01(i * 9781 + 91) - 0.5) * 2;

            // Population density: city/rural structure.
            population[i] = clamp(
                INIT.populationBase + urban * INIT.populationUrbanWeight + grain * INIT.populationGrainWeight,
                INIT.populationMin,
                1.0
            );

            // Demographics correlated to regions (still with local randomness).
            age[i] = clamp(16 + ageRegion * 58 + (hash01(i * 1129 + 7) - 0.5) * 12, 12, 95);
            education[i] = clamp(0.16 + economy * 0.68 + urban * 0.16 + grain * 0.08, 0, 1);
            impressionability[i] = clamp(
                0.10 + (1 - education[i]) * 0.45 + (1 - age[i] / 100) * 0.28 + (hash01(i * 3313 + 19) - 0.5) * 0.16,
                0,
                1
            );

            // Ideological blocks + local grain.
            const bloc = (ideologyMacro - 0.5) * 2 * INIT.ideologyMacroContrast + (ideologyMeso - 0.5) * 2 * INIT.ideologyMesoContrast;
            const personal = grain * INIT.personalContrast + (hash01(i * 7919 + 17) - 0.5) * INIT.microNoiseContrast;
            let start = clamp(bloc + personal, -128, 127);

            // Small stubborn cohort for realistic non-changing minorities.
            const stubborn = hash01(i * 6113 + 43);
            if (stubborn > INIT.stubbornStrongChance) {
                const sign = start >= 0 ? 1 : -1;
                start = sign * clamp(Math.abs(start) + 26, 55, 127);
                impressionability[i] = Math.min(impressionability[i], 0.03);
            } else if (stubborn > INIT.stubbornMediumChance) {
                const sign = start >= 0 ? 1 : -1;
                start = sign * clamp(Math.abs(start) + 14, 35, 127);
                impressionability[i] = Math.min(impressionability[i], 0.08);
            }

            // Fully frozen cells: their stance never changes during simulation.
            isDeadCell[i] = hash01(i * 1871 + 57) < INIT.deadCellChance ? 1 : 0;
            if (isDeadCell[i]) {
                impressionability[i] = 0;
            }

            stance[i] = start;
            baselineStance[i] = start;
            nextStance[i] = start;
            pressure[i] = clamp(stanceToSignal(start) * 0.18, -1, 1);
            nextPressure[i] = 0;
            isPlayer[i] = 0;

            // Mostly local friends with occasional long-distance links.
            const localFriend = hash01(i * 1223 + 99) < INIT.localFriendChance;
            if (localFriend) {
                const radius = INIT.localFriendRadius;
                const ox = Math.floor((hash01(i * 2027 + 33) - 0.5) * radius * 2);
                const oy = Math.floor((hash01(i * 3049 + 55) - 0.5) * radius * 2);
                const fx = clamp(x + ox, 0, SIM_WIDTH - 1);
                const fy = clamp(y + oy, 0, SIM_HEIGHT - 1);
                friendIndex[i] = idx(fx, fy);
            } else {
                friendIndex[i] = Math.floor(hash01(i * 9109 + 71) * SIM_SCALE) >>> 0;
            }

            neighborBudget[i] = Math.floor(clamp(1 + population[i] * 7 + hash01(i * 4093 + 11) * 1.5, 1, 8));
        }

        baseFriendIndex.set(friendIndex);
        baseNeighborBudget.set(neighborBudget);
        baseIsDeadCell.set(isDeadCell);
    }

    function runStanceStep() {
        simulationDay += 1;

        for (let y = 0; y < SIM_HEIGHT; y += 1) {
            for (let x = 0; x < SIM_WIDTH; x += 1) {
                const i = idx(x, y);
                if (!mask[i] || population[i] <= 0) {
                    nextStance[i] = 0;
                    continue;
                }
                if (isPlayer[i]) {
                    nextStance[i] = stance[i];
                    continue;
                }
                if (isDeadCell[i]) {
                    nextStance[i] = stance[i];
                    continue;
                }

                const current = stance[i];
                const open = susceptibility(i);
                const conviction = Math.pow(Math.abs(current) / 127, 1.2);

                let localSum = 0;
                let localWeight = 0;
                let playerSum = 0;
                let playerCount = 0;

                const startNeighbor = Math.floor(hash01(i * 4099 + simulationDay * 977) * 8) & 7;
                const stride = 1 + 2 * (Math.floor(hash01(i * 12289 + simulationDay * 1597) * 4) & 3); // 1,3,5,7
                const includeProb = clamp(neighborBudget[i] / 8, 0, 1);

                for (let step = 0; step < 8; step += 1) {
                    const n = (startNeighbor + step * stride) & 7;
                    const offset = NEIGHBORS[n];
                    const nx = x + offset[0];
                    const ny = y + offset[1];
                    if (nx < 0 || ny < 0 || nx >= SIM_WIDTH || ny >= SIM_HEIGHT) {
                        continue;
                    }

                    const ni = idx(nx, ny);
                    if (!mask[ni] || population[ni] <= 0) {
                        continue;
                    }

                    if (!isPlayer[ni]) {
                        const r = hash01(i * 92821 + simulationDay * 4447 + n * 131 + step * 17);
                        if (r > includeProb) {
                            continue;
                        }
                    }

                    const ns = stance[ni];
                    const nsConv = Math.pow(Math.abs(ns) / 127, 1.1);
                    const w = (0.35 + 0.65 * nsConv) * (isPlayer[ni] ? SIM.playerLocalPull : 1.0);
                    localSum += ns * w;
                    localWeight += w;

                    if (isPlayer[ni]) {
                        playerSum += ns;
                        playerCount += 1;
                    }
                }

                let next = current;

                const drift = (hash01(i * 1583 + simulationDay * 271) - 0.5) * 2;
                next += drift * SIM.driftStrength * SIM.npcAutonomy * open * (1 - conviction * 0.65);

                if (localWeight > 0) {
                    const localAvg = localSum / localWeight;
                    const localPull = SIM.socialPull * SIM.npcAutonomy * open * (1 - conviction * 0.45);
                    next = lerp(next, localAvg, clamp(localPull, 0, 0.35));
                }

                // Keep natural simulation anchored to initial generated map profile.
                const baselinePull = SIM.baselineHold * (1 - 0.45 * open);
                next = lerp(next, baselineStance[i], clamp(baselinePull, 0, 0.35));

                if (playerCount > 0) {
                    const playerAvg = playerSum / playerCount;
                    const disagreement = Math.abs(playerAvg - current) / 254;
                    const oppositionBoost = 1 + SIM.playerOppositionBoost * disagreement;
                    const playerPull = clamp((0.18 + 0.08 * playerCount) * open * SIM.playerDominance * oppositionBoost, 0, 0.88);
                    next = lerp(next, playerAvg, playerPull);
                }

                const fi = friendIndex[i] % SIM_SCALE;
                if (mask[fi] && population[fi] > 0) {
                    const friend = stance[fi];
                    const chance = 0.10 + 0.20 * open + (isPlayer[fi] ? 0.35 : 0.0);
                    if (hash01(i * 9151 + simulationDay * 661) < chance) {
                        const diff = Math.abs(friend - next) / 254;
                        let friendPull = SIM.internetWeight * (0.04 + 0.13 * diff) * open;
                        if (isPlayer[fi]) {
                            friendPull *= SIM.playerFriendBoost * SIM.playerDominance;
                        }
                        next = lerp(next, friend, clamp(friendPull, 0, 0.65));
                    }
                }

                // Extra long-range internet contact (not tied to local graph).
                if (hash01(i * 12011 + simulationDay * 787) < SIM.internetContactChance) {
                    const ri = Math.floor(hash01(i * 22073 + simulationDay * 907) * SIM_SCALE) >>> 0;
                    if (mask[ri] && population[ri] > 0) {
                        const remote = stance[ri];
                        const remoteDiff = Math.abs(remote - next) / 254;
                        let remotePull = SIM.internetWeight * (0.02 + 0.09 * remoteDiff) * open;
                        if (isPlayer[ri]) {
                            remotePull *= SIM.playerFriendBoost * SIM.playerDominance;
                        }
                        next = lerp(next, remote, clamp(remotePull, 0, 0.45));
                    }
                }

                const influence = playerInfluenceMask[i];
                const p = influence > 0 ? clamp(pressure[i] * influence, -1, 1) : 0;
                if (Math.abs(p) > 0.01) {
                    const pressureTarget = p * 127;
                    const pressureDisagreement = Math.abs(pressureTarget - current) / 254;
                    const oppositionBoost = 1 + SIM.playerOppositionBoost * pressureDisagreement;
                    const pressurePull = clamp(Math.abs(p) * SIM.pressureToStance * open * SIM.playerDominance * oppositionBoost, 0, 0.45);
                    next = lerp(next, pressureTarget, pressurePull);
                }

                const maxShift = 2 + 8 * population[i] + 2 * Math.abs(p);
                nextStance[i] = clamp(current + clamp(next - current, -maxShift, maxShift), -128, 127);
            }
        }

        stance.set(nextStance);
    }

    function runPressureStep() {
        playerInfluenceMask.fill(0);

        for (let i = 0; i < SIM_SCALE; i += 1) {
            nextPressure[i] = mask[i] ? pressure[i] * SIM.pressureDecay : 0;
        }

        for (let pi = 0; pi < SIM_SCALE; pi += 1) {
            if (!isPlayer[pi] || !mask[pi]) {
                continue;
            }

            const px = pi % SIM_WIDTH;
            const py = Math.floor(pi / SIM_WIDTH);
            const signal = stanceToSignal(stance[pi]);
            nextPressure[pi] = signal;

            // Build smooth manipulation field from min to max range.
            const minRange = Math.max(0, SIM.playerManipulationMinRange);
            const maxRange = Math.max(minRange + 0.001, SIM.playerManipulationMaxRange);
            const range = Math.ceil(maxRange);
            for (let my = -range; my <= range; my += 1) {
                const yy = py + my;
                if (yy < 0 || yy >= SIM_HEIGHT) {
                    continue;
                }
                for (let mx = -range; mx <= range; mx += 1) {
                    const xx = px + mx;
                    if (xx < 0 || xx >= SIM_WIDTH) {
                        continue;
                    }
                    const dist = Math.sqrt(mx * mx + my * my);
                    if (dist > maxRange) {
                        continue;
                    }
                    let influence = 1;
                    if (dist > minRange) {
                        const t = (dist - minRange) / (maxRange - minRange);
                        influence = 1 - smooth01(t);
                    }
                    const mi = idx(xx, yy);
                    if (influence > playerInfluenceMask[mi]) {
                        playerInfluenceMask[mi] = influence;
                    }
                }
            }

            for (let dy = -SIM.pressureRadius; dy <= SIM.pressureRadius; dy += 1) {
                const ny = py + dy;
                if (ny < 0 || ny >= SIM_HEIGHT) {
                    continue;
                }
                for (let dx = -SIM.pressureRadius; dx <= SIM.pressureRadius; dx += 1) {
                    const nx = px + dx;
                    if (nx < 0 || nx >= SIM_WIDTH) {
                        continue;
                    }
                    const ni = idx(nx, ny);
                    if (!mask[ni] || isPlayer[ni] || isDeadCell[ni]) {
                        continue;
                    }
                    const dist = Math.sqrt(dx * dx + dy * dy);
                    if (dist > SIM.pressureRadius) {
                        continue;
                    }
                    const falloff = 1 - dist / (SIM.pressureRadius + 0.001);
                    const manipulationWeight = playerInfluenceMask[ni];
                    if (manipulationWeight <= 0) {
                        continue;
                    }
                    const targetSignal = stanceToSignal(stance[ni]);
                    const disagreement = Math.abs(signal - targetSignal) * 0.5;
                    const oppositionBoost = 1 + SIM.playerOppositionBoost * disagreement;
                    nextPressure[ni] += signal * SIM.pressureSeed * falloff * manipulationWeight * susceptibility(ni) * oppositionBoost;
                }
            }
        }

        // Mild endogenous spread from already opinionated cells, but only inside
        // active player manipulation zones.
        for (let i = 0; i < SIM_SCALE; i += 1) {
            const manipulationWeight = playerInfluenceMask[i];
            if (!mask[i] || isPlayer[i] || isDeadCell[i] || manipulationWeight <= 0) {
                continue;
            }
            const source = stanceToSignal(stance[i]);
            const magnitude = Math.abs(source);
            if (magnitude < 0.3) {
                continue;
            }

            const sx = i % SIM_WIDTH;
            const sy = Math.floor(i / SIM_WIDTH);
            const leak = 0.02 * magnitude * susceptibility(i) * manipulationWeight;

            for (let n = 0; n < 8; n += 1) {
                const nx = sx + NEIGHBORS[n][0];
                const ny = sy + NEIGHBORS[n][1];
                if (nx < 0 || ny < 0 || nx >= SIM_WIDTH || ny >= SIM_HEIGHT) {
                    continue;
                }
                const ni = idx(nx, ny);
                const neighborWeight = playerInfluenceMask[ni];
                if (!mask[ni] || isPlayer[ni] || isDeadCell[ni] || neighborWeight <= 0) {
                    continue;
                }
                nextPressure[ni] += source * leak * neighborWeight;
            }
        }

        // Neighborhood mixing keeps fronts smooth.
        for (let i = 0; i < SIM_SCALE; i += 1) {
            const manipulationWeight = playerInfluenceMask[i];
            if (!mask[i] || isPlayer[i] || isDeadCell[i] || manipulationWeight <= 0) {
                continue;
            }

            const x = i % SIM_WIDTH;
            const y = Math.floor(i / SIM_WIDTH);
            let sum = 0;
            let count = 0;

            for (let n = 0; n < 8; n += 1) {
                const nx = x + NEIGHBORS[n][0];
                const ny = y + NEIGHBORS[n][1];
                if (nx < 0 || ny < 0 || nx >= SIM_WIDTH || ny >= SIM_HEIGHT) {
                    continue;
                }
                const ni = idx(nx, ny);
                if (!mask[ni] || playerInfluenceMask[ni] <= 0) {
                    continue;
                }
                sum += nextPressure[ni];
                count += 1;
            }

            if (count > 0) {
                const avg = sum / count;
                nextPressure[i] = lerp(nextPressure[i], avg, SIM.pressureMix * manipulationWeight);
            }
        }

        for (let i = 0; i < SIM_SCALE; i += 1) {
            if (playerInfluenceMask[i] <= 0 && !isPlayer[i]) {
                pressure[i] = 0;
            } else if (isDeadCell[i]) {
                pressure[i] = 0;
            } else {
                pressure[i] = clamp(nextPressure[i], -1, 1);
            }
        }
    }

    function simulationStep() {
        runStanceStep();
        runPressureStep();
    }

    function mixColor(a, b, t) {
        return [
            Math.round(a[0] + (b[0] - a[0]) * t),
            Math.round(a[1] + (b[1] - a[1]) * t),
            Math.round(a[2] + (b[2] - a[2]) * t)
        ];
    }

    function getColorForStance(stanceValue, density, darkMode) {
        const t = clamp((stanceValue + 128) / 255, 0, 1);
        const red = [255, 0, 0];
        const center = darkMode ? [110, 114, 122] : [126, 130, 138];
        const blue = [0, 0, 255];

        if (t <= 0.01) {
            return red;
        }
        if (t >= 0.99) {
            return blue;
        }

        let base;
        if (t < 0.5) {
            base = mixColor(red, center, t * 2);
        } else {
            base = mixColor(center, blue, (t - 0.5) * 2);
        }

        const edgeStrength = Math.pow(Math.abs(t - 0.5) * 2, 1.05);
        const vivid = t < 0.5
            ? mixColor(base, red, edgeStrength * 0.32)
            : mixColor(base, blue, edgeStrength * 0.32);

        const light = darkMode
            ? (0.90 + density * 0.10)
            : (0.88 + density * 0.10);

        return [
            clamp(Math.round(vivid[0] * light), 0, 255),
            clamp(Math.round(vivid[1] * light), 0, 255),
            clamp(Math.round(vivid[2] * light), 0, 255)
        ];
    }

    function renderSimulation() {
        if (!simReady) {
            return;
        }

        const darkMode = document.documentElement.classList.contains("dark");

        const image = ctx.createImageData(SIM_WIDTH, SIM_HEIGHT);
        const data = image.data;

        let avg = 0;
        let active = 0;
        let players = 0;

        for (let i = 0; i < SIM_SCALE; i += 1) {
            const p = i * 4;
            if (!mask[i]) {
                data[p + 0] = 0;
                data[p + 1] = 0;
                data[p + 2] = 0;
                data[p + 3] = 0;
                continue;
            }

            let c = getColorForStance(stance[i], population[i], darkMode);
            if (isPlayer[i]) {
                c = darkMode ? [0, 255, 190] : [0, 242, 180];
                players += 1;
            }

            data[p + 0] = c[0];
            data[p + 1] = c[1];
            data[p + 2] = c[2];
            data[p + 3] = 255;

            avg += stance[i];
            active += 1;
        }

        ctx.putImageData(image, 0, 0);

        if (playerOverlayDirty) {
            rebuildPlayerOverlay();
        }
        renderPlayersUi();

        const avgStance = active > 0 ? avg / active : 0;
        statusEl.textContent = `Day ${Math.round(simulationDay / 10)} | Avg stance ${avgStance.toFixed(1)} | Cells ${active} | Players ${players}`;
    }

    function frame(nowMs = 0) {
        if (stopped) {
            return;
        }

        if (!lastFrameTimeMs) {
            lastFrameTimeMs = nowMs;
        }

        const deltaMs = clamp(nowMs - lastFrameTimeMs, 0, 250);
        lastFrameTimeMs = nowMs;

        if (simReady && isRunning) {
            const stepMs = 1000 / Math.max(1, SIM.stepsPerSecond);
            stepAccumulatorMs += deltaMs;

            let executedSteps = 0;
            while (stepAccumulatorMs >= stepMs && executedSteps < SIM.maxCatchUpSteps) {
                simulationStep();
                stepAccumulatorMs -= stepMs;
                executedSteps += 1;
            }

            if (executedSteps === SIM.maxCatchUpSteps && stepAccumulatorMs >= stepMs) {
                // Keep motion smooth after tab throttling without jumping too far ahead.
                stepAccumulatorMs = stepMs * 0.5;
            }
        }
        renderSimulation();
        frameHandle = requestAnimationFrame(frame);
    }

    async function initSimulation() {
        statusEl.textContent = "Loading mask...";
        const loaded = await loadMask();
        if (stopped) {
            return;
        }

        if (!loaded) {
            statusEl.textContent = "Failed to load /simulation/map.png (alpha map required).";
            return;
        }

        initArrays();
        simReady = true;
        statusEl.textContent = "Mask loaded from map alpha. Running.";
        syncPlayersListHeight();

        if (pendingSessionPlayers) {
            syncSessionPlayers(pendingSessionPlayers);
            pendingSessionPlayers = null;
        }
    }

    const onResize = () => {
        playerOverlayDirty = true;

        if (listHeightSyncRaf) {
            cancelAnimationFrame(listHeightSyncRaf);
        }
        listHeightSyncRaf = requestAnimationFrame(() => {
            listHeightSyncRaf = 0;
            syncPlayersListHeight();
        });
    };

    const onToggleClick = () => {
        if (!(toggleBtn instanceof HTMLButtonElement)) {
            return;
        }
        isRunning = !isRunning;
        if (!isRunning) {
            stepAccumulatorMs = 0;
        }
        toggleBtn.textContent = isRunning ? "Pause" : "Resume";
    };

    let stop = () => {
        if (stopped) {
            return;
        }

        stopped = true;
        cancelAnimationFrame(frameHandle);
        if (toggleBtn instanceof HTMLButtonElement) {
            toggleBtn.removeEventListener("click", onToggleClick);
        }
        window.removeEventListener("resize", onResize);
        if (resizeObserver) {
            resizeObserver.disconnect();
            resizeObserver = null;
        }
        if (listHeightSyncRaf) {
            cancelAnimationFrame(listHeightSyncRaf);
            listHeightSyncRaf = 0;
        }
        playerOverlay.innerHTML = "";
        if (playersList instanceof HTMLUListElement) {
            playersList.innerHTML = "";
        }
        hidePlayerTooltip();
    };

    if (toggleBtn instanceof HTMLButtonElement) {
        toggleBtn.addEventListener("click", onToggleClick);
    }

    window.addEventListener("resize", onResize);

    if (typeof ResizeObserver !== "undefined") {
        resizeObserver = new ResizeObserver(onResize);
        resizeObserver.observe(canvas);
    }

    syncPlayersListHeight();

    void initSimulation();
    frameHandle = requestAnimationFrame(frame);

    return {
        stop,
        setPlayers: (players: SessionSimulationPlayer[]) => {
            syncSessionPlayers(players);
        },
        setSimulationEffects: (effectIds: string[]) => {
            applySimulationEffectModifiers(effectIds);
        }
    };
}

