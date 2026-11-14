// Admin-only endpoint: returns all real articles + their fake status.
import { NextResponse } from "next/server";
import { requireAdmin } from '@/lib/serverAuth';
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  query,
  orderBy,
} from "firebase/firestore";

export async function GET(request: Request) {
  const auth = await requireAdmin(request);
  if (auth.error) return auth.error;
  try {
    // Fetch real articles
    const realSnap = await getDocs(
      query(collection(db, "articles"), orderBy("createdAt", "desc"))
    );

    // Fetch fake articles
    const fakeSnap = await getDocs(collection(db, "fake_articles"));

    // Build fake map: articleId → fake doc data
    const fakeMap = new Map<string, any>();
    fakeSnap.forEach((d) => {
      const data = d.data();
      if (data.articleId) {
        fakeMap.set(data.articleId, {
          fakePerex: data.fakePerex || data.perex || "",
          fakeSnippet: data.fakeSnippet || "",
          fakeSnippetExplanation: data.fakeSnippetExplanation || "",
          reasoning: data.reasoning || [],
          generatedBy: data.generatedBy || "",
          generatedModel: data.generatedModel || "",
        });
      }
    });

    const articles: any[] = [];
    realSnap.forEach((d) => {
      const data = d.data();
      const fake = fakeMap.get(data.articleId);
      articles.push({
        docId: d.id,
        articleId: data.articleId || d.id,
        title: data.title || "",
        perex: data.perex || "",
        category: data.category || "",
        source: data.source || "",
        datePublished: data.datePublished || "",
        url: data.url || "",
        imageUrl: data.imageUrl || "",
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() || "",
        hasFake: !!fake,
        ...(fake
          ? {
              fakePerex: fake.fakePerex,
              fakeSnippet: fake.fakeSnippet,
              fakeSnippetExplanation: fake.fakeSnippetExplanation,
              fakeReasoning: fake.reasoning,
              fakeProvider: fake.generatedBy,
              fakeModel: fake.generatedModel,
            }
          : {}),
      });
    });

    return NextResponse.json({
      success: true,
      articles,
      total: articles.length,
      withFake: articles.filter((a) => a.hasFake).length,
      withoutFake: articles.filter((a) => !a.hasFake).length,
    });
  } catch (err: any) {
    console.error("ADMIN-ARTICLES error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
