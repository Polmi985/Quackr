import { spendCoins } from './coinService';
import { addItemToInventory } from './userInventoryService';

// ── Types ──
export type ShopCategory =
  | 'streak_protection'
  | 'hints'
  | 'score_boosters'
  | 'second_chances'
  | 'skips'
  | 'coin_boosts'
  | 'simulation_tools';

export interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: ShopCategory;
  emoji: string;
  consumable: boolean;
  stackable: boolean;
  maxOwned?: number;
}

// ── Category metadata ──
export const SHOP_CATEGORIES: { id: ShopCategory; label: string; emoji: string }[] = [
  { id: 'streak_protection', label: 'Ochrana streaku', emoji: '🛡️' },
  { id: 'hints', label: 'Nápovědy', emoji: '💡' },
  { id: 'score_boosters', label: 'Boostery', emoji: '⚡' },
  { id: 'second_chances', label: 'Druhé šance', emoji: '↩️' },
  { id: 'skips', label: 'Přeskočení', emoji: '⏭️' },
  { id: 'coin_boosts', label: 'Bonus mincí', emoji: '🧲' },
  { id: 'simulation_tools', label: 'Simulační nástroje', emoji: '🧪' },
];

// ── Shop items — serious, gameplay-relevant only ──
export const SHOP_ITEMS: ShopItem[] = [
  // ── Streak Protection ──
  {
    id: 'streak_freeze_1',
    name: 'Zmrazení streaku (1 den)',
    description: 'Ochrání tvůj streak, pokud jeden den nepřijdeš.',
    price: 150,
    category: 'streak_protection',
    emoji: '🧊',
    consumable: true,
    stackable: true,
  },
  {
    id: 'streak_freeze_3',
    name: 'Zmrazení streaku (3 dny)',
    description: 'Trojitá ochrana — 3 dny bez ztráty streaku.',
    price: 350,
    category: 'streak_protection',
    emoji: '❄️',
    consumable: true,
    stackable: true,
  },

  // ── Hints ──
  {
    id: 'hint_token_1',
    name: 'Nápověda',
    description: 'Jemná nápověda zda je článek pravdivý.',
    price: 80,
    category: 'hints',
    emoji: '💡',
    consumable: true,
    stackable: true,
  },
  {
    id: 'hint_pack_5',
    name: 'Balíček nápověd (×5)',
    description: '5 nápověd se slevou — ušetříš 50 mincí.',
    price: 350,
    category: 'hints',
    emoji: '📦',
    consumable: true,
    stackable: true,
  },
  {
    id: 'mega_hint_1',
    name: 'Mega nápověda',
    description: 'Přímo odhalí, zda je článek pravdivý nebo falešný.',
    price: 200,
    category: 'hints',
    emoji: '🔮',
    consumable: true,
    stackable: true,
  },

  // ── Score Boosters ──
  {
    id: 'score_boost_2x_10',
    name: '2× skóre (10 swipů)',
    description: 'Zdvojnásobí body za dalších 10 správných swipů.',
    price: 120,
    category: 'score_boosters',
    emoji: '⚡',
    consumable: true,
    stackable: true,
  },
  {
    id: 'score_boost_2x_25',
    name: '2× skóre (25 swipů)',
    description: 'Zdvojnásobí body za dalších 25 správných swipů.',
    price: 250,
    category: 'score_boosters',
    emoji: '🔋',
    consumable: true,
    stackable: true,
  },

  // ── Second Chances ──
  {
    id: 'safety_net_1',
    name: 'Záchranná síť',
    description: 'Automaticky zachrání 1 špatný swipe — nedostaneš záporný bod.',
    price: 200,
    category: 'second_chances',
    emoji: '🛟',
    consumable: true,
    stackable: true,
  },

  // ── Skips ──
  {
    id: 'article_skip_3',
    name: 'Přeskočení článku (×3)',
    description: 'Přeskoč 3 články bez penalizace.',
    price: 60,
    category: 'skips',
    emoji: '⏭️',
    consumable: true,
    stackable: true,
  },

  // ── Coin Boosts ──
  {
    id: 'coin_magnet_1h',
    name: 'Bonus mincí (1 h)',
    description: '+50 % mincí za správné swipy po dobu 1 hodiny.',
    price: 300,
    category: 'coin_boosts',
    emoji: '🧲',
    consumable: true,
    stackable: true,
  },

  // ── Simulation Tools (pros + cons) ──
  {
    id: 'wide_wave_30m',
    name: 'Široká vlna (30 min)',
    description: 'Větší oblast vlivu v simulaci, ale slabší dopad na jednu buňku.',
    price: 190,
    category: 'simulation_tools',
    emoji: '🌊',
    consumable: true,
    stackable: true,
  },
  {
    id: 'laser_focus_30m',
    name: 'Laserové zaměření (30 min)',
    description: 'Silnější tlak v okolí hráčů, ale menší dosah ovlivnění.',
    price: 210,
    category: 'simulation_tools',
    emoji: '🎯',
    consumable: true,
    stackable: true,
  },
  {
    id: 'echo_chamber_20m',
    name: 'Echo komora (20 min)',
    description: 'Silnější online šíření vlivu, ale společnost je chaotičtější a méně stabilní.',
    price: 260,
    category: 'simulation_tools',
    emoji: '📣',
    consumable: true,
    stackable: true,
  },
  {
    id: 'civic_shield_30m',
    name: 'Občanský štít (30 min)',
    description: 'Sníží náhodný chaos v mapě, ale oslabí přímou dominanci hráčů.',
    price: 230,
    category: 'simulation_tools',
    emoji: '🧱',
    consumable: true,
    stackable: true,
  },
  {
    id: 'viral_spread_25m',
    name: 'Virální šíření (25 min)',
    description: 'Vliv se šíří daleko bez přímé přítomnosti, ale postupně se rozřeďuje.',
    price: 240,
    category: 'simulation_tools',
    emoji: '🦠',
    consumable: true,
    stackable: true,
  },
  {
    id: 'deep_roots_30m',
    name: 'Hluboké kořeny (30 min)',
    description: 'Váš vliv v mapě přetrvá déle, ale i nepřátelský tlak vydrží déle.',
    price: 280,
    category: 'simulation_tools',
    emoji: '🌱',
    consumable: true,
    stackable: true,
  },
  {
    id: 'social_fracture_15m',
    name: 'Společenská trhlina (15 min)',
    description: 'Krajně smýšlející oblasti konvertují rychleji, ale střed mapy je odolnější.',
    price: 220,
    category: 'simulation_tools',
    emoji: '⚡',
    consumable: true,
    stackable: true,
  },
  {
    id: 'mind_fog_20m',
    name: 'Mentální mlha (20 min)',
    description: 'Lidé jsou náchylnější ke změně postoje, ale mapa je nestabilní.',
    price: 200,
    category: 'simulation_tools',
    emoji: '🌫️',
    consumable: true,
    stackable: true,
  },
  {
    id: 'grassroots_30m',
    name: 'Místní síť (30 min)',
    description: 'Sousedé silněji ovlivňují své okolí, ale online kontakty mají menší váhu.',
    price: 170,
    category: 'simulation_tools',
    emoji: '🌿',
    consumable: true,
    stackable: true,
  },
];

