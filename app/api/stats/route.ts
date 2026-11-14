import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { collection, getDocs, query } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logError, logInfo } from '@/lib/monitoringService';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    logInfo('stats-api', 'Fetching article statistics');

    // Počet reálných článků
    const articlesRef = collection(db, 'articles');
    const articlesQuery = query(articlesRef);
    const articlesSnapshot = await getDocs(articlesQuery);
    const articleCount = articlesSnapshot.size;

    // Počet fake článků
    const fakeArticlesRef = collection(db, 'fake_articles');
    const fakeArticlesQuery = query(fakeArticlesRef);
    const fakeSnapshot = await getDocs(fakeArticlesQuery);
    const fakeCount = fakeSnapshot.size;

    // Statistika zdrojů
    const sourceStats: Record<string, number> = {};
    articlesSnapshot.forEach(doc => {
      let source = doc.data().source || 'Unknown';
      // Normalizuj staré zkratky na oficiální názvy
      if (source === 'ct24' || source === 'CT24') {
        source = 'ČT24';
      } else if (source === 'seznam' || source === 'Seznam') {
        source = 'Seznam Zprávy';
      } else if (source === 'hn' || source === 'HN') {
        source = 'Hospodářské noviny';
      }
      sourceStats[source] = (sourceStats[source] || 0) + 1;
    });

    // Statistika kategorií
    const categoryStats: Record<string, number> = {};
    articlesSnapshot.forEach(doc => {
      const category = doc.data().category || 'Unknown';
      categoryStats[category] = (categoryStats[category] || 0) + 1;
    });

    logInfo('stats-api', 'Statistics collected', {
      total: articleCount + fakeCount,
      real: articleCount,
      fake: fakeCount
    });

    return NextResponse.json({
      success: true,
      stats: {
        total: articleCount + fakeCount,
        real: articleCount,
        fake: fakeCount,
        bySource: sourceStats,
        byCategory: categoryStats,
        lastUpdated: new Date().toISOString()
      }
    });
  } catch (error) {
    logError('stats-api', 'Failed to fetch statistics', {}, 
      error instanceof Error ? error : new Error(String(error)));

    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch statistics'
      },
      { status: 500 }
    );
  }
}
