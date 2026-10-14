"use client"

import * as React from "react"

import { lineSubtotal } from "@/lib/calc"
import type { ProformaDocument } from "@/lib/export"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { productUnit } from "@/lib/labels"
import { SECTION_LABEL, SECTIONS, amountInWords, sectionOf, sectionTotals } from "@/lib/proforma"
import type { Client, Product, Quote } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Construit le document proforma (PDF) à partir d'un devis. */
export function toProformaDocument(q: Quote, client: Client | undefined, productById: Map<string, Product>): ProformaDocument {
  const t = sectionTotals(q.items)
  return {
    number: q.number,
    date: q.date,
    issuedIn: q.issuedIn ?? "Douala",
    project: q.project ?? "—",
    site: q.site ?? client?.city ?? "",
    client: { name: client?.name ?? "Client", address: client?.address, phone: client?.phone },
    surfaces: q.surfaces ?? [],
    sections: SECTIONS.map((key) => ({
      key,
      title: SECTION_LABEL[key].title,
      totalLabel: SECTION_LABEL[key].total,
      total: t[key],
      lines: q.items
        .filter((i) => sectionOf(i) === key)
        .map((i) => {
          const p = i.productId ? productById.get(i.productId) : undefined
          return {
            description: i.description || p?.name || "—",
            specification: i.specification ?? p?.specification,
            packaging: i.packaging ?? (p ? p.packaging ?? productUnit[p.unit] : undefined),
            coverage: i.coverage,
            surface: i.surface,
            quantity: i.quantity,
            unitPrice: i.unitPrice,
            amount: Math.round(lineSubtotal(i)),
          }
        }),
    })).filter((s) => s.lines.length > 0),
    subtotal: t.subtotal,
    tax: t.tax,
    total: t.total,
    amountInWords: amountInWords(t.total),
    validUntil: q.validUntil,
    notes: q.notes,
  }
}

const n = (v?: number) => (v === undefined || !Number.isFinite(v) ? "" : formatNumber(v))

/** Aperçu à l'écran, fidèle à la mise en page de la proforma. */
export function ProformaView({ doc }: { doc: ProformaDocument }) {
  return (
    <div className="flex flex-col gap-5 text-sm">
      <div className="flex flex-col gap-1.5 rounded-lg border p-3">
        <div className="flex flex-wrap justify-between gap-2">
          <span><span className="font-semibold italic underline">Projet :</span> <span className="font-semibold italic">{doc.project}</span></span>
          <span><span className="font-semibold underline">Lieu</span> : {doc.site}</span>
        </div>
        <div className="flex flex-wrap justify-between gap-2 text-muted-foreground">
          <span>DOIT : <span className="font-medium text-foreground">{doc.client.name}</span></span>
          <span>{doc.issuedIn} : {formatDate(doc.date, "dd-MM-yyyy")}</span>
        </div>
      </div>

      {doc.surfaces.length > 0 && (
        <div className="flex flex-col gap-2">
          <span className="self-start rounded bg-info/15 px-2 py-1 text-xs font-semibold text-info uppercase">Évaluation des surfaces à traiter</span>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  {["Désignation", "Quantité", "Unité", "Traitement", "Nom commercial"].map((h) => <th key={h} className="px-2 py-1.5 text-left font-medium">{h}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y">
                {doc.surfaces.map((s, i) => (
                  <tr key={i}>
                    <td className="px-2 py-1.5">{s.designation}</td>
                    <td className="px-2 py-1.5 tabular">{n(s.quantity)}</td>
                    <td className="px-2 py-1.5">{s.unit}</td>
                    <td className="px-2 py-1.5">{s.treatment}</td>
                    <td className="px-2 py-1.5 text-muted-foreground">{s.commercialName}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {doc.sections.map((s) => (
        <div key={s.key} className="overflow-x-auto rounded-lg border">
          <table className="w-full min-w-[560px] text-xs">
            <thead>
              <tr>
                <th colSpan={8} className="bg-primary px-2 py-1.5 text-center font-semibold tracking-wide text-primary-foreground uppercase">{s.title}</th>
              </tr>
              <tr className="bg-muted/50 text-muted-foreground">
                {(s.key === "traitement" ? ["Produit / service", "Spécificité", "Cond.", "Couv.", "Surface", "Qté", "PU", "Montant"] : ["Désignation", "", "", "", "", "Qté", "PU", "Montant"]).map((h, i) => (
                  <th key={i} className={cn("px-2 py-1.5 font-medium", i >= 5 ? "text-right" : "text-left")}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {s.lines.map((l, i) => (
                <tr key={i}>
                  {s.key === "traitement" ? (
                    <>
                      <td className="px-2 py-1.5 font-medium">{l.description}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{l.specification}</td>
                      <td className="px-2 py-1.5">{l.packaging}</td>
                      <td className="px-2 py-1.5 tabular">{n(l.coverage)}</td>
                      <td className="px-2 py-1.5 tabular">{n(l.surface)}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="px-2 py-1.5 font-medium">{l.description}</td>
                  )}
                  <td className="px-2 py-1.5 text-right tabular">{n(l.quantity)}</td>
                  <td className="px-2 py-1.5 text-right tabular">{n(l.unitPrice)}</td>
                  <td className="px-2 py-1.5 text-right font-medium tabular">{n(l.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={5} />
                <td colSpan={2} className="bg-primary/90 px-2 py-1.5 text-center font-semibold text-primary-foreground uppercase">{s.totalLabel}</td>
                <td className="bg-primary/90 px-2 py-1.5 text-right font-semibold text-primary-foreground tabular">{n(s.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ))}

      <div className="flex flex-col items-end gap-1.5">
        {doc.tax > 0 && (
          <>
            <div className="flex w-full justify-between gap-4 sm:w-72"><span className="text-muted-foreground">Total projet HT</span><span className="tabular">{formatMoney(doc.subtotal)}</span></div>
            <div className="flex w-full justify-between gap-4 sm:w-72"><span className="text-muted-foreground">TVA 19,25 %</span><span className="tabular">{formatMoney(doc.tax)}</span></div>
          </>
        )}
        <div className="flex w-full justify-between gap-4 rounded-md bg-success px-3 py-2 font-semibold text-success-foreground sm:w-72">
          <span>{doc.tax > 0 ? "TOTAL PROJET TTC" : "TOTAL PROJET"}</span>
          <span className="tabular">{formatMoney(doc.total)}</span>
        </div>
      </div>
      <p className="text-xs font-semibold italic">Arrêté la présente facture proforma à la somme de {doc.amountInWords}</p>
    </div>
  )
}
