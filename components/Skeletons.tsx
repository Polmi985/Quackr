"use client"

export function SkeletonCard() {
  return (
    <div className="w-full max-w-md mx-auto bg-card rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="w-full h-48 bg-muted" />
      <div className="p-5 space-y-3">
        <div className="h-3 bg-muted rounded w-20" />
        <div className="h-5 bg-muted rounded w-full" />
        <div className="h-5 bg-muted rounded w-3/4" />
        <div className="space-y-2 mt-4">
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-full" />
          <div className="h-3 bg-muted rounded w-2/3" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonRankingRow() {
  return (
    <div className="p-4 flex items-center gap-4 animate-pulse">
      <div className="w-12 h-8 bg-muted rounded" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-muted rounded w-32" />
        <div className="h-3 bg-muted rounded w-48" />
      </div>
      <div className="h-4 bg-muted rounded w-16" />
    </div>
  )
}

export function SkeletonProfile() {
  return (
    <div className="w-full bg-card rounded-2xl shadow-sm overflow-hidden animate-pulse">
      <div className="w-full h-32 bg-muted flex items-center justify-center">
        <div className="w-24 h-24 rounded-full bg-muted-foreground/20" />
      </div>
      <div className="p-8 space-y-4">
        <div className="flex flex-col items-center gap-2">
          <div className="h-6 bg-muted rounded w-40" />
          <div className="h-4 bg-muted rounded w-32" />
        </div>
        <div className="bg-muted/40 rounded-xl p-6 space-y-4">
          <div className="h-3 bg-muted rounded w-16 mx-auto" />
          <div className="flex justify-center gap-8">
            <div className="h-10 bg-muted rounded w-16" />
            <div className="h-10 bg-muted rounded w-16" />
          </div>
          <div className="h-8 bg-muted rounded w-20 mx-auto" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonShopItem() {
  return (
    <div className="bg-card border border-border rounded-xl p-4 animate-pulse">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 bg-muted rounded-lg" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-muted rounded w-24" />
          <div className="h-3 bg-muted rounded w-32" />
        </div>
      </div>
      <div className="h-9 bg-muted rounded-lg w-full" />
    </div>
  )
}
