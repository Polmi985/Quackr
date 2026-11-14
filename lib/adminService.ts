import { db } from './firebase';
import { doc, getDoc, query, where, getDocs, collection } from 'firebase/firestore';

const ADMIN_COLLECTION = 'admin';

/**
 * Checks whether the given userId exists in the admins collection.
 * Primary lookup is doc id === userId; falls back to a query on userId field.
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  if (!userId) return false;

  try {
    // Try doc by UID
    const adminDoc = await getDoc(doc(db, ADMIN_COLLECTION, userId));
    if (adminDoc.exists()) return true;

    // Fallback: check if there's a doc with userId field matching
    const q = query(
      collection(db, ADMIN_COLLECTION),
      where('userId', '==', userId)
    );
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (err) {
    console.error('[adminService] Failed to check admin status:', err);
    return false;
  }
}
