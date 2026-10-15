"use client"

import * as React from "react"
import Link from "next/link"
import { LuRefreshCw, LuTriangleAlert } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"

/** Écran affiché lorsqu'une page plante : message clair, réessayer, retour à l'accueil. */
export function CrashScreen({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  // Le détail technique reste dans la console, jamais à l'écran
  React.useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <Empty>
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <LuTriangleAlert />
          </EmptyMedia>
          <EmptyTitle>Une erreur inattendue est survenue</EmptyTitle>
          <EmptyDescription>
            Cette page n&apos;a pas pu s&apos;afficher. Vos données enregistrées ne sont pas affectées. Réessayez ; si le problème persiste, contactez
            l&apos;administrateur.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent className="flex-row justify-center gap-2">
          <Button onClick={retry}>
            <LuRefreshCw /> Réessayer
          </Button>
          <Button variant="outline" asChild>
            <Link href="/">Retour à l&apos;accueil</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  )
}
