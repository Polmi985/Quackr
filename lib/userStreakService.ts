// lib/userStreakService.ts
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "./firebase"
import { useItem } from "./userInventoryService"

export interface UserStreakDoc {
  streak: number
  lastDate: string // "YYYY-MM-DD"
}

function getTodayStr(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, "0")
  const d = String(now.getDate()).padStart(2, "0")
  return `${y}-${m}-${d}`
}

function diffInDays(a: string, b: string): number {
  // a, b = "YYYY-MM-DD"
  const [ay, am, ad] = a.split("-").map(Number)
  const [by, bm, bd] = b.split("-").map(Number)
  const da = new Date(ay, am - 1, ad)
  const dbb = new Date(by, bm - 1, bd)
  const diffMs = dbb.getTime() - da.getTime()
  return Math.round(diffMs / (1000 * 60 * 60 * 24))
}

/**
 * Check if user has a streak freeze and consume it.
 * Checks for both streak_freeze_1 (1-day) and streak_freeze_3 (3-day, gives 3× 1-day freezes).
 */
async function checkAndConsumeStreakFreeze(userId: string): Promise<boolean> {
  // Try to consume a 1-day freeze first
  const consumed = await useItem(userId, "streak_freeze_1")
  if (consumed) {
    console.log(`[Streak] Consumed streak_freeze_1 for user ${userId}`)
    return true
  }

  // Try 3-day freeze (stored as individual days)
  const consumed3 = await useItem(userId, "streak_freeze_3")
  if (consumed3) {
    console.log(`[Streak] Consumed streak_freeze_3 for user ${userId}`)
    return true
  }

  return false
}

/**
 * Zvýší denní streak pro uživatele.
 * - pokud dnes ještě nebyl zapsaný → navýší streak (nebo resetne, když je díra)
 * - pokud už dnes zapsaný je → nechá beze změny
 * - pokud hráč vynechal den(y), zkusí nejdřív spotřebovat streak freeze
 */
export async function bumpUserDailyStreak(userId: string): Promise<UserStreakDoc> {
  const ref = doc(db, "user_streaks", userId)
  const snap = await getDoc(ref)
  const today = getTodayStr()

  if (!snap.exists()) {
    const data: UserStreakDoc = {
      streak: 1,
      lastDate: today,
    }
    await setDoc(ref, data)
    return data
  }

  const data = snap.data() as Partial<UserStreakDoc>
  const lastDate = data.lastDate
  let streak = typeof data.streak === "number" ? data.streak : 0

  if (!lastDate) {
    // neměl nic → začínáme
    streak = 1
  } else if (lastDate === today) {
    // dnešek už je zapsaný → nic neměníme
    return {
      streak,
      lastDate,
    }
  } else {
    const diff = diffInDays(lastDate, today)
    if (diff === 1) {
      // včera hrál → +1
      streak = streak + 1
    } else {
      // mezera → zkusíme streak freeze
      const freezeUsed = await checkAndConsumeStreakFreeze(userId)
      if (freezeUsed) {
        // streak zachován, ale neinkrementujeme (hráč ten den nehrál)
        console.log(`[Streak] Freeze used! Streak preserved at ${streak} for user ${userId}`)
      } else {
        // žádný freeze → reset na 1
        streak = 1
      }
    }
  }

  const newDoc: UserStreakDoc = {
    streak,
    lastDate: today,
  }

  await setDoc(ref, newDoc)
  return newDoc
}

/**
 * Vrátí aktuální streak (číslo) pro daného usera
 */
export async function getUserStreak(userId: string): Promise<number> {
  const ref = doc(db, "user_streaks", userId)
  const snap = await getDoc(ref)
  if (!snap.exists()) return 0

  const data = snap.data() as Partial<UserStreakDoc>
  return typeof data.streak === "number" ? data.streak : 0
}

