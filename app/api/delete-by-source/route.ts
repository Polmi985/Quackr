import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

const VALID_SOURCES = ['ČT24', 'Seznam Zprávy', 'Hospodářské noviny', 'Český rozhlas'];

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const searchParams = request.nextUrl.searchParams;
    const confirm = searchParams.get('confirm');
    const source = searchParams.get('source');

    if (!source) {
      return NextResponse.json({
        success: false,
        error: 'Missing "source" parameter. Valid sources: ' + VALID_SOURCES.join(', '),
      }, { status: 400 });
    }

    if (!VALID_SOURCES.includes(source)) {
      return NextResponse.json({
        success: false,
        error: `Invalid source "${source}". Valid sources: ${VALID_SOURCES.join(', ')}`,
      }, { status: 400 });
    }

    if (confirm !== 'yes') {
      return NextResponse.json({
        success: false,
        error: 'Please add &confirm=yes to confirm deletion',
        message: 'This is a safety measure to prevent accidental deletion',
      }, { status: 400 });
    }

    console.log(`[delete-by-source] Starting deletion of articles with source="${source}"...`);

    const articlesRef = collection(db, 'articles');
    const q = query(articlesRef, where('source', '==', source));
    const snapshot = await getDocs(q);

    console.log(`[delete-by-source] Found ${snapshot.size} articles with source="${source}"`);

    let deleted = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const docSnapshot of snapshot.docs) {
      try {
        await deleteDoc(doc(db, 'articles', docSnapshot.id));
        deleted++;
      } catch (error) {
        failed++;
        const errorMsg = error instanceof Error ? error.message : 'Unknown error';
        console.error(`[delete-by-source] Failed to delete article ${docSnapshot.id}:`, error);
        errors.push(`Article ${docSnapshot.id}: ${errorMsg}`);
      }
    }

    console.log(`[delete-by-source] Deletion complete. Source="${source}", Deleted: ${deleted}, Failed: ${failed}`);

    return NextResponse.json({
      success: true,
      source,
      deleted,
      failed,
      total: snapshot.size,
      ...(errors.length > 0 && { errors: errors.slice(0, 5) }),
    });
  } catch (error) {
    console.error('[delete-by-source] Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete articles by source',
      },
      { status: 500 }
    );
  }
}
