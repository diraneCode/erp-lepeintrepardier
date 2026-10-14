"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  LuBan,
  LuCircleDollarSign,
  LuEye,
  LuFileDown,
  LuPlus,
  LuShoppingBag,
  LuShoppingCart,
  LuTrash2,
  LuTrendingUp,
  LuReceipt,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChartCard } from "@/components/shared/chart-card"
import { DonutChart, RankingBars, TimeBarChart, bucketByPeriod, topWithOther } from "@/components/shared/charts"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSection, DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { DocumentLines, toDocumentClient, toDocumentLines } from "@/components/modules/commercial/document-lines"
import { SaleFormDialog } from "@/components/modules/commercial/sale-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useAccess, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { documentTotals, itemsCost, pctChange } from "@/lib/calc"
import { inRange, previousRange } from "@/lib/date-range"
import { exportDocumentPDF } from "@/lib/export"
import { formatDate, formatMoney, formatNumber, formatPercent } from "@/lib/format"
import { paymentMethod, saleChannel, saleStatus, toOptions } from "@/lib/labels"
import { nextNumber, uid, useStore } from "@/lib/store"
import type { Sale } from "@/lib/types"

type Row = Sale & { subtotal: number; total: number; margin: number; units: number }

export default function SalesPage() {
  const { sales } = useScopedData()
  const acc = useModuleAccess("ventes")
  const remove = useStore((s) => s.remove)
  const cancelSale = useStore((s) => s.cancelSale)
  const createInvoiceFromSale = useStore((s) => s.createInvoice)
  const updateSale = useStore((s) => s.update)
  const { clientName, clientById, shopName, employeeName, employeeOptions, shopOptions, productById, clientOptions } = useLookups()

  const canInvoice = !!useAccess().access("facturation")?.write
  const [formOpen, setFormOpen] = useTransientState(false)
  const [viewing, setViewing] = useTransientState<Row | null>(null)
  const [toCancel, setToCancel] = useTransientState<Row | null>(null)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)

  const rows = React.useMemo<Row[]>(() => {
    const cost = (id: string) => productById.get(id)?.purchasePrice ?? 0
    return sales.map((s) => {
      const t = documentTotals(s.items)
      return { ...s, subtotal: t.subtotal, total: t.total, margin: t.subtotal - itemsCost(s.items, cost), units: s.items.reduce((u, i) => u + i.quantity, 0) }
    })
  }, [sales, productById])

  const sellerIds = React.useMemo(() => new Set(sales.map((s) => s.sellerId)), [sales])
  const clientIdsSold = React.useMemo(() => new Set(sales.map((s) => s.clientId ?? "")), [sales])
  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "N° vente, client, produit…", fields: (s) => [s.number, s.clientId ? clientById.get(s.clientId)?.name : "comptoir", ...s.items.map((i) => i.description)] },
      date: { label: "Date de vente", accessor: (s) => s.date, defaultPreset: "6m" },
      facets: [
        ...(acc.global ? [{ id: "boutique", label: "Boutique", options: shopOptions, accessor: (s: Row) => s.boutiqueId }] : []),
        { id: "status", label: "Statut", options: toOptions(saleStatus), accessor: (s) => s.status },
        { id: "channel", label: "Canal", options: toOptions(saleChannel), accessor: (s) => s.channel },
        { id: "payment", label: "Paiement", options: toOptions(paymentMethod), accessor: (s) => s.paymentMethod },
        ...(acc.scope !== "own" ? [{ id: "seller", label: "Vendeur", options: acc.global ? employeeOptions : employeeOptions.filter((o) => sellerIds.has(o.value)), accessor: (s: Row) => s.sellerId }] : []),
        { id: "client", label: "Client", options: [{ value: "", label: "Client comptoir" }, ...clientOptions.filter((o) => acc.global || clientIdsSold.has(o.value))], accessor: (s) => s.clientId ?? "" },
      ],
      ranges: [
        { id: "total", label: "Montant TTC", unit: "FCFA", accessor: (s) => s.total },
        { id: "margin", label: "Marge brute", unit: "FCFA", accessor: (s) => s.margin },
      ],
    }),
    [clientById, shopOptions, employeeOptions, clientOptions, acc.global, acc.scope, sellerIds, clientIdsSold]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered
  const valid = React.useMemo(() => data.filter((s) => s.status !== "annulee" && s.status !== "brouillon"), [data])

  const kpis = React.useMemo(() => {
    const revenue = valid.reduce((s, r) => s + r.total, 0)
    const margin = valid.reduce((s, r) => s + r.margin, 0)
    const subtotal = valid.reduce((s, r) => s + r.subtotal, 0)
    const prev = previousRange(filters.state.date ?? {})
    let prevRevenue: number | undefined
    if (prev) {
      // Période précédente avec les mêmes filtres hors dates
      prevRevenue = rows
        .filter((r) => r.status !== "annulee" && r.status !== "brouillon" && inRange(r.date, prev))
        .filter((r) => (filters.state.facets.boutique?.length ? filters.state.facets.boutique.includes(r.boutiqueId) : true))
        .reduce((s, r) => s + r.total, 0)
    }
    return {
      revenue,
      count: valid.length,
      basket: valid.length ? revenue / valid.length : 0,
      margin,
      marginRate: subtotal ? (margin / subtotal) * 100 : 0,
      delta: prevRevenue !== undefined ? pctChange(revenue, prevRevenue) : undefined,
    }
  }, [valid, rows, filters.state])

  const trend = React.useMemo(
    () => bucketByPeriod(valid, (s) => s.date, { revenue: (s) => s.total, margin: (s) => s.margin }, filters.state.date),
    [valid, filters.state.date]
  )
  const byShop = React.useMemo(() => {
    const m = new Map<string, number>()
    valid.forEach((s) => {
      const key = acc.global ? shopName(s.boutiqueId) : saleChannel[s.channel]
      m.set(key, (m.get(key) ?? 0) + s.total)
    })
    return topWithOther([...m].map(([name, value]) => ({ name, value })))
  }, [valid, shopName, acc.global])
  const topProducts = React.useMemo(() => {
    const m = new Map<string, number>()
    valid.forEach((s) => s.items.forEach((i) => m.set(i.productId, (m.get(i.productId) ?? 0) + i.quantity * i.unitPrice * (1 - i.discount / 100))))
    return [...m]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([id, value]) => ({ label: productById.get(id)?.name ?? "—", value }))
  }, [valid, productById])

  const downloadTicket = (s: Row) =>
    exportDocumentPDF({
      kind: "TICKET DE VENTE",
      number: s.number,
      date: s.date,
      status: saleStatus[s.status].label,
      client: toDocumentClient(s.clientId ? clientById.get(s.clientId) : null),
      issuer: `${employeeName(s.sellerId)} — ${shopName(s.boutiqueId)}`,
      lines: toDocumentLines(s.items),
      totals: documentTotals(s.items),
      notes: `Paiement : ${paymentMethod[s.paymentMethod]}${s.notes ? ` — ${s.notes}` : ""}`,
    }).then(() => toast.success("Ticket PDF généré"))

  const invoiceSale = (s: Row) => {
    if (!s.clientId) return
    const id = uid("f")
    const number = nextNumber("FAC", useStore.getState().invoices)
    createInvoiceFromSale({ id, number, clientId: s.clientId, boutiqueId: s.boutiqueId, date: s.date, dueDate: s.date, items: s.items, status: "emise", amountPaid: 0, saleId: s.id })
    updateSale("sales", s.id, { invoiceId: id })
    toast.success("Facture générée", { description: number })
  }

  const columns: Column<Row>[] = [
    { id: "number", header: "N° vente", accessor: (s) => s.number, cell: (s) => <span className="font-medium">{s.number}</span> },
    { id: "date", header: "Date", accessor: (s) => s.date, cell: (s) => formatDate(s.date), exportType: "date" },
    { id: "client", header: "Client", accessor: (s) => clientName(s.clientId), cell: (s) => <span className={s.clientId ? undefined : "text-muted-foreground"}>{clientName(s.clientId)}</span>, className: "max-w-[200px] truncate" },
    { id: "boutique", header: "Boutique", accessor: (s) => shopName(s.boutiqueId), hideOnMobile: true, defaultHidden: !acc.global },
    { id: "seller", header: "Vendeur", accessor: (s) => employeeName(s.sellerId), hideOnMobile: true, defaultHidden: true },
    { id: "channel", header: "Canal", accessor: (s) => saleChannel[s.channel], hideOnMobile: true, defaultHidden: true },
    { id: "payment", header: "Paiement", accessor: (s) => paymentMethod[s.paymentMethod], hideOnMobile: true },
    { id: "units", header: "Articles", accessor: (s) => s.units, align: "right", exportType: "number", hideOnMobile: true, defaultHidden: true },
    { id: "subtotal", header: "Total HT", accessor: (s) => s.subtotal, cell: (s) => formatMoney(s.subtotal), align: "right", exportType: "money", defaultHidden: true, footer: (r) => formatMoney(r.reduce((a, s) => a + s.subtotal, 0)) },
    { id: "total", header: "Total TTC", accessor: (s) => s.total, cell: (s) => <span className="font-medium">{formatMoney(s.total)}</span>, align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((a, s) => a + s.total, 0)) },
    { id: "margin", header: "Marge", accessor: (s) => s.margin, cell: (s) => formatMoney(s.margin), align: "right", exportType: "money", hideOnMobile: true, footer: (r) => formatMoney(r.reduce((a, s) => a + s.margin, 0)) },
    { id: "status", header: "Statut", accessor: (s) => saleStatus[s.status].label, cell: (s) => <StatusBadge def={saleStatus[s.status]} /> },
  ]

  return (
    <Page>
      <UrlActions onNew={() => acc.write && setFormOpen(true)} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuShoppingCart}
        title="Ventes"
        description="Suivi des ventes par boutique, vendeur, canal et mode de paiement."
        actions={
          acc.write && (
            <Button onClick={() => setFormOpen(true)}>
              <LuPlus /> Nouvelle vente
            </Button>
          )
        }
      />
      <Card>
        <CardContent>
          <FilterBar filters={filters} />
        </CardContent>
      </Card>
      <StatGrid>
        <StatCard index={0} label="Chiffre d'affaires TTC" value={formatMoney(kpis.revenue, { compact: true })} icon={LuCircleDollarSign} delta={kpis.delta} />
        <StatCard index={1} label="Nombre de ventes" value={formatNumber(kpis.count)} icon={LuShoppingBag} tone="blue" hint="hors brouillons et annulations" />
        <StatCard index={2} label="Panier moyen" value={formatMoney(kpis.basket, { compact: true })} icon={LuShoppingCart} tone="orange" />
        <StatCard index={3} label="Marge brute" value={formatMoney(kpis.margin, { compact: true })} icon={LuTrendingUp} tone="green" hint={`taux ${formatPercent(kpis.marginRate)}`} />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Évolution du chiffre d'affaires" description={`CA TTC et marge brute par ${trend.granularity}`} className="xl:col-span-2">
          <TimeBarChart
            data={trend.data}
            series={[
              { key: "revenue", label: "CA TTC", color: "var(--chart-1)" },
              { key: "margin", label: "Marge brute", color: "var(--chart-2)" },
            ]}
          />
        </ChartCard>
        <ChartCard title={acc.global ? "Répartition par boutique" : "Répartition par canal"} description="Part du CA TTC">
          <DonutChart data={byShop} centerValue={formatMoney(kpis.revenue, { compact: true })} centerLabel="CA total" />
        </ChartCard>
      </div>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Meilleurs produits" description="CA HT sur la période">
          <RankingBars items={topProducts} />
        </ChartCard>
        <Card className="xl:col-span-2">
          <CardContent>
            <DataTable
              data={data}
              columns={columns}
              getRowId={(s) => s.id}
              onRowClick={setViewing}
              selectable={acc.global && acc.write}
              defaultSort={{ id: "date", desc: true }}
              exportOptions={{
                filename: "ventes",
                title: "Journal des ventes",
                subtitle: filters.describe(),
                summary: [
                  { label: "CA TTC", value: formatMoney(kpis.revenue) },
                  { label: "Ventes", value: formatNumber(kpis.count) },
                  { label: "Panier moyen", value: formatMoney(kpis.basket) },
                  { label: "Marge brute", value: formatMoney(kpis.margin) },
                ],
              }}
              bulkActions={(sel) => (
                <Button variant="destructive" size="sm" onClick={() => setToDelete(sel.map((s) => s.id))}>
                  <LuTrash2 /> Supprimer
                </Button>
              )}
              rowActions={(s) => (
                <RowActions
                  actions={[
                    { label: "Voir le détail", icon: LuEye, onSelect: () => setViewing(s) },
                    { label: "Ticket PDF", icon: LuFileDown, onSelect: () => downloadTicket(s) },
                    { label: "Générer la facture", icon: LuReceipt, onSelect: () => invoiceSale(s), hidden: !s.clientId || !!s.invoiceId || s.status === "annulee" || !acc.write || !canInvoice },
                    { label: "Annuler la vente", icon: LuBan, destructive: true, separatorBefore: true, onSelect: () => setToCancel(s), hidden: s.status === "annulee" || !acc.write },
                  ]}
                />
              )}
            />
          </CardContent>
        </Card>
      </div>

      <SaleFormDialog open={formOpen} onOpenChange={setFormOpen} />

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.number}
        description={viewing ? `${formatDate(viewing.date)} · ${shopName(viewing.boutiqueId)}` : undefined}
        badge={viewing && <StatusBadge def={saleStatus[viewing.status]} />}
        wide
        footer={
          viewing && (
            <>
              {viewing.status !== "annulee" && acc.write && (
                <Button variant="outline" onClick={() => setToCancel(viewing)}>
                  <LuBan /> Annuler
                </Button>
              )}
              <Button onClick={() => downloadTicket(viewing)}>
                <LuFileDown /> Ticket PDF
              </Button>
            </>
          )
        }
      >
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="Informations">
              <DescriptionList
                items={[
                  { label: "Client", value: clientName(viewing.clientId) },
                  { label: "Vendeur", value: employeeName(viewing.sellerId) },
                  { label: "Canal", value: saleChannel[viewing.channel] },
                  { label: "Paiement", value: paymentMethod[viewing.paymentMethod] },
                  { label: "Marge brute", value: `${formatMoney(viewing.margin)} (${formatPercent(viewing.subtotal ? (viewing.margin / viewing.subtotal) * 100 : 0)})` },
                  { label: "Facture", value: viewing.invoiceId ? useStore.getState().invoices.find((i) => i.id === viewing.invoiceId)?.number ?? "—" : "Non facturée" },
                  ...(viewing.notes ? [{ label: "Notes", value: viewing.notes, full: true }] : []),
                ]}
              />
            </DetailSection>
            <DetailSection title="Articles">
              <DocumentLines items={viewing.items} />
            </DetailSection>
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title={`Annuler la vente ${toCancel?.number ?? ""} ?`}
        description="Les articles seront réintégrés au stock de la boutique et la facture liée sera annulée."
        confirmLabel="Annuler la vente"
        destructive
        onConfirm={() => {
          if (toCancel) cancelSale(toCancel.id)
          toast.success("Vente annulée", { description: "Stock réintégré" })
          setToCancel(null)
          setViewing(null)
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} vente(s) ?`}
        description="La suppression n'impacte pas le stock. Préférez l'annulation pour réintégrer les articles."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("sales", toDelete)
          toast.success("Vente(s) supprimée(s)")
          setToDelete(null)
        }}
      />
    </Page>
  )
}
