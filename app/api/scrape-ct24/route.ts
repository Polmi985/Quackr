import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { scrapeCT24Articles, scrapeMultipleThemes, CT24Theme } from '@/lib/ct24Scraper';
import { saveArticles } from '@/lib/articleService';
import { logError, logInfo, logMetric, getHealthReport } from '@/lib/monitoringService';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  const startTime = Date.now();
  
  try {
    const searchParams = request.nextUrl.searchParams;
    const theme = searchParams.get('theme') as CT24Theme | null;
    const themes = searchParams.get('themes')?.split(',') as CT24Theme[] | undefined;
    const saveToDb = searchParams.get('save') === 'true';
    const force = searchParams.get('force') === 'true';
    const limitParam = searchParams.get('limit');
    const limit = limitParam ? Math.min(parseInt(limitParam), 500) : undefined; // Cap at 500

    logInfo('scrape-ct24-api', 'Request received', {
      theme,
      themes: themes?.join(','),
      saveToDb,
      force,
      limit
    });

    let articles;
    let selectedThemes;

    try {
      // If multiple themes are requested
      if (themes && themes.length > 0) {
        articles = await scrapeMultipleThemes(themes, limit);
        selectedThemes = themes;
      } else {
        // If single theme or default
        const selectedTheme = theme || 'domaci';
        articles = await scrapeCT24Articles(selectedTheme, limit);
        selectedThemes = [selectedTheme];
      }
    } catch (scrapeError) {
      logError('scrape-ct24-api', 'Failed during scraping', {
        theme,
        themes
      }, scrapeError instanceof Error ? scrapeError : new Error(String(scrapeError)));
      
      throw scrapeError;
    }

    logMetric('scrape-ct24-api', 'articles_fetched', articles.length, {
      themes: selectedThemes.join(',')
    });

    // Save to database if requested
    let dbResult;
    if (saveToDb) {
      logInfo('scrape-ct24-api', `Saving ${articles.length} articles to database`, {
        force
      });
      
      try {
        if (force) {
          let saved = 0;
          let failed = 0;
          const errors: string[] = [];
          const { saveArticle } = await import('@/lib/articleService');

          for (const article of articles) {
            try {
              const result = await saveArticle(article, true);
              if (result) {
                saved++;
              } else {
                failed++;
                errors.push(`Article ${article.id} returned false`);
              }
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : 'Unknown error';
              logError('scrape-ct24-api', `Failed to save article ${article.id}`, {}, 
                error instanceof Error ? error : new Error(errorMsg));
              errors.push(`Article ${article.id}: ${errorMsg}`);
              failed++;
            }
          }
          dbResult = { saved, skipped: failed, errors: errors.slice(0, 3) };
        } else {
          dbResult = await saveArticles(articles);
        }

        logMetric('scrape-ct24-api', 'articles_saved', dbResult.saved, {
          themes: selectedThemes.join(',')
        });
        logMetric('scrape-ct24-api', 'articles_skipped', dbResult.skipped, {
          themes: selectedThemes.join(',')
        });
        
        logInfo('scrape-ct24-api', 'Database save completed', dbResult);
      } catch (saveError) {
        logError('scrape-ct24-api', 'Failed to save articles to database', {
          articlesCount: articles.length
        }, saveError instanceof Error ? saveError : new Error(String(saveError)));
        
        throw saveError;
      }
    }

    const duration = Date.now() - startTime;
    logMetric('scrape-ct24-api', 'request_duration_ms', duration, {
      themes: selectedThemes.join(','),
      saveToDb: String(saveToDb)
    });

    logInfo('scrape-ct24-api', `Request completed successfully in ${duration}ms`, {
      articlesCount: articles.length,
      saved: dbResult?.saved,
      skipped: dbResult?.skipped
    });

    return NextResponse.json({
      success: true,
      theme: selectedThemes.length === 1 ? selectedThemes[0] : undefined,
      themes: selectedThemes.length > 1 ? selectedThemes : undefined,
      articles,
      count: articles.length,
      duration_ms: duration,
      ...(dbResult && {
        database: {
          saved: dbResult.saved,
          skipped: dbResult.skipped
        }
      })
    });
  } catch (error) {
    const duration = Date.now() - startTime;
    
    logError('scrape-ct24-api', 'Request failed', {
      duration_ms: duration
    }, error instanceof Error ? error : new Error(String(error)));

    const healthReport = getHealthReport();

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to scrape articles',
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