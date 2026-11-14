import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { collection, getDocs, deleteDoc, doc } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    // Optional: Add a confirmation parameter for safety
    const searchParams = request.nextUrl.searchParams;
    const confirm = searchParams.get('confirm');

    if (confirm !== 'yes') {
      return NextResponse.json({
        success: false,
        error: 'Please add ?confirm=yes to the URL to confirm deletion',
        message: 'This is a safety measure to prevent accidental deletion'
      }, { status: 400 });
    }

    console.log('[delete-all-articles] Starting deletion of all articles...');

    // Get all articles from the 'articles' collection
    const articlesRef = collection(db, 'articles');
    const snapshot = await getDocs(articlesRef);

    console.log(`[delete-all-articles] Found ${snapshot.size} articles to delete`);

    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    // Delete each article
    for (const docSnapshot of snapshot.docs) {
      try {
        await deleteDoc(doc(db, 'articles', docSnapshot.id));
        deleted++;
        console.log(`[delete-all-articles] Deleted article: ${docSnapshot.id}`);
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[delete-all-articles] Failed to delete article ${docSnapshot.id}:`, error);
        errors.push(`Article ${docSnapshot.id}: ${errorMsg}`);
      }
    }

    console.log(`[delete-all-articles] Deletion complete. Deleted: ${deleted}, Failed: ${failed}`);

    return NextResponse.json({
      success: true,
      deleted,
      failed,
      total: snapshot.size,
      ...(errors.length > 0 && { errors: errors.slice(0, 5) }) // Return first 5 errors if any
    });

  } catch (error) {
    console.error('[delete-all-articles] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete articles'
      },
      { status: 500 }
    );
  }
}
