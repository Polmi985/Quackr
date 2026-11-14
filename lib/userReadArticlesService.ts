// lib/userReadArticlesService.ts
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  Timestamp,
} from "firebase/firestore"
import { db } from "./firebase"

export interface UserReadArticle {
  articleId: string
  title: string
  readAt: Timestamp
  url?: string
  isFake?: boolean  // Track if this is a fake article
}

export interface UserReadArticles {
  userId: string
  articles: UserReadArticle[]
  lastUpdated: Timestamp
}

/**
 * Add an article to user's read list
 * Saves both real and fake articles to prevent repetition
 */
export async function addReadArticle(
  userId: string,
  articleId: string,
  title: string,
  isFake: boolean,
  url?: string
): Promise<void> {
  // Save ALL articles (both real and fake) so we can filter them out
  console.log(`[userReadArticlesService] Saving ${isFake ? 'fake' : 'real'} article: ${articleId}`)

  try {
    const userReadRef = doc(db, "user_read_articles", userId)
    const userReadDoc = await getDoc(userReadRef)

    const readArticle: UserReadArticle = {
      articleId,
      title,
      readAt: Timestamp.now(),
      url: url || undefined,
      isFake: isFake,
    }

    if (userReadDoc.exists()) {
      const existingData = userReadDoc.data() as UserReadArticles

      const alreadyRead = (existingData.articles || []).some(
        (a: UserReadArticle) => a.articleId === articleId
      )

      if (!alreadyRead) {
        await updateDoc(userReadRef, {
          articles: arrayUnion(readArticle),
          lastUpdated: Timestamp.now(),
        })
        console.log(
          `[userReadArticlesService] Added article ${articleId} to user ${userId}`
        )
      } else {
        console.log(
          `[userReadArticlesService] Article ${articleId} already read by user ${userId}`
        )
      }
    } else {
      const newUserRead: UserReadArticles = {
        userId,
        articles: [readArticle],
        lastUpdated: Timestamp.now(),
      }

      await setDoc(userReadRef, newUserRead)
      console.log(
        `[userReadArticlesService] Created read list for user ${userId} with article ${articleId}`
      )
    }
  } catch (error) {
    console.error("[userReadArticlesService] Error adding read article:", error)
    throw error
  }
}

/**
 * Get all articles user has interacted with (for filtering feed)
 * Includes both real and fake articles
 */
export async function getAllReadArticles(
  userId: string
): Promise<UserReadArticle[]> {
  try {
    const userReadRef = doc(db, "user_read_articles", userId)
    const userReadDoc = await getDoc(userReadRef)

    if (userReadDoc.exists()) {
      const data = userReadDoc.data() as UserReadArticles
      return data.articles || []
    }

    return []
  } catch (error) {
    console.error(
      "[userReadArticlesService] Error getting all read articles:",
      error
    )
    throw error
  }
}

/**
 * Get only REAL articles user has read (for display on read page)
 * Filters out fake articles
 */
export async function getUserReadArticles(
  userId: string
): Promise<UserReadArticle[]> {
  try {
    const allArticles = await getAllReadArticles(userId)
    // Filter out fake articles - only return real ones
    return allArticles.filter(article => !article.isFake)
  } catch (error) {
    console.error(
      "[userReadArticlesService] Error getting read articles:",
      error
    )
    throw error
  }
}

/**
 * Počet přečtených článků
 */
export async function getUserReadArticlesCount(
  userId: string
): Promise<number> {
  try {
    const articles = await getUserReadArticles(userId)
    return articles.length
  } catch (error) {
    console.error(
      "[userReadArticlesService] Error getting read articles count:",
      error
    )
    return 0
  }
}
