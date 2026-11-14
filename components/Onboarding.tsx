"use client"

import { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { ArrowRight, ArrowLeft, Newspaper, Coins, Trophy, Flame, ShieldCheck, X } from "lucide-react"

interface OnboardingProps {
  onComplete: () => void
}

const STEPS = [
  {
    title: "Vítej v Quackr!",
    subtitle: "Nauč se rozpoznávat dezinformace hravou formou",
    icon: ShieldCheck,
    iconBg: "bg-emerald-100 dark:bg-emerald-900/40",
    iconColor: "text-emerald-600 dark:text-emerald-400",
    points: [
      "Čtete reálné zprávy z českých médií",
      "Některé články jsou upraveny AI — obsahují dezinformace",
      "Vaším úkolem je rozpoznat, co je pravda a co ne",
    ],
  },
  {
    title: "Jak swipovat?",
    subtitle: "Ovládání je jednoduché",
    icon: Newspaper,
    iconBg: "bg-blue-100 dark:bg-blue-900/40",
    iconColor: "text-blue-600 dark:text-blue-400",
    points: [
      "👉 Swipe doprava — článek je podle vás pravdivý",
      "👈 Swipe doleva — článek je podle vás falešný",
      "⬆️ Swipe nahoru — přeskočit článek (stojí token)",
      "Po každém swipu uvidíte, zda jste měli pravdu",
    ],
  },
  {
    title: "Sbírejte a soutěžte",
    subtitle: "Mince, streaky a žebříčky",
    icon: Trophy,
    iconBg: "bg-amber-100 dark:bg-amber-900/40",
    iconColor: "text-amber-600 dark:text-amber-400",
    points: [
      "🪙 Za správnou odpověď získáte 10 mincí",
      "🔥 Hrajte každý den a udržujte si streak",
      "🛒 V obchodě kupujte nápovědy a boostery",
      "🏆 Soutěžte s ostatními na žebříčku",
    ],
  },
]

export default function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState(0)
  const current = STEPS[step]
  const Icon = current.icon
  const isLast = step === STEPS.length - 1

  return (
    <div className="fixed inset-0 z-[200] bg-background flex items-center justify-center p-4">
      {/* Skip button */}
      <button
        onClick={onComplete}
        className="absolute top-4 right-4 p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors z-10"
        aria-label="Přeskočit"
      >
        <X size={20} />
      </button>

      <div className="w-full max-w-md">
        {/* Progress dots */}
        <div className="flex justify-center gap-2 mb-8">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`h-1.5 rounded-full transition-all duration-300 ${
                i === step ? "w-8 bg-foreground" : "w-3 bg-muted-foreground/30"
              }`}
            />
          ))}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            key={step}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.25 }}
            className="bg-card rounded-2xl shadow-lg p-6 md:p-8"
          >
            {/* Icon */}
            <div className="flex justify-center mb-6">
              <div className={`w-20 h-20 rounded-2xl ${current.iconBg} flex items-center justify-center`}>
                <Icon className={`w-10 h-10 ${current.iconColor}`} strokeWidth={1.5} />
              </div>
            </div>

            {/* Title */}
            <h2 className="text-2xl font-bold text-foreground text-center mb-2">
              {current.title}
            </h2>
            <p className="text-muted-foreground text-center text-sm mb-6">
              {current.subtitle}
            </p>

            {/* Points */}
            <ul className="space-y-3 mb-8">
              {current.points.map((point, i) => (
                <motion.li
                  key={i}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 + i * 0.08 }}
                  className="flex items-start gap-3 text-sm text-foreground"
                >
                  <div className="w-1.5 h-1.5 rounded-full bg-foreground/60 mt-2 shrink-0" />
                  <span>{point}</span>
                </motion.li>
              ))}
            </ul>

            {/* Navigation */}
            <div className="flex items-center gap-3">
              {step > 0 && (
                <button
                  onClick={() => setStep(step - 1)}
                  className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  <ArrowLeft size={16} />
                  Zpět
                </button>
              )}
              <button
                onClick={() => {
                  if (isLast) {
                    onComplete()
                  } else {
                    setStep(step + 1)
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 px-6 py-3 bg-foreground text-background rounded-xl text-sm font-medium hover:scale-[1.02] active:scale-95 transition-transform"
              >
                {isLast ? "Začít hrát!" : "Pokračovat"}
                <ArrowRight size={16} />
              </button>
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
