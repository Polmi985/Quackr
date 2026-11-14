import {
  collection,
  addDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  increment
} from 'firebase/firestore';
import { db } from './firebase';

export interface SwipeAction {
  userId: string;
  articleId: string;
  direction: 'left' | 'right';
  score: number;  // +1 for right, -1 for left
  timestamp: Timestamp;
  sessionId?: string;
  articleTitle?: string;
}

export interface UserGameScore {
  userId: string;
  displayName?: string;  // Player's display name
  positivePoints: number;  // Total positive points from right swipes
  negativePoints: number;  // Total negative points from left swipes
  lastUpdated: Timestamp;
  sessionId?: string;
  // Legacy/optional fields for compatibility
  totalScore?: number;
  rightSwipes?: number;
  leftSwipes?: number;
  articlesViewed?: string[];
  // NEW iter 5
  accuracyHistory?: number[]; // Stores recent accuracy % values
  categoryStats?: Record<string, { correct: number; incorrect: number }>;
}

// Snapshot used when storing score per game or restoring it later
export interface UserGameScoreSnapshot {
  positivePoints: number;
  negativePoints: number;
  displayName?: string;
  lastUpdated?: Timestamp;
  sessionId?: string;
  accuracyHistory?: number[];
  categoryStats?: Record<string, { correct: number; incorrect: number }>;
}

/**
 * Save a swipe action to Firestore (REMOVED - not needed anymore)
 * Keeping function signature for backwards compatibility but does nothing
 */
export async function saveSwipeAction(swipeData: Omit<SwipeAction, 'timestamp'>): Promise<string> {
  // No longer saving individual swipe actions
  return 'skipped';
}

/**
 * Update or create user's game score
 * Tracks positive points (correct answers) and negative points (incorrect answers)
 */
export async function updateUserGameScore(
  userId: string,
  direction: 'left' | 'right',
  articleId: string,
  sessionId?: string,
  displayName?: string,
  isFake?: boolean,
  category?: string
): Promise<void> {
  try {
    const scoreRef = doc(db, 'user_game_scores', userId);
    const scoreDoc = await getDoc(scoreRef);

    // Determine if the swipe was correct
    // Correct: right on real article (isFake=false) OR left on fake article (isFake=true)
    // Incorrect: left on real article (isFake=false) OR right on fake article (isFake=true)
    const isCorrect = (direction === 'right' && !isFake) || (direction === 'left' && isFake);

    if (scoreDoc.exists()) {
      // Update existing score
      const updateData: any = {
        positivePoints: increment(isCorrect ? 1 : 0),
        negativePoints: increment(isCorrect ? 0 : 1),
        lastUpdated: Timestamp.now(),
      };

      // Only add sessionId if it's defined
      if (sessionId !== undefined && sessionId !== null) {
        updateData.sessionId = sessionId;
      }

      // Update displayName if provided
      if (displayName !== undefined && displayName !== null && displayName.trim()) {
        updateData.displayName = displayName.trim();
      }

      // Update category tracking
      if (category) {
        const currentData = scoreDoc.data() as UserGameScore;
        const catStats = currentData.categoryStats || {};
        const catData = catStats[category] || { correct: 0, incorrect: 0 };
        catData.correct += isCorrect ? 1 : 0;
        catData.incorrect += isCorrect ? 0 : 1;
        updateData[`categoryStats.${category}`] = catData;
      }

      // Update accuracy history periodically or simply calculate and push
      const currentData = scoreDoc.data() as UserGameScore;
      const totalCorrect = (currentData.positivePoints || 0) + (isCorrect ? 1 : 0);
      const totalIncorrect = (currentData.negativePoints || 0) + (isCorrect ? 0 : 1);
      const total = totalCorrect + totalIncorrect;
      
      // Update history every 10 articles to avoid massive arrays, or just keep a rolling list of last 20
      if (total % 5 === 0) {
        let history = currentData.accuracyHistory || [];
        const currentAcc = Math.round((totalCorrect / total) * 100);
        history.push(currentAcc);
        if (history.length > 20) history = history.slice(history.length - 20); // keep last 20 points
        updateData.accuracyHistory = history;
      }

      await updateDoc(scoreRef, updateData);
    } else {
      // Create new score document
      const newScore: UserGameScore = {
        userId,
        positivePoints: isCorrect ? 1 : 0,
        negativePoints: isCorrect ? 0 : 1,
        lastUpdated: Timestamp.now(),
      };

      if (sessionId !== undefined && sessionId !== null) {
        newScore.sessionId = sessionId;
      }

      if (displayName !== undefined && displayName !== null && displayName.trim()) {
        newScore.displayName = displayName.trim();
      }

      if (category) {
        newScore.categoryStats = {
          [category]: {
            correct: isCorrect ? 1 : 0,
            incorrect: isCorrect ? 0 : 1
          }
        };
      }
      newScore.accuracyHistory = [];

      await setDoc(scoreRef, newScore);
    }
  } catch (error) {
    console.error('Error updating user game score:', error);
    throw error;
  }
}

