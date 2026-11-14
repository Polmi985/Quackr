import axios from 'axios';
import * as cheerio from 'cheerio';
import { logError, logWarning, logInfo, logMetric } from './monitoringService';
import { validateArticle, SeznamArticleSchema } from './schemas';

export interface SeznamArticle {
  id: string;
  title: string;
  perex: string;
  category: string;
  datePublished: string;
  url: string;
  imageUrl?: string;
}

export type SeznamCategory =
  | 'domaci'      // Domestic (sekce/domaci-13)
  | 'zahranicni'  // International (sekce/zahranicni-11)
  | 'ekonomika'   // Economics (sekce/ekonomika-194)
  | 'krimi'       // Crime (sekce/krimi-122)
  | 'domov';      // Homepage (all categories)

export const categoryLabels: Record<SeznamCategory, string> = {
  domaci: 'Domácí',
  zahranicni: 'Zahraničí',
  ekonomika: 'Ekonomika',
  krimi: 'Krimi',
  domov: 'Zprávy'
};

const categoryUrls: Record<SeznamCategory, string> = {
  domaci: 'https://www.seznamzpravy.cz/sekce/domaci-13',
  zahranicni: 'https://www.seznamzpravy.cz/sekce/zahranicni-11',
  ekonomika: 'https://www.seznamzpravy.cz/sekce/ekonomika-194',
  krimi: 'https://www.seznamzpravy.cz/sekce/krimi-122',
  domov: 'https://www.seznamzpravy.cz/'
};

// Minimum perex length – if shorter, we extend with body paragraphs
const MIN_PEREX_LENGTH = 120;
const MAX_PEREX_LENGTH = 1000;

/**
 * Checks whether a title/URL indicates non-article content
 * (interactive maps, quizzes, event calendars, topic overviews, etc.)
 */
const NON_ARTICLE_TITLE_PATTERNS = [
  /^mapa\s+(ud[áa]lost[ií]|akc[ií])/i,
  /^p[řr]ehled\s+(ud[áa]lost[ií]|akc[ií])/i,
  /^rozcestn[ií]k/i,
  /^kalend[áa][řr]\s+(ud[áa]lost[ií]|akc[ií])/i,
  /^program\s+(ud[áa]lost[ií]|akc[ií]|kin|divadel|festival)/i,
  /^t[ée]ma\s*:/i,
];

const NON_ARTICLE_URL_PATTERNS = [
  /\/sekce\//i,
  /\/autor\//i,
  /\/tema\//i,
  /\/quiz\//i,
];

function isNonArticleContent(title: string, url: string): boolean {
  for (const pattern of NON_ARTICLE_TITLE_PATTERNS) {
    if (pattern.test(title)) return true;
  }
  for (const pattern of NON_ARTICLE_URL_PATTERNS) {
    if (pattern.test(url)) return true;
  }
  return false;
}

/**
 * Truncates text to maxLen but ensures it ends at the last complete sentence.
 * Falls back to last word boundary if no sentence ending is found.
 */
function truncateAtSentence(text: string, maxLen: number = MAX_PEREX_LENGTH): string {
  if (text.length <= maxLen) return text;

  const truncated = text.substring(0, maxLen);

  // Find the last sentence-ending punctuation (.!?) followed by a space or end
  const sentenceEnd = truncated.match(/^[\s\S]*[.!?](?=\s|$)/u);
  if (sentenceEnd && sentenceEnd[0].length >= maxLen * 0.3) {
    return sentenceEnd[0].trim();
  }

  // Fallback: cut at the last space (word boundary)
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLen * 0.3) {
    return truncated.substring(0, lastSpace).replace(/[,;:\-–—]$/, '').trim() + '…';
  }

  return truncated.trim() + '…';
}

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'cs,en;q=0.9',
};

/**
 * Fetches an individual article page and extracts title, perex, image, and date.
 */
