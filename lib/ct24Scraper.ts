import axios from 'axios';
import * as cheerio from 'cheerio';
import { logError, logWarning, logInfo, logMetric } from './monitoringService';
import { validateArticle, CT24ArticleSchema } from './schemas';

export interface CT24Article {
  id: string;
  title: string;
  perex: string;
  category: string;
  datePublished: string;
  url: string;
  imageUrl?: string;
}

export type CT24Theme =
  | 'domaci'      // Domestic
  | 'svet'        // World
  | 'regiony'     // Regions
  | 'ekonomika'   // Economics
  | 'veda'        // Science
  | 'kultura'     // Culture
  | 'sport';      // Sport

export const themeLabels: Record<CT24Theme, string> = {
  domaci: 'Domácí',
  svet: 'Svět',
  regiony: 'Regiony',
  ekonomika: 'Ekonomika',
  veda: 'Věda',
  kultura: 'Kultura',
  sport: 'Sport'
};

// Minimum perex length – if shorter, we try to extend from article page
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
  /\/tema\//i,
  /\/rubrika\//i,
  /\/porady?\//i,
  /\/ivysilani\//i,
  /\/tv-program\//i,
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
 * Fetches an article page and extracts additional text to extend a short perex.
 */
async function extendPerexFromPage(articleUrl: string, currentPerex: string): Promise<string> {
  try {
    const response = await axios.get(articleUrl, {
      headers: AXIOS_HEADERS,
      timeout: 10000,
    });

    const $ = cheerio.load(response.data);
    let perex = currentPerex;

    // Try og:description first – it's often longer than the JSON perex
    const ogDesc = $('meta[property="og:description"]').attr('content')?.trim() || '';
    if (ogDesc.length > perex.length && ogDesc.length >= MIN_PEREX_LENGTH) {
      return truncateAtSentence(ogDesc);
    }

    // Append body paragraphs until we reach the minimum length
    const bodyParagraphs: string[] = [];
    $('article p, [class*="content"] p, [class*="article"] p, [class*="body"] p, main p').each((_, el) => {
      const text = $(el).text().trim();
      if (
        text.length > 20 &&
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

    return truncateAtSentence(perex);
  } catch {
    return currentPerex; // keep original on failure
  }
}

/**
 * Scrapes articles from CT24 website for a specific theme
 * @param theme - The theme/category to scrape articles from
 * @param limit - Maximum number of articles to return (optional)
 * @returns Array of articles with perex (preview text)
 */
export async function scrapeCT24Articles(theme: CT24Theme = 'domaci', limit?: number): Promise<CT24Article[]> {
  const startTime = Date.now();
  
  try {
    const url = theme === 'domaci'
      ? 'https://ct24.ceskatelevize.cz/'
      : `https://ct24.ceskatelevize.cz/${theme}`;

    logInfo('ct24Scraper', `Scraping ČT24: ${url}`);

    const response = await axios.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
      },
      timeout: 10000
    });

    const $ = cheerio.load(response.data);
    const articles: CT24Article[] = [];

    // Try to extract data from Next.js JSON data embedded in the page
    $('script[type="application/json"]').each((_, script) => {
      try {
        const scriptContent = $(script).html();
        if (!scriptContent) return;

        const data = JSON.parse(scriptContent);

        // Navigate through the Next.js data structure
        const extractArticles = (obj: any): void => {
          if (!obj || typeof obj !== 'object') return;

          // Check if this object looks like an article
          if (obj.__typename === 'Article_Out' && obj.id) {
            const mainPath = obj.mainSection?.path || theme;
            const constructedUrl = obj.slug
              ? `https://ct24.ceskatelevize.cz/clanek/${mainPath ? `${mainPath}/` : ''}${obj.slug}${obj.id ? `-${obj.id}` : ''}`
              : mainPath
                ? `https://ct24.ceskatelevize.cz/${mainPath}`
                : 'https://ct24.ceskatelevize.cz';

            const article: CT24Article = {
              id: obj.id.toString(),
              title: obj.title?.main || obj.title?.preview || 'No title',
              perex: truncateAtSentence(obj.perex?.text || 'No preview available'),
              category: obj.mainSection?.name || themeLabels[theme] || 'Unknown',
              datePublished: obj.publication?.datePublished
                ? new Date(obj.publication.datePublished * 1000).toISOString()
                : new Date().toISOString(),
              url: obj.link?.url
                ? (obj.link.url.startsWith('http') ? obj.link.url : `https://ct24.ceskatelevize.cz${obj.link.url}`)
                : (obj.path
                    ? (obj.path.startsWith('http')
                        ? obj.path
                        : `https://ct24.ceskatelevize.cz${obj.path.startsWith('/') ? '' : '/'}${obj.path}`)
                    : constructedUrl),
              imageUrl: obj.previewImage?.crops?.[0]?.url || undefined
            };

            // Validuj artikel před přidáním
            const validationResult = validateArticle(article, CT24ArticleSchema);
            if (!validationResult.valid) {
              logWarning('ct24Scraper', `Invalid article data for ID ${article.id}`, {
                errors: validationResult.errors
              });
              return;
            }

            // Skip non-article content (maps, event calendars, topic pages, etc.)
            if (isNonArticleContent(article.title, article.url)) {
              logInfo('ct24Scraper', `Skipping non-article content: ${article.title}`);
              return;
            }

            articles.push(article);
          }

          // Recursively search through the object
          if (Array.isArray(obj)) {
            obj.forEach(item => extractArticles(item));
          } else {
            Object.values(obj).forEach(value => {
              if (typeof value === 'object' && value !== null) {
                extractArticles(value);
              }
            });
          }
        };

        extractArticles(data);
      } catch (e) {
        // Skip invalid JSON
        logWarning('ct24Scraper', 'Failed to parse embedded JSON', {
          error: e instanceof Error ? e.message : 'Unknown error'
        });
      }
    });

    // If we found articles in JSON data, return them
    if (articles.length > 0) {
      // Remove duplicates based on ID
      const uniqueArticles = Array.from(
        new Map(articles.map(article => [article.id, article])).values()
      );

      // Sort by date (newest first)
      const sorted = uniqueArticles.sort((a, b) =>
        new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
      );

      // Apply limit if specified
      const result = limit ? sorted.slice(0, limit) : sorted;

      // Extend short perexes by fetching article pages
      const BATCH_SIZE = 5;
      for (let i = 0; i < result.length; i += BATCH_SIZE) {
        const batch = result.slice(i, i + BATCH_SIZE);
        const extendPromises = batch.map(async (article) => {
          if (article.perex.length < MIN_PEREX_LENGTH && article.url) {
            article.perex = await extendPerexFromPage(article.url, article.perex);
          }
        });
        await Promise.allSettled(extendPromises);
      }

      const duration = Date.now() - startTime;
      logMetric('ct24Scraper', 'articles_scraped', result.length, {
        theme,
        method: 'json_parsing',
        limited: limit ? 'yes' : 'no'
      });
      logMetric('ct24Scraper', 'scrape_duration_ms', duration, { theme });
      logInfo('ct24Scraper', `Successfully scraped ${result.length} articles in ${duration}ms`, { theme });

      return result;
    }

    // Fallback: Try to scrape from HTML structure if JSON extraction didn't work
    logInfo('ct24Scraper', 'JSON parsing yielded no results, trying HTML fallback', { theme });

    $('article, .article, [class*="article"]').each((_, element) => {
      const $article = $(element);

      const title = $article.find('h1, h2, h3, h4, .title, [class*="title"]').first().text().trim();
      const perex = $article.find('p, .perex, [class*="perex"], [class*="preview"]').first().text().trim();
      const link = $article.find('a').first().attr('href');
      const imageUrl = $article.find('img').first().attr('src');

      if (title && perex) {
        const articleUrl = link ? (link.startsWith('http') ? link : `https://ct24.ceskatelevize.cz${link}`) : url;

        // Skip non-article content (maps, event calendars, topic pages, etc.)
        if (isNonArticleContent(title, articleUrl)) {
          return;
        }

        const article: CT24Article = {
          id: Math.random().toString(36).substring(7),
          title,
          perex: truncateAtSentence(perex),
          category: themeLabels[theme] || 'Unknown',
          datePublished: new Date().toISOString(),
          url: articleUrl,
          imageUrl: imageUrl?.startsWith('http') ? imageUrl : undefined
        };

        // Validuj i fallback články
        const validationResult = validateArticle(article, CT24ArticleSchema);
        if (validationResult.valid) {
          articles.push(article);
        }
      }
    });

    if (articles.length === 0) {
      logWarning('ct24Scraper', 'No articles found', { theme });
    }

    const duration = Date.now() - startTime;
    logMetric('ct24Scraper', 'articles_scraped', articles.length, {
      theme,
      method: 'html_fallback'
    });
    logMetric('ct24Scraper', 'scrape_duration_ms', duration, { theme });

    return articles;
  } catch (error) {
    const duration = Date.now() - startTime;
    logError('ct24Scraper', `Failed to scrape ČT24 (${theme})`, {
      theme,
      duration_ms: duration,
      url: `https://ct24.ceskatelevize.cz/${theme}`
    }, error instanceof Error ? error : new Error(String(error)));
    
    throw new Error(`Failed to scrape CT24 articles: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Get articles from multiple themes
 * @param themes - Array of themes to scrape
 * @param limit - Maximum number of articles to return (optional)
 * @returns Combined array of articles from all themes
 */
export async function scrapeMultipleThemes(themes: CT24Theme[], limit?: number): Promise<CT24Article[]> {
  logInfo('ct24Scraper', `Starting multi-theme scrape: ${themes.join(', ')}`);

  // Calculate per-theme limit to avoid over-fetching when a global limit is set
  const perThemeLimit = limit
    ? Math.max(5, Math.ceil((limit * 1.5) / themes.length))
    : undefined;
  
  const results = await Promise.allSettled(
    themes.map(theme => scrapeCT24Articles(theme, perThemeLimit))
  );

  const allArticles: CT24Article[] = [];
  let successCount = 0;
  let failureCount = 0;

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') {
      allArticles.push(...result.value);
      successCount++;
      logInfo('ct24Scraper', `Theme '${themes[index]}': ${result.value.length} articles`);
    } else {
      failureCount++;
      logError('ct24Scraper', `Failed to scrape theme '${themes[index]}'`, {
        theme: themes[index]
      }, result.reason instanceof Error ? result.reason : new Error(String(result.reason)));
    }
  });

  logMetric('ct24Scraper', 'multi_theme_success_count', successCount);
  logMetric('ct24Scraper', 'multi_theme_failure_count', failureCount);

  // Sort by date (newest first)
  const sorted = allArticles.sort((a, b) =>
    new Date(b.datePublished).getTime() - new Date(a.datePublished).getTime()
  );

  // Apply limit if specified
  return limit ? sorted.slice(0, limit) : sorted;
}
