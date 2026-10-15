"use client"

import { useEffect } from "react"

/** Dernier recours si la mise en page racine elle-même plante (styles intégrés). */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <html lang="fr">
      <body style={{ margin: 0, fontFamily: "system-ui, sans-serif", background: "#ffffff", color: "#1a1830" }}>
        <title>Erreur · Le Peintre Pardier ERP</title>
        <main style={{ minHeight: "100dvh", display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}>
          <div style={{ maxWidth: 420, textAlign: "center" }}>
            <h1 style={{ fontSize: 20, margin: "0 0 8px" }}>L&apos;application a rencontré un problème</h1>
            <p style={{ fontSize: 14, color: "#6b6880", margin: "0 0 20px" }}>
              Rechargez la page. Si le problème persiste, contactez l&apos;administrateur
              {error.digest ? ` (référence : ${error.digest})` : ""}.
            </p>
            <button
              onClick={() => retry()}
              style={{ background: "#4b2e9e", color: "#ffffff", border: 0, borderRadius: 8, padding: "10px 18px", fontSize: 14, cursor: "pointer" }}
            >
              Réessayer
            </button>
          </div>
        </main>
      </body>
    </html>
  )
}
