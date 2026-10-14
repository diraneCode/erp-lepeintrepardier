"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { LuShieldX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccess } from "@/hooks/use-access"
import { moduleForPath } from "@/lib/nav"
import { initStore, useStore } from "@/lib/store"
import { clearSessionCookie } from "@/lib/session"

/**
 * Charge les données locales (localStorage), exige une session et vérifie que
 * l'utilisateur a accès au module de la page. Les pages ne sont rendues que
 * côté client : elles dépendent de la date du jour et des données du navigateur.
 */
export function StoreGate({ children }: { children: React.ReactNode }) {
  const hydrated = useStore((s) => s.hydrated)
  const currentUserId = useStore((s) => s.currentUserId)
  const { user, can } = useAccess()
  const pathname = usePathname()
  const router = useRouter()

  React.useEffect(() => {
    void initStore()
  }, [])
  React.useEffect(() => {
    if (hydrated && (!currentUserId || !user)) {
      // Évite une boucle avec proxy.ts si le compte n'existe plus
      clearSessionCookie()
      router.replace("/login")
    }
  }, [hydrated, currentUserId, user, router])

  if (!hydrated || !user) return <PageSkeleton />
  const required = moduleForPath(pathname)
  if (required && !can(required)) return <AccessDenied />
  return <>{children}</>
}

function AccessDenied() {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LuShieldX />
          </EmptyMedia>
          <EmptyTitle>Accès non autorisé</EmptyTitle>
          <EmptyDescription>Votre rôle ne vous permet pas de consulter ce module. Contactez un administrateur si vous pensez qu&apos;il s&apos;agit d&apos;une erreur.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}

export function PageSkeleton() {
  return (
    <div className="mx-auto flex w-full max-w-[1600px] flex-col gap-6 px-4 py-6 md:px-6 lg:px-8" aria-busy="true" aria-label="Chargement">
      <div className="flex items-end justify-between">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-56" />
          <Skeleton className="h-4 w-80 max-w-full" />
        </div>
        <Skeleton className="hidden h-8 w-32 sm:block" />
      </div>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 rounded-xl" />
        ))}
      </div>
      <Skeleton className="h-10 w-full max-w-xl" />
      <Skeleton className="h-96 rounded-xl" />
    </div>
  )
}
