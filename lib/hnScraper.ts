import axios from 'axios';
import * as cheerio from 'cheerio';
import iconv from 'iconv-lite';
import { logError, logWarning, logInfo, logMetric } from './monitoringService';
import { validateArticle, HNArticleSchema } from './schemas';

export interface HNArticle {
  id: string;
  title: string;
  perex: string;
  category: string;
  datePublished: string;
  url: string;
  imageUrl?: string;
}

export type HNCategory =
  | 'domov'       // Homepage (all categories)
  | 'domaci'      // Domestic
  | 'zahranicni'  // International
  | 'ekonomika'   // Economics
  | 'tech'        // Technology
  | 'nazory';     // Opinions/Comments

export const categoryLabels: Record<HNCategory, string> = {
  domov: 'Zprávy',
  domaci: 'Domácí',
  zahranicni: 'Zahraničí',
  ekonomika: 'Ekonomika',
  tech: 'Technologie',
  nazory: 'Názory',
};

const categoryUrls: Record<HNCategory, string> = {
  domov: 'https://hn.cz/',
  domaci: 'https://domaci.hn.cz/',
  zahranicni: 'https://zahranicni.hn.cz/',
  ekonomika: 'https://ekonomika.hn.cz/',
  tech: 'https://tech.hn.cz/',
  nazory: 'https://nazory.hn.cz/',
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
  /\/event\//i,
  /\/kontext\//i,
  /\/strucne/i,
  /\/podcast/i,
  /\/special\//i,
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

/**
 * Ensures the perex ends at a complete sentence.
 * If the text ends mid-sentence (no sentence-ending punctuation at the end),
 * it trims back to the last full sentence or adds an ellipsis at a word boundary.
 */
function ensureCompleteSentence(text: string): string {
  const trimmed = text.trim();
  if (!trimmed) return trimmed;

  // Remove trailing "..." or "…" that the source website may have added
  let cleaned = trimmed.replace(/\.{2,}$|…$/g, '').trim();

  // If it already ends with sentence-ending punctuation, it's fine
  if (/[.!?]$/.test(cleaned)) return cleaned;

  // Try to find the last complete sentence
  const lastSentenceEnd = cleaned.match(/^[\s\S]*[.!?](?=\s)/u);
  if (lastSentenceEnd && lastSentenceEnd[0].length >= cleaned.length * 0.4) {
    return lastSentenceEnd[0].trim();
  }

  // No complete sentence found – cut at last word boundary and add ellipsis
  const lastSpace = cleaned.lastIndexOf(' ');
  if (lastSpace > cleaned.length * 0.3) {
    return cleaned.substring(0, lastSpace).replace(/[,;:\-–—]$/, '').trim() + '…';
  }

  // Nothing we can do, return with ellipsis
  return cleaned + '…';
}

const AXIOS_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'cs,en;q=0.9',
};

/**
 * Detects charset from raw HTML buffer and decodes it properly.
 * HN.cz pages may use windows-1250 encoding for Czech characters.
 */
function decodeResponse(data: Buffer, contentType?: string): string {
  // 1. Try to get charset from Content-Type header
  let charset = '';
  if (contentType) {
    const match = contentType.match(/charset=([\w-]+)/i);
    if (match) charset = match[1].toLowerCase();
  }

  // 2. If not found in header, peek into the HTML for <meta charset> or <meta http-equiv>
  if (!charset) {
    // Decode a small portion as latin1 (single-byte, lossless) to inspect meta tags
    const head = data.subarray(0, 4096).toString('latin1');
    const metaMatch = head.match(
      /charset=["']?([\w-]+)/i
    );
    if (metaMatch) charset = metaMatch[1].toLowerCase();
  }

  // Normalize common aliases
  if (charset === 'win-1250' || charset === 'cp1250') charset = 'windows-1250';
  if (charset === 'iso-8859-2' || charset === 'latin2') charset = 'iso-8859-2';

  // 3. Decode with detected charset, default to utf-8
  if (charset && charset !== 'utf-8' && iconv.encodingExists(charset)) {
    return iconv.decode(data, charset);
  }

  return data.toString('utf-8');
}

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
      responseType: 'arraybuffer',
    });

    const html = decodeResponse(
      Buffer.from(response.data),
      response.headers['content-type']
    );
    const $ = cheerio.load(html);

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

    // Always ensure perex ends at a complete sentence
    perex = ensureCompleteSentence(perex);

    // Image: og:image meta tag
    let imageUrl = $('meta[property="og:image"]').attr('content')?.trim() || '';
    if (!imageUrl) {
      const imgEl = $('article img[src], [class*="article"] img[src]').first();
      imageUrl = imgEl.attr('src') || '';
    }
    if (imageUrl && imageUrl.startsWith('//')) {
      imageUrl = `https:${imageUrl}`;
    }

    // Date: try article:published_time, time[datetime], or fallback
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
    logWarning('hnScraper', `Failed to fetch article page: ${articleUrl}`, {
      error: error instanceof Error ? error.message : 'Unknown',
    });
    return null;
  }
}

/**
 * Scrapes articles from Hospodářské noviny (hn.cz) website for a specific category.
 *
 * Strategy:
 *  1. Fetch the listing page and collect all unique article URLs.
 *  2. For each URL, fetch the individual article page and extract
 *     title, perex, image and date.
 *
 * @param category - The category to scrape articles from
 * @param limit - Maximum number of articles to return (optional)
 * @returns Array of articles with perex (preview text)
 */
