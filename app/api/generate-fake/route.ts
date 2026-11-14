// Direct fake perex generator — calls AI providers inline, no external service needed.
import { NextResponse } from "next/server";
import { requireAdmin } from '@/lib/serverAuth';
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  query,
  orderBy,
  Timestamp,
} from "firebase/firestore";
import {
  generateFakePerexWithFallback,
  getProviderDelay,
  type AIProvider,
} from "@/lib/fake-generator";

const ARTICLES_COLLECTION = "articles";
const FAKE_ARTICLES_COLLECTION = "fake_articles";

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  try {
    const body = await req.json().catch(() => ({}));
    const rawProvider = body?.provider || "gemini-2.5-flash";
    const allowedProviders: AIProvider[] = [
      "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash",
      "gemini-2.0-flash-lite", "gemini-3.0-flash", "gemini-2.5-flash-lite",
      "gemini-3.1-pro", "gemini-3.1-flash-lite", "gemma-3-27b", "groq"
    ];
    const provider: AIProvider = allowedProviders.includes(rawProvider) ? rawProvider : "gemini-2.5-flash";
    const batchLimit = Math.min(body?.limit || 10, 50);

    // 1. Collect articleIds that already have a fake version
    const fakeSnap = await getDocs(collection(db, FAKE_ARTICLES_COLLECTION));
    const existingIds = new Set<string>();
    fakeSnap.forEach((d) => {
      const data = d.data();
      if (data.articleId) existingIds.add(data.articleId);
    });

    // 2. Find real articles without a fake counterpart
    const realSnap = await getDocs(
      query(collection(db, ARTICLES_COLLECTION), orderBy("createdAt", "desc"))
    );

    interface ArticleToProcess {
      articleId: string;
      title: string;
      perex: string;
      category: string;
      datePublished: string;
      url: string;
      imageUrl: string;
      source: string;
    }

    const toProcess: ArticleToProcess[] = [];
    realSnap.forEach((d) => {
      const data = d.data();
      if (!existingIds.has(data.articleId) && data.perex) {
        toProcess.push({
          articleId: data.articleId,
          title: data.title || "",
          perex: data.perex,
          category: data.category || "",
          datePublished: data.datePublished || "",
          url: data.url || "",
          imageUrl: data.imageUrl || "",
          source: data.source || "",
        });
      }
    });

    const batch = toProcess.slice(0, batchLimit);
    
    // 3. Generate fake perex for each article directly in parallel
    const parallelPromises = batch.map(async (article) => {
      try {
        const data = await generateFakePerexWithFallback(
          article.perex,
          article.title,
          provider
        );

        // Save to fake_articles
        await addDoc(collection(db, FAKE_ARTICLES_COLLECTION), {
          articleId: article.articleId,
          title: article.title,
          perex: data.fakePerex || "",
          fakePerex: data.fakePerex || "",
          fakeSnippet: data.fakeSnippet || "",
          fakeSnippetExplanation: data.fakeSnippetExplanation || "",
          reasoning: data.explanationPoints || [],
          category: article.category,
          datePublished: article.datePublished,
          url: article.url,
          imageUrl: article.imageUrl,
          source: article.source,
          isFake: true,
          createdAt: Timestamp.now(),
          generatedBy: data.provider || provider,
          generatedModel: data.model || "",
        });

        return {
          articleId: article.articleId,
          title: article.title,
          success: true,
        };
      } catch (err: any) {
        console.error(`[generate-fake] Failed article ${article.articleId}:`, err.message);
        return {
          articleId: article.articleId,
          title: article.title,
          success: false,
          error: err.message || "Unknown error",
        };
      }
    });

    const results = await Promise.all(parallelPromises);

    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;

    return NextResponse.json({
      success: true,
      totalWithoutFake: toProcess.length,
      processed: batch.length,
      succeeded,
      failed,
      provider,
      results,
    });
  } catch (err: any) {
    console.error("GENERATE-FAKE error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
