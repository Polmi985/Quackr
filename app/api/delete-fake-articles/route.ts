// DELETE /api/delete-fake-articles?confirm=yes
// Deletes all documents from the fake_articles collection
import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from '@/lib/serverAuth';
import { collection, getDocs, deleteDoc, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";

const FAKE_ARTICLES_COLLECTION = "fake_articles";

export async function DELETE(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    const confirm = request.nextUrl.searchParams.get("confirm");
    if (confirm !== "yes") {
      return NextResponse.json(
        {
          success: false,
          error: "Add ?confirm=yes to confirm deletion",
        },
        { status: 400 }
      );
    }

    const snapshot = await getDocs(collection(db, FAKE_ARTICLES_COLLECTION));
    let deleted = 0;
    let failed = 0;

    for (const d of snapshot.docs) {
      try {
        await deleteDoc(doc(db, FAKE_ARTICLES_COLLECTION, d.id));
        deleted++;
      } catch {
        failed++;
      }
    }

    return NextResponse.json({
      success: true,
      deleted,
      failed,
      total: snapshot.size,
    });
  } catch (err: any) {
    console.error("[delete-fake-articles] Error:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
