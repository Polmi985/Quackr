import { db } from './firebase';
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  Timestamp,
  doc,
  getDoc,
  writeBatch
} from 'firebase/firestore';
import { CT24Article } from './ct24Scraper';
import { SeznamArticle } from './seznamScraper';
import { HNArticle } from './hnScraper';
import { getAllReadArticles } from './userReadArticlesService';
import { logError, logWarning, logInfo, logMetric } from './monitoringService';
import { validateArticle, GenericArticleSchema } from './schemas';
import { isDuplicate, createDeduplicationKey } from './deduplicationService';

// Generic article interface that works with CT24 and Seznam
export interface GenericArticle {
  id: string;
  title: string;
  perex: string;
  category: string;
  datePublished: string;
  url: string;
  imageUrl?: string;
}

export interface DBArticle {
  id?: string;
  articleId: string; // Original article ID from source
  title: string;
  perex: string;
  category: string;
  datePublished: string;
  url: string;
  imageUrl?: string;
  source: string;
  createdAt: Timestamp;
  // Deduplikační pole pro detekci duplikátů
  titleHash?: string;
  urlHash?: string;
  // Fake article fields
  fakePerex?: string;
  fakeSnippet?: string;
  fakeSnippetExplanation?: string;
  reasoning?: string[];
  isFake?: boolean;
}

const ARTICLES_COLLECTION = 'articles';
const FAKE_ARTICLES_COLLECTION = 'fake_articles';

/**
 * Check if an article already exists in the database using advanced deduplication
 */
