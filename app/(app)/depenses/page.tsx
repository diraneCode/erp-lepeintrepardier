"use client"

import * as React from "react"
import { toast } from "sonner"
import { LuBanknote, LuCircleCheck, LuCircleX, LuFileWarning, LuHourglass, LuPencil, LuPlus, LuTrash2, LuWallet } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChartCard } from "@/components/shared/chart-card"
import { DonutChart, OTHER_COLOR, SERIES_COLORS, TimeBarChart, bucketByPeriod, topWithOther } from "@/components/shared/charts"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { ExpenseFormDialog } from "@/components/modules/finance/expense-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { pctChange } from "@/lib/calc"
import { inRange, previousRange } from "@/lib/date-range"
import { formatDate, formatMoney, formatNumber } from "@/lib/format"
import { expenseCategory, expenseStatus, paymentMethod, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Expense, ExpenseCategory } from "@/lib/types"

export default function ExpensesPage() {
  const { expenses } = useScopedData()
  const allExpenses = useStore((s) => s.expenses)
  const acc = useModuleAccess("depenses")
  const canApprove = acc.global && acc.write
  const remove = useStore((s) => s.remove)
  const setStatus = useStore((s) => s.setExpenseStatus)
  const { locationName, employeeName, locationOptions, employeeOptions } = useLookups()
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Expense | undefined>(undefined)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)

  const suppliers = React.useMemo(() => [...new Set(expenses.map((e) => e.supplier))].sort().map((s) => ({ value: s, label: s })), [expenses])

  const submitters = React.useMemo(() => new Set(expenses.map((e) => e.submittedBy)), [expenses])
  const config = React.useMemo<FilterConfig<Expense>>(
    () => ({
      search: { placeholder: "N°, objet, fournisseur…", fields: (e) => [e.number, e.description, e.supplier] },
      date: { label: "Date de dépense", accessor: (e) => e.date, defaultPreset: "year" },
      facets: [
        { id: "category", label: "Catégorie", options: toOptions(expenseCategory), accessor: (e) => e.category },
        { id: "status", label: "Statut", options: toOptions(expenseStatus), accessor: (e) => e.status },
        ...(acc.global ? [{ id: "location", label: "Site", options: locationOptions, accessor: (e: Expense) => e.locationId }] : []),
        { id: "supplier", label: "Fournisseur", options: suppliers, accessor: (e) => e.supplier },
        { id: "payment", label: "Paiement", options: toOptions(paymentMethod).filter((o) => o.value !== "credit"), accessor: (e) => e.paymentMethod },
        ...(acc.scope !== "own" ? [{ id: "submittedBy", label: "Demandeur", options: employeeOptions.filter((o) => acc.global || submitters.has(o.value)), accessor: (e: Expense) => e.submittedBy }] : []),
        { id: "receipt", label: "Justificatif", options: [{ value: "oui", label: "Fourni" }, { value: "non", label: "Manquant" }], accessor: (e) => (e.hasReceipt ? "oui" : "non") },
      ],
      ranges: [{ id: "amount", label: "Montant", unit: "FCFA", accessor: (e) => e.amount }],
    }),
    [locationOptions, employeeOptions, suppliers, acc.global, acc.scope, submitters]
  )
  const filters = useFilters(expenses, config)
  const data = filters.filtered
  const counted = data.filter((e) => e.status !== "rejetee")

  const k = React.useMemo(() => {
    const total = counted.reduce((s, e) => s + e.amount, 0)
    const pending = data.filter((e) => e.status === "en_attente")
    const toPay = data.filter((e) => e.status === "approuvee")
    const prev = previousRange(filters.state.date ?? {})
    const prevTotal = prev ? (acc.global ? allExpenses : expenses).filter((e) => e.status !== "rejetee" && inRange(e.date, prev)).reduce((s, e) => s + e.amount, 0) : undefined
    return {
      total,
      pending: pending.reduce((s, e) => s + e.amount, 0),
      pendingCount: pending.length,
      toPay: toPay.reduce((s, e) => s + e.amount, 0),
      toPayCount: toPay.length,
      missing: data.filter((e) => !e.hasReceipt && e.status !== "rejetee").length,
      delta: prevTotal !== undefined ? pctChange(total, prevTotal) : undefined,
    }
  }, [counted, data, expenses, allExpenses, acc.global, filters.state.date])

  const byCategory = React.useMemo(() => {
    const m = new Map<ExpenseCategory, number>()
    counted.forEach((e) => m.set(e.category, (m.get(e.category) ?? 0) + e.amount))
    return topWithOther([...m].map(([c, value]) => ({ name: expenseCategory[c], value })))
  }, [counted])

  const trend = React.useMemo(() => {
    const top = byCategory.filter((c) => c.name !== "Autres").map((c) => c.name)
    const fns: Record<string, (e: Expense) => number> = {}
    top.forEach((name, i) => (fns[`c${i}`] = (e) => (expenseCategory[e.category] === name ? e.amount : 0)))
    fns.other = (e) => (top.includes(expenseCategory[e.category]) ? 0 : e.amount)
    const series = [...top.map((name, i) => ({ key: `c${i}`, label: name, color: SERIES_COLORS[i] })), { key: "other", label: "Autres", color: OTHER_COLOR }]
    return { ...bucketByPeriod(counted, (e) => e.date, fns, filters.state.date), series }
  }, [counted, byCategory, filters.state.date])

  const openEdit = (e?: Expense) => {
    setEditing(e)
    setFormOpen(true)
  }
  const changeStatus = (ids: string[], status: Expense["status"]) => {
    setStatus(ids, status)
    toast.success(`${ids.length} dépense(s) → ${expenseStatus[status].label}`, status === "payee" ? { description: "Écritures comptables générées" } : undefined)
  }

  const columns: Column<Expense>[] = [
    { id: "number", header: "N°", accessor: (e) => e.number, cell: (e) => <span className="font-medium">{e.number}</span> },
    { id: "date", header: "Date", accessor: (e) => e.date, cell: (e) => formatDate(e.date), exportType: "date" },
    { id: "description", header: "Objet", accessor: (e) => e.description, cell: (e) => <div className="min-w-0"><div className="truncate">{e.description}</div><div className="truncate text-xs text-muted-foreground">{e.supplier}</div></div>, className: "min-w-[200px] max-w-[280px]" },
    { id: "supplier", header: "Fournisseur", accessor: (e) => e.supplier, defaultHidden: true },
    { id: "category", header: "Catégorie", accessor: (e) => expenseCategory[e.category], hideOnMobile: true },
    { id: "location", header: "Site", accessor: (e) => locationName(e.locationId), hideOnMobile: true, defaultHidden: true },
    { id: "submittedBy", header: "Demandeur", accessor: (e) => employeeName(e.submittedBy), hideOnMobile: true },
    { id: "payment", header: "Paiement", accessor: (e) => paymentMethod[e.paymentMethod], hideOnMobile: true, defaultHidden: true },
    { id: "receipt", header: "Justif.", accessor: (e) => (e.hasReceipt ? "Oui" : "Non"), cell: (e) => (e.hasReceipt ? <LuCircleCheck className="size-4 text-success" aria-label="Fourni" /> : <LuFileWarning className="size-4 text-warning" aria-label="Manquant" />), align: "center", hideOnMobile: true },
    { id: "amount", header: "Montant", accessor: (e) => e.amount, cell: (e) => <span className="font-medium">{formatMoney(e.amount)}</span>, align: "right", exportType: "money", footer: (r) => formatMoney(r.reduce((s, e) => s + e.amount, 0)) },
    { id: "status", header: "Statut", accessor: (e) => expenseStatus[e.status].label, cell: (e) => <StatusBadge def={expenseStatus[e.status]} /> },
  ]

  return (
    <Page>
      <UrlActions onNew={() => openEdit()} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuWallet}
        title={acc.global ? "Dépenses" : "Mes notes de frais"}
        description={acc.global ? "Saisie, approbation et paiement des charges de l'entreprise." : "Soumettez vos dépenses et suivez leur validation."}
        actions={
          <Button onClick={() => openEdit()}>
            <LuPlus /> Nouvelle dépense
          </Button>
        }
      />
      <Card>
        <CardContent>
          <FilterBar filters={filters} />
        </CardContent>
      </Card>
      <StatGrid>
        <StatCard index={0} label="Total des dépenses" value={formatMoney(k.total, { compact: true })} icon={LuWallet} delta={k.delta} invertDelta hint="hors rejets" />
        <StatCard index={1} label={canApprove ? "À approuver" : "En attente de validation"} value={formatMoney(k.pending, { compact: true })} icon={LuHourglass} tone="orange" hint={`${k.pendingCount} demande(s)`} />
        <StatCard index={2} label="Approuvées à payer" value={formatMoney(k.toPay, { compact: true })} icon={LuBanknote} tone="blue" hint={`${k.toPayCount} dépense(s)`} />
        <StatCard index={3} label="Justificatifs manquants" value={formatNumber(k.missing)} icon={LuFileWarning} tone="red" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <ChartCard title="Évolution des dépenses" description={`Par ${trend.granularity} et catégorie`} className="xl:col-span-2">
          <TimeBarChart data={trend.data} series={trend.series} stacked />
        </ChartCard>
        <ChartCard title="Répartition par catégorie">
          <DonutChart data={byCategory} centerValue={formatMoney(k.total, { compact: true })} centerLabel="total" />
        </ChartCard>
      </div>
      <Card>
        <CardContent>
          <DataTable
            data={data}
            columns={columns}
            getRowId={(e) => e.id}
            onRowClick={(e) => e.status === "en_attente" && acc.write && openEdit(e)}
            selectable={canApprove}
            defaultSort={{ id: "date", desc: true }}
            exportOptions={{
              filename: "depenses",
              title: "Registre des dépenses",
              subtitle: filters.describe(),
              summary: [
                { label: "Total", value: formatMoney(k.total) },
                { label: "À approuver", value: formatMoney(k.pending) },
                { label: "À payer", value: formatMoney(k.toPay) },
                { label: "Justificatifs manquants", value: formatNumber(k.missing) },
              ],
            }}
            bulkActions={(sel, clear) => (
              <>
                <Button variant="outline" size="sm" onClick={() => { changeStatus(sel.filter((e) => e.status === "en_attente").map((e) => e.id), "approuvee"); clear() }}>
                  <LuCircleCheck /> Approuver
                </Button>
                <Button variant="outline" size="sm" onClick={() => { changeStatus(sel.filter((e) => e.status === "approuvee").map((e) => e.id), "payee"); clear() }}>
                  <LuBanknote /> Marquer payées
                </Button>
                <Button variant="destructive" size="sm" onClick={() => { changeStatus(sel.filter((e) => e.status === "en_attente").map((e) => e.id), "rejetee"); clear() }}>
                  <LuCircleX /> Rejeter
                </Button>
              </>
            )}
            rowActions={(e) => (
              <RowActions
                actions={[
                  { label: "Modifier", icon: LuPencil, onSelect: () => openEdit(e), hidden: e.status !== "en_attente" || !acc.write },
                  { label: "Approuver", icon: LuCircleCheck, onSelect: () => changeStatus([e.id], "approuvee"), hidden: e.status !== "en_attente" || !canApprove },
                  { label: "Rejeter", icon: LuCircleX, onSelect: () => changeStatus([e.id], "rejetee"), hidden: e.status !== "en_attente" || !canApprove },
                  { label: "Marquer payée", icon: LuBanknote, onSelect: () => changeStatus([e.id], "payee"), hidden: e.status !== "approuvee" || !canApprove },
                  { label: e.status === "en_attente" && !canApprove ? "Retirer la demande" : "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([e.id]), hidden: e.status === "payee" || (!canApprove && e.status !== "en_attente") },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>
      <ExpenseFormDialog open={formOpen} onOpenChange={setFormOpen} expense={editing} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette dépense ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("expenses", toDelete)
          toast.success("Dépense supprimée")
          setToDelete(null)
        }}
      />
    </Page>
  )
}
