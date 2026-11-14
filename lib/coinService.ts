import { doc, getDoc, setDoc, updateDoc, increment, Timestamp, collection, addDoc, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { db } from './firebase';

// ── Firestore collection ──
const COINS_COLLECTION = 'user_coins';
const COIN_HISTORY_COLLECTION = 'coin_transactions';

// ── Interfaces ──
export interface UserCoinDoc {
  coins: number;
  totalEarned: number;
  totalSpent: number;
  lastDailyBonus: string | null; // "YYYY-MM-DD"
  lastStreakBonusMilestone: number; // last streak milestone that was rewarded
}

export interface CoinTransaction {
  userId: string;
  amount: number;
  reason: string;
  timestamp: Timestamp;
  balanceAfter?: number;
}

// ── Coin amounts ──
export const COIN_REWARDS = {
  CORRECT_SWIPE: 10,
  INCORRECT_SWIPE: 0,
  DAILY_LOGIN_BONUS: 25,
  STREAK_MILESTONE_BONUS: 100, // every 7 days
} as const;

// ── Helpers ──
function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// ── Public API ──

/**
 * Get user's current coin balance and metadata
 */
export async function getUserCoins(userId: string): Promise<UserCoinDoc> {
  const ref = doc(db, COINS_COLLECTION, userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const initial: UserCoinDoc = {
      coins: 0,
      totalEarned: 0,
      totalSpent: 0,
      lastDailyBonus: null,
      lastStreakBonusMilestone: 0,
    };
    await setDoc(ref, initial);
    return initial;
  }

  return snap.data() as UserCoinDoc;
}

/**
 * Add coins to user's balance (used after swipes, bonuses, etc.)
 */
export async function addCoins(userId: string, amount: number, reason: string): Promise<number> {
  if (amount <= 0) return (await getUserCoins(userId)).coins;

  const ref = doc(db, COINS_COLLECTION, userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    const newDoc: UserCoinDoc = {
      coins: amount,
      totalEarned: amount,
      totalSpent: 0,
      lastDailyBonus: null,
      lastStreakBonusMilestone: 0,
    };
    await setDoc(ref, newDoc);
  } else {
    await updateDoc(ref, {
      coins: increment(amount),
      totalEarned: increment(amount),
    });
  }

  // Log the transaction
  await addDoc(collection(db, COIN_HISTORY_COLLECTION), {
    userId,
    amount,
    reason,
    timestamp: Timestamp.now(),
  } as CoinTransaction);

  const updated = await getUserCoins(userId);
  return updated.coins;
}

/**
 * Spend coins from user's balance. Returns false if insufficient balance.
 */
export async function spendCoins(userId: string, amount: number, reason: string): Promise<boolean> {
  if (amount <= 0) return true;

  const ref = doc(db, COINS_COLLECTION, userId);
  const current = await getUserCoins(userId);

  if (current.coins < amount) {
    return false; // Insufficient balance
  }

  await updateDoc(ref, {
    coins: increment(-amount),
    totalSpent: increment(amount),
  });

  // Log the transaction
  await addDoc(collection(db, COIN_HISTORY_COLLECTION), {
    userId,
    amount: -amount,
    reason,
    timestamp: Timestamp.now(),
  } as CoinTransaction);

  return true;
}

/**
 * Award coins for a swipe action. Handles daily bonus and streak milestone detection.
 * Returns total coins awarded in this call.
 */
export async function awardSwipeCoins(
  userId: string,
  isCorrect: boolean,
  currentStreak: number
): Promise<{ coinsAwarded: number; breakdown: string[] }> {
  const breakdown: string[] = [];
  let totalAwarded = 0;

  // 1. Base swipe reward
  const base = isCorrect ? COIN_REWARDS.CORRECT_SWIPE : COIN_REWARDS.INCORRECT_SWIPE;
  totalAwarded += base;
  breakdown.push(`Swipe: +${base}`);

  // 2. Check daily login bonus
  const ref = doc(db, COINS_COLLECTION, userId);
  const current = await getUserCoins(userId);
  const today = getTodayStr();

  if (current.lastDailyBonus !== today) {
    totalAwarded += COIN_REWARDS.DAILY_LOGIN_BONUS;
    breakdown.push(`Denní bonus: +${COIN_REWARDS.DAILY_LOGIN_BONUS}`);
    await updateDoc(ref, { lastDailyBonus: today });
  }

  // 3. Check streak milestone (every 7 days)
  if (currentStreak > 0 && currentStreak % 7 === 0 && currentStreak > current.lastStreakBonusMilestone) {
    totalAwarded += COIN_REWARDS.STREAK_MILESTONE_BONUS;
    breakdown.push(`Streak ${currentStreak}🔥: +${COIN_REWARDS.STREAK_MILESTONE_BONUS}`);
    await updateDoc(ref, { lastStreakBonusMilestone: currentStreak });
  }

  // 4. Add the total
  await addCoins(userId, totalAwarded, breakdown.join(', '));

  return { coinsAwarded: totalAwarded, breakdown };
}

/**
 * Get recent coin transactions for a user
 */
export async function getCoinHistory(userId: string, count: number = 20): Promise<CoinTransaction[]> {
  const q = query(
    collection(db, COIN_HISTORY_COLLECTION),
    where('userId', '==', userId),
    orderBy('timestamp', 'desc'),
    limit(count)
  );

  const snap = await getDocs(q);
  return snap.docs.map(d => d.data() as CoinTransaction);
}
