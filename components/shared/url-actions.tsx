"use client"

import * as React from "react"
import { usePathname, useRouter, useSearchParams } from "next/navigation"

function Listener({ onNew, onQuery }: { onNew?: () => void; onQuery?: (q: string) => void }) {
  const params = useSearchParams()
  const router = useRouter()
  const pathname = usePathname()
  const isNew = params.get("nouveau") === "1"
  const q = params.get("q")

  React.useEffect(() => {
    if (!isNew && !q) return
    if (isNew) onNew?.()
    if (q) onQuery?.(q)
    router.replace(pathname, { scroll: false })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, q])
  return null
}

/**
 * Réagit aux paramètres d'URL `?nouveau=1` (ouvre le formulaire de création)
 * et `?q=…` (pré-remplit la recherche), utilisés par la recherche globale.
 */
export function UrlActions(props: { onNew?: () => void; onQuery?: (q: string) => void }) {
  return (
    <React.Suspense fallback={null}>
      <Listener {...props} />
    </React.Suspense>
  )
}
