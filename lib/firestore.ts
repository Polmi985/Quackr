import { db } from './firebase';
import {
  collection,
  addDoc,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  query,
  where,
  orderBy,
  Timestamp
} from 'firebase/firestore';

// Collection names
export const COLLECTIONS = {
  USER_SCORES: 'user_scores',
  ARTICLES: 'articles',
  QUIZ_SESSIONS: 'quiz_sessions'
};

// User Score Interface
export interface UserScore {
  id?: string;
  userId: string;
  goodSourceScore: number;
  badSourceScore: number;
  totalQuestions: number;
  createdAt: Timestamp;
  sessionId?: string;
}

// Article Interface
export interface Article {
  id?: string;
  title: string;
  source: string;
  credibilityScore: number;
  preview: string;
  timestamp: string;
  category: string;
  url?: string;
}

// Save user score to Firestore
export async function saveUserScore(
  userId: string,
  goodSourceScore: number,
  badSourceScore: number,
  totalQuestions: number
): Promise<string> {
  try {
    const userScore: UserScore = {
      userId,
      goodSourceScore,
      badSourceScore,
      totalQuestions,
      createdAt: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, COLLECTIONS.USER_SCORES), userScore);
    console.log('User score saved with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving user score:', error);
    throw error;
  }
}

// Get user score by ID
export async function getUserScore(scoreId: string): Promise<UserScore | null> {
  try {
    const docRef = doc(db, COLLECTIONS.USER_SCORES, scoreId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return docSnap.data() as UserScore;
    } else {
      console.log('No such document!');
      return null;
    }
  } catch (error) {
    console.error('Error getting user score:', error);
    throw error;
  }
}

// Get all scores for a user
export async function getUserScores(userId: string): Promise<UserScore[]> {
  try {
    const q = query(
      collection(db, COLLECTIONS.USER_SCORES),
      where('userId', '==', userId),
      orderBy('createdAt', 'desc')
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as UserScore[];
  } catch (error) {
    console.error('Error getting user scores:', error);
    throw error;
  }
}

// Save article to Firestore
export async function saveArticle(article: Article): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, COLLECTIONS.ARTICLES), article);
    console.log('Article saved with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error saving article:', error);
    throw error;
  }
}

// Get all articles
export async function getArticles(): Promise<Article[]> {
  try {
    const querySnapshot = await getDocs(collection(db, COLLECTIONS.ARTICLES));
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Article[];
  } catch (error) {
    console.error('Error getting articles:', error);
    throw error;
  }
}

// Test Firebase connection
export async function testFirebaseConnection(): Promise<boolean> {
  try {
    const testData = {
      test: true,
      timestamp: Timestamp.now()
    };

    const docRef = await addDoc(collection(db, 'test_connection'), testData);
    console.log('Firebase connection test successful! Document ID:', docRef.id);
    return true;
  } catch (error) {
    console.error('Firebase connection test failed:', error);
    return false;
  }
}
