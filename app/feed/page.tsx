"use client"

import type React from "react"
import { useEffect, useState, useCallback } from "react"
import {
  AnimatePresence,
  motion,
  useAnimation,
  useMotionValue,
  useSpring,
  useTransform,
  useVelocity,
  type PanInfo,
  type Transition,
} from "framer-motion"
import {
  ArrowUp,
  CheckCircle2,
  Copy,
  Check,
  ExternalLink,
  FlaskConical,
  Globe2,
  Heart,
  Home,
  Map,
  Newspaper,
  Palette,
  TrendingUp,
  Trophy,
  X,
  AlertTriangle,
} from "lucide-react"
import confetti from "canvas-confetti"
import { useAuth } from "@/lib/authContext"
import { authFetch } from "@/lib/authFetch"
import { getUserGameScore } from "@/lib/swipeScoreService"
import MobileHeader from "@/components/MobileHeader"
import { useRouter } from "next/navigation"
import { bumpUserDailyStreak } from "@/lib/userStreakService"
import { getUserGames } from "@/lib/gameService"
import { isUserAdmin } from "@/lib/adminService"
import { getUserInventory, useItem, type UserInventory } from "@/lib/userInventoryService"
import { getActiveEffects, type ActiveEffect, getScoreMultiplier, getCoinMultiplier, isEffectActive } from "@/lib/activeEffectsService"
import Onboarding from "@/components/Onboarding"
import { doc, getDoc, setDoc } from "firebase/firestore"
import { db } from "@/lib/firebase"
import { SkeletonCard } from "@/components/Skeletons"

interface Article {
  id: string
  title: string
  perex: string
  image?: string
  category: string
  url?: string
  isTrusted?: boolean
  source?: string
  fakePerex?: string
  fakeSnippet?: string
  fakeSnippetExplanation?: string
  reasoning?: string[]
  fakeReasoning?: string[]
  isFake?: boolean
}

const themeIconMap: Record<
  string,
  { icon: React.ComponentType<{ className?: string; strokeWidth?: number }>; bg: string; color: string; label: string }
> = {
  domaci: { icon: Home, bg: "bg-blue-50 dark:bg-blue-950/40", color: "text-primary dark:text-blue-200", label: "Domácí" },
  svet: { icon: Globe2, bg: "bg-indigo-50 dark:bg-indigo-950/40", color: "text-indigo-600 dark:text-indigo-200", label: "Svět" },
  regiony: { icon: Map, bg: "bg-emerald-50 dark:bg-emerald-950/40", color: "text-emerald-600 dark:text-emerald-200", label: "Regiony" },
  ekonomika: { icon: TrendingUp, bg: "bg-amber-50 dark:bg-amber-950/40", color: "text-amber-600 dark:text-amber-200", label: "Ekonomika" },
  veda: { icon: FlaskConical, bg: "bg-cyan-50 dark:bg-cyan-950/40", color: "text-cyan-600 dark:text-cyan-200", label: "Věda" },
  kultura: { icon: Palette, bg: "bg-pink-50 dark:bg-pink-950/40", color: "text-pink-600 dark:text-pink-200", label: "Kultura" },
  sport: { icon: Trophy, bg: "bg-green-50 dark:bg-green-950/40", color: "text-green-600 dark:text-green-200", label: "Sport" },

  general: { icon: Newspaper, bg: "bg-muted/30", color: "text-muted-foreground/60", label: "Zprávy" },
}

