"use client"

import { useState, useEffect, useCallback } from "react"
import { useAuth } from "@/lib/authContext"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import MobileHeader from "@/components/MobileHeader"
import { getUserCoins } from "@/lib/coinService"
import { getUserInventory, type UserInventory } from "@/lib/userInventoryService"
import { getAllShopItems, purchaseItem, SHOP_CATEGORIES, type ShopCategory, type ShopItem } from "@/lib/shopService"
import { getDailyDeals, type DailyDeal } from "@/lib/dailyDealsService"
import { getActiveEffects, activateEffect, isActivatableEffectItem, type ActiveEffect } from "@/lib/activeEffectsService"
import { SkeletonShopItem } from "@/components/Skeletons"

// ProtectedRoute not needed — we redirect manually

export default function ShopPage() {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()

  const [coins, setCoins] = useState(0)
  const [totalEarned, setTotalEarned] = useState(0)
  const [inventory, setInventory] = useState<UserInventory>({ items: {} } as UserInventory)
  const [activeEffects, setActiveEffects] = useState<ActiveEffect[]>([])
  const [dailyDeals, setDailyDeals] = useState<DailyDeal[]>([])
  const [filterCat, setFilterCat] = useState<"all" | ShopCategory>("all")
  const [sortBy, setSortBy] = useState<"default" | "price_asc" | "price_desc">("default")
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null)
  const [buyingId, setBuyingId] = useState<string | null>(null)
  const [filterOpen, setFilterOpen] = useState(false)
  const [infoModal, setInfoModal] = useState<ShopItem | null>(null)

  // time until next daily deal reset
  const [dealTimer, setDealTimer] = useState("")

  useEffect(() => {
    if (!authLoading && !user) router.push("/auth/login")
  }, [authLoading, user, router])

  const loadAll = useCallback(async () => {
    if (!user) return
    try {
      const [coinData, inv, deals, fx] = await Promise.all([
        getUserCoins(user.uid),
        getUserInventory(user.uid),
        getDailyDeals(),
        getActiveEffects(user.uid),
      ])
      setCoins(coinData.coins)
      setTotalEarned(coinData.totalEarned)
      setInventory(inv)
      setDailyDeals(deals)
      setActiveEffects(fx)
    } catch (e) {
      console.error("[Shop] load error:", e)
    }
  }, [user])

  useEffect(() => { loadAll() }, [loadAll])

  // Deal countdown
  useEffect(() => {
    const tick = () => {
      const now = new Date()
      const tomorrow = new Date(now)
      tomorrow.setUTCHours(24, 0, 0, 0)
      const diff = tomorrow.getTime() - now.getTime()
      const h = String(Math.floor(diff / 3600000)).padStart(2, "0")
      const m = String(Math.floor((diff % 3600000) / 60000)).padStart(2, "0")
      const s = String(Math.floor((diff % 60000) / 1000)).padStart(2, "0")
      setDealTimer(`${h}:${m}:${s}`)
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  const showToast = (msg: string, ok: boolean) => {
    setToast({ msg, ok })
    setTimeout(() => setToast(null), 3000)
  }

  const handleBuy = async (itemId: string, price: number) => {
    if (!user || buyingId) return
    setBuyingId(itemId)
    try {
      const result = await purchaseItem(user.uid, itemId, price)
      showToast(result.message, result.success)
      if (result.success) {
        await loadAll()
        if (typeof window !== "undefined") {
          window.dispatchEvent(new CustomEvent("user-coins-updated", { detail: coins - price }))
        }
      }
    } catch {
      showToast("Chyba při nákupu", false)
    } finally {
      setBuyingId(null)
    }
  }

  const handleActivate = async (itemId: string) => {
    if (!user) return
    const ok = await activateEffect(user.uid, itemId)
    if (ok) {
      showToast("Efekt aktivován ✓", true)
      await loadAll()
    } else {
      showToast("Nepodařilo se aktivovat", false)
    }
  }

  // Prepare items
  const allItems = getAllShopItems()
  const filtered = filterCat === "all" ? allItems : allItems.filter((i) => i.category === filterCat)
  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "price_asc") return a.price - b.price
    if (sortBy === "price_desc") return b.price - a.price
    return 0
  })

  const catLabel = filterCat === "all" ? "Vše" : SHOP_CATEGORIES.find((c) => c.id === filterCat)?.label || filterCat
  const ownedCount = Object.values(inventory.items || {}).reduce((sum, v) => sum + v.quantity, 0)

  const getQuantity = (itemId: string) => inventory.items?.[itemId]?.quantity ?? 0

  const isActivatable = (itemId: string) => {
    return isActivatableEffectItem(itemId) && getQuantity(itemId) > 0
  }

  const isAlreadyActive = (itemId: string) => activeEffects.some((e) => e.itemId === itemId)

  if (authLoading || !user) {
    return (
      <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a]">
        <MobileHeader />
        <div className="max-w-4xl mx-auto px-4 py-8">
          <div className="h-8 bg-muted rounded w-32 mb-6 animate-pulse" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <SkeletonShopItem key={i} />
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-[#fafafa] dark:bg-[#0a0a0a]">
      <MobileHeader />

      <div className="max-w-4xl mx-auto px-4 pt-8 pb-24">
        {/* ── Header ── */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100">Obchod</h1>
            <p className="text-xs text-neutral-500 mt-0.5">Celkem získáno: {totalEarned} mincí</p>
          </div>
          <div className="flex items-center gap-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-4 py-2 rounded-lg font-semibold text-sm">
            🪙 {coins}
          </div>
        </div>

        {/* ── Daily deals ── */}
        {dailyDeals.length > 0 && (
          <section className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500">Denní nabídky</h2>
              <span className="text-xs font-mono text-neutral-400">{dealTimer}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {dailyDeals.map((deal) => {
                const item = allItems.find((i) => i.id === deal.itemId)
                if (!item) return null
                const isOwnedOneTime = (item.id === "accuracy_graph" || item.id === "category_breakdown") && getQuantity(item.id) > 0;
                
                return (
                  <div key={deal.itemId} className={`relative flex flex-col justify-between bg-white dark:bg-neutral-900 border-[1.5px] border-emerald-500/20 dark:border-border rounded-2xl p-5 overflow-hidden shadow-sm transition-all ${isOwnedOneTime ? 'opacity-50 grayscale' : ''}`}>
                    {/* Background glow or accent */}
                    <div className="absolute -right-4 -top-4 w-24 h-24 bg-emerald-500/10 dark:bg-emerald-500/5 blur-2xl rounded-full pointer-events-none" />
                    
                    <div className="flex items-start justify-between mb-4 relative z-10">
                      <div className="flex items-center gap-3">
                        <span className="text-3xl shrink-0 drop-shadow-sm">{item.emoji}</span>
                        <div>
                          <p className="text-base font-bold text-neutral-900 dark:text-neutral-100">{item.name}</p>
                          <span className="text-[10px] font-bold text-red-600 bg-red-100 dark:bg-red-900/30 px-2 py-0.5 rounded-full uppercase tracking-wider">
                            Sleva {deal.discountPercent}%
                          </span>
                        </div>
                      </div>
                    </div>
                    
                    <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6 relative z-10">{item.description}</p>
                    
                    <div className="flex items-center justify-between mt-auto relative z-10">
                      <div className="flex flex-col">
                        <span className="text-xs text-neutral-400 line-through decoration-red-500/50 mb-0.5">🪙 {item.price}</span>
                        <span className="text-lg font-black text-emerald-600 dark:text-emerald-400 leading-none">🪙 {deal.discountedPrice}</span>
                      </div>
                      {isOwnedOneTime ? (
                        <button disabled className="px-5 py-2.5 bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-sm font-bold rounded-xl shadow-sm cursor-not-allowed">
                          Vlastníš
                        </button>
                      ) : (
                        <button
                          onClick={() => handleBuy(deal.itemId, deal.discountedPrice)}
                          disabled={coins < deal.discountedPrice || buyingId === deal.itemId}
                          className="px-5 py-2.5 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-sm font-bold rounded-xl hover:opacity-90 hover:-translate-y-0.5 active:scale-95 transition-all disabled:opacity-40 disabled:hover:translate-y-0 shadow-sm"
                        >
                          {buyingId === deal.itemId ? "..." : "Koupit"}
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Active effects ── */}
        {activeEffects.length > 0 && (
          <section className="mb-6">
            <h2 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-2">Aktivní efekty</h2>
            <div className="flex flex-wrap gap-2">
              {activeEffects.map((fx, i) => {
                const item = allItems.find((it) => it.id === fx.itemId)
                return (
                  <div key={i} className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-md text-xs font-medium text-emerald-700 dark:text-emerald-300">
                    {item?.emoji} {item?.name || fx.itemId}
                    {fx.remainingUses !== null && <span className="text-emerald-500">({fx.remainingUses})</span>}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* ── Filter + Sort ── */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative">
            <button
              onClick={() => setFilterOpen(!filterOpen)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm font-medium text-neutral-700 dark:text-neutral-300 hover:border-neutral-400 transition-colors"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"/></svg>
              {catLabel}
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={`transition-transform ${filterOpen ? "rotate-180" : ""}`}><polyline points="6 9 12 15 18 9"/></svg>
            </button>
            <AnimatePresence>
              {filterOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                  className="absolute top-full left-0 mt-1 w-52 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg shadow-lg z-20 py-1 overflow-hidden"
                >
                  <button
                    onClick={() => { setFilterCat("all"); setFilterOpen(false) }}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 ${filterCat === "all" ? "font-semibold text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400"}`}
                  >
                    Všechny položky
                  </button>
                  {SHOP_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => { setFilterCat(cat.id); setFilterOpen(false) }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-neutral-50 dark:hover:bg-neutral-800 flex items-center gap-2 ${filterCat === cat.id ? "font-semibold text-neutral-900 dark:text-white" : "text-neutral-600 dark:text-neutral-400"}`}
                    >
                      <span className="text-base">{cat.emoji}</span> {cat.label}
                    </button>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="px-3 py-1.5 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg text-sm text-neutral-700 dark:text-neutral-300 outline-none"
          >
            <option value="default">Výchozí</option>
            <option value="price_asc">Nejlevnější</option>
            <option value="price_desc">Nejdražší</option>
          </select>

          <span className="ml-auto text-xs text-neutral-400">{sorted.length} položek</span>
        </div>

        {/* ── Items list ── */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {sorted.map((item) => {
            const qty = getQuantity(item.id === "hint_pack_5" ? "hint_token_1" : item.id === "article_skip_3" ? "article_skip_1" : item.id)
            const canActivate = isActivatable(item.id)
            const alreadyActive = isAlreadyActive(item.id)
            const isOwnedOneTime = (item.id === "accuracy_graph" || item.id === "category_breakdown") && qty > 0;
            
            return (
              <div key={item.id} className={`flex flex-col h-full bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-border rounded-2xl p-4 group ${isOwnedOneTime ? 'opacity-50 grayscale' : 'hover:border-neutral-400 dark:hover:border-neutral-600'} transition-all shadow-sm relative`}>
                
                {/* Info button top right */}
                <button
                  onClick={() => setInfoModal(item)}
                  className="absolute top-2 right-2 p-1.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200"
                  aria-label="Informace o vylepšení"
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
                </button>

                <div className="flex items-start justify-between mb-2">
                  <div className="w-10 h-10 flex items-center justify-center bg-neutral-100 dark:bg-neutral-800 rounded-xl text-xl shrink-0">
                    {item.emoji}
                  </div>
                </div>
                
                <div className="mb-3">
                  <div className="flex flex-col gap-1 mb-1">
                    {qty > 0 && (
                      <span className="self-start text-[10px] font-bold bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-sm">
                        Máš {qty}x
                      </span>
                    )}
                    <h3 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 leading-tight pr-6">{item.name}</h3>
                  </div>
                </div>
                
                <div className="mt-auto flex flex-col gap-2 pt-3 border-t border-neutral-100 dark:border-neutral-800/80">
                  <span className="text-base font-black text-neutral-800 dark:text-neutral-200">🪙 {item.price}</span>
                  <div className="flex flex-col gap-1">
                    {canActivate && !alreadyActive && (
                      <button
                        onClick={() => handleActivate(item.id)}
                        className="w-full py-1.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs font-bold rounded-lg hover:bg-emerald-200 dark:hover:bg-emerald-900/50 active:scale-95 transition-all text-center"
                      >
                        Aktivovat
                      </button>
                    )}
                    {alreadyActive && (
                      <span className="w-full py-1.5 text-xs font-bold text-emerald-600 bg-emerald-50 dark:bg-emerald-950/20 rounded-lg text-center">
                        Aktivní
                      </span>
                    )}
                    {isOwnedOneTime ? (
                      <button disabled className="w-full py-2 bg-neutral-200 dark:bg-neutral-800 text-neutral-500 dark:text-neutral-400 text-xs font-bold rounded-lg shadow-sm cursor-not-allowed">
                        Vlastníš
                      </button>
                    ) : (
                      <button
                        onClick={() => handleBuy(item.id, item.price)}
                        disabled={coins < item.price || buyingId === item.id}
                        className="w-full py-2 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-bold rounded-lg hover:opacity-90 active:scale-95 transition-all disabled:opacity-40 shadow-sm"
                      >
                        {buyingId === item.id ? "..." : "Koupit"}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        {/* ── Earning info ── */}
        <section className="mt-8 mb-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
          <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Jak získat mince</h3>
          <div className="grid grid-cols-2 gap-y-2 gap-x-6 text-sm">
            <div className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Správný swipe</span><span className="font-semibold text-neutral-900 dark:text-neutral-100">+10</span></div>
            <div className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Špatný swipe</span><span className="font-semibold text-neutral-900 dark:text-neutral-100">+2</span></div>
            <div className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">Denní bonus</span><span className="font-semibold text-neutral-900 dark:text-neutral-100">+25</span></div>
            <div className="flex justify-between"><span className="text-neutral-600 dark:text-neutral-400">7denní streak</span><span className="font-semibold text-neutral-900 dark:text-neutral-100">+100</span></div>
          </div>
        </section>

        {/* ── Inventory summary ── */}
        {ownedCount > 0 && (
          <section className="mb-4 bg-white dark:bg-neutral-900 border border-neutral-200 dark:border-neutral-800 rounded-lg p-4">
            <h3 className="text-xs font-bold uppercase tracking-widest text-neutral-500 mb-3">Tvůj inventář</h3>
            <div className="flex flex-wrap gap-2">
              {Object.entries(inventory.items || {}).filter(([, v]) => v.quantity > 0).map(([id, v]) => {
                const item = allItems.find((i) => i.id === id)
                return (
                  <div key={id} className="inline-flex items-center gap-1.5 bg-neutral-50 dark:bg-neutral-800 px-2.5 py-1 rounded text-xs font-medium text-neutral-700 dark:text-neutral-300">
                    {item?.emoji || "📦"} {item?.name || id} <span className="text-neutral-400">×{v.quantity}</span>
                  </div>
                )
              })}
            </div>
          </section>
        )}
      </div>

      {/* ── Toast ── */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] px-5 py-2.5 rounded-lg text-sm font-semibold shadow-lg ${toast.ok ? "bg-emerald-600 text-white" : "bg-red-600 text-white"}`}
          >
            {toast.msg}
          </motion.div>
        )}

        {/* Info Modal */}
        {infoModal && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
            onClick={() => setInfoModal(null)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-neutral-900 w-full max-w-sm rounded-3xl p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="w-16 h-16 bg-neutral-100 dark:bg-neutral-800 rounded-2xl flex items-center justify-center text-4xl">
                  {infoModal.emoji}
                </div>
                <button
                  onClick={() => setInfoModal(null)}
                  className="p-2 bg-neutral-100 dark:bg-neutral-800 rounded-full text-neutral-500 hover:text-neutral-900 dark:hover:text-white transition-colors"
                >
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M18 6 6 18"/><path d="M6 6l12 12"/></svg>
                </button>
              </div>
              <h3 className="text-xl font-bold text-neutral-900 dark:text-white mb-2">{infoModal.name}</h3>
              <p className="text-neutral-600 dark:text-neutral-400 text-sm leading-relaxed mb-6">
                {infoModal.description}
              </p>

              <button
                onClick={() => setInfoModal(null)}
                className="w-full py-3 bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-bold rounded-xl hover:opacity-90 active:scale-95 transition-transform"
              >
                Zavřít
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
