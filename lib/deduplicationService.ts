import crypto from 'crypto';

/**
 * Utility pro robustní deduplikaci článků
 * Používá kombinaci: URL hash + titulek hash + levenshtein vzdálenost
 */

/**
 * Vytvoří hash z řetězce (SHA256)
 */
export function createHash(text: string): string {
  return crypto.createHash('sha256').update(text.toLowerCase().trim()).digest('hex');
}

/**
 * Normalizuje text pro porovnávání
 * - Odebere diakritiku
 * - Převede na lowercase
 * - Odebere extra mezery
 */
function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normalizuje URL
 */
function normalizeUrl(url: string): string {
  try {
    const parsed = new URL(url);
    // Odstrani query parametry a fragmenty
    return `${parsed.origin}${parsed.pathname}`.toLowerCase();
  } catch {
    return url.toLowerCase();
  }
}

/**
 * Levenshteinova vzdálenost - měří podobnost mezi dvěma řetězci
 * 0 = identické, vyšší = méně podobné
 */
export function levenshteinDistance(str1: string, str2: string): number {
  const normalized1 = normalizeText(str1);
  const normalized2 = normalizeText(str2);

  const matrix: number[][] = [];

  for (let i = 0; i <= normalized2.length; i++) {
    matrix[i] = [i];
  }

  for (let j = 0; j <= normalized1.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= normalized2.length; i++) {
    for (let j = 1; j <= normalized1.length; j++) {
      if (normalized2.charAt(i - 1) === normalized1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[normalized2.length][normalized1.length];
}

/**
 * Vypočítá similarity score (0-100) mezi dvěma řetězci
 * 100 = identické, 0 = zcela odlišné
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const maxLength = Math.max(str1.length, str2.length);
  if (maxLength === 0) return 100;

  const distance = levenshteinDistance(str1, str2);
  return Math.max(0, 100 - (distance / maxLength) * 100);
}

/**
 * Deduplikační klíč pro článek
 * Kombinuje URL hash + normalizovaný titulek
 */
export interface DeduplicationKey {
  urlHash: string;
  titleHash: string;
  normalizedUrl: string;
  normalizedTitle: string;
}

export function createDeduplicationKey(article: {
  url: string;
  title: string;
}): DeduplicationKey {
  return {
    urlHash: createHash(article.url),
    titleHash: createHash(article.title),
    normalizedUrl: normalizeUrl(article.url),
    normalizedTitle: normalizeText(article.title)
  };
}

/**
 * Kontroluje, zda jsou dva články duplikáty
 * Vrací: { isDuplicate: boolean, confidence: number (0-100) }
 */
export function isDuplicate(
  article1: { url: string; title: string },
  article2: { url: string; title: string },
  titleSimilarityThreshold: number = 85 // Pokud je similarity vyšší než 85%, je to duplikát
): { isDuplicate: boolean; confidence: number } {
  const key1 = createDeduplicationKey(article1);
  const key2 = createDeduplicationKey(article2);

  // Kontrola 1: Identické URL
  if (key1.urlHash === key2.urlHash) {
    return { isDuplicate: true, confidence: 100 };
  }

  // Kontrola 2: Normalizované URL jsou stejné
  if (key1.normalizedUrl === key2.normalizedUrl) {
    return { isDuplicate: true, confidence: 95 };
  }

  // Kontrola 3: Identické titulky
  if (key1.titleHash === key2.titleHash) {
    return { isDuplicate: true, confidence: 100 };
  }

  // Kontrola 4: Vysoká podobnost titulků (Levenshtein)
  const titleSimilarity = calculateSimilarity(article1.title, article2.title);
  if (titleSimilarity >= titleSimilarityThreshold) {
    // Pokud jsou titulky velmi podobné a URL obsahují stejný doménu, je to duplikát
    try {
      const url1Domain = new URL(article1.url).hostname;
      const url2Domain = new URL(article2.url).hostname;
      if (url1Domain === url2Domain) {
        return { isDuplicate: true, confidence: titleSimilarity };
      }
    } catch {
      // Pokud nemůžeme parsovat URL, nebereme to jako duplikát
    }
  }

  return { isDuplicate: false, confidence: titleSimilarity };
}

/**
 * Filtruje seznam článků a odstraňuje duplikáty
 * Vrací pouze unikátní články
 */
export function deduplicateArticles<T extends { url: string; title: string }>(
  articles: T[],
  titleSimilarityThreshold: number = 85
): T[] {
  const seen = new Map<string, T>();
  const duplicates: T[] = [];

  for (const article of articles) {
    const key = createDeduplicationKey(article);
    const keyString = `${key.urlHash}|${key.titleHash}`;

    if (seen.has(keyString)) {
      duplicates.push(article);
      continue;
    }

    // Kontrola proti všem předchozím článkům
    let isDup = false;
    for (const existingArticle of seen.values()) {
      const duplicationResult = isDuplicate(
        article,
        existingArticle,
        titleSimilarityThreshold
      );
      if (duplicationResult.isDuplicate) {
        duplicates.push(article);
        isDup = true;
        break;
      }
    }

    if (!isDup) {
      seen.set(keyString, article);
    }
  }

  return Array.from(seen.values());
}