export async function scrapeHNArticles(category: HNCategory = 'domov', limit?: number): Promise<HNArticle[]> {
  const startTime = Date.now();

  try {
    const url = categoryUrls[category];
    logInfo('hnScraper', `Scraping Hospodářské noviny: ${url}`);

    // ---------- Phase 1: collect article URLs from the listing page ----------
    const response = await axios.get(url, {
      headers: AXIOS_HEADERS,
      timeout: 15000,
      responseType: 'arraybuffer',
    });

    const html = decodeResponse(
      Buffer.from(response.data),
      response.headers['content-type']
    );
    const $ = cheerio.load(html);
    const articleUrls: string[] = [];
    const seenUrls = new Set<string>();

    // HN article URLs follow the pattern /c1-XXXXXXX-slug or subdomain.hn.cz/c1-XXXXXXX-slug
    $('a[href*="/c1-"]').each((_, el) => {
      let href = $(el).attr('href') || '';
      if (!href.includes('/c1-')) return;

      // Skip podcast, event, and non-article links
      if (href.includes('/event/') || href.includes('/kontext/') || href.includes('/strucne')) return;

      if (href.startsWith('/')) {
        href = `https://hn.cz${href}`;
      }

      // Only hn.cz domain articles (including subdomains like domaci.hn.cz, archiv.hn.cz)
      if (!href.includes('hn.cz/')) return;

      if (seenUrls.has(href)) return;
      seenUrls.add(href);
      articleUrls.push(href);
    });

    logInfo('hnScraper', `Found ${articleUrls.length} unique article URLs on listing page`, { category });

    // Respect the limit early to avoid unnecessary fetches
    const urlsToFetch = limit ? articleUrls.slice(0, limit) : articleUrls;

    // ---------- Phase 2: fetch individual article pages (batched) ----------
    const BATCH_SIZE = 5;
    const articles: HNArticle[] = [];

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
          logInfo('hnScraper', `Skipping non-article content: ${title}`);
          continue;
        }

        // Generate ID from URL - extract c1-XXXXXXX part
        const c1Match = articleUrl.match(/c1-(\d+)/);
        const articleIdPart = c1Match ? c1Match[1] : articleUrl.split('/').pop() || '';
        const id = `hn_${articleIdPart.replace(/[^a-z0-9-]/gi, '_')}`;

        const article: HNArticle = {
          id,
          title,
          perex,
          category: categoryLabels[category],
          datePublished,
          url: articleUrl,
          imageUrl: imageUrl || undefined,
        };

        // Validate
        const validationResult = validateArticle(article, HNArticleSchema);
        if (!validationResult.valid) {
          logWarning('hnScraper', `Invalid article data for ID ${article.id}`, {
            errors: validationResult.errors,
          });
          continue;
        }

        logInfo('hnScraper', `Extracted article #${articles.length + 1}`, {
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
    logMetric('hnScraper', 'articles_scraped', result.length, { category, limited: limit ? 'yes' : 'no' });
    logMetric('hnScraper', 'scrape_duration_ms', duration, { category });
    logInfo('hnScraper', `Successfully scraped ${result.length} articles in ${duration}ms`, { category });

    return result;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('hnScraper', `Failed to scrape Hospodářské noviny (${category})`, {
      category,
      duration_ms: duration,
      url: categoryUrls[category],
    }, error instanceof Error ? error : new Error(String(error)));

    if (axios.isAxiosError(error)) {
      logWarning('hnScraper', 'Axios error details', {
        status: error.response?.status,
        statusText: error.response?.statusText,
        message: error.message,
      });
    }

    throw error;
  }
}

/**
 * Scrapes articles from multiple Hospodářské noviny categories
 * @param categories - Array of categories to scrape
 * @param limit - Maximum number of articles to return (optional)
 * @returns Combined array of articles from all categories
 */
export async function scrapeMultipleHNCategories(
  categories: HNCategory[],
  limit?: number
): Promise<HNArticle[]> {
  logInfo('hnScraper', `Scraping ${categories.length} categories: ${categories.join(', ')}`);

  const perCategoryLimit = limit
    ? Math.max(5, Math.ceil((limit * 1.5) / categories.length))
    : undefined;

  const results = await Promise.allSettled(
    categories.map(category => scrapeHNArticles(category, perCategoryLimit))
  );

  const allArticles: HNArticle[] = [];
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      logInfo('hnScraper', `Category '${categories[index]}': ${result.value.length} articles`);
      allArticles.push(...result.value);
      successCount++;
    } else {
      logError('hnScraper', `Failed to scrape category '${categories[index]}'`, {
        category: categories[index]
      }, result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
      failureCount++;
    }
  });

  logMetric('hnScraper', 'multi_category_success_count', successCount);
  logMetric('hnScraper', 'multi_category_failure_count', failureCount);

  // Remove duplicates across categories
  const uniqueArticles = Array.from(
    new Map(allArticles.map(article => [article.id, article])).values()
  );

  logInfo('hnScraper', `Total unique articles across categories: ${uniqueArticles.length}`);

  const sorted = uniqueArticles.sort((a, b) =>
    new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
  );

  return limit ? sorted.slice(0, limit) : sorted;
}
