import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { ImageResponse } from "next/og"

/**
 * Visuel de partage (Open Graph / Twitter) : identité de la marque à gauche,
 * aperçu stylisé du tableau de bord à droite. Couleurs pleines, sans dégradé.
 */
export const OG_SIZE = { width: 1200, height: 630 }
export const OG_ALT = "Le Peintre Pardier ERP — ventes, facturation, stock, RH, paie et comptabilité réunis dans un seul outil"

const C = {
  ink: "#1a1830",
  muted: "#6b6880",
  border: "#e7e4f0",
  panel: "#f4f1fb",
  card: "#ffffff",
  violet: "#4b2e9e",
  blue: "#2f80d1",
  green: "#5aa832",
  orange: "#ee8f1f",
  red: "#dc3b30",
  successBg: "#e8f5e1",
  success: "#2f7a1a",
  warningBg: "#fdf0dc",
  warning: "#9a5a06",
}

const MODULES = ["Ventes", "Facturation", "Stock", "RH & paie", "Comptabilité", "Marketing"]
const BARS = [38, 52, 44, 66, 58, 74, 62, 86, 78, 92]
const ROWS = [
  { ref: "FAC-2026-00412", who: "Bâti Plus Douala", amount: "1 245 000", status: "Payée", ok: true },
  { ref: "VTE-2026-01087", who: "Boutique Akwa", amount: "386 500", status: "Livrée", ok: true },
  { ref: "PF 14/2026/10", who: "Hôtel La Falaise", amount: "4 980 000", status: "Envoyée", ok: false },
]

async function assets() {
  const root = process.cwd()
  const [logo, regular, medium, semibold] = await Promise.all([
    readFile(join(root, "public/logo.jpg")),
    readFile(join(root, "assets/fonts/Geist-400.ttf")),
    readFile(join(root, "assets/fonts/Geist-500.ttf")),
    readFile(join(root, "assets/fonts/Geist-600.ttf")),
  ])
  return {
    logo: `data:image/jpeg;base64,${logo.toString("base64")}`,
    fonts: [
      { name: "Geist", data: regular, weight: 400 as const, style: "normal" as const },
      { name: "Geist", data: medium, weight: 500 as const, style: "normal" as const },
      { name: "Geist", data: semibold, weight: 600 as const, style: "normal" as const },
    ],
  }
}

export async function renderOgImage() {
  const { logo, fonts } = await assets()

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", background: C.card, fontFamily: "Geist", color: C.ink }}>
        {/* Bande aux couleurs de la marque */}
        <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 10, display: "flex" }}>
          {[C.violet, C.blue, C.green, C.orange, C.red].map((c) => (
            <div key={c} style={{ flex: 1, background: c }} />
          ))}
        </div>

        {/* Identité */}
        <div style={{ width: 560, display: "flex", flexDirection: "column", padding: "64px 0 56px 64px" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} width={300} height={121} alt="" style={{ marginLeft: -10 }} />
          <div style={{ display: "flex", flexDirection: "column", marginTop: 34 }}>
            <div style={{ fontSize: 50, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.5 }}>Toute l&apos;entreprise</div>
            <div style={{ fontSize: 50, fontWeight: 600, lineHeight: 1.08, letterSpacing: -1.5, color: C.violet }}>dans un seul outil.</div>
            <div style={{ fontSize: 22, color: C.muted, marginTop: 18, lineHeight: 1.4 }}>L&apos;ERP des boutiques et dépôts du Peintre Pardier, de la vente au bilan.</div>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 28, width: 470 }}>
            {MODULES.map((m) => (
              <div key={m} style={{ display: "flex", fontSize: 18, fontWeight: 500, padding: "7px 14px", borderRadius: 999, border: `1.5px solid ${C.border}`, color: C.ink }}>
                {m}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", marginTop: "auto", fontSize: 20, fontWeight: 500, color: C.muted }}>erp.pardier.com</div>
        </div>

        {/* Aperçu du tableau de bord */}
        <div style={{ flex: 1, display: "flex", padding: "54px 56px 0 24px" }}>
          <div
            style={{
              flex: 1,
              display: "flex",
              flexDirection: "column",
              background: C.panel,
              borderRadius: "28px 28px 0 0",
              padding: "26px 26px 0",
              border: `1.5px solid ${C.border}`,
              borderBottom: "none",
            }}
          >
            {/* Indicateurs */}
            <div style={{ display: "flex", gap: 14 }}>
              <Kpi label="Chiffre d'affaires du mois" value="48,6 M" unit="FCFA" delta="+12,4 %" />
              <Kpi label="Objectif boutiques" value="87 %" delta="+6 pts" />
            </div>

            {/* Graphique */}
            <div style={{ display: "flex", flexDirection: "column", background: C.card, borderRadius: 18, border: `1.5px solid ${C.border}`, padding: "16px 20px", marginTop: 14 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 15, color: C.muted }}>
                <span style={{ fontWeight: 500, color: C.ink }}>Ventes par mois</span>
                <span>2026</span>
              </div>
              <div style={{ display: "flex", alignItems: "flex-end", gap: 9, height: 104, marginTop: 12 }}>
                {BARS.map((h, i) => (
                  <div key={i} style={{ flex: 1, height: `${h}%`, borderRadius: "5px 5px 0 0", background: i === BARS.length - 1 ? C.violet : "#cfc6ec" }} />
                ))}
              </div>
            </div>

            {/* Derniers documents */}
            <div style={{ display: "flex", flexDirection: "column", background: C.card, borderRadius: "18px 18px 0 0", border: `1.5px solid ${C.border}`, borderBottom: "none", marginTop: 14, padding: "6px 20px 0", flex: 1 }}>
              {ROWS.map((r, i) => (
                <div key={r.ref} style={{ display: "flex", alignItems: "center", padding: "12px 0", borderTop: i ? `1.5px solid ${C.border}` : "none", fontSize: 16 }}>
                  <div style={{ display: "flex", flexDirection: "column", flex: 1 }}>
                    <span style={{ fontWeight: 600 }}>{r.ref}</span>
                    <span style={{ color: C.muted, fontSize: 14 }}>{r.who}</span>
                  </div>
                  <span style={{ fontWeight: 500, marginRight: 14 }}>{r.amount}</span>
                  <span
                    style={{
                      display: "flex",
                      fontSize: 13,
                      fontWeight: 600,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: r.ok ? C.successBg : C.warningBg,
                      color: r.ok ? C.success : C.warning,
                    }}
                  >
                    {r.status}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    ),
    { ...OG_SIZE, fonts }
  )
}

function Kpi({ label, value, unit, delta }: { label: string; value: string; unit?: string; delta: string }) {
  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", background: C.card, borderRadius: 18, border: `1.5px solid ${C.border}`, padding: "16px 18px" }}>
      <span style={{ fontSize: 14, color: C.muted }}>{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginTop: 6 }}>
        <span style={{ fontSize: 32, fontWeight: 600, letterSpacing: -1 }}>{value}</span>
        {unit && <span style={{ fontSize: 15, color: C.muted, fontWeight: 500 }}>{unit}</span>}
      </div>
      <span style={{ display: "flex", fontSize: 14, fontWeight: 600, color: C.success, marginTop: 4 }}>{delta} vs mois dernier</span>
    </div>
  )
}
