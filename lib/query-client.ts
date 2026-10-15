"use client"

import { QueryCache, QueryClient } from "@tanstack/react-query"
import { toast } from "sonner"

/**
 * Client React Query unique côté navigateur. Les données restent fraîches
 * 1 minute puis sont revalidées en arrière-plan (retour sur l'onglet, reconnexion).
 */
export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    // Échec d'une actualisation en arrière-plan : les données affichées restent
    // celles du cache, on prévient l'utilisateur (le premier chargement est géré par StoreGate)
    onError: (_error, query) => {
      if (query.state.data !== undefined) toast.warning("Actualisation impossible", { id: "refresh-error", description: "Les données affichées peuvent ne pas être à jour." })
    },
  }),
  defaultOptions: {
    queries: {
      staleTime: 60_000,
      gcTime: 30 * 60_000,
      refetchOnWindowFocus: true,
      retry: (count, error) => count < 2 && !isAuthError(error),
    },
  },
})

function isAuthError(error: unknown) {
  const code = (error as { code?: string; status?: number })?.code
  const status = (error as { status?: number })?.status
  return code === "42501" || code === "PGRST301" || status === 401 || status === 403
}
