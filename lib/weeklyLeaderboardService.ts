import { collection, query, getDocs, doc, setDoc, getDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

export interface WeeklyLeaderboardEntry {
  userId: string;
  displayName: string;
  correctAnswers: number;
  totalArticles: number;
  accuracy: number; // 0-100
  weekKey: string;  // e.g. "2025-W03"
}

const WEEKLY_LEADERBOARD_COLLECTION = 'weekly_leaderboard';

/**
 * Get the ISO week key for a given date (e.g. "2025-W03")
 */
export function getCurrentWeekKey(date: Date = new Date()): string {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

/**
 * Submit or update a user's weekly score
 */
export async function submitWeeklyScore(
  userId: string,
  displayName: string,
  correctAnswers: number,
  totalArticles: number
): Promise<void> {
  const weekKey = getCurrentWeekKey();
  const accuracy = totalArticles === 0 ? 0 : Math.round((correctAnswers / totalArticles) * 100);
  const docId = `${weekKey}_${userId}`;

  const ref = doc(db, WEEKLY_LEADERBOARD_COLLECTION, docId);
  await setDoc(ref, {
    userId,
    displayName,
    correctAnswers,
    totalArticles,
    accuracy,
    weekKey,
    updatedAt: Timestamp.now(),
  }, { merge: true });
}

/**
 * Get the top entries for a given week
 */
export async function getWeeklyLeaderboard(weekKey?: string): Promise<WeeklyLeaderboardEntry[]> {
  const week = weekKey || getCurrentWeekKey();
  const ref = collection(db, WEEKLY_LEADERBOARD_COLLECTION);
  const snapshot = await getDocs(ref);

  const entries: WeeklyLeaderboardEntry[] = [];
  snapshot.forEach((docSnap) => {
    const data = docSnap.data();
    if (data.weekKey === week) {
      entries.push({
        userId: data.userId,
        displayName: data.displayName || 'Neznámý',
        correctAnswers: data.correctAnswers || 0,
        totalArticles: data.totalArticles || 0,
        accuracy: data.accuracy || 0,
        weekKey: data.weekKey,
      });
    }
  });

  // Sort: accuracy desc (min 5 articles first), then totalArticles desc
  const MIN_ARTICLES = 5;
  entries.sort((a, b) => {
    const aAbove = a.totalArticles >= MIN_ARTICLES;
    const bAbove = b.totalArticles >= MIN_ARTICLES;
    if (aAbove && !bAbove) return -1;
    if (!aAbove && bAbove) return 1;
    if (a.accuracy !== b.accuracy) return b.accuracy - a.accuracy;
    return b.totalArticles - a.totalArticles;
  });

  return entries.slice(0, 100);
}
