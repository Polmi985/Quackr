import { doc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import { useItem, getUserInventory } from './userInventoryService';

const EFFECTS_COLLECTION = 'user_active_effects';

// ── Types ──

export interface ActiveEffect {
  itemId: string;
  activatedAt: string; // ISO
  expiresAt: string | null; // null = count-based
  remainingUses: number | null; // null = time-based
}

export interface UserActiveEffects {
  effects: ActiveEffect[];
}

// ── Effect durations / counts ──

const EFFECT_CONFIG: Record<string, { type: 'time' | 'count'; duration?: number; uses?: number }> = {
  score_boost_2x_10: { type: 'count', uses: 10 },
  score_boost_2x_25: { type: 'count', uses: 25 },
  coin_magnet_1h: { type: 'time', duration: 3600000 },
  safety_net_1: { type: 'count', uses: 1 },
  wide_wave_30m: { type: 'time', duration: 1800000 },
  laser_focus_30m: { type: 'time', duration: 1800000 },
  echo_chamber_20m: { type: 'time', duration: 1200000 },
  civic_shield_30m: { type: 'time', duration: 1800000 },
  viral_spread_25m: { type: 'time', duration: 1500000 },
  deep_roots_30m: { type: 'time', duration: 1800000 },
  social_fracture_15m: { type: 'time', duration: 900000 },
  mind_fog_20m: { type: 'time', duration: 1200000 },
  grassroots_30m: { type: 'time', duration: 1800000 },
};

// ── Public API ──

/**
 * Get all active (non-expired) effects for a user
 */
export async function getActiveEffects(userId: string): Promise<ActiveEffect[]> {
  const ref = doc(db, EFFECTS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return [];

  const data = snap.data() as UserActiveEffects;
  const now = Date.now();

  // Filter out expired effects
  const active = (data.effects || []).filter((e) => {
    if (e.expiresAt && new Date(e.expiresAt).getTime() < now) return false;
    if (e.remainingUses !== null && e.remainingUses <= 0) return false;
    return true;
  });

  // If we pruned any, update Firestore
  if (active.length !== (data.effects || []).length) {
    await updateDoc(ref, { effects: active });
  }

  return active;
}

/**
 * Activate an effect from inventory. Consumes the item.
 */
export async function activateEffect(userId: string, itemId: string): Promise<boolean> {
  const config = EFFECT_CONFIG[itemId];
  if (!config) return false;

  // Consume from inventory
  const consumed = await useItem(userId, itemId);
  if (!consumed) return false;

  const now = new Date();
  const effect: ActiveEffect = {
    itemId,
    activatedAt: now.toISOString(),
    expiresAt: config.type === 'time' && config.duration
      ? new Date(now.getTime() + config.duration).toISOString()
      : null,
    remainingUses: config.type === 'count' ? (config.uses ?? 1) : null,
  };

  const ref = doc(db, EFFECTS_COLLECTION, userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    await setDoc(ref, { effects: [effect] });
  } else {
    const data = snap.data() as UserActiveEffects;
    const effects = [...(data.effects || []), effect];
    await updateDoc(ref, { effects });
  }

  return true;
}

/**
 * Returns true when shop item can be activated as an effect.
 */
export function isActivatableEffectItem(itemId: string): boolean {
  return !!EFFECT_CONFIG[itemId];
}

/**
 * Decrement a use-count effect. Returns true if effect was still active.
 */
export async function decrementEffect(userId: string, itemId: string): Promise<boolean> {
  const ref = doc(db, EFFECTS_COLLECTION, userId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return false;

  const data = snap.data() as UserActiveEffects;
  const effects = [...(data.effects || [])];
  const idx = effects.findIndex((e) => e.itemId === itemId && (e.remainingUses === null || e.remainingUses > 0));
  if (idx === -1) return false;

  if (effects[idx].remainingUses !== null) {
    effects[idx] = { ...effects[idx], remainingUses: effects[idx].remainingUses! - 1 };
    if (effects[idx].remainingUses! <= 0) {
      effects.splice(idx, 1);
    }
  }

  await updateDoc(ref, { effects });
  return true;
}

/**
 * Check if a specific effect is currently active
 */
export function isEffectActive(effects: ActiveEffect[], itemId: string): boolean {
  return effects.some((e) => e.itemId === itemId);
}

/**
 * Get the current score multiplier from active effects
 */
export function getScoreMultiplier(effects: ActiveEffect[]): number {
  if (effects.some((e) => e.itemId === 'score_boost_2x_10' || e.itemId === 'score_boost_2x_25')) return 2;
  return 1;
}

/**
 * Get the current coin bonus multiplier
 */
export function getCoinMultiplier(effects: ActiveEffect[]): number {
  return effects.some((e) => e.itemId === 'coin_magnet_1h') ? 1.5 : 1;
}

/**
 * Deduct all active count-based score effects after a swipe
 */
export async function consumeSwipeEffects(userId: string): Promise<void> {
  const scoreEffects = ['score_boost_2x_10', 'score_boost_2x_25'];
  for (const eid of scoreEffects) {
    await decrementEffect(userId, eid);
  }
}

/**
 * Get quick summary of active effects for the frontend
 */
export async function getEffectsSummary(userId: string): Promise<{
  scoreMultiplier: number;
  coinMultiplier: number;
  hasSafetyNet: boolean;
  activeEffectIds: string[];
}> {
  const effects = await getActiveEffects(userId);
  return {
    scoreMultiplier: getScoreMultiplier(effects),
    coinMultiplier: getCoinMultiplier(effects),
    hasSafetyNet: isEffectActive(effects, 'safety_net_1'),
    activeEffectIds: effects.map((e) => e.itemId),
  };
}
