import { doc, getDoc, setDoc, Timestamp } from 'firebase/firestore';
import { db } from './firebase';
import { SHOP_ITEMS, type ShopItem } from './shopService';

const DAILY_DEALS_COLLECTION = 'daily_deals';
const DEALS_COUNT = 3;
const MIN_DISCOUNT = 0.30; // 30%
const MAX_DISCOUNT = 0.50; // 50%

export interface DailyDeal {
  itemId: string;
  item: ShopItem;
  originalPrice: number;
  discountedPrice: number;
  discountPercent: number;
}

export interface DailyDealsDoc {
  date: string; // "YYYY-MM-DD"
  deals: {
    itemId: string;
    discountPercent: number;
  }[];
  createdAt: Timestamp;
}

// ── Deterministic seeded random ──
function seededRandom(seed: string): () => number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    const char = seed.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit int
  }

  return () => {
    hash = (hash * 1103515245 + 12345) & 0x7fffffff;
    return hash / 0x7fffffff;
  };
}

function getTodayStr(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Get milliseconds remaining until midnight (UTC+1 for CZ)
 */
export function getMsUntilNextReset(): number {
  const now = new Date();
  const tomorrow = new Date(now);
  tomorrow.setHours(24, 0, 0, 0);
  return tomorrow.getTime() - now.getTime();
}

/**
 * Generate deterministic deals for a given date
 */
function generateDealsForDate(dateStr: string): DailyDealsDoc['deals'] {
  const rng = seededRandom(`daily-deals-${dateStr}-v1`);
  
  // Filter out items that cost less than 50 coins (not worth discounting)
  const eligibleItems = SHOP_ITEMS.filter(item => item.price >= 50);
  
  // Pick unique random items
  const shuffled = [...eligibleItems].sort(() => rng() - 0.5);
  const selected = shuffled.slice(0, DEALS_COUNT);

  return selected.map(item => {
    const rawDiscount = MIN_DISCOUNT + rng() * (MAX_DISCOUNT - MIN_DISCOUNT);
    const discountPercent = Math.round(rawDiscount * 100);
    return {
      itemId: item.id,
      discountPercent,
    };
  });
}

/**
 * Get today's daily deals. Creates them in Firestore if they don't exist yet,
 * so all players see the same deals.
 */
export async function getDailyDeals(): Promise<DailyDeal[]> {
  const today = getTodayStr();
  const ref = doc(db, DAILY_DEALS_COLLECTION, today);
  
  let dealsDoc: DailyDealsDoc;

  const snap = await getDoc(ref);
  if (snap.exists()) {
    dealsDoc = snap.data() as DailyDealsDoc;
  } else {
    // Generate and store
    dealsDoc = {
      date: today,
      deals: generateDealsForDate(today),
      createdAt: Timestamp.now(),
    };
    await setDoc(ref, dealsDoc);
  }

  // Hydrate with full item data
  return dealsDoc.deals
    .map(deal => {
      const item = SHOP_ITEMS.find(i => i.id === deal.itemId);
      if (!item) return null;

      const discountedPrice = Math.round(item.price * (1 - deal.discountPercent / 100));

      return {
        itemId: deal.itemId,
        item,
        originalPrice: item.price,
        discountedPrice,
        discountPercent: deal.discountPercent,
      };
    })
    .filter((d): d is DailyDeal => d !== null);
}
