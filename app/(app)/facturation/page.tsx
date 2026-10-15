"use client"

import * as React from "react"
import { toast } from "sonner"
import {
  LuBan,
  LuBanknote,
  LuCircleAlert,
  LuCircleDollarSign,
  LuEye,
  LuFileDown,
  LuHourglass,
  LuPencil,
  LuPlus,
  LuReceipt,
  LuSend,
  LuTrash2,
  LuWallet,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ChartCard } from "@/components/shared/chart-card"
import { RankingBars, TimeBarChart, bucketByPeriod } from "@/components/shared/charts"
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
import { InvoiceFormDialog } from "@/components/modules/billing/invoice-form"
import { PaymentFormDialog } from "@/components/modules/billing/payment-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useAccess, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { FollowupFormDialog, type FollowupPreset } from "@/components/modules/prospects/followup-forms"
import { useTransientState } from "@/hooks/use-transient-state"
import { daysOverdue, documentTotals, invoiceBalance, invoiceStatus as computeStatus } from "@/lib/calc"
import { exportDocumentPDF } from "@/lib/export"
import { formatDate, formatMoney, formatNumber, formatPercent, relativeDays } from "@/lib/format"
import { invoiceStatus, paymentMethod, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Invoice, InvoiceStatus, Payment } from "@/lib/types"

type Row = Invoice & { total: number; balance: number; displayStatus: InvoiceStatus; overdueDays: number }

export default function BillingPage() {
  const [tab, setTab] = React.useState("factures")
  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <InvoicesTab tabs={
          <TabsList>
            <TabsTrigger value="factures">Factures</TabsTrigger>
            <TabsTrigger value="encaissements">Encaissements</TabsTrigger>
          </TabsList>
        } tab={tab} />
      </Tabs>
    </Page>
  )
}

