// Generate fake perex for a SINGLE article by its articleId.
import { NextResponse } from "next/server";
import { requireAdmin } from '@/lib/serverAuth';
import { db } from "@/lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  deleteDoc,
  query,
  where,
  Timestamp,
} from "firebase/firestore";
import { generateFakePerex, type AIProvider } from "@/lib/fake-generator";

const ARTICLES_COLLECTION = "articles";
const FAKE_ARTICLES_COLLECTION = "fake_articles";

export async function POST(req: Request) {
  const auth = await requireAdmin(req);
  if (auth.error) return auth.error;
  try {
    const body = await req.json();
    const articleId: string | undefined = body?.articleId;
    const rawProvider = body?.provider || "gemini-2.5-flash";
    const allowedProviders: AIProvider[] = [
      "gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash",
      "gemini-2.0-flash-lite", "gemini-3.0-flash", "gemini-2.5-flash-lite",
      "gemini-3.1-pro", "gemini-3.1-flash-lite", "gemma-3-27b", "groq"
    ];
    const provider: AIProvider = allowedProviders.includes(rawProvider) ? rawProvider : "gemini-2.5-flash";
    const forceRegenerate: boolean = body?.force === true;

    if (!articleId) {
      return NextResponse.json(
        { error: "Missing articleId" },
        { status: 400 }
      );
    }

    // Check if fake already exists
    const existingSnap = await getDocs(
      query(
        collection(db, FAKE_ARTICLES_COLLECTION),
        where("articleId", "==", articleId)
      )
    );
    if (!existingSnap.empty && !forceRegenerate) {
      return NextResponse.json(
        { error: "Fake pro tento článek už existuje", alreadyExists: true },
        { status: 409 }
      );
    }

    // Find the original article
    const articleSnap = await getDocs(
      query(
        collection(db, ARTICLES_COLLECTION),
        where("articleId", "==", articleId)
      )
    );

    if (articleSnap.empty) {
      return NextResponse.json(
        { error: "Článek nenalezen" },
        { status: 404 }
      );
    }

    const articleDoc = articleSnap.docs[0];
    const article = articleDoc.data();

    if (!article.perex) {
      return NextResponse.json(
        { error: "Článek nemá perex" },
        { status: 400 }
      );
    }

    // Generate fake
    const result = await generateFakePerex(
      article.perex,
      article.title || undefined,
      provider
    );

    // Delete existing fake(s) if regenerating
    if (!existingSnap.empty) {
      for (const doc of existingSnap.docs) {
        await deleteDoc(doc.ref);
      }
    }

    // Save to fake_articles
    await addDoc(collection(db, FAKE_ARTICLES_COLLECTION), {
      articleId: article.articleId,
      title: article.title || "",
      perex: result.fakePerex,
      fakePerex: result.fakePerex,
      fakeSnippet: result.fakeSnippet,
      fakeSnippetExplanation: result.fakeSnippetExplanation,
      reasoning: result.explanationPoints,
      category: article.category || "",
      datePublished: article.datePublished || "",
      url: article.url || "",
      imageUrl: article.imageUrl || "",
      source: article.source || "",
      isFake: true,
      createdAt: Timestamp.now(),
      generatedBy: result.provider,
      generatedModel: result.model,
    });

    return NextResponse.json({
      success: true,
      articleId,
      fakePerex: result.fakePerex,
      fakeSnippet: result.fakeSnippet,
      fakeSnippetExplanation: result.fakeSnippetExplanation,
      explanationPoints: result.explanationPoints,
      provider: result.provider,
      model: result.model,
    });
  } catch (err: any) {
    console.error("GENERATE-SINGLE-FAKE error:", err);
    return NextResponse.json(
      { error: err.message || "Server error" },
      { status: 500 }
    );
  }
}
