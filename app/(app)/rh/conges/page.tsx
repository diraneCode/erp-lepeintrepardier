"use client"

import * as React from "react"
import { toast } from "sonner"
import { addDays, eachDayOfInterval, format, isWeekend } from "date-fns"
import { fr } from "date-fns/locale"
import { LuCalendarCheck, LuCalendarDays, LuCheck, LuHourglass, LuPencil, LuPlane, LuPlus, LuUserX, LuX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Textarea } from "@/components/ui/textarea"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PersonCell } from "@/components/shared/user-avatar"
import { LeaveFormDialog, annualTaken } from "@/components/modules/hr/leave-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { ANNUAL_LEAVE_DAYS } from "@/lib/calc"
import { capitalize, formatDate, formatNumber, toISODate } from "@/lib/format"
import { department, leaveStatus, leaveType, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Leave, LeaveType } from "@/lib/types"
import { cn } from "@/lib/utils"

const typeColor: Record<LeaveType, string> = {
  annuel: "bg-chart-1",
  maladie: "bg-chart-2",
  maternite: "bg-chart-5",
  sans_solde: "bg-muted-foreground",
  exceptionnel: "bg-chart-3",
  recuperation: "bg-chart-4",
}

export default function LeavesPage() {
  const [tab, setTab] = React.useState("demandes")
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Leave | undefined>(undefined)
  const openForm = (l?: Leave) => {
    setEditing(l)
    setFormOpen(true)
  }
  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          icon={LuCalendarDays}
          title="Congés"
          description="Demandes, validation, soldes et planning des absences."
          actions={
            <>
              <TabsList>
                <TabsTrigger value="demandes">Demandes</TabsTrigger>
                <TabsTrigger value="soldes">Soldes</TabsTrigger>
                <TabsTrigger value="planning">Planning</TabsTrigger>
              </TabsList>
              <Button onClick={() => openForm()}>
                <LuPlus /> Nouvelle demande
              </Button>
            </>
          }
        />
        <TabsContent value="demandes">
          <RequestsTab onEdit={openForm} />
        </TabsContent>
        <TabsContent value="soldes">{tab === "soldes" && <BalancesTab />}</TabsContent>
        <TabsContent value="planning">{tab === "planning" && <PlanningTab />}</TabsContent>
      </Tabs>
      <LeaveFormDialog open={formOpen} onOpenChange={setFormOpen} leave={editing} />
    </Page>
  )
}