/**
 * Get user's current game score
 */
export async function getUserGameScore(userId: string): Promise<UserGameScore | null> {
  try {
    const scoreRef = doc(db, 'user_game_scores', userId);
    const scoreDoc = await getDoc(scoreRef);

    if (scoreDoc.exists()) {
      return scoreDoc.data() as UserGameScore;
    }

    return null;
  } catch (error) {
    console.error('Error getting user game score:', error);
    throw error;
  }
}

/**
 * Overwrite user score (used when restoring per-game snapshots)
 */
export async function setUserGameScoreSnapshot(
  userId: string,
  snapshot: UserGameScoreSnapshot
): Promise<void> {
  try {
    const scoreRef = doc(db, 'user_game_scores', userId);
    const payload: UserGameScore = {
      userId,
      positivePoints: snapshot.positivePoints ?? 0,
      negativePoints: snapshot.negativePoints ?? 0,
      lastUpdated: snapshot.lastUpdated || Timestamp.now(),
    };

    if (snapshot.displayName) {
      payload.displayName = snapshot.displayName;
    }

    if (snapshot.sessionId) {
      payload.sessionId = snapshot.sessionId;
    }

    await setDoc(scoreRef, payload);
  } catch (error) {
    console.error('Error setting user game score snapshot:', error);
    throw error;
  }
}

/**
 * Get user's swipe history
 */
export async function getUserSwipeHistory(userId: string, limitCount: number = 50): Promise<SwipeAction[]> {
  try {
    const swipesQuery = query(
      collection(db, 'swipe_actions'),
      where('userId', '==', userId),
      orderBy('timestamp', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(swipesQuery);
    return querySnapshot.docs.map(doc => ({
      ...doc.data() as SwipeAction
    }));
  } catch (error) {
    console.error('Error getting swipe history:', error);
    throw error;
  }
}

/**
 * Get leaderboard (top scores)
 */
export async function getLeaderboard(limitCount: number = 10): Promise<UserGameScore[]> {
  try {
    const leaderboardQuery = query(
      collection(db, 'user_game_scores'),
      orderBy('positivePoints', 'desc'),
      limit(limitCount)
    );

    const querySnapshot = await getDocs(leaderboardQuery);
    return querySnapshot.docs.map(doc => ({
      ...doc.data() as UserGameScore
    }));
  } catch (error) {
    console.error('Error getting leaderboard:', error);
    throw error;
  }
}

/**
 * Reset user's score (for testing or new games)
 */
export async function resetUserScore(userId: string): Promise<void> {
  try {
    const scoreRef = doc(db, 'user_game_scores', userId);
    const resetScore: UserGameScore = {
      userId,
      positivePoints: 0,
      negativePoints: 0,
      lastUpdated: Timestamp.now()
    };

    await setDoc(scoreRef, resetScore);
  } catch (error) {
    console.error('Error resetting user score:', error);
    throw error;
  }
}