export async function articleExists(articleId: string): Promise<boolean> {
  try {
    const articlesRef = collection(db, ARTICLES_COLLECTION);
    const q = query(articlesRef, where('articleId', '==', articleId), limit(1));
    const snapshot = await getDocs(q);
    return !snapshot.empty;
  } catch (error) {
    logError('articleService', 'Error checking article existence', {
      articleId
    }, error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Pokročilá deduplikační kontrola - kontroluje URL, titulek a podobnost
 */
export async function checkForDuplicates(
  article: CT24Article | SeznamArticle | HNArticle | GenericArticle
): Promise<boolean> {
  try {
    // Kontrola 1: Přesná shoda podle articleId
    const existsByIdRef = collection(db, ARTICLES_COLLECTION);
    const idQuery = query(existsByIdRef, where('articleId', '==', article.id), limit(1));
    const idSnapshot = await getDocs(idQuery);
    
    if (!idSnapshot.empty) {
      logInfo('articleService', `Duplicate found: exact ID match for ${article.id}`);
      return true;
    }

    // Kontrola 2: URL match
    const urlQuery = query(existsByIdRef, where('url', '==', article.url), limit(1));
    const urlSnapshot = await getDocs(urlQuery);
    
    if (!urlSnapshot.empty) {
      logWarning('articleService', `Potential duplicate: URL match for ${article.id}`, {
        url: article.url
      });
      return true;
    }

    // Kontrola 3: Přesná shoda v databázi proti všem článkům (náročnější)
    const allArticlesQuery = query(existsByIdRef, limit(100)); // Omež na posledních 100 pro performance
    const allSnapshot = await getDocs(allArticlesQuery);
    
    for (const doc of allSnapshot.docs) {
      const existingArticle = {
        url: doc.data().url,
        title: doc.data().title
      };
      
      const duplicationCheck = isDuplicate(
        { url: article.url, title: article.title },
        existingArticle,
        85 // 85% podobnosti = duplikát
      );
      
      if (duplicationCheck.isDuplicate && duplicationCheck.confidence > 90) {
        logWarning('articleService', `Potential duplicate: High similarity match`, {
          articleId: article.id,
          existingId: doc.data().articleId,
          similarity: duplicationCheck.confidence
        });
        return true;
      }
    }

    return false;
  } catch (error) {
    logError('articleService', 'Error in duplicate checking', {
      articleId: article.id
    }, error instanceof Error ? error : new Error(String(error)));
    return false;
  }
}

/**
 * Save a single article to Firestore (only if it doesn't exist)
 * Works with CT24Article, SeznamArticle, or GenericArticle
 */
export async function saveArticle(
  article: CT24Article | SeznamArticle | HNArticle | GenericArticle,
  skipDuplicateCheck = false,
  source?: string
): Promise<boolean> {
  try {
    logInfo('articleService', `Starting save for article: ${article.id}`);

    // Validuj data před uložením
    const validationResult = validateArticle(article, GenericArticleSchema);
    if (!validationResult.valid) {
      logWarning('articleService', `Invalid article data for ID ${article.id}`, {
        errors: validationResult.errors
      });
      return false;
    }

    // Check if article already exists (unless skipped)
    if (!skipDuplicateCheck) {
      const isDuplicate = await checkForDuplicates(article);
      if (isDuplicate) {
        logInfo('articleService', `Article ${article.id} is a duplicate, skipping...`);
        return false;
      }
    }

    // Determine source from article ID or parameter
    let articleSource = source || 'ČT24';
    if (article.id.startsWith('seznam_')) {
      articleSource = 'Seznam Zprávy';
    } else if (article.id.startsWith('hn_')) {
      articleSource = 'Hospodářské noviny';
    }

    // Vytvoř deduplikační klíče pro budoucí kontroly
    const dedupeKey = createDeduplicationKey({
      url: article.url,
      title: article.title
    });

    // Save the article (Firestore doesn't allow undefined values)
    const dbArticle: Omit<DBArticle, 'id'> = {
      articleId: article.id,
      title: article.title,
      perex: article.perex,
      category: article.category,
      datePublished: article.datePublished,
      url: article.url,
      imageUrl: article.imageUrl || '', // Convert undefined to empty string
      source: articleSource,
      titleHash: dedupeKey.titleHash,
      urlHash: dedupeKey.urlHash,
      createdAt: Timestamp.now()
    };

    logInfo('articleService', `Attempting to add document to Firestore...`);
    const docRef = await addDoc(collection(db, ARTICLES_COLLECTION), dbArticle);
    
    logInfo('articleService', `Article ${article.id} saved successfully with doc ID: ${docRef.id}`);
    logMetric('articleService', 'article_saved', 1, {
      source: articleSource
    });
    
    return true;
  } catch (error) {
    logError('articleService', `Error saving article ${article.id}`, {
      source: source || 'ČT24'
    }, error instanceof Error ? error : new Error(String(error)));
    
    throw error;
  }
}

/**
 * Save multiple articles to Firestore with duplicate checking
 * Works with CT24Article, SeznamArticle, or GenericArticle arrays
 */
export async function saveArticles(
  articles: (CT24Article | SeznamArticle | HNArticle | GenericArticle)[],
  source?: string
): Promise<{ saved: number; skipped: number }> {
  logInfo('articleService', `Starting batch save of ${articles.length} articles`);
  
  let saved = 0;
  let skipped = 0;

  for (const article of articles) {
    try {
      const wasSaved = await saveArticle(article, false, source);
      if (wasSaved) {
        saved++;
      } else {
        skipped++;
      }
    } catch (error) {
      logError('articleService', `Failed to save article ${article.id}`, {}, 
        error instanceof Error ? error : new Error(String(error)));
      skipped++;
    }
  }

  logMetric('articleService', 'batch_save_count', saved);
  logMetric('articleService', 'batch_skip_count', skipped);
  logInfo('articleService', `Batch save completed: ${saved} saved, ${skipped} skipped`);

  return { saved, skipped };
}

/**
 * Get articles from Firestore with optional filtering and pagination
 * This function fetches both real and fake articles and mixes them
 * Filters out articles that the user has already read
 */
export async function getArticles(options?: {
  limitCount?: number;
  category?: string;
  userId?: string;
}): Promise<DBArticle[]> {
  try {
    logInfo('articleService', 'Starting article fetch', options);

    // Get user's read articles if userId is provided (includes both real and fake for filtering)
    let readArticleIds: Set<string> = new Set();
    if (options?.userId) {
      try {
        const userReadArticles = await getAllReadArticles(options.userId);
        readArticleIds = new Set(userReadArticles.map(a => a.articleId));
        logInfo('articleService', `User has interacted with ${readArticleIds.size} articles (real + fake)`, {
          userId: options.userId
        });
      } catch (error) {
        logError('articleService', 'Error fetching user read articles', {
          userId: options.userId
        }, error instanceof Error ? error : new Error(String(error)));
        // Continue without filtering if there's an error
      }
    }

    const requestedLimit = options?.limitCount || 50;

    // Fetch ALL articles (no limit) - we'll filter and shuffle them
    const realArticlesRef = collection(db, ARTICLES_COLLECTION);
    let realQuery;

    if (options?.category) {
      realQuery = query(
        realArticlesRef,
        where('category', '==', options.category),
        orderBy('createdAt', 'desc')
      );
    } else {
      realQuery = query(
        realArticlesRef,
        orderBy('createdAt', 'desc')
      );
    }

    // Fetch ALL fake articles
    const fakeArticlesRef = collection(db, FAKE_ARTICLES_COLLECTION);
    let fakeQuery;

    if (options?.category) {
      fakeQuery = query(
        fakeArticlesRef,
        where('category', '==', options.category),
        orderBy('createdAt', 'desc')
      );
    } else {
      fakeQuery = query(
        fakeArticlesRef,
        orderBy('createdAt', 'desc')
      );
    }

    logInfo('articleService', 'Fetching real and fake articles from Firestore');

    // Fetch both collections in parallel
    const [realSnapshot, fakeSnapshot] = await Promise.all([
      getDocs(realQuery),
      getDocs(fakeQuery)
    ]);

    logMetric('articleService', 'real_articles_fetched', realSnapshot.size, {
      category: options?.category || 'all'
    });
    logMetric('articleService', 'fake_articles_fetched', fakeSnapshot.size, {
      category: options?.category || 'all'
    });

    const realArticles: DBArticle[] = [];
    const fakeArticles: DBArticle[] = [];

    // Process real articles and filter out already read ones
    realSnapshot.forEach((doc) => {
      const data = doc.data();
      const article = {
        id: doc.id,
        ...data,
        isFake: false
      } as DBArticle;

      // Check if user has read this article (using Firestore doc ID)
      const isRead = article.id && readArticleIds.has(article.id);

      if (!isRead) {
        realArticles.push(article);
      }
    });

    // Process fake articles and filter out already read ones
    fakeSnapshot.forEach((doc) => {
      const data = doc.data();
      const article = {
        id: doc.id,
        ...data,
        isFake: true
      } as DBArticle;

      // Check if user has read this article (using Firestore doc ID)
      const isRead = article.id && readArticleIds.has(article.id);

      if (!isRead) {
        fakeArticles.push(article);
      }
    });

    logInfo('articleService', `After filtering: ${realArticles.length} unread real articles, ${fakeArticles.length} unread fake articles`, {
      category: options?.category || 'all'
    });

    // Shuffle both arrays using Fisher-Yates algorithm for true randomness
    const shuffleArray = <T>(array: T[]): T[] => {
      const shuffled = [...array];
      for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
      }
      return shuffled;
    };

    const shuffledReal = shuffleArray(realArticles);
    const shuffledFake = shuffleArray(fakeArticles);

    // Mix real and fake articles with target ratio (60% real, 40% fake)
    const mixedArticles: DBArticle[] = [];
    let realIndex = 0;
    let fakeIndex = 0;

    for (let i = 0; i < requestedLimit && (realIndex < shuffledReal.length || fakeIndex < shuffledFake.length); i++) {
      // Randomly decide whether to add a real or fake article based on target ratio
      const addFake = Math.random() < 0.4 && fakeIndex < shuffledFake.length;

      if (addFake) {
        mixedArticles.push(shuffledFake[fakeIndex]);
        fakeIndex++;
      } else if (realIndex < shuffledReal.length) {
        mixedArticles.push(shuffledReal[realIndex]);
        realIndex++;
      } else if (fakeIndex < shuffledFake.length) {
        // If we're out of real articles, add fake ones
        mixedArticles.push(shuffledFake[fakeIndex]);
        fakeIndex++;
      }
    }

    // Ensure real + fake articles with the same articleId/url are never adjacent
    const separateSameArticles = (articles: DBArticle[]): DBArticle[] => {
      const result = [...articles];
      for (let i = 0; i < result.length - 1; i++) {
        if (
          result[i].articleId === result[i + 1].articleId ||
          result[i].url === result[i + 1].url
        ) {
          // Find the nearest non-conflicting article to swap with
          let swapIdx = -1;
          for (let j = i + 2; j < result.length; j++) {
            const candidate = result[j];
            // Check candidate won't conflict with position i or i+2
            const conflictsWithPrev =
              candidate.articleId === result[i].articleId ||
              candidate.url === result[i].url;
            const conflictsWithNext =
              j < result.length - 1 &&
              (candidate.articleId === result[i + 2]?.articleId ||
               candidate.url === result[i + 2]?.url);
            if (!conflictsWithPrev && !conflictsWithNext) {
              swapIdx = j;
              break;
            }
          }
          if (swapIdx !== -1) {
            [result[i + 1], result[swapIdx]] = [result[swapIdx], result[i + 1]];
          }
        }
      }
      return result;
    };

    const separatedArticles = separateSameArticles(mixedArticles);

    logMetric('articleService', 'articles_returned', separatedArticles.length, {
      realCount: String(realIndex),
      fakeCount: String(fakeIndex),
      category: options?.category || 'all'
    });

    logInfo('articleService', `Returning ${separatedArticles.length} mixed articles (${realIndex} real, ${fakeIndex} fake)`);

    // If we have no articles after filtering and a userId was provided, log a warning
    if (separatedArticles.length === 0 && options?.userId) {
      logWarning('articleService', 'No unread articles found for user. User may have read all available articles.', {
        userId: options.userId,
        category: options.category
      });
    }

    return separatedArticles;
  } catch (error) {
    logError('articleService', 'Error getting articles', {
      category: options?.category,
      userId: options?.userId
    }, error instanceof Error ? error : new Error(String(error)));
    
    throw error;
  }
}

/**
 * Get a single article by its Firestore document ID
 */
export async function getArticleById(id: string): Promise<DBArticle | null> {
  if (!id || typeof id !== 'string') return null;
  try {
    const docSnap = await getDoc(doc(db, ARTICLES_COLLECTION, id));
    if (docSnap.exists()) {
      return { id: docSnap.id, ...docSnap.data(), isFake: false } as DBArticle;
    }

    // Fake articles live in their own collection (see getArticles)
    const fakeSnap = await getDoc(doc(db, FAKE_ARTICLES_COLLECTION, id));
    if (fakeSnap.exists()) {
      return { id: fakeSnap.id, ...fakeSnap.data(), isFake: true } as DBArticle;
    }

    return null;
  } catch (error) {
    console.error('Error getting article:', error);
    throw error;
  }
}