function RequestsTab({ onEdit }: { onEdit: (l: Leave) => void }) {
  const leaves = useStore((s) => s.leaves)
  const setLeaveStatus = useStore((s) => s.setLeaveStatus)
  const updateMany = useStore((s) => s.updateMany)
  const { employeeName, employeeById, employeeOptions } = useLookups(["employeeName", "employeeById", "employeeOptions"])
  const [deciding, setDeciding] = useTransientState<{ leave: Leave; status: "approuve" | "refuse" } | null>(null)
  const [comment, setComment] = React.useState("")
  const today = toISODate(new Date())

  const config = React.useMemo<FilterConfig<Leave>>(
    () => ({
      search: { placeholder: "Employé, motif…", fields: (l) => [employeeName(l.employeeId), l.reason, l.comment] },
      date: { label: "Date de début", accessor: (l) => l.startDate },
      facets: [
        { id: "status", label: "Statut", options: toOptions(leaveStatus), accessor: (l) => l.status },
        { id: "type", label: "Type", options: toOptions(leaveType), accessor: (l) => l.type },
        { id: "employee", label: "Employé", options: employeeOptions, accessor: (l) => l.employeeId },
        { id: "department", label: "Service", options: toOptions(department), accessor: (l) => employeeById.get(l.employeeId)?.department },
      ],
      ranges: [{ id: "days", label: "Durée", unit: "jours", accessor: (l) => l.days }],
    }),
    [employeeName, employeeById, employeeOptions]
  )
  const filters = useFilters(leaves, config)
  const data = filters.filtered

  const k = {
    pending: leaves.filter((l) => l.status === "en_attente").length,
    away: leaves.filter((l) => l.status === "approuve" && l.startDate <= today && l.endDate >= today).length,
    upcoming: leaves.filter((l) => l.status === "approuve" && l.startDate > today && l.startDate <= toISODate(addDays(new Date(), 30))).length,
    days: data.filter((l) => l.status === "approuve").reduce((s, l) => s + l.days, 0),
  }

  const decide = async () => {
    if (!deciding) return
    if (!(await setLeaveStatus(deciding.leave.id, deciding.status, comment.trim() || undefined))) return
    toast.success(deciding.status === "approuve" ? "Congé approuvé" : "Demande refusée", { description: employeeName(deciding.leave.employeeId) })
    setDeciding(null)
    setComment("")
  }

  const columns: Column<Leave>[] = [
    { id: "employee", header: "Employé", accessor: (l) => employeeName(l.employeeId), cell: (l) => <PersonCell name={employeeName(l.employeeId)} sub={employeeById.get(l.employeeId)?.position} />, className: "min-w-[200px]" },
    { id: "type", header: "Type", accessor: (l) => leaveType[l.type], cell: (l) => <span className="inline-flex items-center gap-2"><span className={cn("size-2 rounded-full", typeColor[l.type])} />{leaveType[l.type]}</span> },
    { id: "start", header: "Du", accessor: (l) => l.startDate, cell: (l) => formatDate(l.startDate), exportType: "date" },
    { id: "end", header: "Au", accessor: (l) => l.endDate, cell: (l) => formatDate(l.endDate), exportType: "date" },
    { id: "days", header: "Jours", accessor: (l) => l.days, align: "right", exportType: "number", footer: (r) => formatNumber(r.reduce((s, l) => s + l.days, 0)) },
    { id: "reason", header: "Motif", accessor: (l) => l.reason, hideOnMobile: true, className: "max-w-[220px] truncate" },
    { id: "requestedAt", header: "Demandé le", accessor: (l) => l.requestedAt, cell: (l) => formatDate(l.requestedAt), exportType: "date", hideOnMobile: true, defaultHidden: true },
    { id: "status", header: "Statut", accessor: (l) => leaveStatus[l.status].label, cell: (l) => <StatusBadge def={leaveStatus[l.status]} /> },
  ]

  return (
    <div className="flex flex-col gap-6">
      <StatGrid>
        <StatCard index={0} label="En attente de validation" value={formatNumber(k.pending)} icon={LuHourglass} tone="orange" />
        <StatCard index={1} label="Absents aujourd'hui" value={formatNumber(k.away)} icon={LuUserX} tone="blue" />
        <StatCard index={2} label="Départs sous 30 jours" value={formatNumber(k.upcoming)} icon={LuPlane} tone="violet" />
        <StatCard index={3} label="Jours accordés (sélection)" value={formatNumber(k.days)} icon={LuCalendarCheck} tone="green" />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(l) => l.id}
            onRowClick={(l) => l.status === "en_attente" && onEdit(l)}
            selectable
            defaultSort={{ id: "start", desc: true }}
            exportOptions={{ filename: "conges", title: "Demandes de congé", subtitle: filters.describe() }}
            bulkActions={(sel, clear) => (
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  const pending = sel.filter((l) => l.status === "en_attente")
                  if (!(await updateMany("leaves", pending.map((l) => l.id), { status: "approuve", approverId: useStore.getState().currentUserId ?? undefined }))) return
                  toast.success(`${pending.length} demande(s) approuvée(s)`)
                  clear()
                }}
              >
                <LuCheck /> Approuver
              </Button>
            )}
            rowActions={(l) => (
              <RowActions
                actions={[
                  { label: "Approuver", icon: LuCheck, onSelect: () => setDeciding({ leave: l, status: "approuve" }), hidden: l.status !== "en_attente" },
                  { label: "Refuser", icon: LuX, onSelect: () => setDeciding({ leave: l, status: "refuse" }), hidden: l.status !== "en_attente" },
                  { label: "Modifier", icon: LuPencil, onSelect: () => onEdit(l), hidden: l.status !== "en_attente" },
                  { label: "Annuler", icon: LuX, destructive: true, separatorBefore: true, onSelect: () => { void setLeaveStatus(l.id, "annule").then((ok) => ok && toast.success("Demande annulée")) }, hidden: l.status === "annule" || l.status === "refuse" || l.endDate < today },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>
      <Dialog open={!!deciding} onOpenChange={(o) => !o && setDeciding(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{deciding?.status === "approuve" ? "Approuver la demande" : "Refuser la demande"}</DialogTitle>
            <DialogDescription>
              {deciding && `${employeeName(deciding.leave.employeeId)} · ${leaveType[deciding.leave.type]} du ${formatDate(deciding.leave.startDate)} au ${formatDate(deciding.leave.endDate)} (${deciding.leave.days} j)`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            <Label htmlFor="comment">Commentaire {deciding?.status === "refuse" && <span className="text-destructive">*</span>}</Label>
            <Textarea id="comment" value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Visible par l'employé" />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeciding(null)}>Annuler</Button>
            <Button variant={deciding?.status === "refuse" ? "destructive" : "default"} disabled={deciding?.status === "refuse" && comment.trim().length < 3} onClick={decide}>
              {deciding?.status === "approuve" ? "Approuver" : "Refuser"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function BalancesTab() {
  const employees = useStore((s) => s.employees)
  const leaves = useStore((s) => s.leaves)
  const { locationName, locationOptions } = useLookups(["locationName", "locationOptions"])
  const year = new Date().getFullYear().toString()

  const rows = React.useMemo(
    () =>
      employees
        .filter((e) => e.status !== "sorti")
        .map((e) => {
          const own = leaves.filter((l) => l.employeeId === e.id && l.startDate.startsWith(year) && l.status === "approuve")
          const taken = own.filter((l) => l.type === "annuel").reduce((s, l) => s + l.days, 0)
          const pending = leaves.filter((l) => l.employeeId === e.id && l.status === "en_attente" && l.type === "annuel").reduce((s, l) => s + l.days, 0)
          return {
            id: e.id,
            name: `${e.firstName} ${e.lastName}`,
            matricule: e.matricule,
            department: e.department,
            locationId: e.locationId,
            taken,
            pending,
            remaining: Math.max(0, ANNUAL_LEAVE_DAYS - annualTaken(leaves, e.id, year)),
            sick: own.filter((l) => l.type === "maladie").reduce((s, l) => s + l.days, 0),
            other: own.filter((l) => l.type !== "annuel" && l.type !== "maladie").reduce((s, l) => s + l.days, 0),
          }
        }),
    [employees, leaves, year]
  )
  type Row = (typeof rows)[number]
  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Employé, matricule…", fields: (r) => [r.name, r.matricule] },
      facets: [
        { id: "department", label: "Service", options: toOptions(department), accessor: (r) => r.department },
        { id: "location", label: "Site", options: locationOptions, accessor: (r) => r.locationId },
      ],
      ranges: [{ id: "remaining", label: "Solde restant", unit: "jours", accessor: (r) => r.remaining }],
    }),
    [locationOptions]
  )
  const filters = useFilters(rows, config)

  const columns: Column<Row>[] = [
    { id: "name", header: "Employé", accessor: (r) => r.name, cell: (r) => <PersonCell name={r.name} sub={r.matricule} />, className: "min-w-[200px]" },
    { id: "department", header: "Service", accessor: (r) => department[r.department], hideOnMobile: true },
    { id: "location", header: "Site", accessor: (r) => locationName(r.locationId), hideOnMobile: true, defaultHidden: true },
    {
      id: "taken",
      header: `Congés annuels ${year}`,
      accessor: (r) => r.taken,
      cell: (r) => (
        <div className="flex min-w-40 flex-col gap-1">
          <div className="flex justify-between text-xs"><span>{r.taken} j pris</span><span className="text-muted-foreground">{ANNUAL_LEAVE_DAYS} j</span></div>
          <Progress value={(r.taken / ANNUAL_LEAVE_DAYS) * 100} className="h-1.5" />
        </div>
      ),
      exportType: "number",
    },
    { id: "pending", header: "En attente", accessor: (r) => r.pending, align: "right", exportType: "number" },
    { id: "remaining", header: "Solde", accessor: (r) => r.remaining, cell: (r) => <span className={cn("font-semibold", r.remaining <= 3 && "text-warning")}>{r.remaining} j</span>, align: "right", exportType: "number" },
    { id: "sick", header: "Maladie", accessor: (r) => r.sick, align: "right", exportType: "number", hideOnMobile: true },
    { id: "other", header: "Autres", accessor: (r) => r.other, align: "right", exportType: "number", hideOnMobile: true },
  ]

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <FilterBar filters={filters} />
        <p className="text-xs text-muted-foreground">Base légale : {ANNUAL_LEAVE_DAYS} jours ouvrables par an (1,5 j par mois de service effectif).</p>
        <DataTable data={filters.filtered} columns={columns} getRowId={(r) => r.id} defaultSort={{ id: "remaining" }} exportOptions={{ filename: `soldes-conges-${year}`, title: `Soldes de congés ${year}`, subtitle: filters.describe() }} />
      </CardContent>
    </Card>
  )
}

function PlanningTab() {
  const leaves = useStore((s) => s.leaves)
  const { employeeName } = useLookups(["employeeName"])
  const start = new Date()
  const days = eachDayOfInterval({ start, end: addDays(start, 44) })
  const from = toISODate(days[0])
  const to = toISODate(days[days.length - 1])
  const items = leaves
    .filter((l) => (l.status === "approuve" || l.status === "en_attente") && l.startDate <= to && l.endDate >= from)
    .sort((a, b) => a.startDate.localeCompare(b.startDate))

  return (
    <Card>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">45 prochains jours</span>
          {(Object.keys(typeColor) as LeaveType[]).map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5"><span className={cn("size-2.5 rounded-[3px]", typeColor[t])} />{leaveType[t]}</span>
          ))}
          <span className="inline-flex items-center gap-1.5"><span className="size-2.5 rounded-[3px] border border-dashed border-muted-foreground" />En attente</span>
        </div>
        <div className="overflow-x-auto rounded-lg border scrollbar-thin">
          <div className="min-w-[900px]">
            <div className="grid border-b bg-muted/50 text-[10px] text-muted-foreground" style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(0, 1fr))` }}>
              <div className="px-3 py-2 text-xs font-medium">Employé</div>
              {days.map((d) => (
                <div key={d.toISOString()} className={cn("py-1 text-center", isWeekend(d) && "bg-muted")}>
                  <div>{format(d, "EEEEE", { locale: fr })}</div>
                  <div className="font-medium">{format(d, "d")}</div>
                </div>
              ))}
            </div>
            {items.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucune absence planifiée.</p>}
            {items.map((l) => {
              const s = Math.max(0, days.findIndex((d) => toISODate(d) >= l.startDate))
              const eIdx = days.findIndex((d) => toISODate(d) > l.endDate)
              const e = eIdx === -1 ? days.length : eIdx
              return (
                <div key={l.id} className="grid items-center border-b last:border-0" style={{ gridTemplateColumns: `200px repeat(${days.length}, minmax(0, 1fr))` }}>
                  <div className="truncate px-3 py-2 text-sm">{employeeName(l.employeeId)}</div>
                  <div
                    className={cn("my-1.5 flex h-6 items-center truncate rounded-md px-2 text-[11px] font-medium text-white", typeColor[l.type], l.status === "en_attente" && "border-2 border-dashed border-foreground/40 opacity-70")}
                    style={{ gridColumn: `${s + 2} / ${e + 2}` }}
                    title={`${leaveType[l.type]} · ${formatDate(l.startDate)} → ${formatDate(l.endDate)}`}
                  >
                    {capitalize(leaveType[l.type])} · {l.days} j
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
