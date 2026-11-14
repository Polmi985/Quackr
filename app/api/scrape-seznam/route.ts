import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { scrapeSeznamArticles, scrapeMultipleCategories, SeznamCategory } from '@/lib/seznamScraper';
import { saveArticles } from '@/lib/articleService';
import { logError, logInfo, logMetric, getHealthReport } from '@/lib/monitoringService';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') as SeznamCategory | null;
    const categoriesParam = searchParams.get('categories');
    const shouldSave = searchParams.get('save') === 'true';
    const forceS = searchParams.get('force') === 'true';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam), 500) : undefined; // Cap at 500

    logInfo('scrape-seznam-api', 'Request received', {
      category,
      categories: categoriesParam,
      shouldSave,
      force: forceS,
      limit
    });

    let articles;

    try {
      // If multiple categories are specified
      if (categoriesParam) {
        const categories = categoriesParam.split(',').map(c => c.trim()) as SeznamCategory[];
        logInfo('scrape-seznam-api', `Scraping multiple categories: ${categories.join(', ')}`);
        articles = await scrapeMultipleCategories(categories, limit);
      }
      // If single category is specified
      else if (category) {
        logInfo('scrape-seznam-api', `Scraping single category: ${category}`);
        articles = await scrapeSeznamArticles(category, limit);
      }
      // Default: scrape homepage
      else {
        logInfo('scrape-seznam-api', 'Scraping default category: domov');
        articles = await scrapeSeznamArticles('domov', limit);
      }
    } catch (scrapeError) {
      logError('scrape-seznam-api', 'Failed during scraping', {
        category,
        categories: categoriesParam
      }, scrapeError instanceof Error ? scrapeError : new Error(String(scrapeError)));
      
      throw scrapeError;
    }

    logMetric('scrape-seznam-api', 'articles_fetched', articles.length, {
      category: category || categoriesParam || 'domov'
    });

    // Convert Seznam articles to the format expected by articleService
    const convertedArticles = articles.map(article => ({
      id: article.id,
      title: article.title,
      perex: article.perex,
      category: article.category,
      datePublished: article.datePublished,
      url: article.url,
      imageUrl: article.imageUrl
    }));

    // Save to database if requested
    let databaseResult;
    if (shouldSave) {
      logInfo('scrape-seznam-api', `Saving ${convertedArticles.length} articles to database`);
      
      try {
        databaseResult = await saveArticles(convertedArticles);
        
        logMetric('scrape-seznam-api', 'articles_saved', databaseResult.saved, {
          category: category || categoriesParam || 'domov'
        });
        logMetric('scrape-seznam-api', 'articles_skipped', databaseResult.skipped, {
          category: category || categoriesParam || 'domov'
        });
        
        logInfo('scrape-seznam-api', 'Database save completed', databaseResult);
      } catch (saveError) {
        logError('scrape-seznam-api', 'Failed to save articles to database', {
          articlesCount: convertedArticles.length
        }, saveError instanceof Error ? saveError : new Error(String(saveError)));
        
        throw saveError;
      }
    }

    const duration = Date.now() - startTime;
    logMetric('scrape-seznam-api', 'request_duration_ms', duration, {
      category: category || categoriesParam || 'domov',
      shouldSave: String(shouldSave)
    });

    logInfo('scrape-seznam-api', `Request completed successfully in ${duration}ms`, {
      articlesCount: convertedArticles.length,
      saved: databaseResult?.saved,
      skipped: databaseResult?.skipped
    });

    return NextResponse.json({
      success: true,
      category: category || categoriesParam || 'domov',
      articles: convertedArticles,
      count: convertedArticles.length,
      duration_ms: duration,
      ...(shouldSave && { database: databaseResult })
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    
    logError('scrape-seznam-api', 'Request failed', {
      duration_ms: duration
    }, error instanceof Error ? error : new Error(String(error)));

    const healthReport = getHealthReport();

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scrape Seznam Zprávy',
        duration_ms: duration,
        systemHealth: {
          isHealthy: healthReport.isHealthy,
          errorCount: healthReport.errorCount,
          errorRate: `${healthReport.errorRate}%`
        }
      },
      { status: 500 }
    );
  }
}
