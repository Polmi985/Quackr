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
  arrayUnion,
  arrayRemove,
  Timestamp
} from 'firebase/firestore';
import {
  getUserGameScore,
  resetUserScore,
  setUserGameScoreSnapshot,
  type UserGameScoreSnapshot
} from './swipeScoreService';

// Collection names
export const GAME_COLLECTIONS = {
  GAMES: 'games',
  ORGANIZATIONS: 'games' // Organizations are stored in the 'games' collection
};

// Game Session Interface
export interface GameSession {
  id?: string;
  code: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: Timestamp;
  status: 'active' | 'completed' | 'cancelled';
  players?: string[];
  mode?: 'solo' | 'multi';
}

// Player info interface
export interface PlayerInfo {
  userId: string;
  displayName: string;
  joinedAt: Timestamp;
}

// Organization Interface
export interface Organization {
  id?: string;
  code: string;
  name?: string;
  createdBy: string;
  createdByEmail: string;
  createdAt: Timestamp;
  mode?: 'solo' | 'multi';
  players: string[]; // Array of player UIDs (for backwards compatibility)
  playerInfo?: PlayerInfo[]; // Array of player info with names
  playerScores?: Record<string, UserGameScoreSnapshot>; // Stored stats per user per game
}

// Persist the user's current score into the game document so it can be restored later
async function persistUserScoreForGame(gameId: string, userId: string) {
  const currentScore = await getUserGameScore(userId);
  if (!currentScore) return;

  const snapshot: UserGameScoreSnapshot = {
    positivePoints: currentScore.positivePoints,
    negativePoints: currentScore.negativePoints,
    lastUpdated: currentScore.lastUpdated || Timestamp.now(),
    displayName: currentScore.displayName,
    sessionId: gameId
  };

  await setDoc(
    doc(db, GAME_COLLECTIONS.GAMES, gameId),
    { playerScores: { [userId]: snapshot } },
    { merge: true }
  );
}

// Restore saved stats for this game or initialize to zero if there is no snapshot
async function restoreUserScoreForGame(
  gameId: string,
  userId: string,
  displayName?: string,
  gameData?: Organization
) {
  const snapshot = gameData?.playerScores?.[userId];

  if (snapshot) {
    await setUserGameScoreSnapshot(userId, {
      ...snapshot,
      sessionId: gameId,
      displayName: snapshot.displayName || displayName
    });
  } else {
    await setUserGameScoreSnapshot(userId, {
      positivePoints: 0,
      negativePoints: 0,
      lastUpdated: Timestamp.now(),
      displayName,
      sessionId: gameId
    });
  }
}


/**
 * Create a new game session with a unique code
 */
export async function createGameSession(
  code: string,
  userId: string,
  userEmail: string,
  displayName: string,
  mode: 'solo' | 'multi' = 'multi'
): Promise<string> {
  try {
    // Check if code already exists
    const existingGame = await getGameByCode(code);
    if (existingGame) {
      throw new Error('Game code already exists. Please generate a new one.');
    }

    const playerInfo: PlayerInfo = {
      userId,
      displayName,
      joinedAt: Timestamp.now()
    };

    const gameSession: Organization = {
      code,
      createdBy: userId,
      createdByEmail: userEmail,
      createdAt: Timestamp.now(),
      mode,
      players: [userId],
      playerInfo: [playerInfo]
    };

    const docRef = await addDoc(collection(db, GAME_COLLECTIONS.GAMES), gameSession);
    console.log('Game session created with ID:', docRef.id);

    // Start the creator with a clean score tied to this game
    await setUserGameScoreSnapshot(userId, {
      positivePoints: 0,
      negativePoints: 0,
      lastUpdated: Timestamp.now(),
      displayName,
      sessionId: docRef.id
    });

    return docRef.id;
  } catch (error) {
    console.error('Error creating game session:', error);
    throw error;
  }
}

/**
 * Get game session by code
 */
export async function getGameByCode(code: string): Promise<GameSession | null> {
  try {
    const q = query(
      collection(db, GAME_COLLECTIONS.GAMES),
      where('code', '==', code)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    } as GameSession;
  } catch (error) {
    console.error('Error getting game by code:', error);
    throw error;
  }
}

/**
 * Get all games created by a user
 */
