"use client"

import * as React from "react"
import { toast } from "sonner"
import { LuCalendarCheck, LuCalendarDays, LuHourglass, LuPencil, LuPlane, LuPlus, LuX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { LeaveFormDialog } from "@/components/modules/hr/leave-form"
import { useCurrentUser } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { ANNUAL_LEAVE_DAYS } from "@/lib/calc"
import { formatDate, formatNumber, toISODate } from "@/lib/format"
import { leaveStatus, leaveType, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Leave } from "@/lib/types"

export default function MyLeavesPage() {
  const user = useCurrentUser()
  const leaves = useStore((s) => s.leaves)
  const update = useStore((s) => s.update)
  const log = useStore((s) => s.log)
  const { employeeName } = useLookups()
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Leave | undefined>(undefined)
  const [toCancel, setToCancel] = useTransientState<Leave | null>(null)

  const mine = React.useMemo(() => leaves.filter((l) => l.employeeId === user?.id), [leaves, user])
  const year = new Date().getFullYear().toString()
  const today = toISODate(new Date())

  const balance = React.useMemo(() => {
    const annual = mine.filter((l) => l.type === "annuel" && l.startDate.startsWith(year))
    const taken = annual.filter((l) => l.status === "approuve").reduce((s, l) => s + l.days, 0)
    const pending = annual.filter((l) => l.status === "en_attente").reduce((s, l) => s + l.days, 0)
    return { taken, pending, remaining: Math.max(0, ANNUAL_LEAVE_DAYS - taken - pending), next: mine.filter((l) => l.status === "approuve" && l.startDate >= today).sort((a, b) => a.startDate.localeCompare(b.startDate))[0] }
  }, [mine, year, today])

  const config = React.useMemo<FilterConfig<Leave>>(
    () => ({
      search: { placeholder: "Motif…", fields: (l) => [l.reason, l.comment] },
      date: { label: "Date de début", accessor: (l) => l.startDate },
      facets: [
        { id: "status", label: "Statut", options: toOptions(leaveStatus), accessor: (l) => l.status },
        { id: "type", label: "Type", options: toOptions(leaveType), accessor: (l) => l.type },
      ],
    }),
    []
  )
  const filters = useFilters(mine, config)

  const openForm = (l?: Leave) => {
    setEditing(l)
    setFormOpen(true)
  }

  const columns: Column<Leave>[] = [
    { id: "type", header: "Type", accessor: (l) => leaveType[l.type] },
    { id: "start", header: "Du", accessor: (l) => l.startDate, cell: (l) => formatDate(l.startDate), exportType: "date" },
    { id: "end", header: "Au", accessor: (l) => l.endDate, cell: (l) => formatDate(l.endDate), exportType: "date" },
    { id: "days", header: "Jours", accessor: (l) => l.days, align: "right", exportType: "number" },
    { id: "reason", header: "Motif", accessor: (l) => l.reason, hideOnMobile: true, className: "max-w-[220px] truncate" },
    { id: "requestedAt", header: "Demandé le", accessor: (l) => l.requestedAt, cell: (l) => formatDate(l.requestedAt), exportType: "date", hideOnMobile: true },
    { id: "status", header: "Statut", accessor: (l) => leaveStatus[l.status].label, cell: (l) => <StatusBadge def={leaveStatus[l.status]} /> },
    { id: "comment", header: "Réponse", accessor: (l) => (l.comment ? `${l.comment}${l.approverId ? ` — ${employeeName(l.approverId)}` : ""}` : ""), hideOnMobile: true, className: "max-w-[260px] truncate" },
  ]

  if (!user) return null
  return (
    <Page>
      <UrlActions onNew={() => openForm()} />
      <PageHeader
        icon={LuCalendarDays}
        title="Mes congés"
        description="Faites vos demandes et suivez leur validation."
        actions={
          <Button onClick={() => openForm()}>
            <LuPlus /> Demander un congé
          </Button>
        }
      />
      <StatGrid>
        <StatCard index={0} label={`Solde ${year}`} value={`${balance.remaining} j`} icon={LuCalendarCheck} tone="green" hint={`sur ${ANNUAL_LEAVE_DAYS} j acquis`} />
        <StatCard index={1} label="Jours pris" value={`${balance.taken} j`} icon={LuPlane} tone="blue" />
        <StatCard index={2} label="En attente de validation" value={`${balance.pending} j`} icon={LuHourglass} tone="orange" hint={`${mine.filter((l) => l.status === "en_attente").length} demande(s)`} />
        <StatCard index={3} label="Prochain congé" value={balance.next ? formatDate(balance.next.startDate, "d MMM") : "—"} icon={LuCalendarDays} hint={balance.next ? `${balance.next.days} j · ${leaveType[balance.next.type]}` : "aucun congé planifié"} />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-2">
          <div className="flex justify-between text-sm">
            <span className="font-medium">Consommation des congés annuels {year}</span>
            <span className="text-muted-foreground tabular">{balance.taken + balance.pending} / {ANNUAL_LEAVE_DAYS} j</span>
          </div>
          <Progress value={((balance.taken + balance.pending) / ANNUAL_LEAVE_DAYS) * 100} className="h-2" />
          <p className="text-xs text-muted-foreground">1,5 jour ouvrable acquis par mois de service effectif. Les jours en attente sont réservés sur votre solde.</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={filters.filtered}
            columns={columns}
            getRowId={(l) => l.id}
            defaultSort={{ id: "start", desc: true }}
            emptyDescription="Vous n'avez encore fait aucune demande de congé."
            exportOptions={{ filename: "mes-conges", title: `Congés — ${user.firstName} ${user.lastName}`, subtitle: filters.describe() }}
            rowActions={(l) => (
              <RowActions
                actions={[
                  { label: "Modifier", icon: LuPencil, onSelect: () => openForm(l), hidden: l.status !== "en_attente" },
                  { label: "Annuler la demande", icon: LuX, destructive: true, onSelect: () => setToCancel(l), hidden: !(l.status === "en_attente" || (l.status === "approuve" && l.startDate > today)) },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>
      <LeaveFormDialog open={formOpen} onOpenChange={setFormOpen} leave={editing} employeeId={user.id} />
      <ConfirmDialog
        open={!!toCancel}
        onOpenChange={(o) => !o && setToCancel(null)}
        title="Annuler cette demande ?"
        description={toCancel ? `${leaveType[toCancel.type]} du ${formatDate(toCancel.startDate)} au ${formatDate(toCancel.endDate)} (${formatNumber(toCancel.days)} j).` : undefined}
        confirmLabel="Annuler la demande"
        destructive
        onConfirm={() => {
          if (toCancel) {
            update("leaves", toCancel.id, { status: "annule" })
            log("Annulation", "Mes congés", `Demande du ${formatDate(toCancel.startDate)}`)
          }
          toast.success("Demande annulée")
          setToCancel(null)
        }}
      />
    </Page>
  )
}
