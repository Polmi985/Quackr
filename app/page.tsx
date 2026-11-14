"use client";

import { useState, useEffect } from "react";
import MobileHeader from "@/components/MobileHeader";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/lib/authContext";
import { getUserReadArticles, type UserReadArticle } from "@/lib/userReadArticlesService";

interface Article {
  id: string;
  title: string;
  timestamp: string;
  url?: string;
}

function getRelativeTime(timestamp: any): string {
  const date = timestamp?.toDate ? timestamp.toDate() : new Date(timestamp);
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) return "právě teď";
  if (diffInSeconds < 3600)
    return `před ${Math.floor(diffInSeconds / 60)} minutami`;
  if (diffInSeconds < 86400)
    return `před ${Math.floor(diffInSeconds / 3600)} hodinami`;
  if (diffInSeconds < 604800)
    return `před ${Math.floor(diffInSeconds / 86400)} dny`;

  // Změněno na české formátování data
  return date.toLocaleDateString("cs-CZ", { month: "long", day: "numeric", year: "numeric" });
}

export default function ReadArticlesPage() {
  const { user } = useAuth();
  const [articles, setArticles] = useState<Article[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchReadArticles = async () => {
      if (!user) {
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      try {
        const readArticles = await getUserReadArticles(user.uid);

        // Transform and sort by most recent
        const transformedArticles: Article[] = readArticles
          .map((article: UserReadArticle) => ({
            id: article.articleId,
            title: article.title,
            timestamp: getRelativeTime(article.readAt),
            url: article.url,
          }))
          .sort((a, b) => {
            // Sort by readAt timestamp (most recent first)
            return 0; // They're already in order from Firebase
          });

        setArticles(transformedArticles);
      } catch (err) {
        console.error("Error fetching read articles:", err);
        // Přeložená chybová hláška
        setError("Nepodařilo se načíst vaše přečtené články. Zkuste to prosím znovu.");
      } finally {
        setLoading(false);
      }
    };

    fetchReadArticles();
  }, [user]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50 dark:bg-background">

        {/* Hamburger header */}
        <MobileHeader />

        {/* Content */}
        <div className="pt-4">
          {/* Page Header */}
          <div className="max-w-6xl mx-auto px-4 pb-6">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">Přečtené články</h1>
            <p className="text-gray-600 dark:text-muted-foreground">

              Články, které jste již prošli a ohodnotili jako ověřené nebo neověřené
            </p>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex justify-center items-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="max-w-6xl mx-auto px-4 pb-8">
              <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded-lg">
                <p className="font-bold">Chyba</p>
                <p>{error}</p>
              </div>
            </div>
          )}

          {/* Articles List */}
          {!loading && !error && (
            <main className="max-w-6xl mx-auto px-4 pb-24">
              <div className="space-y-3">
                {articles.map((article: Article) => (
                  <article
                    key={article.id}
                    className="bg-white dark:bg-card rounded-lg shadow-md hover:shadow-lg transition-shadow p-5"

                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <span className="text-sm text-gray-500 dark:text-muted-foreground">

                            {article.timestamp}
                          </span>
                        </div>

                        <h2 className="text-xl font-bold text-gray-900 dark:text-foreground mb-1 hover:text-indigo-600 transition-colors">
                          {article.url ? (
                            <a
                              href={article.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="hover:underline"
                            >
                              {article.title}
                            </a>
                          ) : (
                            article.title
                          )}
                        </h2>
                      </div>
                    </div>
                  </article>
                ))}
              </div>

              {articles.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-gray-500 dark:text-muted-foreground text-lg font-medium mb-2">

                    Zatím žádné přečtené články
                  </p>
                    <p className="text-gray-400 dark:text-muted-foreground text-sm">
                    Začněte hodnotit články ve feedu a uvidíte je zde!
                  </p>
                </div>
              )}
            </main>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
