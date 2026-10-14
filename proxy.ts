import { NextResponse, type NextRequest } from "next/server"

import { SESSION_COOKIE } from "@/lib/session"

/**
 * Redirige vers /login toute visite sans session (ex. https://erp.pardier.com),
 * et un utilisateur déjà connecté qui revient sur /login vers l'accueil.
 */
export function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  const hasSession = request.cookies.get(SESSION_COOKIE)?.value === "1"

  if (pathname === "/login") {
    if (hasSession) return NextResponse.redirect(new URL("/", request.url))
    return NextResponse.next()
  }

  if (!hasSession) {
    const url = new URL("/login", request.url)
    // Retour à la page demandée après connexion
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`)
    return NextResponse.redirect(url)
  }

  return NextResponse.next()
}

export const config = {
  // Exclut les fichiers statiques, les images et les ressources du dossier public
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:jpg|jpeg|png|svg|webp|ico|txt|webmanifest|pdf)$).*)"],
}