async function scrapeArticlePage(articleUrl: string): Promise<{
  title: string;
  perex: string;
  imageUrl: string;
  datePublished: string;
} | null> {
  try {
    const response = await axios.get(articleUrl, {
      headers: AXIOS_HEADERS,
      timeout: 12000,
    });

    const $ = cheerio.load(response.data);

    // Title: <h1> on article page
    const title = $('h1').first().text().trim();
    if (!title || title.length < 5) return null;

    // Perex: try og:description meta tag first (most reliable)
    let perex = $('meta[property="og:description"]').attr('content')?.trim() || '';

    // Fallback: meta description
    if (!perex) {
      perex = $('meta[name="description"]').attr('content')?.trim() || '';
    }

    // Fallback: first <p> with substantial text inside the article body
    if (!perex) {
      $('article p, [class*="content"] p, [class*="article"] p, main p').each((_, el) => {
        const text = $(el).text().trim();
        if (text.length > 30 && text !== title && !title.includes(text)) {
          perex = text;
          return false; // break
        }
      });
    }

    if (!perex) {
      perex = title; // last resort
    }

    // If perex is too short, extend it with body paragraphs
    if (perex.length < MIN_PEREX_LENGTH) {
      const bodyParagraphs: string[] = [];
      $('article p, [class*="content"] p, [class*="article"] p, [class*="body"] p, main p').each((_, el) => {
        const text = $(el).text().trim();
        if (
          text.length > 20 &&
          text !== title &&
          text !== perex &&
          !perex.includes(text) &&
          !text.includes(perex)
        ) {
          bodyParagraphs.push(text);
        }
      });

      for (const paragraph of bodyParagraphs) {
        if (perex.length >= MIN_PEREX_LENGTH) break;
        perex = perex ? `${perex} ${paragraph}` : paragraph;
      }
    }

    // Trim perex
    if (perex.length > MAX_PEREX_LENGTH) {
      perex = truncateAtSentence(perex);
    }

    // Image: og:image meta tag
    let imageUrl = $('meta[property="og:image"]').attr('content')?.trim() || '';
    if (!imageUrl) {
      const imgEl = $('article img[src], [class*="article"] img[src]').first();
      imageUrl = imgEl.attr('src') || '';
    }
    if (imageUrl && imageUrl.startsWith('//')) {
      imageUrl = `https:${imageUrl}`;
    }

    // Date: try time[datetime], og:article:published_time, or meta
    let datePublished = '';
    const ogDate = $('meta[property="article:published_time"]').attr('content')?.trim();
    if (ogDate) {
      datePublished = new Date(ogDate).toISOString();
    }
    if (!datePublished) {
      const timeEl = $('time[datetime]').first();
      if (timeEl.length > 0) {
        datePublished = new Date(timeEl.attr('datetime')!).toISOString();
      }
    }
    if (!datePublished) {
      datePublished = new Date().toISOString();
    }

    return { title, perex, imageUrl, datePublished };
  } catch (error) {
    logWarning('seznamScraper', `Failed to fetch article page: ${articleUrl}`, {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

/**
 * Scrapes articles from Seznam Zprávy website for a specific category.
 *
 * Strategy:
 *  1. Fetch the listing page and collect all unique article URLs.
 *  2. For each URL, fetch the individual article page and extract
 *     title, perex, image and date – this avoids the bug where the
 *     listing-page DOM structure caused every article to get the
 *     same title/perex.
 *
 * @param category - The category to scrape articles from
 * @param limit - Maximum number of articles to return (optional)
 * @returns Array of articles with perex (preview text)
 */
export async function scrapeSeznamArticles(category: SeznamCategory = 'domov', limit?: number): Promise<SeznamArticle[]> {
  const startTime = Date.now();

  try {
    const url = categoryUrls[category];
    logInfo('seznamScraper', `Scraping Seznam Zprávy: ${url}`);

    // ---------- Phase 1: collect article URLs from the listing page ----------
    const response = await axios.get(url, {
      headers: AXIOS_HEADERS,
      timeout: 15000,
    });

    const $ = cheerio.load(response.data);
    const articleUrls: string[] = [];
    const seenUrls = new Set<string>();

    $('a[href*="/clanek/"]').each((_, el) => {
      let href = $(el).attr('href') || '';
      if (!href.includes('/clanek/')) return;
      if (href.startsWith('/')) {
        href = `https://www.seznamzpravy.cz${href}`;
      }
      // Only seznamzpravy.cz articles
      if (!href.startsWith('https://www.seznamzpravy.cz/')) return;
      if (seenUrls.has(href)) return;
      seenUrls.add(href);
      articleUrls.push(href);
    });

    logInfo('seznamScraper', `Found ${articleUrls.length} unique article URLs on listing page`, { category });

    // Respect the limit early to avoid unnecessary fetches
    const urlsToFetch = limit ? articleUrls.slice(0, limit) : articleUrls;

    // ---------- Phase 2: fetch individual article pages (batched) ----------
    const BATCH_SIZE = 5;
    const articles: SeznamArticle[] = [];

    for (let i = 0; i < urlsToFetch.length; i += BATCH_SIZE) {
      const batch = urlsToFetch.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((articleUrl) => scrapeArticlePage(articleUrl))
      );

      for (let j = 0; j < results.length; j++) {
        const result = results[j];
        const articleUrl = batch[j];

        if (result.status !== 'fulfilled' || !result.value) continue;

        const { title, perex, imageUrl, datePublished } = result.value;

        // Skip non-article content (maps, event calendars, topic pages, etc.)
        if (isNonArticleContent(title, articleUrl)) {
          logInfo('seznamScraper', `Skipping non-article content: ${title}`);
          continue;
        }

        // Generate ID from URL slug
        const urlParts = articleUrl.split('/');
        const articleSlug = urlParts[urlParts.length - 1] || urlParts[urlParts.length - 2];
        const id = `seznam_${articleSlug.replace(/[^a-z0-9-]/gi, '_')}`;

        const article: SeznamArticle = {
          id,
          title,
          perex,
          category: categoryLabels[category],
          datePublished,
          url: articleUrl,
          imageUrl: imageUrl || undefined,
        };

        // Validate
        const validationResult = validateArticle(article, SeznamArticleSchema);
        if (!validationResult.valid) {
          logWarning('seznamScraper', `Invalid article data for ID ${article.id}`, {
            errors: validationResult.errors,
          });
          continue;
        }

        logInfo('seznamScraper', `Extracted article #${articles.length + 1}`, {
          title: title.substring(0, 60),
          perexLength: perex.length,
          category,
        });

        articles.push(article);
      }
    }

    // Sort by date
    const sorted = articles.sort(
      (a, b) => new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
    );

    const result = limit ? sorted.slice(0, limit) : sorted;

    const duration = Date.now() - startTime;
    logMetric('seznamScraper', 'articles_scraped', result.length, { category, limited: limit ? 'yes' : 'no' });
    logMetric('seznamScraper', 'scrape_duration_ms', duration, { category });
    logInfo('seznamScraper', `Successfully scraped ${result.length} articles in ${duration}ms`, { category });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('seznamScraper', `Failed to scrape Seznam Zprávy (${category})`, {
      category,
      duration_ms: duration,
      url: categoryUrls[category],
    }, error instanceof Error ? error : new Error(String(error)));

    if (axios.isAxiosError(error)) {
      logWarning('seznamScraper', 'Axios error details', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
      });
    }

    throw error;
  }
}

/**
 * Scrapes articles from multiple Seznam Zprávy categories
 * @param categories - Array of categories to scrape
 * @param limit - Maximum number of articles to return (optional)
 * @returns Combined array of articles from all categories
 */
export async function scrapeMultipleCategories(
  categories: SeznamCategory[],
  limit?: number
): Promise<SeznamArticle[]> {
  logInfo('seznamScraper', `Scraping ${categories.length} categories: ${categories.join(', ')}`);

  // Calculate a per-category limit to avoid fetching hundreds of article pages
  // unnecessarily. Each category gets a fair share; we fetch slightly more than
  // needed to compensate for deduplication and failures.
  const perCategoryLimit = limit
    ? Math.max(5, Math.ceil((limit * 1.5) / categories.length))
    : undefined;

  const results = await Promise.allSettled(
    categories.map(category => scrapeSeznamArticles(category, perCategoryLimit))
  );

  const allArticles: SeznamArticle[] = [];
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      logInfo('seznamScraper', `Category '${categories[index]}': ${result.value.length} articles`);
      allArticles.push(...result.value);
      successCount++;
    } else {
      logError('seznamScraper', `Failed to scrape category '${categories[index]}'`, {
        category: categories[index]
      }, result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
      failureCount++;
    }
  });

  logMetric('seznamScraper', 'multi_category_success_count', successCount);
  logMetric('seznamScraper', 'multi_category_failure_count', failureCount);

  // Remove duplicates across categories
  const uniqueArticles = Array.from(
    new Map(allArticles.map(article => [article.id, article])).values()
  );

  logInfo('seznamScraper', `Total unique articles across categories: ${uniqueArticles.length}`);

  const sorted = uniqueArticles.sort((a, b) =>
    new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
  );

  // Apply limit if specified
  return limit ? sorted.slice(0, limit) : sorted;
}
