"use client"

import * as React from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useIsFetching } from "@tanstack/react-query"
import { LuRefreshCw, LuShieldX, LuWifiOff } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Skeleton } from "@/components/ui/skeleton"
import { useAccess } from "@/hooks/use-access"
import { moduleForPath } from "@/lib/nav"
import { queryClient } from "@/lib/query-client"
import { errorMessage, readDbStatus, useDbStatus, useMe, useStore } from "@/lib/store"

/**
 * Exige une session Supabase rattachée à un employé actif et vérifie que
 * l'utilisateur a accès au module de la page. Les pages ne sont rendues que
 * côté client : elles dépendent de la date du jour et de la session.
 */
export function StoreGate({ children }: { children: React.ReactNode }) {
  const me = useMe()
  const { user, can } = useAccess()
  const pathname = usePathname()
  const router = useRouter()
  const signedOut = me.isSuccess && !me.data

  React.useEffect(() => {
    // Session expirée, compte désactivé ou non rattaché à un employé
    if (signedOut) void useStore.getState().logout().then(() => router.replace("/login"))
  }, [signedOut, router])

  if (me.isError) return <LoadError message={errorMessage(me.error as Error)} onRetry={() => void me.refetch()} />
  if (!user) return <PageSkeleton />
  const required = moduleForPath(pathname)
  if (required && !can(required)) return <AccessDenied />
  return (
    <>
      <FetchingBar />
      <OfflineBanner />
      <DataBoundary pathname={pathname}>{children}</DataBoundary>
    </>
  )
}

/**
 * Affiche un squelette tant que les données de la page n'ont pas été reçues
 * (au lieu d'un écran vide ou d'un « Aucun résultat » trompeur), puis un
 * message avec « Réessayer » si une requête a échoué. La page reste montée
 * (masquée) pour que ses requêtes se poursuivent.
 */
function DataBoundary({ pathname, children }: { pathname: string; children: React.ReactNode }) {
  const { loading, failed, retry } = useDbStatus()
  const [readyPath, setReadyPath] = React.useState<string | null>(null)
  const ready = readyPath === pathname

  // La page est « prête » quand toutes ses requêtes ont abouti ; ensuite les
  // chargements secondaires (formulaires, palettes) ne la masquent plus.
  // Vérifié après le montage : les requêtes de la page sont alors lancées.
  React.useEffect(() => {
    if (ready) return
    const check = () => {
      const { loading, failed } = readDbStatus()
      if (!loading && !failed) setReadyPath(pathname)
    }
    const unsubscribe = queryClient.getQueryCache().subscribe(check)
    const timer = setTimeout(check, 0)
    return () => {
      unsubscribe()
      clearTimeout(timer)
    }
  }, [ready, pathname])
  const blocked = !ready && (loading || failed)
  return (
    <>
      {blocked && (failed ? <LoadError message="Une partie des données n'a pas pu être chargée." onRetry={retry} /> : <PageSkeleton />)}
      <div className={blocked ? "hidden" : "contents"}>
        {children}
      </div>
      {ready && failed && (
        <div role="alert" className="fixed right-4 bottom-4 z-50 flex max-w-sm items-center gap-3 rounded-lg border bg-background p-3 text-sm shadow-lg">
          <LuWifiOff className="size-4 shrink-0 text-destructive" />
          <span className="flex-1">Certaines données n&apos;ont pas pu être chargées.</span>
          <Button size="sm" variant="outline" onClick={retry}>
            Réessayer
          </Button>
        </div>
      )}
    </>
  )
}

/** Bandeau affiché lorsque l'appareil perd la connexion. */
function OfflineBanner() {
  const online = React.useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb)
      window.addEventListener("offline", cb)
      return () => {
        window.removeEventListener("online", cb)
        window.removeEventListener("offline", cb)
      }
    },
    () => navigator.onLine,
    () => true
  )
  if (online) return null
  return (
    <div role="status" className="sticky top-0 z-40 flex items-center justify-center gap-2 border-b border-warning/30 bg-warning/10 px-4 py-2 text-xs font-medium text-foreground">
      <LuWifiOff className="size-3.5" /> Vous êtes hors connexion : les données affichées peuvent ne pas être à jour et les enregistrements échoueront.
    </div>
  )
}

/** Fine barre de progression pendant le chargement des données. */
function FetchingBar() {
  const fetching = useIsFetching({ queryKey: ["db"] }) > 0
  return (
    <div aria-hidden className="pointer-events-none fixed inset-x-0 top-0 z-50 h-0.5 overflow-hidden">
      <div className={`h-full w-1/3 bg-primary transition-opacity duration-300 ${fetching ? "animate-[fetching_1.1s_ease-in-out_infinite] opacity-100" : "opacity-0"}`} />
    </div>
  )
}

function LoadError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LuWifiOff />
          </EmptyMedia>
          <EmptyTitle>Chargement impossible</EmptyTitle>
          <EmptyDescription>{message} Vérifiez votre connexion puis réessayez.</EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <Button onClick={onRetry}>
            <LuRefreshCw /> Réessayer
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
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
