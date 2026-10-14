"use client"

import { documentTotals, lineSubtotal } from "@/lib/calc"
import type { CommercialDocument } from "@/lib/export"
import { formatMoney, formatNumber } from "@/lib/format"
import type { Client, LineItem } from "@/lib/types"

export function DocumentLines({ items, paid }: { items: LineItem[]; paid?: number }) {
  const t = documentTotals(items)
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Désignation</th>
              <th className="px-3 py-2 text-right font-medium">Qté</th>
              <th className="px-3 py-2 text-right font-medium">P.U.</th>
              <th className="px-3 py-2 text-right font-medium">Rem.</th>
              <th className="px-3 py-2 text-right font-medium">Total HT</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((i, idx) => (
              <tr key={idx}>
                <td className="px-3 py-2">{i.description}</td>
                <td className="px-3 py-2 text-right tabular">{formatNumber(i.quantity)}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular">{formatMoney(i.unitPrice, { currency: false })}</td>
                <td className="px-3 py-2 text-right tabular">{i.discount ? `${i.discount} %` : "—"}</td>
                <td className="px-3 py-2 text-right whitespace-nowrap tabular">{formatMoney(lineSubtotal(i), { currency: false })}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="ml-auto grid w-full grid-cols-2 gap-x-6 gap-y-1.5 text-sm sm:w-72">
        <dt className="text-muted-foreground">Total HT</dt>
        <dd className="text-right tabular">{formatMoney(t.subtotal)}</dd>
        {t.discount > 0 && (
          <>
            <dt className="text-muted-foreground">dont remises</dt>
            <dd className="text-right tabular">− {formatMoney(t.discount)}</dd>
          </>
        )}
        <dt className="text-muted-foreground">TVA 19,25 %</dt>
        <dd className="text-right tabular">{formatMoney(t.tax)}</dd>
        <dt className="border-t pt-1.5 font-semibold">Total TTC</dt>
        <dd className="border-t pt-1.5 text-right font-semibold tabular">{formatMoney(t.total)}</dd>
        {paid !== undefined && (
          <>
            <dt className="text-muted-foreground">Réglé</dt>
            <dd className="text-right text-success tabular">{formatMoney(paid)}</dd>
            <dt className="font-semibold">Reste à payer</dt>
            <dd className="text-right font-semibold text-warning tabular">{formatMoney(Math.max(0, t.total - paid))}</dd>
          </>
        )}
      </dl>
    </div>
  )
}

export function toDocumentLines(items: LineItem[]): CommercialDocument["lines"] {
  return items.map((i) => ({
    description: i.description,
    quantity: i.quantity,
    unitPrice: i.unitPrice,
    discount: i.discount,
    taxRate: i.taxRate,
    total: Math.round(lineSubtotal(i)),
  }))
}

export function toDocumentClient(client?: Client | null): CommercialDocument["client"] {
  if (!client) return { name: "Client comptoir" }
  return { name: client.name, code: client.code, address: client.address, phone: client.phone, email: client.email }
}
