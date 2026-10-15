import { NextResponse, type NextRequest } from "next/server"
import { createServerClient } from "@supabase/ssr"

import { SUPABASE_ANON_KEY, SUPABASE_URL, isSupabaseConfigured } from "@/lib/supabase/env"

/**
 * Rafraîchit la session Supabase (cookies) puis redirige vers /login toute
 * visite sans session valide (ex. https://erp.pardier.com), et un utilisateur
 * déjà connecté qui revient sur /login vers l'accueil.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl
  let response = NextResponse.next({ request })

  let authenticated = false
  if (isSupabaseConfigured) {
    const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (cookies, headers) => {
          cookies.forEach(({ name, value }) => request.cookies.set(name, value))
          response = NextResponse.next({ request })
          cookies.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
          Object.entries(headers ?? {}).forEach(([k, v]) => response.headers.set(k, v))
        },
      },
    })
    // Vérifie la signature du jeton (et le renouvelle si nécessaire)
    const { data } = await supabase.auth.getClaims()
    authenticated = !!data?.claims?.sub
  }

  const redirect = (url: URL) => {
    const res = NextResponse.redirect(url)
    // Conserve les cookies de session éventuellement renouvelés
    response.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  if (pathname === "/login") {
    return authenticated ? redirect(new URL("/", request.url)) : response
  }

  if (!authenticated) {
    const url = new URL("/login", request.url)
    // Retour à la page demandée après connexion
    if (pathname !== "/") url.searchParams.set("next", `${pathname}${search}`)
    return redirect(url)
  }

  return response
}

export const config = {
  // Exclut les fichiers statiques, les images et les ressources du dossier public
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml|.*\\.(?:jpg|jpeg|png|svg|webp|ico|txt|webmanifest|pdf)$).*)"],
}
