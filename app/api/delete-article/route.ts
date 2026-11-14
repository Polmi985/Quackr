import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { collection, getDocs, deleteDoc, doc, query, where } from 'firebase/firestore';
import { db } from '@/lib/firebase';

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const searchParams = request.nextUrl.searchParams;
    const articleId = searchParams.get('articleId');
    const target = searchParams.get('target') ?? 'both'; // 'real' | 'fake' | 'both'

    if (!articleId) {
      return NextResponse.json(
        { success: false, error: 'Missing "articleId" parameter.' },
        { status: 400 }
      );
    }

    let deletedReal = 0;
    let deletedFake = 0;

    // Delete from articles collection
    if (target === 'real' || target === 'both') {
      const realQ = query(collection(db, 'articles'), where('articleId', '==', articleId));
      const realSnap = await getDocs(realQ);
      for (const d of realSnap.docs) {
        await deleteDoc(doc(db, 'articles', d.id));
        deletedReal++;
      }
      // Also try by doc id as fallback
      if (deletedReal === 0) {
        try {
          await deleteDoc(doc(db, 'articles', articleId));
          deletedReal++;
        } catch {
          // not found by docId, that's fine
        }
      }
    }

    // Delete from fake_articles collection
    if (target === 'fake' || target === 'both') {
      const fakeQ = query(collection(db, 'fake_articles'), where('articleId', '==', articleId));
      const fakeSnap = await getDocs(fakeQ);
      for (const d of fakeSnap.docs) {
        await deleteDoc(doc(db, 'fake_articles', d.id));
        deletedFake++;
      }
    }

    return NextResponse.json({
      success: true,
      articleId,
      target,
      deletedReal,
      deletedFake,
    });
  } catch (err: any) {
    console.error('[delete-article] Error:', err);
    return NextResponse.json(
      { success: false, error: err.message || 'Unknown error' },
      { status: 500 }
    );
  }
}
