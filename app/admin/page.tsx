"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/lib/authContext";
import MobileHeader from "@/components/MobileHeader";
import { isUserAdmin } from "@/lib/adminService";
import { authFetch } from "@/lib/authFetch";
import { AlertCircle, CheckCircle2, Zap, Trash2, RefreshCw, Eye, BarChart3, Bot, Sparkles, Search, FileText, ChevronDown, ChevronUp, ExternalLink, Filter, X } from "lucide-react";

export default function AdminPage() {
  return (
    <ProtectedRoute>
      <AdminContent />
    </ProtectedRoute>
  );
}

interface ScraperStatus {
  name: string;
  loading: boolean;
  success: boolean;
  message: string;
  count?: number;
  duration?: number;
}

interface HealthReport {
  isHealthy: boolean;
  errorCount: number;
  warningCount: number;
  errorRate: number;
  report: string;
}

interface Stats {
  total: number;
  real: number;
  fake: number;
  bySource: Record<string, number>;
  byCategory: Record<string, number>;
}

interface ApiResponse {
  health?: HealthReport;
  stats?: Stats;
  firebaseStatus?: string;
}

function AdminContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState<boolean>(false);
  const [checking, setChecking] = useState(true);
  
  // Scraping states
  const [scrapers, setScrapers] = useState<ScraperStatus[]>([
    { name: "ČT24 (Domácí)", loading: false, success: false, message: "" },
    { name: "ČT24 (Všechny kategorie)", loading: false, success: false, message: "" },
    { name: "Seznam Zprávy", loading: false, success: false, message: "" },
    { name: "Hospodářské noviny", loading: false, success: false, message: "" },
    { name: "Všechny zdroje", loading: false, success: false, message: "" },
  ]);

  // General state
  const [activeTab, setActiveTab] = useState<"scrape" | "articles" | "monitoring" | "maintenance">("scrape");
  const [health, setHealth] = useState<HealthReport | null>(null);
  const [loadingHealth, setLoadingHealth] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [loadingStats, setLoadingStats] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [logs, setLogs] = useState<any>(null);
  const [articleLimit, setArticleLimit] = useState<number | undefined>(undefined);

  // Delete state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Delete by source state
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [showDeleteSourceConfirm, setShowDeleteSourceConfirm] = useState(false);
  const [isDeletingBySource, setIsDeletingBySource] = useState(false);
  const [deleteSourceMessage, setDeleteSourceMessage] = useState("");

  // Fake generation state
  const [aiProvider, setAiProvider] = useState<"gemini-2.5-flash" | "gemini-2.5-pro" | "gemini-2.0-flash" | "gemini-2.0-flash-lite" | "gemini-3.0-flash" | "gemini-2.5-flash-lite" | "gemini-3.1-pro" | "gemini-3.1-flash-lite" | "gemma-3-27b" | "groq">("gemini-2.5-flash");
  const aiProvidersList = [
    { id: "gemini-2.5-flash", label: "🔵 2.5 Flash", color: "blue" },
    { id: "gemini-2.5-pro", label: "🟣 2.5 Pro", color: "purple" },
    { id: "gemini-2.0-flash", label: "🟦 2.0 Flash", color: "blue" },
    { id: "gemini-2.0-flash-lite", label: "🟡 2.0 Flash Lite", color: "yellow" },
    { id: "gemini-3.0-flash", label: "🟠 3.0 Flash", color: "orange" },
    { id: "gemini-2.5-flash-lite", label: "🟡 2.5 Flash Lite", color: "yellow" },
    { id: "gemini-3.1-pro", label: "🔴 3.1 Pro", color: "red" },
    { id: "gemini-3.1-flash-lite", label: "🟡 3.1 Flash Lite", color: "yellow" },
    { id: "gemma-3-27b", label: "🟢 Gemma 3 27B", color: "emerald" },
    { id: "groq", label: "🟪 Groq", color: "pink" }
  ] as const;

  const [fakeGenLoading, setFakeGenLoading] = useState(false);
  const [fakeGenMessage, setFakeGenMessage] = useState("");
  const [fakeGenLimit, setFakeGenLimit] = useState<number>(10);
  const [fakeGenResults, setFakeGenResults] = useState<{articleId:string;title:string;success:boolean;error?:string}[]>([]);
  const [showFakeGenDetails, setShowFakeGenDetails] = useState(false);
  const [autoGenerateFakes, setAutoGenerateFakes] = useState(false);

  // Articles browser state
  interface ArticleEntry {
    docId: string;
    articleId: string;
    title: string;
    perex: string;
    category: string;
    source: string;
    datePublished: string;
    url: string;
    imageUrl: string;
    createdAt: any;
    hasFake: boolean;
    fakePerex?: string;
    fakeReasoning?: string[];
    fakeProvider?: string;
    fakeModel?: string;
  }
  const [allArticles, setAllArticles] = useState<ArticleEntry[]>([]);
  const [loadingArticles, setLoadingArticles] = useState(false);
  const [articleFilter, setArticleFilter] = useState<"all" | "with-fake" | "without-fake">("all");
  const [articleSearch, setArticleSearch] = useState("");
  const [articleSourceFilter, setArticleSourceFilter] = useState<string>("all");
  const [articleCategoryFilter, setArticleCategoryFilter] = useState<string>("all");
  const [expandedArticleId, setExpandedArticleId] = useState<string | null>(null);
  const [generatingSingleId, setGeneratingSingleId] = useState<string | null>(null);
  const [singleGenMessage, setSingleGenMessage] = useState<Record<string, string>>({});
  const [articlesSortBy, setArticlesSortBy] = useState<"date" | "title" | "source">("date");
  const [articlesSortDir, setArticlesSortDir] = useState<"asc" | "desc">("desc");

  // Delete fakes state
  const [showDeleteFakesConfirm, setShowDeleteFakesConfirm] = useState(false);
  const [isDeletingFakes, setIsDeletingFakes] = useState(false);
  const [deleteFakesMessage, setDeleteFakesMessage] = useState("");

  // Per-article delete state
  const [deletingArticleId, setDeletingArticleId] = useState<string | null>(null);
  const [deleteArticleMsg, setDeleteArticleMsg] = useState<Record<string, string>>({});
  const [confirmDeleteArticleId, setConfirmDeleteArticleId] = useState<string | null>(null);
  const [confirmDeleteFakeId, setConfirmDeleteFakeId] = useState<string | null>(null);

  // API connectivity


  useEffect(() => {
    let mounted = true;
    const checkAdmin = async () => {
      if (!user?.uid) {
        setChecking(false);
        setIsAdmin(false);
        return;
      }
      const allowed = await isUserAdmin(user.uid);
      if (!mounted) return;
      setIsAdmin(allowed);
      setChecking(false);
      if (!allowed) {
        router.push("/");
      }
    };
    checkAdmin();
    return () => {
      mounted = false;
    };
  }, [user, router]);

  // Auto-fetch stats and articles when admin is verified
  useEffect(() => {
    if (isAdmin) {
      fetchStats();
      fetchAllArticles();
    }
  }, [isAdmin]);

  // Safe JSON parser — handles HTML error pages gracefully
  const safeJson = async (res: Response): Promise<any> => {
    const text = await res.text();
    try {
      return JSON.parse(text);
    } catch {
      // Server returned HTML (e.g. timeout, 500 error page)
      const status = res.status;
      throw new Error(
        `Server vrátil neočekávanou odpověď (HTTP ${status}). Zkuste to znovu nebo zmenšete batch.`
      );
    }
  };


  // Scraping functions
  const scrapeCtAll = async () => {
    const scraperIndex = 1; // ČT24 All
    const newScrapers = [...scrapers];
    newScrapers[scraperIndex].loading = true;
    setScrapers(newScrapers);

    try {
      const limitParam = articleLimit ? `&limit=${articleLimit}` : '';
      const res = await authFetch(`/api/scrape-ct24?themes=domaci,svet,regiony,ekonomika,veda,kultura,sport&save=true${limitParam}`
      );
      const data = await safeJson(res);
      
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: data.success,
        message: data.success
          ? `✅ ${data.count} článků scrapnuto, ${data.database?.saved} uloženo, ${data.database?.skipped} duplikátů (${data.duration_ms}ms)`
          : `❌ ${data.error}`,
        count: data.count,
        duration: data.duration_ms,
      };
    } catch (err: any) {
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: false,
        message: `❌ ${err.message || "Neznámá chyba"}`,
      };
    }
    setScrapers(newScrapers);
    if (newScrapers[scraperIndex].success && autoGenerateFakes) {
      handleGenerateFakes();
    }
  };

  const scrapeCt24 = async () => {
    const scraperIndex = 0; // ČT24 Domácí
    const newScrapers = [...scrapers];
    newScrapers[scraperIndex].loading = true;
    setScrapers(newScrapers);

    try {
      const limitParam = articleLimit ? `&limit=${articleLimit}` : '';
      const res = await authFetch(`/api/scrape-ct24?theme=domaci&save=true${limitParam}`);
      const data = await safeJson(res);
      
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: data.success,
        message: data.success
          ? `✅ ${data.count} článků scrapnuto, ${data.database?.saved} uloženo, ${data.database?.skipped} duplikátů (${data.duration_ms}ms)`
          : `❌ ${data.error}`,
        count: data.count,
        duration: data.duration_ms,
      };
    } catch (err: any) {
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: false,
        message: `❌ ${err.message || "Neznámá chyba"}`,
      };
    }
    setScrapers(newScrapers);
    if (newScrapers[scraperIndex].success && autoGenerateFakes) {
      handleGenerateFakes();
    }
  };

  const scrapeSeznam = async () => {
    const scraperIndex = 2; // Seznam
    const newScrapers = [...scrapers];
    newScrapers[scraperIndex].loading = true;
    setScrapers(newScrapers);

    try {
      const limitParam = articleLimit ? `&limit=${articleLimit}` : '';
      const res = await authFetch(`/api/scrape-seznam?categories=domov,domaci,zahranicni,ekonomika,krimi&save=true${limitParam}`
      );
      const data = await safeJson(res);
      
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: data.success,
        message: data.success
          ? `✅ ${data.count} článků scrapnuto, ${data.database?.saved} uloženo, ${data.database?.skipped} duplikátů (${data.duration_ms}ms)`
          : `❌ ${data.error}`,
        count: data.count,
        duration: data.duration_ms,
      };
    } catch (err: any) {
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: false,
        message: `❌ ${err.message || "Neznámá chyba"}`,
      };
    }
    setScrapers(newScrapers);
    if (newScrapers[scraperIndex].success && autoGenerateFakes) {
      handleGenerateFakes();
    }
  };

  const scrapeHN = async () => {
    const scraperIndex = 3; // Hospodářské noviny
    const newScrapers = [...scrapers];
    newScrapers[scraperIndex].loading = true;
    setScrapers(newScrapers);

    try {
      const limitParam = articleLimit ? `&limit=${articleLimit}` : '';
      const res = await authFetch(`/api/scrape-hn?categories=domov,domaci,zahranicni,ekonomika,tech,nazory&save=true${limitParam}`
      );
      const data = await safeJson(res);
      
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: data.success,
        message: data.success
          ? `✅ ${data.count} článků scrapnuto, ${data.database?.saved} uloženo, ${data.database?.skipped} duplikátů (${data.duration_ms}ms)`
          : `❌ ${data.error}`,
        count: data.count,
        duration: data.duration_ms,
      };
    } catch (err: any) {
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: false,
        message: `❌ ${err.message || "Neznámá chyba"}`,
      };
    }
    setScrapers(newScrapers);
    if (newScrapers[scraperIndex].success && autoGenerateFakes) {
      handleGenerateFakes();
    }
  };

  const scrapeBoth = async () => {
    const scraperIndex = 4; // Všechny zdroje
    const newScrapers = [...scrapers];
    newScrapers[scraperIndex].loading = true;
    setScrapers(newScrapers);

    try {
      const start = Date.now();
      const limitParam = articleLimit ? `&limit=${articleLimit}` : '';
      
      const res1 = await authFetch(`/api/scrape-ct24?themes=domaci,svet,regiony,ekonomika,veda,kultura,sport&save=true${limitParam}`
      );
      const data1 = await safeJson(res1);

      const res2 = await authFetch(`/api/scrape-seznam?categories=domov,domaci,zahranicni,ekonomika,krimi&save=true${limitParam}`
      );
      const data2 = await safeJson(res2);

      const res3 = await authFetch(`/api/scrape-hn?categories=domov,domaci,zahranicni,ekonomika,tech,nazory&save=true${limitParam}`
      );
      const data3 = await safeJson(res3);

      const totalCount = (data1.count || 0) + (data2.count || 0) + (data3.count || 0);
      const totalSaved =
        (data1.database?.saved || 0) + (data2.database?.saved || 0) + (data3.database?.saved || 0);
      const totalSkipped =
        (data1.database?.skipped || 0) + (data2.database?.skipped || 0) + (data3.database?.skipped || 0);
      const duration = Date.now() - start;

      const success = data1.success && data2.success && data3.success;
      
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success,
        message: success
          ? `✅ ${totalCount} artikulů scrapnuto, ${totalSaved} uloženo, ${totalSkipped} duplikátů (${duration}ms)`
          : `⚠️ Částečná chyba - CT24: ${data1.success ? "OK" : data1.error}, Seznam: ${data2.success ? "OK" : data2.error}, HN: ${data3.success ? "OK" : data3.error}`,
        count: totalCount,
        duration,
      };
    } catch (err: any) {
      newScrapers[scraperIndex] = {
        ...newScrapers[scraperIndex],
        loading: false,
        success: false,
        message: `❌ ${err.message || "Neznámá chyba"}`,
      };
    }
    setScrapers(newScrapers);
    if (newScrapers[scraperIndex].success && autoGenerateFakes) {
      handleGenerateFakes();
    }
  };

  // Health check
  const fetchHealth = async () => {
    setLoadingHealth(true);
    try {
      const response = await authFetch("/api/health");
      const data: ApiResponse = await safeJson(response);
      
      if (response.ok && data.health) {
        setHealth(data.health);
      } else {
        setHealth({
          isHealthy: false,
          errorCount: 1,
          warningCount: 0,
          errorRate: 100,
          report: "❌ Systém má problémy - API neodpovídá správně"
        });
      }
    } catch (err) {
      setHealth({
        isHealthy: false,
        errorCount: 1,
        warningCount: 0,
        errorRate: 100,
        report: `❌ Systém má problémy - ${err}`
      });
    }
    setLoadingHealth(false);
  };

  // Stats fetch
  const fetchStats = async () => {
    setLoadingStats(true);
    try {
      const response = await authFetch("/api/stats");
      const data: ApiResponse = await safeJson(response);
      
      if (response.ok && data.stats) {
        setStats(data.stats);
      }
    } catch (err) {
      console.error("Failed to fetch stats:", err);
    }
    setLoadingStats(false);
  };

  // Delete all
  const handleDeleteAll = async () => {
    setIsDeleting(true);
    try {
      const res = await authFetch("/api/delete-all-articles?confirm=yes", {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        setScrapers(scrapers.map(s => ({
          ...s,
          message: `✅ Vymazáno ${data.deleted} z ${data.total} článků`
        })));
        setShowDeleteConfirm(false);
      } else {
        setScrapers(scrapers.map(s => ({
          ...s,
          message: `❌ ${data.error}`
        })));
      }
    } catch (err: any) {
      setScrapers(scrapers.map(s => ({
        ...s,
        message: `❌ ${err.message}`
      })));
    }
    setIsDeleting(false);
  };

  // Generate fakes in parallel via backend API
  const handleGenerateFakes = async () => {
    setFakeGenLoading(true);
    setFakeGenResults([]);
    setFakeGenMessage("Získávám seznam článků a generuji (může trvat delší dobu kvůli paralelním requestům)...");

    try {
      const res = await authFetch("/api/generate-fake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: aiProvider, limit: fakeGenLimit }),
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        if (data.processed === 0) {
          setFakeGenMessage("✅ Všechny články již mají fake perex.");
        } else {
          setFakeGenMessage(
            `\u2705 Zpracováno ${data.processed} článků (${data.succeeded} OK, ${data.failed} chyb). Zbývá bez faku: ${data.totalWithoutFake - data.processed}. Provider: ${data.provider}`
          );
        }
        setFakeGenResults(data.results || []);
      } else {
        setFakeGenMessage(`\u274c ${data.error || "Neznámá chyba"}`);
      }
      
      // Update stats and refresh articles to sync UI
      fetchStats();
      fetchAllArticles();
      
    } catch (err: any) {
      setFakeGenMessage(`❌ Chyb: ${err.message}`);
    }
    setFakeGenLoading(false);
  };

  // Delete all fakes
  const handleDeleteFakes = async () => {
    setIsDeletingFakes(true);
    setDeleteFakesMessage("");
    try {
      const res = await authFetch("/api/delete-fake-articles?confirm=yes", {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        setDeleteFakesMessage(`\u2705 Vymazáno ${data.deleted} falešných článků`);
        setShowDeleteFakesConfirm(false);
      } else {
        setDeleteFakesMessage(`\u274c ${data.error}`);
      }
    } catch (err: any) {
      setDeleteFakesMessage(`\u274c ${err.message}`);
    }
    setIsDeletingFakes(false);
  };

  // Delete by source
  const handleDeleteBySource = async () => {
    if (!selectedSource) return;
    setIsDeletingBySource(true);
    setDeleteSourceMessage("");
    try {
      const res = await authFetch(`/api/delete-by-source?source=${encodeURIComponent(selectedSource)}&confirm=yes`,
        { method: "DELETE" }
      );
      const data = await safeJson(res);
      if (res.ok && data.success) {
        setDeleteSourceMessage(
          `✅ Vymazáno ${data.deleted} z ${data.total} článků ze zdroje "${selectedSource}"`
        );
        setShowDeleteSourceConfirm(false);
      } else {
        setDeleteSourceMessage(`❌ ${data.error}`);
      }
    } catch (err: any) {
      setDeleteSourceMessage(`❌ ${err.message}`);
    }
    setIsDeletingBySource(false);
  };

  // ── Fetch all articles + fakes for the Articles tab ──
  const fetchAllArticles = async () => {
    setLoadingArticles(true);
    try {
      const res = await authFetch("/api/admin-articles");
      const data = await safeJson(res);
      if (res.ok && data.success) {
        setAllArticles(data.articles);
      }
    } catch (err) {
      console.error("Fetch articles failed:", err);
    }
    setLoadingArticles(false);
  };

  // Auto-fetch articles when switching to the tab
  useEffect(() => {
    if (activeTab === "articles" && allArticles.length === 0) {
      fetchAllArticles();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // ── Generate fake for a single article ──
  const handleDeleteArticle = async (articleId: string, target: 'real' | 'fake' | 'both') => {
    setDeletingArticleId(articleId);
    setDeleteArticleMsg((prev) => ({ ...prev, [articleId]: "Mažu…" }));
    try {
      const res = await authFetch(`/api/delete-article?articleId=${encodeURIComponent(articleId)}&target=${target}`, {
        method: "DELETE",
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        if (target === 'both') {
          setAllArticles((prev) => prev.filter((a) => a.articleId !== articleId));
          setDeleteArticleMsg((prev) => ({ ...prev, [articleId]: "" }));
        } else if (target === 'fake') {
          setAllArticles((prev) =>
            prev.map((a) =>
              a.articleId === articleId
                ? { ...a, hasFake: false, fakePerex: undefined, fakeReasoning: undefined, fakeProvider: undefined, fakeModel: undefined }
                : a
            )
          );
          setDeleteArticleMsg((prev) => ({ ...prev, [articleId]: "✅ Fake smazán" }));
        }
        setConfirmDeleteArticleId(null);
        setConfirmDeleteFakeId(null);
        fetchStats();
      } else {
        setDeleteArticleMsg((prev) => ({ ...prev, [articleId]: `❌ ${data.error || "Chyba"}` }));
      }
    } catch (err: any) {
      setDeleteArticleMsg((prev) => ({ ...prev, [articleId]: `❌ ${err.message}` }));
    }
    setDeletingArticleId(null);
  };

  // ── Generate fake for a single article ──
  const handleGenerateSingleFake = async (articleId: string, force = false) => {
    setGeneratingSingleId(articleId);
    setSingleGenMessage((prev) => ({ ...prev, [articleId]: "Generuji…" }));
    try {
      const res = await authFetch("/api/generate-single-fake", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, provider: aiProvider, force }),
      });
      const data = await safeJson(res);
      if (res.ok && data.success) {
        setSingleGenMessage((prev) => ({
          ...prev,
          [articleId]: `✅ Fake perex vygenerován (${data.provider})`,
        }));
        // Update the article entry in-place
        setAllArticles((prev) =>
          prev.map((a) =>
            a.articleId === articleId
              ? {
                  ...a,
                  hasFake: true,
                  fakePerex: data.fakePerex,
                  fakeReasoning: data.explanationPoints,
                  fakeProvider: data.provider,
                  fakeModel: data.model,
                }
              : a
          )
        );
      } else {
        setSingleGenMessage((prev) => ({
          ...prev,
          [articleId]: `❌ ${data.error || "Chyba"}`,
        }));
      }
    } catch (err: any) {
      setSingleGenMessage((prev) => ({
        ...prev,
        [articleId]: `❌ ${err.message}`,
      }));
    }
    setGeneratingSingleId(null);
  };

  // ── Filtered & sorted articles ──
  const filteredArticles = allArticles
    .filter((a) => {
      if (articleFilter === "with-fake" && !a.hasFake) return false;
      if (articleFilter === "without-fake" && a.hasFake) return false;
      if (articleSourceFilter !== "all" && a.source !== articleSourceFilter)
        return false;
      if (
        articleCategoryFilter !== "all" &&
        a.category !== articleCategoryFilter
      )
        return false;
      if (articleSearch) {
        const q = articleSearch.toLowerCase();
        return (
          a.title.toLowerCase().includes(q) ||
          a.perex.toLowerCase().includes(q) ||
          a.articleId.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => {
      const dir = articlesSortDir === "asc" ? 1 : -1;
      if (articlesSortBy === "title") return a.title.localeCompare(b.title) * dir;
      if (articlesSortBy === "source") return a.source.localeCompare(b.source) * dir;
      // date
      const da = a.datePublished || a.createdAt || "";
      const db_ = b.datePublished || b.createdAt || "";
      return String(da).localeCompare(String(db_)) * dir;
    });

  // Unique sources & categories for filter dropdowns
  const uniqueSources = [...new Set(allArticles.map((a) => a.source).filter(Boolean))];
  const uniqueCategories = [...new Set(allArticles.map((a) => a.category).filter(Boolean))];

  if (checking) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-background flex items-center justify-center">
        <MobileHeader />
        <div className="text-center text-sm text-gray-600 dark:text-foreground">

          Ověřuji oprávnění...
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-background">

      <MobileHeader />
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-8 pb-16">
        {/* Header & Prominent AI State Dashboard */}
        <div className="mb-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 dark:text-gray-50 mb-2">
                Admin Dashboard
              </h1>
              <p className="text-gray-600 dark:text-foreground">
                Přihlášeni jako {user?.email || "unknown"} • Správa scrapingu a AI perexů
              </p>
            </div>
            <button
              onClick={() => { fetchStats(); fetchAllArticles(); }}
              disabled={loadingStats || loadingArticles}
              className="self-start md:self-auto inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-purple-600/10 text-purple-700 dark:bg-purple-500/10 dark:text-purple-300 font-semibold hover:bg-purple-600/20 dark:hover:bg-purple-500/20 transition"
            >
              <RefreshCw size={16} className={loadingStats || loadingArticles ? "animate-spin" : ""} />
              Aktualizovat data
            </button>
          </div>

          {/* Top-level prominent AI status grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
            <div className="rounded-2xl border border-gray-200 dark:border-border bg-white dark:bg-background p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/5 rounded-bl-full -z-10" />
              <div className="flex items-center gap-3 mb-2 text-gray-500 dark:text-muted-foreground">
                <FileText size={18} />
                <h3 className="text-xs font-bold uppercase tracking-wide">Celkem článků</h3>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-gray-50">
                {stats ? stats.total : <RefreshCw size={24} className="animate-spin text-gray-300" />}
              </p>
            </div>

            <div className="rounded-2xl border border-emerald-200 dark:border-emerald-800/40 bg-emerald-50/50 dark:bg-emerald-900/10 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-500/10 rounded-bl-full -z-10" />
              <div className="flex items-center gap-3 mb-2 text-emerald-600 dark:text-emerald-400">
                <Sparkles size={18} />
                <h3 className="text-xs font-bold uppercase tracking-wide">AI Fake Perexy</h3>
              </div>
              <div className="flex items-end gap-2 text-emerald-700 dark:text-emerald-300">
                <p className="text-3xl font-bold">
                  {stats ? stats.fake : <RefreshCw size={24} className="animate-spin opacity-50" />}
                </p>
                {stats && stats.total > 0 && (
                  <span className="text-sm font-semibold mb-1 opacity-80 backdrop-blur-sm px-2 py-0.5 rounded-full bg-emerald-200/50 dark:bg-emerald-800/30">
                    {((stats.fake / stats.total) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>

            <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50/50 dark:bg-amber-900/10 p-5 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-amber-500/10 rounded-bl-full -z-10" />
              <div className="flex items-center gap-3 mb-2 text-amber-600 dark:text-amber-400">
                <CheckCircle2 size={18} />
                <h3 className="text-xs font-bold uppercase tracking-wide">Originální Perexy</h3>
              </div>
              <div className="flex items-end gap-2 text-amber-700 dark:text-amber-300">
                <p className="text-3xl font-bold">
                  {stats ? stats.real : <RefreshCw size={24} className="animate-spin opacity-50" />}
                </p>
                {stats && stats.total > 0 && (
                  <span className="text-sm font-semibold mb-1 opacity-80 backdrop-blur-sm px-2 py-0.5 rounded-full bg-amber-200/50 dark:bg-amber-800/30">
                    {((stats.real / stats.total) * 100).toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            
            <div className="rounded-2xl border border-blue-200 dark:border-blue-800/40 bg-blue-50/50 dark:bg-blue-900/10 p-5 shadow-sm relative overflow-hidden flex flex-col justify-center">
              <div className="absolute top-0 right-0 w-24 h-24 bg-blue-500/10 rounded-bl-full -z-10" />
              <div className="flex items-center gap-3 mb-3 text-primary dark:text-blue-400">
                <Bot size={18} />
                <h3 className="text-xs font-bold uppercase tracking-wide">Stav AI Modulo</h3>
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300 text-sm font-semibold">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                  API Aktivní
                </span>
              </div>
            </div>
          </div>

        </div>

        {/* ── ACTIVE AI GENERATION PANEL (Moved to top for visibility) ── */}
        {(fakeGenLoading || fakeGenMessage || fakeGenResults.length > 0) && (
          <div className="mb-8 rounded-2xl border border-purple-300 dark:border-purple-500/30 overflow-hidden bg-gradient-to-br from-purple-50/90 to-fuchsia-50/90 dark:from-purple-950/40 dark:to-fuchsia-950/40 shadow-[0_0_40px_rgba(168,85,247,0.1)] relative backdrop-blur-xl">
            {/* Animated background glow */}
            {fakeGenLoading && (
              <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-fuchsia-400 to-purple-500 bg-[length:200%_100%] animate-pulse border-b border-purple-400/50" />
            )}
            
            <div className="p-6 md:p-8">
               <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-6">
                 <div>
                   <h2 className="text-xl md:text-2xl font-black text-purple-900 dark:text-purple-100 flex items-center gap-3 tracking-tight">
                     <div className="relative">
                       <Sparkles size={28} className="text-purple-600 dark:text-purple-400" />
                       {fakeGenLoading && <span className="absolute -inset-1 blur-md bg-purple-500/50 rounded-full animate-pulse" />}
                     </div>
                     Aktivní AI Generování ({aiProvidersList.find(p => p.id === aiProvider)?.label || aiProvider})
                   </h2>
                   <p className="text-purple-800 dark:text-purple-200 mt-2 font-medium bg-white/40 dark:bg-black/20 inline-block px-4 py-1.5 rounded-full text-sm border border-white/20 dark:border-white/10">
                     {fakeGenMessage || "Čeká na spuštění..."}
                   </p>
                 </div>
                 
                 {!fakeGenLoading && fakeGenResults.length === 0 && (
                   <button
                     onClick={handleGenerateFakes}
                     className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-purple-600 text-white font-bold hover:bg-purple-700 transition shadow-lg shadow-purple-500/20"
                   >
                     <Bot size={20} />
                     Spustit generování
                   </button>
                 )}
                 {fakeGenLoading && (
                   <div className="text-right">
                     <div className="inline-flex items-center gap-3 px-5 py-2.5 rounded-xl bg-white dark:bg-purple-900/60 text-purple-900 dark:text-purple-100 font-bold shadow-sm border border-purple-200 dark:border-purple-800/50">
                       <RefreshCw size={18} className="animate-spin text-purple-600 dark:text-purple-400" />
                       <span>{fakeGenResults.length} / {fakeGenLimit} hotovo</span>
                     </div>
                   </div>
                 )}
               </div>

               {/* PROGRESS BAR */}
               {fakeGenLoading && (
                 <div className="mb-8 relative">
                   <div className="flex justify-between text-sm font-bold text-purple-800 dark:text-purple-200 mb-2">
                     <span className="uppercase tracking-wider text-xs">Průběh</span>
                     <span>{Math.round((fakeGenResults.length / fakeGenLimit) * 100)}%</span>
                   </div>
                   <div className="w-full bg-white/50 dark:bg-black/30 rounded-full h-4 md:h-5 overflow-hidden shadow-inner relative border border-purple-200/50 dark:border-purple-900/50">
                     <div 
                       className="h-full bg-gradient-to-r from-purple-500 to-fuchsia-500 relative transition-all duration-500 ease-out"
                       style={{ width: `${Math.max(5, (fakeGenResults.length / fakeGenLimit) * 100)}%` }}
                     >
                       <div className="absolute inset-0 bg-white/20 animate-pulse" />
                     </div>
                   </div>
                 </div>
               )}

               {/* RESULTS LIST */}
               {fakeGenResults.length > 0 && (
                 <div className="mt-6 rounded-xl border border-purple-200 dark:border-purple-800/50 bg-white/60 dark:bg-black/30 overflow-hidden shadow-sm backdrop-blur-sm">
                   <div className="p-4 border-b border-purple-100 dark:border-purple-900/50 flex justify-between items-center bg-white/50 dark:bg-purple-950/50">
                     <h3 className="font-bold text-purple-900 dark:text-purple-100 flex items-center gap-2">
                       <FileText size={16} className="text-purple-600 dark:text-purple-400" />
                       Živá historie zpracování
                     </h3>
                     <button onClick={() => setShowFakeGenDetails(!showFakeGenDetails)} className="text-xs font-bold uppercase tracking-wider text-purple-600 hover:text-purple-800 transition px-3 py-1 rounded bg-purple-100/50 dark:bg-purple-900/30">
                       {showFakeGenDetails ? "Skrýt detaily" : "Zobrazit všechny"}
                     </button>
                   </div>
                   
                   <div className={`transition-all duration-300 ${showFakeGenDetails ? "max-h-96" : "max-h-[140px]"} overflow-y-auto p-4 space-y-2.5 scrollbar-thin scrollbar-thumb-purple-300 dark:scrollbar-thumb-purple-800`}>
                     {[...fakeGenResults].reverse().map((r, i) => (
                       <div key={i} className={`flex items-start gap-4 p-3.5 rounded-xl border ${
                         r.success 
                          ? "bg-emerald-50/90 border-emerald-200 dark:bg-emerald-500/10 dark:border-emerald-500/20 shadow-sm" 
                          : "bg-red-50/90 border-red-200 dark:bg-red-500/10 dark:border-red-500/20 shadow-sm"
                       }`}>
                         <div className="shrink-0 mt-0.5 relative">
                           {r.success ? (
                             <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center">
                               <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                             </div>
                           ) : (
                             <div className="w-8 h-8 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center">
                               <AlertCircle size={18} className="text-red-600 dark:text-red-400" />
                             </div>
                           )}
                         </div>
                         <div className="flex-1 min-w-0">
                           <p className={`font-semibold text-[0.9375rem] truncate ${r.success ? "text-emerald-900 dark:text-emerald-100" : "text-red-900 dark:text-red-100"}`}>
                             {r.title}
                           </p>
                           {r.error && (
                             <p className="text-sm mt-1.5 text-red-700 dark:text-red-300 bg-red-100/50 dark:bg-red-900/30 px-2.5 py-1 rounded w-fit border border-red-200/50 dark:border-red-800/30">
                               Chyba: {r.error}
                             </p>
                           )}
                         </div>
                       </div>
                     ))}
                   </div>
                 </div>
               )}
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-border">

          <button
            onClick={() => setActiveTab("scrape")}
            className={`px-4 py-3 font-semibold border-b-2 transition ${
              activeTab === "scrape"
                ? "border-blue-600 text-primary dark:text-blue-400"
                : "border-transparent text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-gray-200"

            }`}
          >
            <Zap className="inline mr-2" size={18} />
            Scraping
          </button>
          <button
            onClick={() => setActiveTab("articles")}
            className={`px-4 py-3 font-semibold border-b-2 transition ${
              activeTab === "articles"
                ? "border-blue-600 text-primary dark:text-blue-400"
                : "border-transparent text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-gray-200"

            }`}
          >
            <FileText className="inline mr-2" size={18} />
            Články
          </button>
          <button
            onClick={() => setActiveTab("monitoring")}
            className={`px-4 py-3 font-semibold border-b-2 transition ${
              activeTab === "monitoring"
                ? "border-blue-600 text-primary dark:text-blue-400"
                : "border-transparent text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-gray-200"

            }`}
          >
            <BarChart3 className="inline mr-2" size={18} />
            Monitoring
          </button>
          <button
            onClick={() => setActiveTab("maintenance")}
            className={`px-4 py-3 font-semibold border-b-2 transition ${
              activeTab === "maintenance"
                ? "border-blue-600 text-primary dark:text-blue-400"
                : "border-transparent text-gray-600 dark:text-muted-foreground hover:text-gray-900 dark:hover:text-gray-200"

            }`}
          >
            <Trash2 className="inline mr-2" size={18} />
            Údržba
          </button>
        </div>

        {/* SCRAPING TAB */}
        {activeTab === "scrape" && (
          <div className="space-y-4">
            {/* Scraping Settings */}
            <div className="rounded-xl border border-blue-200 dark:border-blue-800/50 bg-blue-50 dark:bg-blue-900/20 p-6">
              <h3 className="font-semibold text-blue-900 dark:text-blue-100 mb-4">
                ⚙️ Nastavení scrapingu
              </h3>
              <div className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-blue-800 dark:text-blue-200 mb-2">
                    Maximální počet článků
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="500"
                    value={articleLimit || ""}
                    onChange={(e) => setArticleLimit(e.target.value ? parseInt(e.target.value) : undefined)}
                    placeholder="Bez omezení (ponechat prázdné)"
                    className="w-full px-4 py-2 rounded-lg border border-blue-300 dark:border-blue-700 bg-white dark:bg-card text-blue-900 dark:text-blue-100 placeholder-blue-400 dark:placeholder-blue-600 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                {articleLimit && (
                  <button
                    onClick={() => setArticleLimit(undefined)}
                    className="px-4 py-2 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 transition"
                  >
                    Vymazat
                  </button>
                )}
              </div>
              <p className="text-xs text-blue-700 dark:text-blue-300 mt-3">
                💡 Tip: Zadejte počet článků, které chcete maximálně scrapnout. Maximum je 500 článků.
                {articleLimit && ` Nyní je nastaveno na ${articleLimit} článků.`}
              </p>

              {/* ── Auto-generate fakes ── */}
              <div className="mt-5 pt-5 border-t border-blue-200">
                <div className="flex items-center gap-3 mb-3">
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={autoGenerateFakes}
                      onChange={(e) => setAutoGenerateFakes(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-300 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-purple-400 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-purple-600"></div>
                  </label>
                  <span className="text-sm font-medium text-blue-900 dark:text-blue-100">
                    <Sparkles size={14} className="inline mr-1" />
                    Auto-generovat fake perexy po scrapingu
                  </span>
                </div>

                {autoGenerateFakes && (
                  <div className="flex flex-wrap items-center gap-4 ml-14">
                    <div>
                      <label className="block text-xs font-medium text-blue-800 mb-1">
                        AI Provider
                      </label>
                      <div className="flex flex-wrap gap-2 mt-1">
                        {aiProvidersList.map((p) => (
                          <button 
                            key={p.id} 
                            onClick={() => setAiProvider(p.id)} 
                            className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${
                              aiProvider === p.id 
                                ? "bg-purple-600 border-purple-600 text-white shadow-md shadow-purple-500/30" 
                                : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                            }`}
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-blue-800 mb-1">
                        Max článků
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="50"
                        value={fakeGenLimit}
                        onChange={(e) => setFakeGenLimit(Math.max(1, Math.min(50, parseInt(e.target.value) || 1)))}
                        className="w-20 px-2 py-1.5 rounded-lg border border-purple-300 dark:border-purple-700 bg-white dark:bg-card text-gray-900 dark:text-foreground focus:outline-none focus:ring-2 focus:ring-purple-500 text-xs"
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Scraper Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {scrapers.map((scraper, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6 flex flex-col h-full"
                >
                  <div className="flex items-start justify-between mb-4">
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground">
                    {scraper.name}
                  </h2>
                  {scraper.success && scraper.message && (
                    <CheckCircle2 size={24} className="text-emerald-600" />
                  )}
                  {!scraper.success && scraper.message && (
                    <AlertCircle size={24} className="text-orange-600" />
                  )}
                </div>

                {scraper.message && (
                  <div className="mb-4 p-3 rounded-lg bg-gray-100 dark:bg-muted text-sm text-gray-800 dark:text-foreground">
                    {scraper.message}
                  </div>
                )}

                <button
                  onClick={() => {
                    if (idx === 0) scrapeCt24();
                    else if (idx === 1) scrapeCtAll();
                    else if (idx === 2) scrapeSeznam();
                    else if (idx === 3) scrapeHN();
                    else if (idx === 4) scrapeBoth();
                  }}
                  disabled={scraper.loading || !isAdmin}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-blue-600 text-white font-semibold hover:bg-blue-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  {scraper.loading ? (
                    <>
                      <RefreshCw size={18} className="animate-spin" />
                      Scrapuji...
                    </>
                  ) : (
                    <>
                      <Zap size={18} />
                      Spustit
                    </>
                  )}
                </button>
              </div>
              ))}
            </div>



          </div>
        )}

        {/* ARTICLES TAB */}
        {activeTab === "articles" && (
          <div className="space-y-4">
            {/* Controls bar */}
            <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-4">

              <div className="flex flex-wrap items-center gap-3">
                {/* Search */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    value={articleSearch}
                    onChange={(e) => setArticleSearch(e.target.value)}
                    placeholder="Hledat v názvu, perexu…"
                    className="w-full pl-9 pr-8 py-2 rounded-lg border border-gray-300 dark:border-border bg-gray-50 dark:bg-muted text-gray-900 dark:text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  {articleSearch && (
                    <button onClick={() => setArticleSearch("")} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                      <X size={14} />
                    </button>
                  )}
                </div>

                {/* Fake filter */}
                <div className="flex rounded-lg overflow-hidden border border-gray-300 text-xs font-semibold">
                  {(["all", "without-fake", "with-fake"] as const).map((f) => (
                    <button
                      key={f}
                      onClick={() => setArticleFilter(f)}
                      className={`px-3 py-2 transition ${
                        articleFilter === f
                          ? "bg-blue-600 text-white"
                          : "bg-white dark:bg-gray-700 text-gray-700 dark:text-foreground hover:bg-gray-100 dark:hover:bg-gray-600"

                      }`}
                    >
                      {f === "all" ? "Všechny" : f === "without-fake" ? "🟡 Bez fake" : "🟢 S fake"}
                    </button>
                  ))}
                </div>

                {/* Source filter */}
                <select
                  value={articleSourceFilter}
                  onChange={(e) => setArticleSourceFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-card text-gray-900 dark:text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Všechny zdroje</option>
                  {uniqueSources.map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>

                {/* Category filter */}
                <select
                  value={articleCategoryFilter}
                  onChange={(e) => setArticleCategoryFilter(e.target.value)}
                  className="px-3 py-2 rounded-lg border border-gray-300 dark:border-border bg-white dark:bg-card text-gray-900 dark:text-foreground text-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="all">Všechny kategorie</option>
                  {uniqueCategories.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>

                {/* Refresh */}
                <button
                  onClick={fetchAllArticles}
                  disabled={loadingArticles}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-blue-600 text-white text-xs font-semibold hover:bg-blue-700 disabled:opacity-60 transition"
                >
                  <RefreshCw size={14} className={loadingArticles ? "animate-spin" : ""} />
                  {loadingArticles ? "Načítám…" : "Obnovit"}
                </button>
              </div>

              {/* Summary row */}
              <div className="flex flex-wrap items-center gap-4 mt-3 text-xs text-gray-500 dark:text-muted-foreground">
                <span>Celkem: <strong className="text-gray-900 dark:text-gray-100">{allArticles.length}</strong></span>

                <span>S fake: <strong className="text-emerald-600">{allArticles.filter((a) => a.hasFake).length}</strong></span>
                <span>Bez fake: <strong className="text-amber-600">{allArticles.filter((a) => !a.hasFake).length}</strong></span>
                <span>Zobrazeno: <strong className="text-gray-900 dark:text-gray-100">{filteredArticles.length}</strong></span>

                {/* Sort controls */}
                <span className="ml-auto flex items-center gap-1">
                  <Filter size={12} />
                  Řadit:
                  <select
                    value={articlesSortBy}
                    onChange={(e) => setArticlesSortBy(e.target.value as any)}
                    className="px-1 py-0.5 rounded border border-gray-300 bg-transparent text-xs"
                  >
                    <option value="date">Datum</option>
                    <option value="title">Název</option>
                    <option value="source">Zdroj</option>
                  </select>
                  <button
                    onClick={() => setArticlesSortDir((d) => d === "asc" ? "desc" : "asc")}
                    className="p-0.5 rounded hover:bg-gray-200"
                    title={articlesSortDir === "asc" ? "Vzestupně" : "Sestupně"}
                  >
                    {articlesSortDir === "asc" ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                  </button>
                </span>
              </div>
            </div>

            {/* AI Provider quick pick (used for single generation) */}
            <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-muted-foreground">

              <span>AI Provider pro generování:</span>
              <div className="flex flex-wrap gap-2 mt-2">
                {aiProvidersList.map((p) => (
                  <button 
                    key={p.id} 
                    onClick={() => setAiProvider(p.id)} 
                    className={`px-3 py-1.5 text-xs font-semibold rounded-full border transition ${
                      aiProvider === p.id 
                        ? "bg-purple-600 border-purple-600 text-white shadow-sm" 
                        : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-300 hover:border-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/20"
                    }`}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Articles list */}
            {loadingArticles ? (
              <div className="text-center py-12 text-gray-500 dark:text-muted-foreground">

                <RefreshCw size={24} className="animate-spin mx-auto mb-3" />
                Načítám články…
              </div>
            ) : filteredArticles.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-muted-foreground">

                {allArticles.length === 0
                  ? "Žádné články v databázi. Spusťte scraping."
                  : "Žádné články neodpovídají filtru."}
              </div>
            ) : (
              <div className="space-y-2">
                {filteredArticles.map((article) => {
                  const isExpanded = expandedArticleId === article.articleId;
                  const isGenerating = generatingSingleId === article.articleId;
                  const msg = singleGenMessage[article.articleId];

                  return (
                    <div
                      key={article.docId}
                      className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card overflow-hidden"

                    >
                      {/* Row header */}
                      <button
                        onClick={() => setExpandedArticleId(isExpanded ? null : article.articleId)}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-muted transition"
                      >
                        {/* Fake status badge */}
                        <span className={`shrink-0 w-2 h-2 rounded-full ${article.hasFake ? "bg-emerald-500" : "bg-amber-400"}`} />

                        {/* Title */}
                        <span className="flex-1 text-sm font-medium text-gray-900 dark:text-foreground truncate">
                          {article.title}
                        </span>

                        {/* Meta badges */}
                        <span className="hidden sm:inline-flex shrink-0 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] text-gray-600 dark:text-muted-foreground">
                          {article.source}
                        </span>
                        <span className="hidden md:inline-flex shrink-0 px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-[10px] text-gray-600 dark:text-muted-foreground capitalize">

                          {article.category}
                        </span>
                        {article.hasFake ? (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-emerald-100 text-[10px] text-emerald-700 font-semibold">
                            Fake ✓
                          </span>
                        ) : (
                          <span className="shrink-0 px-2 py-0.5 rounded-full bg-amber-100 text-[10px] text-amber-700 font-semibold">
                            Bez fake
                          </span>
                        )}

                        {isExpanded ? <ChevronUp size={16} className="shrink-0 text-gray-400" /> : <ChevronDown size={16} className="shrink-0 text-gray-400" />}
                      </button>

                      {/* Expanded detail */}
                      {isExpanded && (
                        <div className="border-t border-gray-200 dark:border-border px-5 py-4 space-y-4">
                          {/* Original perex */}
                          <div>
                            <h4 className="text-xs font-semibold text-gray-500 dark:text-muted-foreground uppercase tracking-wide mb-1">

                              Originální perex
                            </h4>
                            <p className="text-sm text-gray-800 dark:text-foreground leading-relaxed">
                              {article.perex || <span className="italic text-gray-400">(žádný perex)</span>}
                            </p>
                          </div>

                          {/* Fake perex */}
                          {article.hasFake && article.fakePerex && (
                            <div className="bg-purple-50 dark:bg-purple-900/20 rounded-lg p-3">
                              <h4 className="text-xs font-semibold text-purple-600 uppercase tracking-wide mb-1 flex items-center gap-1">
                                <Sparkles size={12} />
                                Fake perex
                                {article.fakeProvider && (
                                  <span className="ml-2 font-normal normal-case text-[10px] text-purple-500">
                                    ({article.fakeProvider}{article.fakeModel ? ` / ${article.fakeModel}` : ""})
                                  </span>
                                )}
                              </h4>
                              <p className="text-sm text-gray-800 dark:text-foreground leading-relaxed">
                                {article.fakePerex}
                              </p>

                              {article.fakeReasoning && article.fakeReasoning.length > 0 && (
                                <div className="mt-2 pt-2 border-t border-purple-200">
                                  <h5 className="text-[10px] font-semibold text-purple-500 uppercase mb-1">
                                    Proč je podezřelý
                                  </h5>
                                  <ul className="list-disc list-inside text-xs text-gray-700 dark:text-foreground space-y-0.5">

                                    {article.fakeReasoning.map((r, i) => (
                                      <li key={i}>{r}</li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </div>
                          )}

                          {/* Meta info */}
                          <div className="flex flex-wrap gap-3 text-xs text-gray-500 dark:text-muted-foreground">

                            <span>Zdroj: <strong>{article.source}</strong></span>
                            <span>Kategorie: <strong className="capitalize">{article.category || "—"}</strong></span>
                            <span>Datum: <strong>{article.datePublished || "—"}</strong></span>
                            <span>ID: <code className="text-[10px] bg-gray-100 dark:bg-muted px-1 rounded">{article.articleId}</code></span>
                            {article.url && (
                              <a
                                href={article.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-primary dark:text-blue-400 hover:underline"

                              >
                                <ExternalLink size={11} />
                                Originál
                              </a>
                            )}
                          </div>

                          {/* Actions */}
                          <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100 dark:border-border">

                            {!article.hasFake && article.perex && (
                              <button
                                onClick={() => handleGenerateSingleFake(article.articleId)}
                                disabled={isGenerating}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-600 text-white text-xs font-semibold hover:bg-purple-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                              >
                                {isGenerating ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin" />
                                    Generuji…
                                  </>
                                ) : (
                                  <>
                                    <Bot size={13} />
                                    Generovat fake perex
                                  </>
                                )}
                              </button>
                            )}
                            {article.hasFake && (
                              <button
                                onClick={() => handleGenerateSingleFake(article.articleId, true)}
                                disabled={isGenerating}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-semibold hover:bg-purple-200 dark:hover:bg-purple-900/50 disabled:opacity-60 disabled:cursor-not-allowed transition border border-purple-200 dark:border-purple-800"
                              >
                                {isGenerating ? (
                                  <>
                                    <RefreshCw size={13} className="animate-spin" />
                                    Generuji…
                                  </>
                                ) : (
                                  <>
                                    <RefreshCw size={13} />
                                    Přegenerovat
                                  </>
                                )}
                              </button>
                            )}

                            {/* Delete fake only */}
                            {article.hasFake && (
                              confirmDeleteFakeId === article.articleId ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <span className="text-xs text-red-600 font-semibold">Smazat fake?</span>
                                  <button
                                    onClick={() => handleDeleteArticle(article.articleId, 'fake')}
                                    disabled={deletingArticleId === article.articleId}
                                    className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 transition"
                                  >
                                    {deletingArticleId === article.articleId ? <RefreshCw size={12} className="animate-spin" /> : "Ano"}
                                  </button>
                                  <button
                                    onClick={() => setConfirmDeleteFakeId(null)}
                                    className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-200 transition"
                                  >
                                    Ne
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setConfirmDeleteFakeId(article.articleId)}
                                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-400 text-xs font-semibold hover:bg-orange-100 dark:hover:bg-orange-900/40 transition border border-orange-200 dark:border-orange-800"
                                >
                                  <Trash2 size={12} />
                                  Smazat fake
                                </button>
                              )
                            )}

                            {/* Delete whole article */}
                            {confirmDeleteArticleId === article.articleId ? (
                              <div className="inline-flex items-center gap-1.5">
                                <span className="text-xs text-red-600 font-semibold">Smazat článek i fake?</span>
                                <button
                                  onClick={() => handleDeleteArticle(article.articleId, 'both')}
                                  disabled={deletingArticleId === article.articleId}
                                  className="px-2.5 py-1.5 rounded-lg bg-red-600 text-white text-xs font-bold hover:bg-red-700 disabled:opacity-60 transition"
                                >
                                  {deletingArticleId === article.articleId ? <RefreshCw size={12} className="animate-spin" /> : "Ano, smazat"}
                                </button>
                                <button
                                  onClick={() => setConfirmDeleteArticleId(null)}
                                  className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs font-bold hover:bg-gray-200 transition"
                                >
                                  Ne
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => setConfirmDeleteArticleId(article.articleId)}
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400 text-xs font-semibold hover:bg-red-100 dark:hover:bg-red-900/40 transition border border-red-200 dark:border-red-800 ml-auto"
                              >
                                <Trash2 size={12} />
                                Smazat článek
                              </button>
                            )}

                            {(msg || deleteArticleMsg[article.articleId]) && (
                              <span className={`text-xs ${
                                (msg || deleteArticleMsg[article.articleId]).startsWith("✅") ? "text-emerald-600"
                                : (msg || deleteArticleMsg[article.articleId]).startsWith("❌") ? "text-red-600"
                                : "text-gray-500"
                              }`}>
                                {msg || deleteArticleMsg[article.articleId]}
                              </span>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* MONITORING TAB */}
        {activeTab === "monitoring" && (
          <div className="space-y-6">
            {/* Health Check */}
            <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6">

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground">
                  Systémový health
                </h2>
                <button
                  onClick={fetchHealth}
                  disabled={loadingHealth}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-600 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={loadingHealth ? "animate-spin" : ""} />
                  {loadingHealth ? "Načítám..." : "Aktualizovat"}
                </button>
              </div>

              {health ? (
                <div className={`p-4 rounded-lg ${
                  health.isHealthy
                    ? "bg-emerald-50 border border-emerald-200"
                    : "bg-orange-50 border border-orange-200"
                }`}>
                  <p className={`text-sm font-mono ${
                    health.isHealthy
                      ? "text-emerald-900"
                      : "text-orange-900"
                  }`}>
                    {health.report}
                  </p>
                  <div className="mt-3 grid grid-cols-3 gap-4 text-xs">
                    <div>
                      <span className="text-gray-600 dark:text-muted-foreground">Chyby:</span>
                      <p className="text-lg font-bold text-red-600">{health.errorCount}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-muted-foreground">Varování:</span>
                      <p className="text-lg font-bold text-yellow-600">{health.warningCount}</p>
                    </div>
                    <div>
                      <span className="text-gray-600 dark:text-muted-foreground">Chybovost:</span>
                      <p className="text-lg font-bold text-gray-900 dark:text-gray-50">

                        {health.errorRate.toFixed(1)}%
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-center text-sm text-gray-600 dark:text-foreground">

                  Klikněte na "Aktualizovat" pro načtení statusu
                </div>
              )}
            </div>

            {/* Statistics */}
            <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6">

              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-foreground">
                  📊 Statistika článků
                </h2>
                <button
                  onClick={fetchStats}
                  disabled={loadingStats}
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-gray-600 text-white text-sm font-semibold hover:bg-gray-700 disabled:opacity-60"
                >
                  <RefreshCw size={16} className={loadingStats ? "animate-spin" : ""} />
                  {loadingStats ? "Načítám..." : "Aktualizovat"}
                </button>
              </div>

              {stats ? (
                <div className="space-y-4">
                  {/* Main Stats */}
                  <div className="grid grid-cols-3 gap-4">
                    <div className="rounded-lg bg-gradient-to-br from-blue-50 to-blue-100 dark:from-blue-900/20 dark:to-blue-900/40 p-4">
                      <p className="text-xs text-gray-600 dark:text-muted-foreground mb-1">Celkem</p>
                      <p className="text-2xl font-bold text-blue-900 dark:text-blue-100">
                        {stats.total}
                      </p>
                      <p className="text-xs text-gray-600 dark:text-muted-foreground mt-1">Článků</p>
                    </div>

                    <div className="rounded-lg bg-gradient-to-br from-green-50 to-green-100 dark:from-green-900/20 dark:to-green-900/40 p-4">
                      <p className="text-xs text-gray-600 dark:text-muted-foreground mb-1">Skutečné</p>
                      <p className="text-2xl font-bold text-green-900 dark:text-green-100">

                        {stats.real}
                      </p>
                      <p className="text-xs text-green-600 mt-1">
                        {((stats.real / stats.total) * 100 || 0).toFixed(1)}%
                      </p>
                    </div>

                    <div className="rounded-lg bg-gradient-to-br from-red-50 to-red-100 dark:from-red-900/20 dark:to-red-900/40 p-4">
                      <p className="text-xs text-gray-600 dark:text-muted-foreground mb-1">Falešné</p>
                      <p className="text-2xl font-bold text-red-900 dark:text-red-100">

                        {stats.fake}
                      </p>
                      <p className="text-xs text-red-600 mt-1">
                        {((stats.fake / stats.total) * 100 || 0).toFixed(1)}%
                      </p>
                    </div>
                  </div>

                  {/* By Source */}
                  <div>
                    <p className="text-sm font-semibold text-gray-700 dark:text-foreground mb-3">
                      Podle zdroje
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="rounded-lg border border-gray-200 dark:border-border p-3">
                        <p className="text-xs text-gray-600 dark:text-muted-foreground">ČT24</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-50">
                          {stats.bySource?.ct24 || 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-border p-3">
                        <p className="text-xs text-gray-600 dark:text-muted-foreground">Seznam</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-50">
                          {stats.bySource?.seznam || 0}
                        </p>
                      </div>
                      <div className="rounded-lg border border-gray-200 dark:border-border p-3">
                        <p className="text-xs text-gray-600 dark:text-muted-foreground">Hospodářské noviny</p>
                        <p className="text-xl font-bold text-gray-900 dark:text-gray-50">

                          {stats.bySource?.hn || 0}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* By Category */}
                  {stats.byCategory && Object.keys(stats.byCategory).length > 0 && (
                    <div>
                      <p className="text-sm font-semibold text-gray-700 dark:text-foreground mb-3">

                        Podle kategorie
                      </p>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {Object.entries(stats.byCategory).map(([category, count]) => (
                          <div
                            key={category}
                            className="rounded-lg border border-gray-200 dark:border-border p-3 text-center"
                          >
                            <p className="text-xs text-gray-600 dark:text-muted-foreground capitalize mb-1">

                              {category}
                            </p>
                            <p className="text-lg font-bold text-gray-900 dark:text-foreground">
                              {count}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-4 rounded-lg bg-gray-100 dark:bg-gray-700 text-center text-sm text-gray-600 dark:text-foreground">

                  Klikněte na "Aktualizovat" pro načtení statistik
                </div>
              )}
            </div>

            {/* Info Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
                <h3 className="font-semibold text-blue-900 mb-2">
                  ℹ️ O monitoringu
                </h3>
                <p className="text-sm text-blue-800">
                  Systém zaznamenává všechny chyby, varování a metriky. Problematické úkoly jsou automaticky logovány.
                </p>
              </div>

              <div className="rounded-xl border border-green-200 bg-green-50 p-6">
                <h3 className="font-semibold text-green-900 mb-2">
                  ✅ Deduplikace
                </h3>
                <p className="text-sm text-green-800">
                  Každý scrapovaný článek je kontrolován na duplikáty pomocí URL hashe, title hashe a Levenshteinovy vzdálenosti.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* MAINTENANCE TAB */}
        {activeTab === "maintenance" && (
          <div className="space-y-6">
            {/* Delete All Fakes */}
            <div className="rounded-xl border border-purple-200 bg-purple-50 p-6">
              <h2 className="text-lg font-semibold text-purple-800 mb-2">
                🗑️ Vymazat všechny fake články
              </h2>
              <p className="text-sm text-purple-700 mb-4">
                Vymaže VŠECHNY dokumenty z kolekce <code>fake_articles</code>. Operace je <strong>NEVRATNÁ</strong>.
              </p>

              {deleteFakesMessage && (
                <div className="mb-4 p-3 rounded-lg bg-purple-100 text-sm text-purple-900">
                  {deleteFakesMessage}
                </div>
              )}

              {!showDeleteFakesConfirm ? (
                <button
                  onClick={() => setShowDeleteFakesConfirm(true)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 transition"
                >
                  <Trash2 size={18} />
                  Vymazat všechny fake články
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-purple-800">
                    ⚠️ Opravdu chcete VYMAZAT VŠECHNY fake články?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDeleteFakes}
                      disabled={isDeletingFakes}
                      className="px-5 py-2 rounded-lg bg-purple-600 text-white font-semibold hover:bg-purple-700 disabled:opacity-60"
                    >
                      {isDeletingFakes ? "Mažu..." : "Ano, vymazat"}
                    </button>
                    <button
                      onClick={() => setShowDeleteFakesConfirm(false)}
                      disabled={isDeletingFakes}
                      className="px-5 py-2 rounded-lg bg-gray-400 text-white font-semibold hover:bg-gray-500 disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delete All Warning */}
            <div className="rounded-xl border border-red-200 bg-red-50 p-6">
              <h2 className="text-lg font-semibold text-red-800 mb-2">
                ⚠️ Vymazat všechny články
              </h2>
              <p className="text-sm text-red-700 mb-4">
                Tato operace je <strong>NEVRATNÁ</strong>. Vymaže všechny články z databáze.
                Použijte jen v případě vážné potřeby.
              </p>

              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700"
                >
                  <Trash2 size={18} />
                  Vymazat všechny články
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-red-800">
                    ⚠️ Opravdu chcete VYMAZAT VŠECHNY články?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDeleteAll}
                      disabled={isDeleting}
                      className="px-5 py-2 rounded-lg bg-red-600 text-white font-semibold hover:bg-red-700 disabled:opacity-60"
                    >
                      {isDeleting ? "Mažu..." : "Ano, vymazat"}
                    </button>
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      disabled={isDeleting}
                      className="px-5 py-2 rounded-lg bg-gray-400 text-white font-semibold hover:bg-gray-500 disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Delete by source */}
            <div className="rounded-xl border border-orange-200 bg-orange-50 p-6">
              <h2 className="text-lg font-semibold text-orange-800 mb-2">
                🗑️ Vymazat články podle zdroje
              </h2>
              <p className="text-sm text-orange-700 mb-4">
                Vyberte zdroj a smažte všechny články z daného zdroje. Tato operace je <strong>NEVRATNÁ</strong>.
              </p>

              <div className="flex gap-3 items-end mb-4">
                <div className="flex-1">
                  <label className="block text-sm font-medium text-orange-800 mb-2">
                    Zdroj
                  </label>
                  <select
                    value={selectedSource}
                    onChange={(e) => {
                      setSelectedSource(e.target.value);
                      setShowDeleteSourceConfirm(false);
                      setDeleteSourceMessage("");
                    }}
                    className="w-full px-4 py-2 rounded-lg border border-orange-300 bg-white text-orange-900 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  >
                    <option value="">-- Vyberte zdroj --</option>
                    <option value="ct24">ČT24</option>
                    <option value="seznam">Seznam Zprávy</option>
                    <option value="hn">Hospodářské noviny</option>
                    <option value="Český rozhlas">Český rozhlas</option>
                  </select>
                </div>
              </div>

              {deleteSourceMessage && (
                <div className="mb-4 p-3 rounded-lg bg-orange-100 text-sm text-orange-900">
                  {deleteSourceMessage}
                </div>
              )}

              {!showDeleteSourceConfirm ? (
                <button
                  onClick={() => setShowDeleteSourceConfirm(true)}
                  disabled={!selectedSource}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-60 disabled:cursor-not-allowed transition"
                >
                  <Trash2 size={18} />
                  Vymazat články z vybraného zdroje
                </button>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm font-semibold text-orange-800">
                    ⚠️ Opravdu chcete vymazat VŠECHNY články ze zdroje "{selectedSource}"?
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={handleDeleteBySource}
                      disabled={isDeletingBySource}
                      className="px-5 py-2 rounded-lg bg-orange-600 text-white font-semibold hover:bg-orange-700 disabled:opacity-60"
                    >
                      {isDeletingBySource ? "Mažu..." : "Ano, vymazat"}
                    </button>
                    <button
                      onClick={() => setShowDeleteSourceConfirm(false)}
                      disabled={isDeletingBySource}
                      className="px-5 py-2 rounded-lg bg-gray-400 text-white font-semibold hover:bg-gray-500 disabled:opacity-60"
                    >
                      Zrušit
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Useful Info */}
            <div className="space-y-4">
              <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-50 mb-3">
                  API Endpoints
                </h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-foreground font-mono">
                  <div><span className="text-primary dark:text-blue-400">GET</span> /api/scrape-ct24?theme=domaci&save=true</div>
                  <div><span className="text-primary dark:text-blue-400">GET</span> /api/scrape-seznam?category=domov&save=true</div>
                  <div><span className="text-primary dark:text-blue-400">GET</span> /api/scrape-hn?category=domov&save=true</div>
                  <div><span className="text-primary dark:text-blue-400">GET</span> /api/articles?limit=50</div>
                  <div><span className="text-red-600 dark:text-red-400">DELETE</span> /api/delete-all-articles?confirm=yes</div>
                  <div><span className="text-red-600 dark:text-red-400">DELETE</span> /api/delete-by-source?source=ct24&confirm=yes</div>
                  <div><span className="text-purple-600 dark:text-purple-400">POST</span> /api/generate-fake {'{'}provider, limit{'}'}</div>
                  <div><span className="text-purple-600 dark:text-purple-400">POST</span> /api/generate-single-fake {'{'}articleId, provider, force{'}'}</div>
                  <div><span className="text-primary dark:text-blue-400">GET</span> /api/admin-articles</div>
                  <div><span className="text-red-600 dark:text-red-400">DELETE</span> /api/delete-fake-articles?confirm=yes</div>
                </div>
              </div>

              <div className="rounded-xl border border-gray-200 dark:border-border bg-white dark:bg-card p-6">
                <h3 className="font-semibold text-gray-900 dark:text-gray-50 mb-3">
                  Klávesové zkratky
                </h3>
                <div className="space-y-2 text-sm text-gray-700 dark:text-foreground">
                  <div><kbd className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">F5</kbd> - Aktualizovat health check</div>
                  <div><kbd className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">S</kbd> - Jít na Scraping tab</div>
                  <div><kbd className="px-2 py-1 rounded bg-gray-200 dark:bg-gray-700">M</kbd> - Jít na Monitoring tab</div>

                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}



