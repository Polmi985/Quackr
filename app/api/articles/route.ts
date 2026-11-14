import { NextRequest, NextResponse } from 'next/server';
import { getArticles } from '@/lib/articleService';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const limitCount = searchParams.get('limit');
    const category = searchParams.get('category');
    const userId = searchParams.get('userId');

    const articles = await getArticles({
      limitCount: limitCount ? parseInt(limitCount) : 50,
      category: category || undefined,
      userId: userId || undefined
    });

    return NextResponse.json({
      success: true,
      articles,
      count: articles.length
    });
  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch articles'
      },
      { status: 500 }
    );
  }
}