function InvoicesTab({ tabs, tab }: { tabs: React.ReactNode; tab: string }) {
  const { invoices, payments } = useScopedData(["invoices", "payments"])
  const acc = useModuleAccess("facturation")
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const { clientName, clientById, clientOptions, shopOptions, shopName } = useLookups(["clientName", "clientById", "clientOptions", "shopOptions", "shopName"])

  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Invoice | undefined>(undefined)
  const [viewingId, setViewingId] = useTransientState<string | null>(null)
  const [paying, setPaying] = useTransientState<Invoice | null>(null)
  const [toCancel, setToCancel] = useTransientState<Invoice | null>(null)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)
  const [followPreset, setFollowPreset] = useTransientState<FollowupPreset | null>(null)
  const canFollowup = !!useAccess().access("relances")?.write

  const rows = React.useMemo<Row[]>(
    () =>
      invoices.map((inv) => {
        const status = computeStatus(inv)
        return {
          ...inv,
          total: documentTotals(inv.items).total,
          balance: inv.status === "annulee" ? 0 : invoiceBalance(inv),
          displayStatus: status,
          overdueDays: status === "en_retard" ? daysOverdue(inv) : 0,
        }
      }),
    [invoices]
  )
  const invoicedClients = React.useMemo(() => new Set(invoices.map((i) => i.clientId)), [invoices])
  const viewing = viewingId ? rows.find((r) => r.id === viewingId) ?? null : null

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "N° facture, client, produit…", fields: (r) => [r.number, clientById.get(r.clientId)?.name, ...r.items.map((i) => i.description)] },
      date: { label: "Date de facture", accessor: (r) => r.date, defaultPreset: "year" },
      facets: [
        { id: "status", label: "Statut", options: toOptions(invoiceStatus), accessor: (r) => r.displayStatus },
        { id: "client", label: "Client", options: acc.global ? clientOptions : clientOptions.filter((o) => invoicedClients.has(o.value)), accessor: (r) => r.clientId },
        ...(acc.global ? [{ id: "shop", label: "Point de vente", options: shopOptions, accessor: (r: Row) => r.boutiqueId }] : []),
        {
          id: "aging",
          label: "Retard",
          options: [
            { value: "0", label: "À jour" },
            { value: "30", label: "1 à 30 jours" },
            { value: "60", label: "31 à 60 jours" },
            { value: "90", label: "61 à 90 jours" },
            { value: "90+", label: "Plus de 90 jours" },
          ],
          accessor: (r) => (r.overdueDays === 0 ? "0" : r.overdueDays <= 30 ? "30" : r.overdueDays <= 60 ? "60" : r.overdueDays <= 90 ? "90" : "90+"),
        },
      ],
      ranges: [
        { id: "total", label: "Montant TTC", unit: "FCFA", accessor: (r) => r.total },
        { id: "balance", label: "Reste à payer", unit: "FCFA", accessor: (r) => r.balance },
      ],
    }),
    [clientById, clientOptions, shopOptions, acc.global, invoicedClients]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const kpis = React.useMemo(() => {
    const valid = data.filter((r) => r.status !== "annulee" && r.status !== "brouillon")
    const billed = valid.reduce((s, r) => s + r.total, 0)
    const collected = valid.reduce((s, r) => s + Math.min(r.total, r.amountPaid), 0)
    const late = valid.filter((r) => r.displayStatus === "en_retard")
    return {
      billed,
      collected,
      outstanding: valid.reduce((s, r) => s + r.balance, 0),
      lateAmount: late.reduce((s, r) => s + r.balance, 0),
      lateCount: late.length,
      rate: billed ? (collected / billed) * 100 : 0,
      count: valid.length,
    }
  }, [data])

  const trend = React.useMemo(() => {
    const valid = data.filter((r) => r.status !== "annulee" && r.status !== "brouillon")
    return bucketByPeriod(valid, (r) => r.date, { billed: (r) => r.total, collected: (r) => Math.min(r.total, r.amountPaid) }, filters.state.date)
  }, [data, filters.state.date])

  const aging = React.useMemo(() => {
    const buckets = [
      { label: "Non échues", value: 0 },
      { label: "1 à 30 jours", value: 0 },
      { label: "31 à 60 jours", value: 0 },
      { label: "61 à 90 jours", value: 0 },
      { label: "Plus de 90 jours", value: 0 },
    ]
    data.forEach((r) => {
      if (r.balance <= 0 || r.status === "brouillon") return
      const d = r.overdueDays
      buckets[d === 0 ? 0 : d <= 30 ? 1 : d <= 60 ? 2 : d <= 90 ? 3 : 4].value += r.balance
    })
    return buckets
  }, [data])

  const openEdit = (inv?: Invoice) => {
    setEditing(inv)
    setFormOpen(true)
  }

  const downloadPdf = (inv: Row) =>
    exportDocumentPDF({
      kind: "FACTURE",
      number: inv.number,
      date: inv.date,
      dueDate: inv.dueDate,
      status: invoiceStatus[inv.displayStatus].label,
      client: toDocumentClient(clientById.get(inv.clientId)),
      issuer: shopName(inv.boutiqueId),
      lines: toDocumentLines(inv.items),
      totals: documentTotals(inv.items),
      paid: inv.amountPaid,
      notes: inv.notes,
    }).then(() => toast.success("Facture PDF générée", { description: inv.number }))

  const columns: Column<Row>[] = [
    { id: "number", header: "N° facture", accessor: (r) => r.number, cell: (r) => <span className="font-medium">{r.number}</span> },
    { id: "client", header: "Client", accessor: (r) => clientName(r.clientId), className: "max-w-[200px] truncate" },
    { id: "date", header: "Date", accessor: (r) => r.date, cell: (r) => formatDate(r.date), exportType: "date" },
    {
      id: "dueDate",
      header: "Échéance",
      accessor: (r) => r.dueDate,
      cell: (r) => (
        <div className="flex flex-col">
          <span>{formatDate(r.dueDate)}</span>
          {r.balance > 0 && r.status !== "brouillon" && (
            <span className={r.overdueDays ? "text-xs text-destructive" : "text-xs text-muted-foreground"}>
              {r.overdueDays ? `${r.overdueDays} j de retard` : relativeDays(r.dueDate)}
            </span>
          )}
        </div>
      ),
      exportType: "date",
      hideOnMobile: true,
    },
    { id: "shop", header: "Point de vente", accessor: (r) => shopName(r.boutiqueId), hideOnMobile: true, defaultHidden: true },
    { id: "total", header: "Montant TTC", accessor: (r) => r.total, cell: (r) => formatMoney(r.total), align: "right", exportType: "money", footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.total, 0)) },
    { id: "paid", header: "Réglé", accessor: (r) => r.amountPaid, cell: (r) => formatMoney(r.amountPaid), align: "right", exportType: "money", hideOnMobile: true, footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.amountPaid, 0)) },
    {
      id: "balance",
      header: "Reste dû",
      accessor: (r) => r.balance,
      cell: (r) => <span className={r.balance > 0 ? "font-medium" : "text-muted-foreground"}>{formatMoney(r.balance)}</span>,
      align: "right",
      exportType: "money",
      footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.balance, 0)),
    },
    { id: "status", header: "Statut", accessor: (r) => invoiceStatus[r.displayStatus].label, cell: (r) => <StatusBadge def={invoiceStatus[r.displayStatus]} /> },
  ]

  const viewingPayments = viewing ? payments.filter((p) => p.invoiceId === viewing.id).sort((a, b) => b.date.localeCompare(a.date)) : []

  return (
    <>
      <UrlActions onNew={() => acc.write && openEdit()} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuReceipt}
        title="Facturation"
        description="Factures clients, échéances, relances et encaissements."
        actions={
          <>
            {tabs}
            {acc.write && (
              <Button onClick={() => openEdit()}>
                <LuPlus /> Nouvelle facture
              </Button>
            )}
          </>
        }
      />
      <TabsContent value="factures" className="flex flex-col gap-6">
        <Card>
          <CardContent>
            <FilterBar filters={filters} />
          </CardContent>
        </Card>
        <StatGrid>
          <StatCard index={0} label="Facturé TTC" value={formatMoney(kpis.billed, { compact: true })} icon={LuReceipt} hint={`${formatNumber(kpis.count)} factures`} />
          <StatCard index={1} label="Encaissé" value={formatMoney(kpis.collected, { compact: true })} icon={LuCircleDollarSign} tone="green" hint={`taux de recouvrement ${formatPercent(kpis.rate)}`} />
          <StatCard index={2} label="Reste à encaisser" value={formatMoney(kpis.outstanding, { compact: true })} icon={LuHourglass} tone="orange" />
          <StatCard index={3} label="En retard" value={formatMoney(kpis.lateAmount, { compact: true })} icon={LuCircleAlert} tone="red" hint={`${kpis.lateCount} facture(s)`} />
        </StatGrid>
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Facturé et encaissé" description={`Par ${trend.granularity}, sur les factures de la période`} className="xl:col-span-2">
            <TimeBarChart
              data={trend.data}
              series={[
                { key: "billed", label: "Facturé", color: "var(--chart-1)" },
                { key: "collected", label: "Encaissé", color: "var(--chart-3)" },
              ]}
            />
          </ChartCard>
          <ChartCard title="Balance âgée" description="Reste dû par ancienneté du retard">
            <RankingBars items={aging} color="var(--chart-2)" />
          </ChartCard>
        </div>
        <Card>
          <CardContent>
            <DataTable
              data={data}
              columns={columns}
              getRowId={(r) => r.id}
              onRowClick={(r) => setViewingId(r.id)}
              selectable={acc.write}
              defaultSort={{ id: "date", desc: true }}
              rowClassName={(r) => (r.displayStatus === "annulee" ? "opacity-60" : undefined)}
              exportOptions={{
                filename: "factures",
                title: "Registre des factures",
                subtitle: filters.describe(),
                summary: [
                  { label: "Facturé TTC", value: formatMoney(kpis.billed) },
                  { label: "Encaissé", value: formatMoney(kpis.collected) },
                  { label: "Reste à encaisser", value: formatMoney(kpis.outstanding) },
                  { label: "En retard", value: formatMoney(kpis.lateAmount) },
                ],
              }}
              bulkActions={(sel, clear) => (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const late = sel.filter((r) => r.displayStatus === "en_retard")
                      const meId = useStore.getState().currentUserId ?? ""
                      late.forEach((r) =>
                        useStore.getState().add("followups", {
                          id: `rl_${r.id}_${Date.now()}`,
                          targetType: "facture",
                          targetId: r.id,
                          subject: `Relance paiement ${r.number}`,
                          channel: "appel",
                          priority: r.overdueDays > 30 ? "haute" : "normale",
                          dueDate: new Date().toISOString().slice(0, 10),
                          status: "a_faire",
                          ownerId: clientById.get(r.clientId)?.ownerId ?? meId,
                          createdAt: new Date().toISOString().slice(0, 10),
                        })
                      )
                      toast.success(`${late.length} relance(s) programmée(s)`, { description: "Retrouvez-les dans le module Relances." })
                      clear()
                    }}
                  >
                    <LuSend /> Relancer
                  </Button>
                  {acc.global && (
                    <Button variant="destructive" size="sm" onClick={() => setToDelete(sel.map((r) => r.id))}>
                      <LuTrash2 /> Supprimer
                    </Button>
                  )}
                </>
              )}
              rowActions={(r) => (
                <RowActions
                  actions={[
                    { label: "Voir", icon: LuEye, onSelect: () => setViewingId(r.id) },
                    { label: "Encaisser", icon: LuBanknote, onSelect: () => setPaying(r), hidden: r.balance <= 0 || r.status === "brouillon" || r.status === "annulee" || !acc.write },
                    { label: "Émettre", icon: LuSend, onSelect: () => update("invoices", r.id, { status: "emise" }), hidden: r.status !== "brouillon" || !acc.write },
                    { label: "Modifier", icon: LuPencil, onSelect: () => openEdit(r), hidden: r.status !== "brouillon" || !acc.write },
                    { label: "Télécharger PDF", icon: LuFileDown, onSelect: () => downloadPdf(r) },
                    { label: "Programmer une relance", icon: LuSend, onSelect: () => setFollowPreset({ targetType: "facture", targetId: r.id, subject: `Relance paiement ${r.number}` }), hidden: r.balance <= 0 || r.status === "brouillon" || r.status === "annulee" || !canFollowup },
                    { label: "Annuler la facture", icon: LuBan, destructive: true, separatorBefore: true, onSelect: () => setToCancel(r), hidden: r.status === "annulee" || r.status === "payee" || !acc.global || !acc.write },
                  ]}
                />
              )}
            />
          </CardContent>
        </Card>
      </TabsContent>
      <TabsContent value="encaissements">{tab === "encaissements" && <PaymentsTab />}</TabsContent>

      <InvoiceFormDialog open={formOpen} onOpenChange={setFormOpen} invoice={editing} />
      <FollowupFormDialog open={!!followPreset} onOpenChange={(o) => !o && setFollowPreset(null)} preset={followPreset ?? undefined} />
      <PaymentFormDialog open={!!paying} onOpenChange={(o) => !o && setPaying(null)} invoice={paying} />

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewingId(null)}
        title={viewing?.number}
        description={viewing ? clientName(viewing.clientId) : undefined}
        badge={viewing && <StatusBadge def={invoiceStatus[viewing.displayStatus]} />}
        wide
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => downloadPdf(viewing)}>
                <LuFileDown /> PDF
              </Button>
              {viewing.balance > 0 && viewing.status !== "brouillon" && viewing.status !== "annulee" && acc.write && (
                <Button onClick={() => setPaying(viewing)}>
                  <LuBanknote /> Encaisser
                </Button>
              )}
            </>
          )
        }
      >
        {viewing && (
          <div className="flex flex-col">
            <DetailSection title="Informations">
              <DescriptionList
                items={[
                  { label: "Date de facture", value: formatDate(viewing.date) },
                  { label: "Échéance", value: `${formatDate(viewing.dueDate)}${viewing.overdueDays ? ` (${viewing.overdueDays} j de retard)` : ""}` },
                  { label: "Point de vente", value: shopName(viewing.boutiqueId) },
                  { label: "Origine", value: viewing.saleId ? "Vente boutique" : viewing.quoteId ? "Devis accepté" : "Saisie manuelle" },
                ]}
              />
            </DetailSection>
            <DetailSection title="Lignes">
              <DocumentLines items={viewing.items} paid={viewing.amountPaid} />
            </DetailSection>
            <DetailSection title={`Encaissements (${viewingPayments.length})`}>
              {viewingPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">Aucun encaissement enregistré.</p>
              ) : (
                <div className="flex flex-col divide-y rounded-lg border">
                  {viewingPayments.map((p) => (
                    <div key={p.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                      <div>
                        <div className="font-medium">{paymentMethod[p.method]}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatDate(p.date)} · {p.reference}
                        </div>
                      </div>
                      <span className="font-medium text-success tabular">+ {formatMoney(p.amount)}</span>
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title={`Annuler la facture ${toCancel?.number ?? ""} ?`}
        description="La facture sera conservée avec le statut « Annulée » et exclue des indicateurs."
        confirmLabel="Annuler la facture"
        destructive
        onConfirm={async () => {
          if (toCancel) {
            if (!(await update("invoices", toCancel.id, { status: "annulee" }))) return
          }
          toast.success("Facture annulée")
          setToCancel(null)
        }}
      />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} facture(s) ?`}
        description="Action irréversible. Pour conserver une trace comptable, préférez l'annulation."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) {
            if (!(await remove("invoices", toDelete))) return
          }
          toast.success("Facture(s) supprimée(s)")
          setToDelete(null)
        }}
      />
    </>
  )
}

function PaymentsTab() {
  const { payments, invoices } = useScopedData(["payments", "invoices"])
  const { clientName } = useLookups(["clientName"])
  const invoiceById = React.useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices])

  const config = React.useMemo<FilterConfig<Payment>>(
    () => ({
      search: { placeholder: "Référence, facture, client…", fields: (p) => [p.reference, invoiceById.get(p.invoiceId)?.number, clientName(invoiceById.get(p.invoiceId)?.clientId)] },
      date: { label: "Date d'encaissement", accessor: (p) => p.date, defaultPreset: "month" },
      facets: [{ id: "method", label: "Mode", options: toOptions(paymentMethod).filter((o) => o.value !== "credit"), accessor: (p) => p.method }],
      ranges: [{ id: "amount", label: "Montant", unit: "FCFA", accessor: (p) => p.amount }],
    }),
    [invoiceById, clientName]
  )
  const filters = useFilters(payments, config)
  const data = filters.filtered
  const total = data.reduce((s, p) => s + p.amount, 0)
  const byMethod = (m: string) => data.filter((p) => p.method === m).reduce((s, p) => s + p.amount, 0)

  const columns: Column<Payment>[] = [
    { id: "date", header: "Date", accessor: (p) => p.date, cell: (p) => formatDate(p.date), exportType: "date" },
    { id: "reference", header: "Référence", accessor: (p) => p.reference, cell: (p) => <span className="font-medium">{p.reference}</span> },
    { id: "invoice", header: "Facture", accessor: (p) => invoiceById.get(p.invoiceId)?.number ?? "—" },
    { id: "client", header: "Client", accessor: (p) => clientName(invoiceById.get(p.invoiceId)?.clientId), className: "max-w-[220px] truncate" },
    { id: "method", header: "Mode", accessor: (p) => paymentMethod[p.method] },
    { id: "amount", header: "Montant", accessor: (p) => p.amount, cell: (p) => <span className="font-medium text-success">{formatMoney(p.amount)}</span>, align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((s, p) => s + p.amount, 0)) },
  ]

  return (
    <div className="flex flex-col gap-6">
      <StatGrid>
        <StatCard index={0} label="Total encaissé" value={formatMoney(total, { compact: true })} icon={LuWallet} hint={`${data.length} règlements`} />
        <StatCard index={1} label="Virements & chèques" value={formatMoney(byMethod("virement") + byMethod("cheque"), { compact: true })} icon={LuBanknote} tone="blue" />
        <StatCard index={2} label="Mobile Money" value={formatMoney(byMethod("mobile_money"), { compact: true })} icon={LuCircleDollarSign} tone="orange" />
        <StatCard index={3} label="Espèces & carte" value={formatMoney(byMethod("especes") + byMethod("carte"), { compact: true })} icon={LuWallet} tone="green" />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(p) => p.id}
            defaultSort={{ id: "date", desc: true }}
            exportOptions={{ filename: "encaissements", title: "Journal des encaissements", subtitle: filters.describe(), summary: [{ label: "Total encaissé", value: formatMoney(total) }] }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
