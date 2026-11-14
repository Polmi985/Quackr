import { doc, getDoc, setDoc, updateDoc, increment, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

const INVENTORY_COLLECTION = 'user_inventory';

// ── Types ──
export interface InventoryItem {
  quantity: number;
  firstAcquired: string; // ISO date
  lastAcquired: string;  // ISO date
}

export interface UserInventory {
  items: Record<string, InventoryItem>;
  lastUpdated: Timestamp;
  // NEW iter 3
  accuracy_graph: number;
  category_breakdown: number;
  article_skip_1: number;
}

// ── Public API ──

/**
 * Get full inventory for a user
 */
export async function getUserInventory(userId: string): Promise<UserInventory> {
  const ref = doc(db, INVENTORY_COLLECTION, userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) {
    // Default values for new properties
    return {
      items: {},
      lastUpdated: Timestamp.now(),
      accuracy_graph: 0,
      category_breakdown: 0,
      article_skip_1: 0,
    };
  }

  return snap.data() as UserInventory;
}

/**
 * Add an item (or N items) to user's inventory.
 */
export async function addItemToInventory(userId: string, itemId: string, quantity: number = 1): Promise<void> {
  const ref = doc(db, INVENTORY_COLLECTION, userId);
  const snap = await getDoc(ref);
  const now = new Date().toISOString();

  if (!snap.exists()) {
    // Brand new inventory
    const newInventory: UserInventory = {
      items: {
        [itemId]: {
          quantity,
          firstAcquired: now,
          lastAcquired: now,
        },
      },
      lastUpdated: Timestamp.now(),
      article_skip_1: 0,
      accuracy_graph: 0,
      category_breakdown: 0,
    };
    await setDoc(ref, newInventory);
    return;
  }

  const data = snap.data() as UserInventory;
  const existing = data.items?.[itemId];

  if (existing) {
    // Increment existing item
    const updated: InventoryItem = {
      quantity: existing.quantity + quantity,
      firstAcquired: existing.firstAcquired,
      lastAcquired: now,
    };
    await updateDoc(ref, {
      [`items.${itemId}`]: updated,
    });
  } else {
    // Add new item
    await updateDoc(ref, {
      [`items.${itemId}`]: {
        quantity,
        firstAcquired: now,
        lastAcquired: now,
      } as InventoryItem,
    });
  }
}

/**
 * Consume one unit of a consumable item. Returns false if user doesn't have it.
 */
export async function useItem(userId: string, itemId: string): Promise<boolean> {
  const ref = doc(db, INVENTORY_COLLECTION, userId);
  const snap = await getDoc(ref);

  if (!snap.exists()) return false;

  const data = snap.data() as UserInventory;
  const item = data.items?.[itemId];

  if (!item || item.quantity <= 0) return false;

  if (item.quantity === 1) {
    // Remove the item entirely
    const updatedItems = { ...data.items };
    delete updatedItems[itemId];
    await updateDoc(ref, { items: updatedItems });
  } else {
    // Decrement
    await updateDoc(ref, {
      [`items.${itemId}`]: {
        ...item,
        quantity: item.quantity - 1,
      },
    });
  }

  return true;
}

/**
 * Check if user owns an item (quantity > 0)
 */
export async function hasItem(userId: string, itemId: string): Promise<boolean> {
  const inventory = await getUserInventory(userId);
  const item = inventory.items?.[itemId];
  return !!item && item.quantity > 0;
}

/**
 * Get the quantity of a specific item the user has
 */
export async function getItemQuantity(userId: string, itemId: string): Promise<number> {
  const inventory = await getUserInventory(userId);
  return inventory.items?.[itemId]?.quantity ?? 0;
}