export async function getGamesCreatedByUser(userId: string): Promise<GameSession[]> {
  try {
    const q = query(
      collection(db, GAME_COLLECTIONS.GAMES),
      where('createdBy', '==', userId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as GameSession[];
  } catch (error) {
    console.error('Error getting games created by user:', error);
    throw error;
  }
}

/**
 * Join an organization by code
 */
export async function joinOrganization(
  code: string,
  userId: string,
  userEmail: string,
  displayName: string
): Promise<string> {
  try {
    // Normalize code to uppercase for case-insensitive matching
    const normalizedCode = code.toUpperCase().trim();

    console.log('=== JOIN ORGANIZATION DEBUG ===');
    console.log('Input code:', code);
    console.log('Normalized code:', normalizedCode);
    console.log('Collection:', GAME_COLLECTIONS.ORGANIZATIONS);
    console.log('Firebase app name:', db.app.name);
    console.log('Firebase project ID:', db.app.options.projectId);

    // First, let's get ALL organizations to see what's in the database
    console.log('Attempting to fetch all organizations from collection:', GAME_COLLECTIONS.ORGANIZATIONS);

    try {
      const allOrgsSnapshot = await getDocs(collection(db, GAME_COLLECTIONS.ORGANIZATIONS));
      console.log('Total organizations in database:', allOrgsSnapshot.size);
      console.log('Is snapshot empty?', allOrgsSnapshot.empty);
      allOrgsSnapshot.forEach((doc) => {
        const data = doc.data();
        console.log('Org found:', {
          id: doc.id,
          code: data.code,
          name: data.name,
          codeType: typeof data.code,
          codeLength: data.code?.length,
          allFields: Object.keys(data)
        });
      });
    } catch (dbError) {
      console.error('Error fetching organizations:', dbError);
      throw new Error('Database connection error: ' + (dbError as Error).message);
    }

    // Find organization by code
    const q = query(
      collection(db, GAME_COLLECTIONS.ORGANIZATIONS),
      where('code', '==', normalizedCode)
    );

    const querySnapshot = await getDocs(q);
    console.log('Query results for code "' + normalizedCode + '":', querySnapshot.size, 'documents found');

    if (querySnapshot.empty) {
      throw new Error('Organization not found. Please check the code and try again.');
    }

    const orgDoc = querySnapshot.docs[0];
    const orgData = orgDoc.data() as Organization;

    console.log('Organization data:', orgData);

    // Check if user is already in the players array
    if (orgData.players && orgData.players.includes(userId)) {
      throw new Error('You are already a member of this organization.');
    }

    const newPlayerInfo: PlayerInfo = {
      userId,
      displayName,
      joinedAt: Timestamp.now()
    };

    // Add player to the players array and playerInfo array in the game document
    await updateDoc(doc(db, GAME_COLLECTIONS.ORGANIZATIONS, orgDoc.id), {
      players: arrayUnion(userId),
      playerInfo: arrayUnion(newPlayerInfo)
    });

    // Restore previous stats for this game or start fresh for a new player
    await restoreUserScoreForGame(orgDoc.id, userId, displayName, orgData);

    console.log('Successfully joined organization:', orgDoc.id);
    return orgDoc.id;
  } catch (error) {
    console.error('Error joining organization:', error);
    throw error;
  }
}

/**
 * Create a new organization
 */
export async function createOrganization(
  code: string,
  name: string,
  userId: string,
  userEmail: string
): Promise<string> {
  try {
    // Normalize code to uppercase
    const normalizedCode = code.toUpperCase().trim();

    // Check if code already exists
    const existingOrg = await getOrganizationByCode(normalizedCode);
    if (existingOrg) {
      throw new Error('Organization code already exists. Please use a different code.');
    }

    const organization: Organization = {
      code: normalizedCode,
      name,
      createdBy: userId,
      createdByEmail: userEmail,
      createdAt: Timestamp.now(),
      players: [userId] // Creator is the first player
    };

    const docRef = await addDoc(collection(db, GAME_COLLECTIONS.ORGANIZATIONS), organization);

    console.log('Organization created with ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('Error creating organization:', error);
    throw error;
  }
}

/**
 * Get organization by code
 */
export async function getOrganizationByCode(code: string): Promise<Organization | null> {
  try {
    // Normalize code to uppercase for case-insensitive matching
    const normalizedCode = code.toUpperCase().trim();

    const q = query(
      collection(db, GAME_COLLECTIONS.ORGANIZATIONS),
      where('code', '==', normalizedCode)
    );

    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      return null;
    }

    const doc = querySnapshot.docs[0];
    return {
      id: doc.id,
      ...doc.data()
    } as Organization;
  } catch (error) {
    console.error('Error getting organization by code:', error);
    throw error;
  }
}

/**
 * Get all organizations/games a user is a member of
 */
export async function getUserGames(userId: string): Promise<Organization[]> {
  try {
    const q = query(
      collection(db, GAME_COLLECTIONS.GAMES),
      where('players', 'array-contains', userId)
    );

    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => ({
      id: doc.id,
      ...doc.data()
    })) as Organization[];
  } catch (error) {
    console.error('Error getting user games:', error);
    throw error;
  }
}

/**
 * Get organization details by ID
 */
export async function getOrganization(organizationId: string): Promise<Organization | null> {
  try {
    const docRef = doc(db, GAME_COLLECTIONS.ORGANIZATIONS, organizationId);
    const docSnap = await getDoc(docRef);

    if (docSnap.exists()) {
      return {
        id: docSnap.id,
        ...docSnap.data()
      } as Organization;
    } else {
      console.log('No such organization!');
      return null;
    }
  } catch (error) {
    console.error('Error getting organization:', error);
    throw error;
  }
}

/**
 * Leave a game/organization
 */
export async function leaveGame(gameId: string, userId: string): Promise<void> {
  try {
    const gameRef = doc(db, GAME_COLLECTIONS.GAMES, gameId);
    const gameSnap = await getDoc(gameRef);

    if (!gameSnap.exists()) {
      throw new Error('Game not found');
    }

    const gameData = gameSnap.data() as Organization;

    // Save the current stats into the game so they can be restored if the player rejoins
    await persistUserScoreForGame(gameId, userId);

    // Find the player info to remove
    const playerToRemove = gameData.playerInfo?.find(p => p.userId === userId);

    // Remove user from players array and playerInfo array
    await updateDoc(gameRef, {
      players: arrayRemove(userId),
      ...(playerToRemove && { playerInfo: arrayRemove(playerToRemove) })
    });

    // Reset live score so joining a different game starts from zero
    await resetUserScore(userId);

    console.log('Successfully left game:', gameId);
  } catch (error) {
    console.error('Error leaving game:', error);
    throw error;
  }
}
