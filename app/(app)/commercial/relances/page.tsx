"use client"

import * as React from "react"
import { toast } from "sonner"
import { addDays, format } from "date-fns"
import { LuBellRing, LuCalendarClock, LuCheck, LuCircleAlert, LuListChecks, LuPencil, LuPlus, LuRefreshCw, LuTrash2, LuX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { CompleteFollowupDialog, FollowupFormDialog } from "@/components/modules/prospects/followup-forms"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { invoiceBalance } from "@/lib/calc"
import { formatDate, formatMoney, formatNumber, relativeDays, toISODate } from "@/lib/format"
import { followupChannel, followupStatus, followupTarget, priorityLabel, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Followup } from "@/lib/types"
import { cn } from "@/lib/utils"

type Row = Followup & { targetLabel: string; targetSub: string; amount: number; overdue: boolean }
type View = "ouvertes" | "retard" | "aujourdhui" | "toutes"

export default function FollowupsPage() {
  const { followups } = useScopedData(["followups"])
  const prospects = useStore((s) => s.prospects)
  const quotes = useStore((s) => s.quotes)
  const invoices = useStore((s) => s.invoices)
  const update = useStore((s) => s.update)
  const updateMany = useStore((s) => s.updateMany)
  const remove = useStore((s) => s.remove)
  const generate = useStore((s) => s.generateFollowups)
  const acc = useModuleAccess("relances")
  const { clientName, clientById, employeeName, employeeOptions } = useLookups(["clientName", "clientById", "employeeName", "employeeOptions"])

  const [view, setView] = React.useState<View>("ouvertes")
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Followup | undefined>(undefined)
  const [completing, setCompleting] = useTransientState<Followup | null>(null)
  const [toDelete, setToDelete] = useTransientState<string[] | null>(null)

  const today = toISODate(new Date())
  const rows = React.useMemo<Row[]>(() => {
    const pById = new Map(prospects.map((p) => [p.id, p]))
    const qById = new Map(quotes.map((q) => [q.id, q]))
    const iById = new Map(invoices.map((i) => [i.id, i]))
    return followups.map((f) => {
      let targetLabel = "—"
      let targetSub = followupTarget[f.targetType]
      let amount = 0
      if (f.targetType === "prospect") {
        const p = pById.get(f.targetId)
        targetLabel = p?.name ?? "Prospect supprimé"
        targetSub = `Prospect · ${p?.phone ?? ""}`
        amount = p?.potential ?? 0
      } else if (f.targetType === "client") {
        const c = clientById.get(f.targetId)
        targetLabel = c?.name ?? "Client supprimé"
        targetSub = `Client · ${c?.phone ?? ""}`
      } else if (f.targetType === "devis") {
        const q = qById.get(f.targetId)
        targetLabel = clientName(q?.clientId)
        targetSub = `Devis ${q?.number ?? ""}`
        amount = q ? q.items.reduce((s, i) => s + i.quantity * i.unitPrice * (1 - i.discount / 100) * (1 + i.taxRate / 100), 0) : 0
      } else {
        const i = iById.get(f.targetId)
        targetLabel = clientName(i?.clientId)
        targetSub = `Facture ${i?.number ?? ""} · échue le ${formatDate(i?.dueDate)}`
        amount = i ? invoiceBalance(i) : 0
      }
      const open = f.status === "a_faire" || f.status === "reporte"
      return { ...f, targetLabel, targetSub, amount: Math.round(amount), overdue: open && f.dueDate < today }
    })
  }, [followups, prospects, quotes, invoices, clientById, clientName, today])

  const viewRows = React.useMemo(() => {
    const open = (r: Row) => r.status === "a_faire" || r.status === "reporte"
    if (view === "ouvertes") return rows.filter(open)
    if (view === "retard") return rows.filter((r) => r.overdue)
    if (view === "aujourdhui") return rows.filter((r) => open(r) && r.dueDate === today)
    return rows
  }, [rows, view, today])

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Objet, client, prospect, n° de pièce…", fields: (r) => [r.subject, r.targetLabel, r.targetSub, r.notes, r.outcome] },
      date: { label: "Date prévue", accessor: (r) => r.dueDate },
      facets: [
        { id: "type", label: "Type", options: toOptions(followupTarget), accessor: (r) => r.targetType },
        { id: "status", label: "Statut", options: toOptions(followupStatus), accessor: (r) => r.status },
        { id: "channel", label: "Canal", options: toOptions(followupChannel), accessor: (r) => r.channel },
        { id: "priority", label: "Priorité", options: toOptions(priorityLabel), accessor: (r) => r.priority },
        ...(acc.global ? [{ id: "owner", label: "Responsable", options: employeeOptions, accessor: (r: Row) => r.ownerId }] : []),
      ],
      ranges: [{ id: "amount", label: "Montant en jeu", unit: "FCFA", accessor: (r) => r.amount }],
    }),
    [employeeOptions, acc.global]
  )
  const filters = useFilters(viewRows, config)
  const data = filters.filtered

  const k = React.useMemo(() => {
    const open = rows.filter((r) => r.status === "a_faire" || r.status === "reporte")
    const weekEnd = toISODate(addDays(new Date(), 7))
    return {
      overdue: open.filter((r) => r.overdue).length,
      today: open.filter((r) => r.dueDate === today).length,
      week: open.filter((r) => r.dueDate > today && r.dueDate <= weekEnd).length,
      unpaid: open.filter((r) => r.targetType === "facture").reduce((s, r) => s + r.amount, 0),
      done: rows.filter((r) => r.status === "fait" && (r.doneAt ?? "") >= toISODate(addDays(new Date(), -30))).length,
    }
  }, [rows, today])

  const postpone = async (ids: string[], days: number) => {
    if (!(await updateMany("followups", ids, { status: "reporte", dueDate: format(addDays(new Date(), days), "yyyy-MM-dd") }))) return
    toast.success(`${ids.length} relance(s) reportée(s) de ${days} jour(s)`)
  }

  const columns: Column<Row>[] = [
    {
      id: "dueDate",
      header: "Échéance",
      accessor: (r) => r.dueDate,
      cell: (r) => (
        <div className="flex flex-col">
          <span className={cn(r.overdue && "font-medium text-destructive")}>{formatDate(r.dueDate)}</span>
          {(r.status === "a_faire" || r.status === "reporte") && <span className="text-xs text-muted-foreground">{relativeDays(r.dueDate)}</span>}
        </div>
      ),
      exportType: "date",
    },
    { id: "subject", header: "Objet", accessor: (r) => r.subject, cell: (r) => <div className="min-w-0"><div className="truncate font-medium">{r.subject}</div><div className="truncate text-xs text-muted-foreground">{r.targetSub}</div></div>, className: "min-w-[220px] max-w-[300px]" },
    { id: "target", header: "Client / prospect", accessor: (r) => r.targetLabel, className: "max-w-[200px] truncate", hideOnMobile: true },
    { id: "type", header: "Type", accessor: (r) => followupTarget[r.targetType], hideOnMobile: true, defaultHidden: true },
    { id: "amount", header: "En jeu", accessor: (r) => r.amount, cell: (r) => (r.amount ? formatMoney(r.amount, { compact: true }) : "—"), align: "right", exportType: "money", hideOnMobile: true, footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.amount, 0), { compact: true }) },
    { id: "channel", header: "Canal", accessor: (r) => followupChannel[r.channel], hideOnMobile: true },
    { id: "priority", header: "Priorité", accessor: (r) => priorityLabel[r.priority].label, cell: (r) => <StatusBadge def={priorityLabel[r.priority]} />, hideOnMobile: true },
    { id: "owner", header: "Responsable", accessor: (r) => employeeName(r.ownerId), hideOnMobile: true, defaultHidden: !acc.global },
    { id: "status", header: "Statut", accessor: (r) => followupStatus[r.status].label, cell: (r) => <StatusBadge def={followupStatus[r.status]} /> },
    { id: "outcome", header: "Résultat", accessor: (r) => r.outcome ?? "", defaultHidden: true, className: "max-w-[240px] truncate" },
  ]

  return (
    <Page>
      <UrlActions onNew={() => acc.write && (setEditing(undefined), setFormOpen(true))} onQuery={filters.setSearch} />
      <PageHeader
        icon={LuBellRing}
        title={acc.global ? "Relances" : "Mes relances"}
        description="Relances de devis, de factures impayées, de prospects et de clients."
        actions={
          acc.write && (
            <>
              <Button
                variant="outline"
                onClick={async () => {
                  const n = await generate()
                  if (n < 0) return
                  toast[n ? "success" : "info"](n ? `${n} relance(s) créée(s)` : "Aucune nouvelle relance à créer", { description: "Factures échues et devis envoyés depuis plus de 7 jours" })
                }}
              >
                <LuRefreshCw /> Générer les relances
              </Button>
              <Button onClick={() => { setEditing(undefined); setFormOpen(true) }}>
                <LuPlus /> Nouvelle relance
              </Button>
            </>
          )
        }
      />
      <StatGrid>
        <StatCard index={0} label="En retard" value={formatNumber(k.overdue)} icon={LuCircleAlert} tone="red" onClick={() => setView("retard")} />
        <StatCard index={1} label="Aujourd'hui" value={formatNumber(k.today)} icon={LuCalendarClock} tone="orange" hint={`${k.week} dans les 7 jours`} onClick={() => setView("aujourdhui")} />
        <StatCard index={2} label="Impayés à relancer" value={formatMoney(k.unpaid, { compact: true })} icon={LuBellRing} tone="blue" />
        <StatCard index={3} label="Effectuées (30 j)" value={formatNumber(k.done)} icon={LuListChecks} tone="green" />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <Tabs value={view} onValueChange={(v) => setView(v as View)}>
            <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
              <TabsTrigger value="ouvertes">À traiter</TabsTrigger>
              <TabsTrigger value="retard">En retard</TabsTrigger>
              <TabsTrigger value="aujourdhui">Aujourd&apos;hui</TabsTrigger>
              <TabsTrigger value="toutes">Toutes</TabsTrigger>
            </TabsList>
          </Tabs>
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={(r) => acc.write && (r.status === "a_faire" || r.status === "reporte") && setCompleting(r)}
            selectable={acc.write}
            defaultSort={{ id: "dueDate" }}
            rowClassName={(r) => (r.overdue ? "bg-destructive/[0.03]" : undefined)}
            emptyDescription="Aucune relance pour ces critères."
            exportOptions={{
              filename: "relances",
              title: "Plan de relances",
              subtitle: filters.describe(),
              summary: [
                { label: "En retard", value: formatNumber(k.overdue) },
                { label: "Aujourd'hui", value: formatNumber(k.today) },
                { label: "Impayés à relancer", value: formatMoney(k.unpaid) },
              ],
            }}
            bulkActions={(sel, clear) => {
              const open = sel.filter((r) => r.status === "a_faire" || r.status === "reporte").map((r) => r.id)
              return (
                <>
                  <Button variant="outline" size="sm" onClick={() => { postpone(open, 3); clear() }}>
                    Reporter de 3 j
                  </Button>
                  <Button variant="outline" size="sm" onClick={async () => { if (!(await updateMany("followups", open, { status: "annule" }))) return; toast.success("Relances annulées"); clear() }}>
                    <LuX /> Annuler
                  </Button>
                </>
              )
            }}
            rowActions={(r) => {
              const open = r.status === "a_faire" || r.status === "reporte"
              return (
                <RowActions
                  actions={[
                    { label: "Marquer effectuée", icon: LuCheck, onSelect: () => setCompleting(r), hidden: !acc.write || !open },
                    { label: "Reporter à demain", icon: LuCalendarClock, onSelect: () => postpone([r.id], 1), hidden: !acc.write || !open },
                    { label: "Reporter d'une semaine", icon: LuCalendarClock, onSelect: () => postpone([r.id], 7), hidden: !acc.write || !open },
                    { label: "Modifier", icon: LuPencil, onSelect: () => { setEditing(r); setFormOpen(true) }, hidden: !acc.write || !open },
                    { label: "Annuler la relance", icon: LuX, onSelect: () => update("followups", r.id, { status: "annule" }), hidden: !acc.write || !open },
                    { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete([r.id]), hidden: !acc.global || !acc.write },
                  ]}
                />
              )
            }}
          />
        </CardContent>
      </Card>
      <FollowupFormDialog open={formOpen} onOpenChange={setFormOpen} followup={editing} />
      <CompleteFollowupDialog followup={completing} onOpenChange={(o) => !o && setCompleting(null)} />
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer cette relance ?"
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) {
            if (!(await remove("followups", toDelete))) return
          }
          toast.success("Relance supprimée")
          setToDelete(null)
        }}
      />
    </Page>
  )
}
