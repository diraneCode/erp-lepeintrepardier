/**
 * Témoin de session lu par `proxy.ts` pour rediriger avant tout rendu.
 * Il ne contient aucune donnée sensible : l'authentification réelle reste
 * vérifiée côté client (StoreGate) à partir du compte connecté.
 */
export const SESSION_COOKIE = "pardier_session"

export function setSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=1; path=/; max-age=${60 * 60 * 12}; samesite=lax${location.protocol === "https:" ? "; secure" : ""}`
}

export function clearSessionCookie() {
  document.cookie = `${SESSION_COOKIE}=; path=/; max-age=0; samesite=lax`
}