const normalizeCategory = (category?: string) =>
  (category || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()

const getThemeIcon = (category?: string) => {
  const normalized = normalizeCategory(category)

  if (normalized.includes("domaci")) return themeIconMap.domaci
  if (normalized.includes("svet")) return themeIconMap.svet
  if (normalized.includes("region")) return themeIconMap.regiony
  if (normalized.includes("ekonom")) return themeIconMap.ekonomika
  if (normalized.includes("veda")) return themeIconMap.veda
  if (normalized.includes("kultur")) return themeIconMap.kultura
  if (normalized.includes("sport")) return themeIconMap.sport

  return themeIconMap.general
}

/**
 * Trims text so that the last sentence is always complete.
 * If the text would be cut mid-sentence by CSS line-clamp, this ensures
 * we only show full sentences.
 */
function trimToCompleteSentences(text: string, maxChars: number = 450): string {
  if (!text) return text
  if (text.length <= maxChars) {
    // Even short text may end mid-sentence from scraper
    const trimmed = text.trim().replace(/\.{2,}$|…$/g, '').trim()
    if (/[.!?]$/.test(trimmed)) return trimmed
    // Find last complete sentence
    const lastSentence = trimmed.match(/^[\s\S]*[.!?](?=\s)/u)
    if (lastSentence && lastSentence[0].length >= trimmed.length * 0.4) {
      return lastSentence[0].trim()
    }
    return text // return original if we can't improve it
  }

  const cut = text.substring(0, maxChars)
  // Find the last complete sentence ending
  const lastSentence = cut.match(/^[\s\S]*[.!?](?=\s|$)/u)
  if (lastSentence && lastSentence[0].length >= maxChars * 0.3) {
    return lastSentence[0].trim()
  }
  // Fallback: cut at last word boundary
  const lastSpace = cut.lastIndexOf(' ')
  if (lastSpace > maxChars * 0.3) {
    return cut.substring(0, lastSpace).replace(/[,;:\-\u2013\u2014]$/, '').trim() + '\u2026'
  }
  return cut.trim() + '\u2026'
}

function splitPerexBySnippet(perex: string, snippet?: string) {
  if (!snippet) return { before: perex, match: "", after: "" }

  const trimmedSnippet = snippet.trim()
  if (!trimmedSnippet) return { before: perex, match: "", after: "" }

  const lowerPerex = perex.toLowerCase()
  const lowerSnippet = trimmedSnippet.toLowerCase()
  const start = lowerPerex.indexOf(lowerSnippet)

  if (start === -1) return { before: perex, match: "", after: "" }

  const end = start + trimmedSnippet.length
  return {
    before: perex.slice(0, start),
    match: perex.slice(start, end),
    after: perex.slice(end),
  }
}

const Card = ({
  article,
  onSwipe,
  style,
  draggable,
  showCheat = false,
  canSkip = true,
}: {
  article: Article
  onSwipe: (dir: "left" | "right" | "up") => void
  style?: React.CSSProperties
  draggable: boolean
  showCheat: boolean
  canSkip?: boolean
}) => {
  const controls = useAnimation()
  const x = useMotionValue(0)
  const y = useMotionValue(0)
  const smoothX = useSpring(x, { stiffness: 200, damping: 26, mass: 0.6 })
  const smoothY = useSpring(y, { stiffness: 200, damping: 26, mass: 0.6 })

  const velocityX = useVelocity(smoothX)
  const velocityY = useVelocity(smoothY)

  // Lean effect based primarily on velocity, with a very subtle cap.
  // It leans into the direction of the swipe without warping the entire aspect ratio awkwardly.
  const rotateX = useTransform(velocityY, [-1000, 1000], [10, -10])
  const rotateY = useTransform(velocityX, [-1000, 1000], [-10, 10])

  const [copied, setCopied] = useState(false)

  const copyTitle = async (e: React.MouseEvent) => {
    e.stopPropagation()
    try {
      await navigator.clipboard.writeText(article.title)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {}
  }

  // Smooth continuous rotation that maps infinitely instead of clamping
  const rotate = useTransform(smoothX, (currentX) => currentX * 0.04)
  
  const opacityLike = useTransform(smoothX, [0, 45], [0, 1])
  const opacityNope = useTransform(smoothX, [0, -45], [0, 1])
  const opacitySkip = useTransform(smoothY, [0, -45], [0, 1])

  useEffect(() => {
    controls.set({ x: 0, y: 0, rotate: 0 })
    x.set(0)
    y.set(0)
  }, [article.id, controls, x, y])

  const handleDragEnd = async (event: any, info: PanInfo) => {
    const { velocity, offset } = info
    const swipeThreshold = 120
    const velocityThreshold = 600

    const exitTransition: Transition = {
      type: "spring",
      stiffness: 600,
      damping: 30,
      mass: 0.5
    }

    const snapBackTransition: Transition = {
      type: "spring",
      stiffness: 300,
      damping: 30,
      mass: 1.2
    }

    if (offset.y < -swipeThreshold || velocity.y < -velocityThreshold) {
      if (canSkip) {
        await controls.start({ y: -1000, transition: exitTransition })
        onSwipe("up")
      } else {
        controls.start({ x: 0, y: 0, transition: snapBackTransition })
        onSwipe("up") // Trigger toast warning in parent
      }
    } else if (offset.x > swipeThreshold || velocity.x > velocityThreshold) {
      await controls.start({ 
        x: 1000, 
        y: offset.y * 0.5, 
        transition: exitTransition 
      })
      onSwipe("right")
    } else if (offset.x < -swipeThreshold || velocity.x < -velocityThreshold) {
      await controls.start({ 
        x: -1000, 
        y: offset.y * 0.5, 
        transition: exitTransition 
      })
      onSwipe("left")
    } else {
      controls.start({ x: 0, y: 0, transition: snapBackTransition })
    }
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0, y: 20 }}
      animate={{ scale: 1, opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 420, damping: 28, mass: 0.6 }}
      style={{ ...style }}
      className="absolute inset-0 z-10"
    >
      <motion.div
        drag={draggable}
        dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
        dragTransition={{ bounceStiffness: 200, bounceDamping: 24, power: 0.15, timeConstant: 250 }}
        dragElastic={0.8}
        dragMomentum={false}
        onDragEnd={handleDragEnd}
        animate={controls}
        whileDrag={{ scale: 1.02, zIndex: 50, cursor: "grabbing" }}
        style={{ 
          x: smoothX, 
          y: smoothY, 
          rotateZ: rotate, 
          rotateX, 
          rotateY, 
          willChange: "transform" 
        }}
        className="w-full h-full origin-center touch-none select-none cursor-grab perspective-1000"
        role="article"
      >
        <div className="w-full h-full bg-card rounded-xl md:rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.12)] overflow-hidden flex flex-col">

        <motion.div
          style={{ opacity: opacityLike }}
          className="absolute top-4 left-4 md:top-8 md:left-8 z-30 pointer-events-none"
        >
          <div className="bg-green-500 text-white px-3 py-1.5 md:px-5 md:py-2 rounded-full">
            <span className="font-bold text-xs md:text-sm tracking-widest uppercase">Ověřeno</span>
          </div>
        </motion.div>

        <motion.div
          style={{ opacity: opacityNope }}
          className="absolute top-4 right-4 md:top-8 md:right-8 z-30 pointer-events-none"
        >
          <div className="bg-red-500 text-white px-3 py-1.5 md:px-5 md:py-2 rounded-full">
            <span className="font-bold text-xs md:text-sm tracking-widest uppercase">Neověřeno</span>
          </div>
        </motion.div>

        <motion.div
          style={{ opacity: opacitySkip }}
          className="absolute top-4 md:top-8 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
        >
          <div className="bg-foreground text-background px-3 py-1.5 md:px-5 md:py-2 rounded-full flex items-center gap-2">
            <ArrowUp size={16} strokeWidth={2.5} />
            <span className="font-bold text-xs md:text-sm tracking-widest uppercase">Přeskočit</span>
          </div>
        </motion.div>

        <div className="w-full h-32 md:h-40 relative shrink-0">
          {showCheat && (
            <div className="absolute top-3 left-3 z-20 flex items-center gap-2">
              <span
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                  article.isFake ? "bg-red-500/90 text-white" : "bg-emerald-500/90 text-white"
                }`}
              >
                {article.isFake ? (
                  <X className="w-4 h-4" strokeWidth={2.5} />
                ) : (
                  <CheckCircle2 className="w-4 h-4" strokeWidth={2.2} />
                )}
                {article.isFake ? "Unverified" : "Verified"}
              </span>
            </div>
          )}

          {(() => {
            const { icon: ThemeIcon, bg, color, label } = getThemeIcon(article.category)
            return (
              <div className={`w-full h-full flex items-center justify-center ${bg}`}>
                <ThemeIcon className={`w-14 h-14 md:w-16 md:h-16 lg:w-20 lg:h-20 ${color}`} strokeWidth={1.75} />
                <span className="sr-only">{label}</span>
              </div>
            )
          })()}
        </div>

        <div className="flex-1 p-4 md:p-6 lg:p-8 flex flex-col justify-start bg-card overflow-hidden">
          <div className="mb-2 md:mb-3 shrink-0">
            <span className="text-[0.625rem] md:text-xs font-medium text-muted-foreground uppercase tracking-[0.15em]">
              {article.category || "Zprávy"}
            </span>
          </div>

          <div className="flex items-start gap-2 mb-2 pb-1 shrink-0">
            <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground leading-tight text-balance flex-1 break-words">
              {article.title}
            </h2>
            <button
              onClick={copyTitle}
              className="mt-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors shrink-0"
              title="Zkopírovat titulek"
            >
              {copied ? (
                <Check size={16} className="text-green-500" strokeWidth={2.5} />
              ) : (
                <Copy size={16} strokeWidth={2} />
              )}
            </button>
          </div>

          <p className="text-muted-foreground text-sm md:text-[0.9375rem] leading-relaxed overflow-y-auto text-pretty flex-1 min-h-[4rem] pr-2 scrollbar-thin scrollbar-thumb-muted-foreground/20 dark:scrollbar-thumb-muted-foreground/40 hover:scrollbar-thumb-muted-foreground/40 transition-colors pointer-events-none">
            {trimToCompleteSentences(article.fakePerex || article.perex)}
          </p>
        </div>
        </div>
      </motion.div>
    </motion.div>
  )
}

const VerificationResult = ({
  article,
  userVote,
  onContinueReading,
  onClose,
  coinMultiplier = 1,
  scoreMultiplier = 1,
  hasSafetyNet = false,
}: {
  article: Article
  userVote: "verified" | "unverified"
  onContinueReading: () => void
  onClose: () => void
  coinMultiplier?: number
  scoreMultiplier?: number
  hasSafetyNet?: boolean
}) => {
  const isTrusted = !article.isFake
  const isCorrect = (userVote === "verified" && isTrusted) || (userVote === "unverified" && !isTrusted)
  const fakePerexText = article.fakePerex || article.perex
  const fallbackSnippet = (fakePerexText || "").split(/(?<=[.!?])\s+/)[0]?.trim() || ""
  const highlightedSnippet = article.fakeSnippet || fallbackSnippet
  const { before, match, after } = splitPerexBySnippet(fakePerexText || "", highlightedSnippet)
  const snippetExplanation = article.fakeSnippetExplanation || "Tato věta obsahuje neověřitelné nebo zavádějící tvrzení, proto je označena jako dezinformace."

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 md:p-6"
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.9, y: 20 }}
        transition={{ duration: 0.3, ease: [0.32, 0.72, 0, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl h-[92vh] md:h-[88vh] max-h-[900px] bg-card rounded-xl md:rounded-2xl shadow-2xl overflow-hidden flex flex-col relative z-[101]"
      >
        <div
          className={`w-full p-4 md:p-6 shrink-0 ${isCorrect ? "bg-green-50 dark:bg-green-950/30" : "bg-red-50 dark:bg-red-950/30"}`}

        >
          <div className="flex items-center justify-center mb-6">
            {isCorrect ? (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-green-500 flex items-center justify-center">
                <CheckCircle2 size={32} className="md:w-10 md:h-10 text-white" strokeWidth={2.5} />
              </div>
            ) : (
              <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-red-500 flex items-center justify-center">
                <X size={32} className="md:w-10 md:h-10 text-white" strokeWidth={3} />
              </div>
            )}
          </div>

          <div className="flex flex-wrap justify-center gap-2">
            {isCorrect ? (
              <>
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${scoreMultiplier > 1 ? 'bg-amber-100 text-amber-700 shadow-[0_0_15px_rgba(245,158,11,0.5)] border border-amber-300' : 'bg-green-100 text-green-700'}`}>
                  <span>{scoreMultiplier > 1 ? '⚡' : '🔥'}</span>
                  <span>+{1 * scoreMultiplier} Skóre</span>
                </motion.div>
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 ${coinMultiplier > 1 ? 'bg-yellow-100 text-yellow-700 shadow-[0_0_15px_rgba(234,179,8,0.5)] border border-yellow-300 animate-pulse' : 'bg-green-100 text-green-700'}`}>
                  <span>🧲</span>
                  <span>+{10 * coinMultiplier} Mincí</span>
                </motion.div>
              </>
            ) : (
              <>
                {hasSafetyNet ? (
                  <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 bg-cyan-100 text-cyan-700 shadow-[0_0_15px_rgba(6,182,212,0.5)] border border-cyan-300">
                    <span>🪢</span>
                    <span>Síť tě zachránila</span>
                  </motion.div>
                ) : (
                  <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.1 }} className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 bg-red-100 text-red-700">
                    <span>❌</span>
                    <span>-1 Skóre</span>
                  </motion.div>
                )}
                <motion.div initial={{ scale: 0.5, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ delay: 0.2 }} className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest flex items-center gap-1.5 bg-red-100 text-red-700">
                  <span>🪙</span>
                  <span>+0 Mince</span>
                </motion.div>
              </>
            )}
          </div>
        </div>

        <div className="flex-1 p-4 md:p-6 lg:p-8 overflow-y-auto">
          <div className="mb-4 md:mb-6 pb-4 md:pb-6 border-b border-border">
            <p className="text-[0.625rem] md:text-xs font-medium text-muted-foreground uppercase tracking-[0.15em] mb-2">
              Zdroj
            </p>
            <p className="text-sm md:text-base text-foreground font-medium">
              {article.isFake ? "AI/Neověřený zdroj" : article.source}
            </p>
          </div>

          <div className="mb-3 md:mb-4">
            <span className="text-[0.625rem] md:text-xs font-medium text-muted-foreground uppercase tracking-[0.15em]">
              {article.category || "Zprávy"}
            </span>
          </div>

          <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-foreground leading-tight md:leading-[1.2] mb-3 md:mb-4 text-balance">
            {article.title}
          </h2>

          <p className="text-muted-foreground text-sm md:text-[0.9375rem] leading-relaxed mb-3 md:mb-4">
            {article.isFake ? (
              match ? (
                <>
                  {before}
                  <span className="bg-red-200/80 dark:bg-red-500/25 text-red-800 dark:text-red-100 px-1 rounded-sm font-semibold">
                    {match}
                  </span>
                  {after}
                </>
              ) : (
                fakePerexText
              )
            ) : (
              article.perex
            )}
          </p>

          {article.isFake && (
            <p className="text-base md:text-lg text-red-800 dark:text-red-200 leading-relaxed mb-4 md:mb-6">
              {snippetExplanation}
            </p>
          )}
        </div>

        <div className="p-4 md:p-6 border-t border-border bg-card space-y-2 md:space-y-3">
          <button
            onClick={onContinueReading}
            className="w-full px-4 py-3 md:px-6 md:py-4 bg-foreground text-background rounded-lg md:rounded-xl text-sm font-medium hover:scale-[1.02] active:scale-95 transition-transform flex items-center justify-center gap-2"
          >
            Číst dál
            <ExternalLink size={16} />
          </button>
          <button
            onClick={onClose}
            className="w-full px-4 py-3 md:px-6 md:py-4 bg-muted text-foreground rounded-lg md:rounded-xl text-sm font-medium hover:scale-[1.02] active:scale-95 transition-transform"
          >
            Zavřít
          </button>
        </div>
      </motion.div>
    </motion.div>
  )
}

export default function TinderNewsPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [articles, setArticles] = useState<Article[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [verificationArticle, setVerificationArticle] = useState<{
    article: Article
    userVote: "verified" | "unverified"
  } | null>(null)

  const [positivePoints, setPositivePoints] = useState(0)
  const [negativePoints, setNegativePoints] = useState(0)
  const [scoreLoading, setScoreLoading] = useState(true)
  const [displayName, setDisplayName] = useState<string>("")
  const [hasGame, setHasGame] = useState<boolean>(true)
  const [gameLoading, setGameLoading] = useState<boolean>(true)
  const [isAdmin, setIsAdmin] = useState(false)
  const [checkingAdmin, setCheckingAdmin] = useState(true)

  // ── Upgrade state ──
  const [inventory, setInventory] = useState<UserInventory>({ items: {} } as UserInventory)
  const [activeEffects, setActiveEffects] = useState<ActiveEffect[]>([])
  const [hintText, setHintText] = useState<string | null>(null)
  const [isSwiping, setIsSwiping] = useState(false)
  const [feedToast, setFeedToast] = useState<{ msg: string; type: "info" | "warn" | "ok" } | null>(null)
  const [hasRestoredArticle, setHasRestoredArticle] = useState(false)

  // ── Onboarding ──
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingChecked, setOnboardingChecked] = useState(false)

  useEffect(() => {
    if (!user) return
    const ref = doc(db, "user_settings", user.uid)
    getDoc(ref).then((snap) => {
      if (snap.exists() && snap.data()?.onboardingDone === true) {
        setShowOnboarding(false)
      } else {
        setShowOnboarding(true)
      }
      setOnboardingChecked(true)
    }).catch(() => {
      // Firestore failed – show onboarding to be safe
      setShowOnboarding(true)
      setOnboardingChecked(true)
    })
  }, [user])

  const handleOnboardingComplete = () => {
    setShowOnboarding(false)
    if (user) {
      const ref = doc(db, "user_settings", user.uid)
      setDoc(ref, { onboardingDone: true }, { merge: true }).catch(console.error)
    }
  }

  const skipCount = inventory.items?.['article_skip_1']?.quantity ?? 0
  const hintCount = inventory.items?.['hint_token_1']?.quantity ?? 0
  const megaHintCount = inventory.items?.['mega_hint_1']?.quantity ?? 0
  const scoreMultiplier = getScoreMultiplier(activeEffects)
  const coinMultiplier = getCoinMultiplier(activeEffects)
  const hasSafetyNet = isEffectActive(activeEffects, 'safety_net_1')

  // Load inventory and effects
  useEffect(() => {
    if (!user) return
    const load = async () => {
      try {
        const [inv, fx] = await Promise.all([
          getUserInventory(user.uid),
          getActiveEffects(user.uid),
        ])
        setInventory(inv)
        setActiveEffects(fx)
      } catch (e) {
        console.error('[Feed] inventory/effects load error:', e)
      }
    }
    load()
  }, [user])

  // Save current article to localStorage
  useEffect(() => {
    if (!user || articles.length === 0) return
    const currentArticle = articles[articles.length - 1]
    if (currentArticle) {
      try {
        localStorage.setItem(`feed_current_article_${user.uid}`, JSON.stringify(currentArticle))
      } catch (e) {
        console.error('[Feed] Failed to save current article:', e)
      }
    }
  }, [articles, user])

  // Restore saved article on initial load
  useEffect(() => {
    if (!user || hasRestoredArticle || authLoading || gameLoading || !hasGame) return

    try {
      const savedArticleStr = localStorage.getItem(`feed_current_article_${user.uid}`)
      if (savedArticleStr) {
        const savedArticle = JSON.parse(savedArticleStr) as Article
        setArticles([savedArticle])
        setHasRestoredArticle(true)
        console.log('[Feed] Restored saved article:', savedArticle.id)
      } else {
        setHasRestoredArticle(true)
      }
    } catch (e) {
      console.error('[Feed] Failed to restore article:', e)
      setHasRestoredArticle(true)
    }
  }, [user, hasRestoredArticle, authLoading, gameLoading, hasGame])

  // Refresh inventory helper
  const refreshInventory = useCallback(async () => {
    if (!user) return
    try {
      const [inv, fx] = await Promise.all([
        getUserInventory(user.uid),
        getActiveEffects(user.uid),
      ])
      setInventory(inv)
      setActiveEffects(fx)
    } catch {}
  }, [user])

  // Hint handler
  const handleUseHint = useCallback(async () => {
    if (!user || hintCount <= 0) return
    const article = articles[articles.length - 1]
    if (!article) return
    const consumed = await useItem(user.uid, 'hint_token_1')
    if (!consumed) { setFeedToast({ msg: 'Nemáš žádné nápovědy', type: 'warn' }); return }
    await refreshInventory()

    let hintMsg = '💡 Tento článek vypadá důvěryhodně.'
    if (article.isFake) {
      if (article.fakeReasoning && article.fakeReasoning.length > 0) {
        // Pick a random reasoning from the AI
        const reasoning = article.fakeReasoning[Math.floor(Math.random() * article.fakeReasoning.length)]
        hintMsg = `💡 Podezřelý znak: ${reasoning}`
      } else {
        hintMsg = '💡 Tento článek obsahuje typické znaky manipulace nebo clickbaitu.'
      }
    } else {
      hintMsg = '💡 AI analytik nenašel na tomto perexu žádné zjevné prvky manipulace.'
    }

    setHintText(hintMsg)
    setTimeout(() => setHintText(null), 6000)
  }, [user, hintCount, articles, refreshInventory])

  // Mega hint handler
  const handleUseMegaHint = useCallback(async () => {
    if (!user || megaHintCount <= 0) return
    const article = articles[articles.length - 1]
    if (!article) return
    const consumed = await useItem(user.uid, 'mega_hint_1')
    if (!consumed) { setFeedToast({ msg: 'Nemáš mega nápovědu', type: 'warn' }); return }
    await refreshInventory()
    setHintText(article.isFake ? '🔮 FALEŠNÝ — swipni doleva!' : '🔮 PRAVDIVÝ — swipni doprava!')
    setTimeout(() => setHintText(null), 5000)
  }, [user, megaHintCount, articles, refreshInventory])

  useEffect(() => {
    if (authLoading) return

    if (!scoreLoading && !user) {
      router.push("/auth/login")
    }
  }, [scoreLoading, user, router])

  useEffect(() => {
    let active = true
    const verifyAdmin = async () => {
      if (!user?.uid) {
        setIsAdmin(false)
        setCheckingAdmin(false)
        return
      }
      try {
        const allowed = await isUserAdmin(user.uid)
        if (active) {
          setIsAdmin(allowed)
        }
      } catch (err) {
        console.error("[Feed] Failed to check admin:", err)
        if (active) setIsAdmin(false)
      } finally {
        if (active) setCheckingAdmin(false)
      }
    }
    verifyAdmin()
    return () => {
      active = false
    }
  }, [user])

  const fireConfetti = () => {
    if (typeof window === "undefined") return

    confetti({
      particleCount: 70,
      spread: 65,
      startVelocity: 45,
      origin: { y: 0.7 },
      ticks: 200,
      colors: ["#4ade80", "#22c55e", "#a3e635"],
    })
  }

  const fetchArticles = async (isLoadMore = false) => {
    if (!hasGame || !user) {
      setLoading(false)
      return
    }

    try {
      setLoading(true)

      const response = await fetch(`/api/articles?limit=10&userId=${user.uid}`)

      if (!response.ok) {
        const fallback = await response.text()
        console.error(`[Feed] /api/articles ${response.status}:`, fallback.slice(0, 400))
        if (!isLoadMore) setError("Nelze načíst články (API není dostupné)")
        return
      }

      const contentType = response.headers.get("content-type") || ""
      if (!contentType.includes("application/json")) {
        const fallback = await response.text()
        console.error("[Feed] /api/articles returned non-JSON:", fallback.slice(0, 400))
        if (!isLoadMore) setError("Nelze načíst články (neočekávaný formát)")
        return
      }

      const data = await response.json()

      if (data?.success && Array.isArray(data.articles)) {
        const transformedArticles: Article[] = data.articles.map((article: any) => {
          const isFake = article.fakePerex && article.fakePerex.trim() !== ""

          return {
            id: article.id,
            title: article.title,
            perex: article.perex,
            image: article.imageUrl,
            category: article.category || "Zprávy",
            url: article.url,
            isTrusted: !isFake,
            source: article.source || "Zpravodajský portál",
            fakePerex: article.fakePerex,
            fakeSnippet: article.fakeSnippet,
            fakeSnippetExplanation: article.fakeSnippetExplanation,
            fakeReasoning: article.fakeReasoning || article.reasoning,
            isFake: isFake,
          }
        })

        setArticles((prev) => (isLoadMore ? [...prev, ...transformedArticles] : transformedArticles))
        setError(null)
      } else {
        console.error("[Feed] /api/articles returned invalid payload", data)
        if (!isLoadMore) setError(data?.error || "Nepodařilo se načíst články")
      }
    } catch (err) {
      console.error("Error fetching articles:", err)
      if (!isLoadMore) setError("Nelze načíst články")
    } finally {
      setLoading(false)
    }
  }

  const markDailyEngagement = async () => {
  if (!user) return
  try {
    const res = await bumpUserDailyStreak(user.uid)
    console.log("[Streak] Updated:", res)

    // 🔥 po aktualizaci streaku pošli event do celého frontendu
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("user-streak-updated", { detail: res.streak })
      )
    }
  } catch (err) {
    console.error("[Streak] Failed to update:", err)
  }
  }


  const handleSwipe = async (id: string, direction: "left" | "right" | "up") => {
    if (isSwiping) return
    if (gameLoading || !hasGame) {
      setError("Pro swipování vytvořte nebo se připojte k herní relaci v sekci Hra.")
      return
    }
    const article = articles.find((a) => a.id === id)
    setHintText(null) 

    if (direction === "up") {
      if (skipCount <= 0) {
        setFeedToast({ msg: 'Nemáš přeskočení — kup si je v obchodě', type: 'warn' })
        return
      }
      setIsSwiping(true)
      if (user) {
        try {
          const res = await authFetch('/api/swipe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ userId: user.uid, articleId: id, direction: 'up', useSkip: true }),
          })
          if (!res.ok) {
            const data = await res.json()
            setFeedToast({ msg: data.error || 'Nelze přeskočit', type: 'warn' })
            setIsSwiping(false)
            return
          }
          await refreshInventory()
          setFeedToast({ msg: `Přeskočeno (zbývá ${skipCount - 1})`, type: 'info' })
        } catch {
          setFeedToast({ msg: 'Chyba při přeskočení', type: 'warn' })
          setIsSwiping(false)
          return
        }
      }
      console.log(`Article ${id} -> SKIPPED (up, paid)`)
    } else {
      setIsSwiping(true)
      const isSwipeCorrect = (direction === "right" && !article?.isFake) || (direction === "left" && article?.isFake)

      // Optimistic update — but skip adding a negative point if safety net is active,
      // because we know the server will block it.
      if (isSwipeCorrect) {
        setPositivePoints((prev) => prev + 1)
      } else if (!hasSafetyNet) {
        // Only add negative if no safety net is there to block it
        setNegativePoints((prev) => prev + 1)
      }

      if (article) {
        const isTrusted = !article.isFake
        const isCorrectDetailed = (direction === "right" && isTrusted) || (direction === "left" && !isTrusted)

        if (isCorrectDetailed) {
          fireConfetti()
        }

        setVerificationArticle({
          article,
          userVote: direction === "right" ? "verified" : "unverified",
        })
      }

      if (user) {
        try {
          const response = await authFetch("/api/swipe", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              userId: user.uid,
              articleId: id,
              direction,
              articleTitle: article?.title,
              displayName,
              isFake: article?.isFake || false,
              url: article?.url,
              category: article?.category || "Zprávy",
            }),
          })

          if (!response.ok) {
            const errorData = await response.json()
            console.error("Failed to save swipe to backend:", response.status, errorData)
            // Roll back optimistic update
            if (isSwipeCorrect) {
              setPositivePoints((prev) => prev - 1)
            } else if (!hasSafetyNet) {
              setNegativePoints((prev) => prev - 1)
            }
          } else {
            const result = await response.json()

            // If the server used the safety net, ensure the negative
            // won't be counted — roll it back if it slipped through
            if (result.safetyNetUsed) {
              // In case hasSafetyNet was stale (race), also undo the negative
              setNegativePoints((prev) => Math.max(0, prev - 1))
              setFeedToast({ msg: '🪢 Záchranná síť tě zachránila!', type: 'ok' })
              fireConfetti()
            }

            await markDailyEngagement()
            await refreshInventory()

            // Update coin display in header
            if (typeof window !== "undefined" && result.coinsAwarded) {
              try {
                const { getUserCoins } = await import("@/lib/coinService")
                const coinData = await getUserCoins(user.uid)
                window.dispatchEvent(
                  new CustomEvent("user-coins-updated", { detail: coinData.coins })
                )
              } catch (coinErr) {
                console.error("[Feed] Failed to update coin display:", coinErr)
              }
            }
          }
        } catch (error) {
          console.error("Error saving swipe:", error)
          // Roll back optimistic update on network error
          if (isSwipeCorrect) {
            setPositivePoints((prev) => prev - 1)
          } else if (!hasSafetyNet) {
            setNegativePoints((prev) => prev - 1)
          }
        }
      }
    }

    setTimeout(() => {
      setArticles((prev) => prev.filter((item) => item.id !== id))
      // Clear saved article from localStorage when swiped
      if (user) {
        try {
          localStorage.removeItem(`feed_current_article_${user.uid}`)
        } catch (e) {
          console.error('[Feed] Failed to clear saved article:', e)
        }
      }
    }, 80)

    // Unlock swiping shortly after card transition to keep next card immediately draggable
    setTimeout(() => {
      setIsSwiping(false)
    }, 120)

    if (articles.length < 8) {
      fetchArticles(true)
    }
  }

  const triggerSwipe = (direction: "left" | "right" | "up") => {
    if (articles.length > 0) {
      const topArticle = articles[articles.length - 1]
      handleSwipe(topArticle.id, direction)
    }
  }

  const handleContinueReading = () => {
    if (verificationArticle?.article.url) {
      window.open(verificationArticle.article.url, "_blank")
    } else {
      alert("URL článku není k dispozici (ukázka)")
    }
    // Don't close the popup — user can read the article in a new tab
    // and come back to the verification result. They can close it with "Zavřít".
  }

  const handleCloseVerification = () => {
    setVerificationArticle(null)
  }

  useEffect(() => {
    // Only fetch articles once we know the user is in a game and we've tried to restore
    if (!authLoading && !gameLoading && hasGame && user && hasRestoredArticle && articles.length === 0) {
      fetchArticles()
    }
  }, [authLoading, gameLoading, hasGame, user, hasRestoredArticle, articles.length])

  useEffect(() => {
    const loadUserData = async () => {
      if (authLoading) return

      if (user) {
        console.log("[Frontend] User logged in:", user.uid)
        try {
          // Check if user is in any game (solo or multi). If not, block swiping.
          try {
            const games = await getUserGames(user.uid)
            setHasGame(games.length > 0)
          } catch (gameErr) {
            console.error("[Frontend] Could not load user games:", gameErr)
            setHasGame(false)
          } finally {
            setGameLoading(false)
          }

          const userScore = await getUserGameScore(user.uid)
          if (userScore) {
            console.log("[Frontend] Loaded user score:", userScore)
            setPositivePoints(userScore.positivePoints)
            setNegativePoints(userScore.negativePoints)
            if (userScore.displayName) {
              setDisplayName(userScore.displayName)
            }
          } else {
            console.log("[Frontend] No existing score found, starting fresh")
          }

          if (!userScore?.displayName) {
            try {
              const { getUserGames } = await import("@/lib/gameService")
              const games = await getUserGames(user.uid)
              if (games.length > 0 && games[0].playerInfo) {
                const playerInfo = games[0].playerInfo.find((p) => p.userId === user.uid)
                if (playerInfo?.displayName) {
                  setDisplayName(playerInfo.displayName)
                }
              }
            } catch (gameErr) {
              console.log("[Frontend] Could not load game info:", gameErr)
            }
          }
        } catch (err) {
          console.error("Error loading user data:", err)
        } finally {
          setScoreLoading(false)
        }
      } else {
        console.log("[Frontend] No user logged in")
        setScoreLoading(false)
        setGameLoading(false)
        setHasGame(false)
      }
    }

    loadUserData()
  }, [user, authLoading])

  // ── ONBOARDING: highest-priority render — shows before game/feed state ──
  if (user && showOnboarding) {
    return <Onboarding onComplete={handleOnboardingComplete} />
  }

  // If user is logged in but not in any game, show a blocker instead of feed
  // Wait for onboarding check so the user can't bypass it by clicking "Začít relaci"
  if (user && !gameLoading && !hasGame) {
    if (!onboardingChecked) {
      // Still checking — show a neutral loading screen so nothing is clickable yet
      return (
        <div className="min-h-screen w-full bg-background flex flex-col">
          <MobileHeader />
          <div className="flex-1 flex items-center justify-center">
            <SkeletonCard />
          </div>
        </div>
      )
    }
    return (
      <div className="min-h-screen w-full bg-background flex flex-col">
        <MobileHeader />
        <div className="flex-1 max-w-md lg:max-w-lg xl:max-w-xl mx-auto px-4 md:px-6 flex flex-col items-center justify-center text-center gap-4">
          <div className="w-16 h-16 rounded-full bg-muted flex items-center justify-center">
            <Trophy className="w-8 h-8 text-muted-foreground" />
          </div>
          <h1 className="text-2xl font-semibold text-foreground">Vytvořte herní relaci</h1>
          <p className="text-muted-foreground text-sm">
            Abyste mohli scrollovat články, založte si alespoň solo místnost nebo se připojte k existující hře.
          </p>
          <button
            onClick={() => router.push("/game")}
            className="px-6 py-3 bg-foreground text-background rounded-xl font-medium hover:scale-105 transition-transform"
          >
            Začít relaci
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen w-full bg-background flex flex-col relative">
      <MobileHeader />

      {/* Onboarding overlay (user has game — covers feed) */}
      {showOnboarding && (
        <Onboarding onComplete={handleOnboardingComplete} />
      )}

      <div className="flex flex-col h-[calc(100vh-3.8rem)] w-full overflow-hidden items-center font-sans">
        <header className="w-full max-w-md lg:max-w-lg xl:max-w-xl pt-4 md:pt-6 lg:pt-8 pb-2 md:pb-3 px-4 md:px-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">Zprávy</h1>
            {user && !scoreLoading && (
              <div className="flex gap-2 md:gap-3 text-xs md:text-sm">
                <span className="text-green-600 font-bold flex items-center gap-1">
                  <Heart className="w-3 h-3 md:w-4 md:h-4" fill="currentColor" strokeWidth={0} />+{positivePoints}
                </span>
                <span className="text-red-600 font-bold flex items-center gap-1">
                  <X className="w-3 h-3 md:w-4 md:h-4" strokeWidth={3} />
                  {negativePoints}
                </span>
              </div>
            )}
          </div>

          {/* ── Active boost indicators ── */}
          {user && (scoreMultiplier > 1 || coinMultiplier > 1 || hasSafetyNet || hintCount > 0 || megaHintCount > 0 || skipCount > 0) && (
            <div className="flex flex-wrap gap-2 mt-3">
              {scoreMultiplier > 1 && (
                <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-amber-400/20 to-orange-500/20 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-[11px] font-black uppercase tracking-wider rounded-md shadow-[0_0_12px_rgba(245,158,11,0.2)]">
                  <span className="animate-pulse drop-shadow-sm">⚡</span> {scoreMultiplier}× skóre
                </motion.span>
              )}
              {coinMultiplier > 1 && (
                <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-yellow-400/20 to-lime-500/20 border border-yellow-500/30 text-yellow-700 dark:text-yellow-300 text-[11px] font-black uppercase tracking-wider rounded-md shadow-[0_0_12px_rgba(234,179,8,0.2)]">
                  <span className="animate-bounce drop-shadow-sm">🧲</span> +50% mince
                </motion.span>
              )}
              {hasSafetyNet && (
                <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-cyan-400/20 to-blue-500/20 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[11px] font-black uppercase tracking-wider rounded-md shadow-[0_0_12px_rgba(6,182,212,0.2)]">
                  <span className="drop-shadow-sm">🪢</span> Záchranná síť
                </motion.span>
              )}
              {hintCount > 0 && (
                <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-purple-400/20 to-fuchsia-500/20 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-[11px] font-black uppercase tracking-wider rounded-md">
                  <span className="drop-shadow-sm">💡</span> {hintCount} Nápověda
                </motion.span>
              )}
              {megaHintCount > 0 && (
                <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-violet-400/20 to-indigo-500/20 border border-violet-500/30 text-violet-700 dark:text-violet-300 text-[11px] font-black uppercase tracking-wider rounded-md shadow-[0_0_10px_rgba(139,92,246,0.3)]">
                  <span className="animate-pulse drop-shadow-sm">🔮</span> {megaHintCount} Mega nápověda
                </motion.span>
              )}
              {skipCount > 0 && (
                <motion.span initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-gradient-to-r from-stone-400/20 to-stone-500/20 border border-stone-500/30 text-stone-700 dark:text-stone-300 text-[11px] font-black uppercase tracking-wider rounded-md">
                  <span className="drop-shadow-sm">⏭️</span> {skipCount} Přeskočit
                </motion.span>
              )}
            </div>
          )}
        </header>

        <main className="flex-1 w-full max-w-md lg:max-w-lg xl:max-w-xl relative flex flex-col items-center justify-center px-4 md:px-6 pb-4">
          <div className="relative w-full h-[min(60vh,500px)] md:h-[min(65vh,580px)] lg:h-[min(60vh,540px)] z-10">
            {loading && articles.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                <SkeletonCard />
              </div>
            )}

            {error && articles.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 md:px-8">
                <div className="w-14 h-14 md:w-16 md:h-16 rounded-full bg-muted flex items-center justify-center mb-4 md:mb-6">
                  <AlertTriangle size={24} className="md:w-7 md:h-7 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="text-lg md:text-xl font-semibold text-foreground mb-2">Chyba</h3>
                <p className="text-muted-foreground text-xs md:text-sm mb-6 md:mb-8">{error}</p>
                <button
                  onClick={() => fetchArticles()}
                  className="px-5 py-2.5 md:px-6 md:py-3 bg-foreground text-background rounded-full text-xs md:text-sm font-medium active:scale-95 transition-transform"
                >
                  Zkusit znovu
                </button>
              </div>
            )}

            {!loading && !error && articles.length === 0 && (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 md:px-8">
                <div className="w-16 h-16 md:w-20 md:h-20 rounded-full bg-muted flex items-center justify-center mb-4 md:mb-6">
                  <Newspaper className="w-8 h-8 md:w-10 md:h-10 text-muted-foreground" strokeWidth={1.5} />
                </div>
                <h3 className="text-xl md:text-2xl font-semibold text-foreground mb-2">Vše přečteno</h3>
                <p className="text-muted-foreground text-xs md:text-sm mb-6 md:mb-8">
                  Momentálně nejsou k dispozici žádné další články
                </p>
                <button
                  onClick={() => fetchArticles()}
                  className="px-6 py-2.5 md:px-8 md:py-3 bg-foreground text-background rounded-full text-xs md:text-sm font-medium active:scale-95 transition-transform"
                >
                  Obnovit
                </button>
              </div>
            )}

            <AnimatePresence>
              {articles.map((article, index) => {
                const isTop = index === articles.length - 1
                if (!isTop) return null

                return (
                  <Card
                    key={article.id}
                    article={article}
                    onSwipe={(dir) => handleSwipe(article.id, dir)}
                    style={{
                      zIndex: articles.length - index,
                      scale: 1 - (articles.length - 1 - index) * 0.05,
                      y: (articles.length - 1 - index) * 12,
                      opacity: index < articles.length - 3 ? 0 : 1,
                    }}
                    draggable={index === articles.length - 1 && !isSwiping}
                    showCheat={isAdmin}
                    canSkip={skipCount > 0}
                  />
                )
              })}
            </AnimatePresence>
          </div>
        </main>

        {/* ── Hint overlay ── */}
        <AnimatePresence>
          {hintText && (
            <motion.div
              initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="absolute top-20 left-1/2 -translate-x-1/2 z-30 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-700 shadow-lg rounded-lg px-4 py-2 text-sm font-medium text-neutral-800 dark:text-neutral-200 max-w-xs text-center"
            >
              {hintText}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Feed toast ── */}
        <AnimatePresence>
          {feedToast && (
            <motion.div
              initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
              onAnimationComplete={() => setTimeout(() => setFeedToast(null), 2500)}
              className={`absolute bottom-28 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg text-[13px] font-medium shadow-lg
                ${feedToast.type === 'ok' ? 'bg-emerald-600 text-white' : feedToast.type === 'warn' ? 'bg-amber-500 text-white' : 'bg-neutral-800 text-white'}`}
            >
              {feedToast.msg}
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="w-full max-w-md lg:max-w-lg xl:max-w-xl flex items-center justify-center gap-3 md:gap-4 pb-20 md:pb-6 pt-3 md:pt-5 shrink-0 z-20">
          {/* Hint button */}
          {hintCount > 0 && (
            <button
              className="relative w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-purple-100 to-fuchsia-100 dark:from-purple-900/40 dark:to-fuchsia-900/40 text-purple-600 dark:text-purple-300 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform text-lg shadow-[0_0_15px_rgba(168,85,247,0.4)] border border-purple-300/50 dark:border-purple-700/50"
              onClick={handleUseHint}
              aria-label="Použít nápovědu"
              title={`Nápověda (${hintCount})`}
            >
              <span className="drop-shadow-sm">💡</span>
              <span className="absolute -top-1.5 -right-1.5 bg-purple-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm border-2 border-background">{hintCount}</span>
            </button>
          )}

          {/* Mega hint button */}
          {megaHintCount > 0 && (
            <button
              className="relative w-10 h-10 md:w-12 md:h-12 rounded-xl bg-gradient-to-br from-violet-100 to-indigo-100 dark:from-violet-900/40 dark:to-indigo-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center hover:scale-105 active:scale-95 transition-transform text-lg shadow-[0_0_15px_rgba(139,92,246,0.5)] border border-violet-300/50 dark:border-violet-700/50"
              onClick={handleUseMegaHint}
              aria-label="Použít mega nápovědu"
              title={`Mega nápověda (${megaHintCount})`}
            >
              <span className="drop-shadow-sm animate-pulse">🔮</span>
              <span className="absolute -top-1.5 -right-1.5 bg-violet-600 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm border-2 border-background">{megaHintCount}</span>
            </button>
          )}

          <button
            className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-card text-red-500 shadow-[0_4px_20px_rgb(0,0,0,0.08)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform border border-border"
            onClick={() => triggerSwipe("left")}
            aria-label="Označit jako neověřené"
          >
            <X size={24} className="md:w-7 md:h-7" strokeWidth={2} />
          </button>

          <button
            className={`w-14 h-14 md:w-16 md:h-16 rounded-2xl flex items-center justify-center hover:scale-105 active:scale-95 transition-all text-white relative ${skipCount <= 0 ? 'bg-neutral-800 dark:bg-neutral-800 opacity-40 shadow-none' : 'bg-gradient-to-b from-stone-600 to-stone-800 shadow-[0_0_15px_rgba(87,83,78,0.5)] border border-stone-500/50'}`}
            onClick={() => triggerSwipe("up")}
            aria-label="Přeskočit"
          >
            <ArrowUp size={24} className="md:w-7 md:h-7" strokeWidth={2.5} />
            {skipCount > 0 && (
              <span className="absolute -top-2 -right-2 bg-gradient-to-b from-stone-400 to-stone-500 text-white text-[10px] font-bold w-5 h-5 rounded-full flex items-center justify-center shadow-sm border-2 border-background">{skipCount}</span>
            )}
          </button>

          <button
            className="w-14 h-14 md:w-16 md:h-16 rounded-2xl bg-green-500 text-white shadow-[0_4px_20px_rgb(0,0,0,0.15)] flex items-center justify-center hover:scale-105 active:scale-95 transition-transform"
            onClick={() => triggerSwipe("right")}
            aria-label="Označit jako ověřené"
          >
            <CheckCircle2 size={22} className="md:w-[26px] md:h-[26px]" strokeWidth={2.5} />
          </button>
        </footer>
      </div>

      <AnimatePresence>
        {verificationArticle && (
          <VerificationResult
            article={verificationArticle.article}
            userVote={verificationArticle.userVote}
            onContinueReading={handleContinueReading}
            onClose={handleCloseVerification}
            coinMultiplier={coinMultiplier}
            scoreMultiplier={scoreMultiplier}
            hasSafetyNet={hasSafetyNet}
          />
        )}
      </AnimatePresence>
    </div>
  )
}

