"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { addDays } from "date-fns"
import {
  LuCircleCheck,
  LuCopy,
  LuEye,
  LuFileCheck,
  LuFileDown,
  LuFileText,
  LuHourglass,
  LuPencil,
  LuPlus,
  LuReceipt,
  LuSend,
  LuTrash2,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSection, DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { QuoteFormDialog } from "@/components/modules/commercial/quote-form"
import { ProformaView, toProformaDocument } from "@/components/modules/commercial/proforma-view"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useAccess, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { FollowupFormDialog, type FollowupPreset } from "@/components/modules/prospects/followup-forms"
import { useTransientState } from "@/hooks/use-transient-state"
import { documentTotals } from "@/lib/calc"
import { exportProformaPDF } from "@/lib/export"
import { nextProformaNumber } from "@/lib/proforma"
import { formatDate, formatMoney, formatNumber, formatPercent, toISODate } from "@/lib/format"
import { quoteStatus, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { Quote } from "@/lib/types"

type Row = Quote & { total: number; expired: boolean }

export default function QuotesPage() {
  const router = useRouter()
  const { quotes, clients: scopedClients } = useScopedData()
  const acc = useModuleAccess("devis")
  const update = useStore((s) => s.update)
  const add = useStore((s) => s.add)
  const remove = useStore((s) => s.remove)
  const convert = useStore((s) => s.convertQuoteToInvoice)
  const { clientName, clientById, employeeName, employeeOptions, clientOptions, productById } = useLookups()

  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Quote | undefined>(undefined)
  const [viewing, setViewing] = useTransientState<Row | null>(null)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)
  const [followPreset, setFollowPreset] = useTransientState<FollowupPreset | null>(null)
  const canFollowup = !!useAccess().access("relances")?.write

  const today = toISODate(new Date())
  const rows = React.useMemo<Row[]>(
    () =>
      quotes.map((q) => ({
        ...q,
        total: documentTotals(q.items).total,
        expired: q.status === "envoye" && q.validUntil < today,
      })),
    [quotes, today]
  )

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "N° proforma, client, projet, lieu, produit…", fields: (q) => [q.number, clientById.get(q.clientId)?.name, q.project, q.site, ...q.items.map((i) => i.description)] },
      date: { label: "Date du devis", accessor: (q) => q.date },
      facets: [
        { id: "status", label: "Statut", options: toOptions(quoteStatus), accessor: (q) => q.status },
        { id: "client", label: "Client", options: acc.global ? clientOptions : scopedClients.map((c) => ({ value: c.id, label: c.name })), accessor: (q) => q.clientId },
        ...(acc.global ? [{ id: "owner", label: "Commercial", options: employeeOptions, accessor: (q: Row) => q.ownerId }] : []),
      ],
      ranges: [{ id: "total", label: "Montant TTC", unit: "FCFA", accessor: (q) => q.total }],
    }),
    [clientById, clientOptions, employeeOptions, acc.global, scopedClients]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const kpis = React.useMemo(() => {
    const total = data.reduce((s, q) => s + q.total, 0)
    const accepted = data.filter((q) => q.status === "accepte")
    const pending = data.filter((q) => q.status === "envoye")
    const decided = data.filter((q) => ["accepte", "refuse", "expire"].includes(q.status)).length
    return {
      total,
      acceptedAmount: accepted.reduce((s, q) => s + q.total, 0),
      pendingAmount: pending.reduce((s, q) => s + q.total, 0),
      pendingCount: pending.length,
      rate: decided ? (accepted.length / decided) * 100 : 0,
    }
  }, [data])

  const openEdit = (q?: Quote) => {
    setEditing(q)
    setFormOpen(true)
  }

  const downloadPdf = (q: Quote) =>
    exportProformaPDF(toProformaDocument(q, clientById.get(q.clientId), productById)).then(() => toast.success("Proforma PDF générée", { description: `N° ${q.number}` }))

  const duplicate = (q: Quote) => {
    const number = nextProformaNumber(useStore.getState().quotes)
    add("quotes", { ...q, id: uid("d"), number, status: "brouillon", date: today, validUntil: toISODate(addDays(new Date(), 30)), invoiceId: undefined })
    toast.success("Devis dupliqué", { description: number })
  }

  const toInvoice = (q: Quote) => {
    const inv = convert(q.id)
    if (inv) {
      toast.success("Facture créée", {
        description: inv.number,
        action: { label: "Voir", onClick: () => router.push(`/facturation?q=${inv.number}`) },
      })
      setViewing(null)
    }
  }

  const columns: Column<Row>[] = [
    { id: "number", header: "N° proforma", accessor: (q) => q.number, cell: (q) => <span className="font-medium">{q.number}</span> },
    { id: "project", header: "Projet", accessor: (q) => q.project ?? "", cell: (q) => <div className="min-w-0"><div className="truncate">{q.project ?? "—"}</div><div className="truncate text-xs text-muted-foreground">{q.site}</div></div>, className: "max-w-[220px]", hideOnMobile: true },
    { id: "client", header: "Client", accessor: (q) => clientName(q.clientId), className: "max-w-[220px] truncate" },
    { id: "date", header: "Date", accessor: (q) => q.date, cell: (q) => formatDate(q.date), exportType: "date" },
    {
      id: "validUntil",
      header: "Validité",
      accessor: (q) => q.validUntil,
      cell: (q) => <span className={q.expired ? "text-destructive" : undefined}>{formatDate(q.validUntil)}</span>,
      exportType: "date",
      hideOnMobile: true,
    },
    { id: "lines", header: "Lignes", accessor: (q) => q.items.length, align: "right", exportType: "number", hideOnMobile: true, defaultHidden: true },
    { id: "owner", header: "Commercial", accessor: (q) => employeeName(q.ownerId), hideOnMobile: true, defaultHidden: !acc.global },
    { id: "total", header: "Total projet", accessor: (q) => q.total, cell: (q) => formatMoney(q.total), align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((s, q) => s + q.total, 0)) },
    {
      id: "status",
      header: "Statut",
      accessor: (q) => quoteStatus[q.status].label,
      cell: (q) => (
        <div className="flex items-center gap-1.5">
          <StatusBadge def={quoteStatus[q.status]} />
          {q.expired && <span className="text-xs text-destructive">expiré</span>}
        </div>
      ),
    },
  ]

  return (
    <Page>
      <UrlActions onNew={() => acc.write && openEdit()} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuFileText}
        title="Devis & proformas"
        description="Factures proforma par projet : évaluation des surfaces, traitement, main d'œuvre, accessoires."
        actions={
          acc.write && (
            <Button onClick={() => openEdit()}>
              <LuPlus /> Nouvelle proforma
            </Button>
          )
        }
      />
      <StatGrid>
        <StatCard index={0} label="Montant total des devis" value={formatMoney(kpis.total, { compact: true })} icon={LuFileText} hint={`${formatNumber(data.length)} devis`} />
        <StatCard index={1} label="En attente de réponse" value={formatMoney(kpis.pendingAmount, { compact: true })} icon={LuHourglass} tone="orange" hint={`${kpis.pendingCount} devis envoyés`} />
        <StatCard index={2} label="Devis acceptés" value={formatMoney(kpis.acceptedAmount, { compact: true })} icon={LuCircleCheck} tone="green" />
        <StatCard index={3} label="Taux d'acceptation" value={formatPercent(kpis.rate)} icon={LuFileCheck} tone="blue" hint="sur devis clôturés" />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(q) => q.id}
            onRowClick={setViewing}
            selectable={acc.write}
            defaultSort={{ id: "date", desc: true }}
            exportOptions={{
              filename: "devis",
              title: "Liste des devis",
              subtitle: filters.describe(),
              summary: [
                { label: "Total devis", value: formatMoney(kpis.total) },
                { label: "Acceptés", value: formatMoney(kpis.acceptedAmount) },
                { label: "En attente", value: formatMoney(kpis.pendingAmount) },
                { label: "Taux d'acceptation", value: formatPercent(kpis.rate) },
              ],
            }}
            bulkActions={(sel, clear) => (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    sel.filter((q) => q.status === "brouillon").forEach((q) => update("quotes", q.id, { status: "envoye" }))
                    toast.success("Devis marqués comme envoyés")
                    clear()
                  }}
                >
                  <LuSend /> Marquer envoyés
                </Button>
                {acc.global && (
                  <Button variant="destructive" size="sm" onClick={() => setToDelete(sel.map((q) => q.id))}>
                    <LuTrash2 /> Supprimer
                  </Button>
                )}
              </>
            )}
            rowActions={(q) => (
              <RowActions
                actions={[
                  { label: "Voir", icon: LuEye, onSelect: () => setViewing(q) },
                  { label: "Modifier", icon: LuPencil, onSelect: () => openEdit(q), hidden: !!q.invoiceId || !acc.write },
                  { label: "Télécharger PDF", icon: LuFileDown, onSelect: () => downloadPdf(q) },
                  { label: "Marquer envoyé", icon: LuSend, onSelect: () => update("quotes", q.id, { status: "envoye" }), hidden: q.status !== "brouillon" || !acc.write },
                  { label: "Transformer en facture", icon: LuReceipt, onSelect: () => toInvoice(q), hidden: !!q.invoiceId || q.status === "refuse" || !acc.write },
                  { label: "Programmer une relance", icon: LuSend, onSelect: () => setFollowPreset({ targetType: "devis", targetId: q.id, subject: `Relance devis ${q.number}` }), hidden: !canFollowup || (q.status !== "envoye" && q.status !== "brouillon") },
                  { label: "Dupliquer", icon: LuCopy, onSelect: () => duplicate(q), hidden: !acc.write },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([q.id]), hidden: !acc.global || !acc.write },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>

      <QuoteFormDialog open={formOpen} onOpenChange={setFormOpen} quote={editing} />
      <FollowupFormDialog open={!!followPreset} onOpenChange={(o) => !o && setFollowPreset(null)} preset={followPreset ?? undefined} />

      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.number}
        description={viewing ? clientName(viewing.clientId) : undefined}
        badge={viewing && <StatusBadge def={quoteStatus[viewing.status]} />}
        wide
        footer={
          viewing && (
            <>
              <Button variant="outline" onClick={() => downloadPdf(viewing)}>
                <LuFileDown /> PDF
              </Button>
              {!viewing.invoiceId && viewing.status !== "refuse" && acc.write && (
                <Button onClick={() => toInvoice(viewing)}>
                  <LuReceipt /> Transformer en facture
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
                  { label: "Date", value: formatDate(viewing.date) },
                  { label: "Valable jusqu'au", value: formatDate(viewing.validUntil) },
                  { label: "Commercial", value: employeeName(viewing.ownerId) },
                  { label: "Facture liée", value: viewing.invoiceId ? useStore.getState().invoices.find((i) => i.id === viewing.invoiceId)?.number : "—" },
                  ...(viewing.notes ? [{ label: "Notes", value: viewing.notes, full: true }] : []),
                ]}
              />
            </DetailSection>
            <DetailSection title="Proforma">
              <ProformaView doc={toProformaDocument(viewing, clientById.get(viewing.clientId), productById)} />
            </DetailSection>
          </div>
        )}
      </DetailSheet>

      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer ${toDelete?.length ?? 0} devis ?`}
        description="Cette action est irréversible."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("quotes", toDelete)
          toast.success("Devis supprimé(s)")
          setToDelete(null)
          setViewing(null)
        }}
      />
    </Page>
  )
}
