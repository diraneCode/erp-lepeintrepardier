import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
      <span className="text-6xl font-semibold text-primary tabular">404</span>
      <h1 className="text-xl font-semibold">Page introuvable</h1>
      <p className="max-w-sm text-sm text-muted-foreground">La page demandée n&apos;existe pas ou a été déplacée.</p>
      <Button asChild>
        <Link href="/">Retour au tableau de bord</Link>
      </Button>
    </div>
  )
}