// ── Public API ──

export function getAllShopItems(): ShopItem[] {
  return SHOP_ITEMS;
}

export function getItemById(itemId: string): ShopItem | undefined {
  return SHOP_ITEMS.find(item => item.id === itemId);
}

export function getItemsByCategory(category: ShopCategory): ShopItem[] {
  return SHOP_ITEMS.filter(item => item.category === category);
}

/**
 * Purchase an item from the shop.
 */
export async function purchaseItem(
  userId: string,
  itemId: string,
  customPrice?: number
): Promise<{ success: boolean; message: string }> {
  const item = getItemById(itemId);
  if (!item) {
    return { success: false, message: 'Položka nenalezena.' };
  }

  const price = customPrice ?? item.price;

  const spent = await spendCoins(userId, price, `Nákup: ${item.name}`);
  if (!spent) {
    return { success: false, message: 'Nemáš dostatek mincí!' };
  }

  // Multi-packs
  let quantity = 1;
  let actualItemId = itemId;

  if (itemId === 'hint_pack_5') {
    actualItemId = 'hint_token_1';
    quantity = 5;
  } else if (itemId === 'article_skip_3') {
    actualItemId = 'article_skip_1';
    quantity = 3;
  }

  await addItemToInventory(userId, actualItemId, quantity);

  return { success: true, message: `${item.name} zakoupeno!` };
}
