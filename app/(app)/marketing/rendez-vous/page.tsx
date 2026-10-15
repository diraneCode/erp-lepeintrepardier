"use client"

import * as React from "react"
import { toast } from "sonner"
import { addDays, addWeeks, eachDayOfInterval, endOfWeek, format, isSameDay, startOfWeek } from "date-fns"
import { fr } from "date-fns/locale"
import {
  LuCalendarCheck,
  LuCalendarClock,
  LuCalendarPlus,
  LuCalendarX,
  LuCheck,
  LuChevronLeft,
  LuChevronRight,
  LuKanban,
  LuList,
  LuMapPin,
  LuPencil,
  LuPhone,
  LuTrash2,
  LuUserX,
  LuX,
} from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { UrlActions } from "@/components/shared/url-actions"
import { AppointmentFormDialog, type AppointmentPreset } from "@/components/modules/marketing/appointment-form"
import { useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { capitalize, formatDate, formatNumber, formatPercent, toISODate } from "@/lib/format"
import { appointmentStatus, appointmentType, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Appointment } from "@/lib/types"
import { cn } from "@/lib/utils"

type Row = Appointment & { who: string; whoKind: string; end: string }

const statusBar: Record<Appointment["status"], string> = {
  planifie: "border-l-info",
  confirme: "border-l-primary",
  realise: "border-l-success",
  reporte: "border-l-warning",
  annule: "border-l-muted-foreground/40",
  absent: "border-l-destructive",
}

const endTime = (a: Appointment) => {
  const [h, m] = a.startTime.split(":").map(Number)
  const t = h * 60 + m + a.durationMinutes
  return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`
}

export default function AppointmentsPage() {
  const { appointments, clients, prospects } = useScopedData(["appointments", "clients", "prospects"])
  const allProspects = useStore((s) => s.prospects)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const acc = useModuleAccess("rendez_vous")
  const { clientById, employeeName, employeeOptions } = useLookups(["clientById", "employeeName", "employeeOptions"])

  const [view, setView] = React.useState<"agenda" | "liste">("agenda")
  const [weekStart, setWeekStart] = React.useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }))
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Appointment | undefined>(undefined)
  const [preset, setPreset] = useTransientState<AppointmentPreset | undefined>(undefined)
  const [viewingId, setViewingId] = useTransientState<string | null>(null)
  const [toDelete, setToDelete] = useTransientState<string | null>(null)

  const today = toISODate(new Date())
  const rows = React.useMemo<Row[]>(() => {
    const pById = new Map(allProspects.map((p) => [p.id, p]))
    return appointments.map((a) => ({
      ...a,
      who: a.clientId ? clientById.get(a.clientId)?.name ?? a.contactName : a.prospectId ? pById.get(a.prospectId)?.name ?? a.contactName : a.contactName,
      whoKind: a.clientId ? "Client" : a.prospectId ? "Prospect" : "Contact",
      end: endTime(a),
    }))
  }, [appointments, allProspects, clientById])
  const viewing = viewingId ? rows.find((r) => r.id === viewingId) ?? null : null

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Objet, client, contact, lieu…", fields: (r) => [r.title, r.who, r.contactName, r.phone, r.location, r.notes] },
      date: { label: "Date du rendez-vous", accessor: (r) => r.date, filter: view === "liste" },
      facets: [
        { id: "type", label: "Type", options: toOptions(appointmentType), accessor: (r) => r.type },
        { id: "status", label: "Statut", options: toOptions(appointmentStatus), accessor: (r) => r.status },
        { id: "kind", label: "Interlocuteur", options: ["Client", "Prospect", "Contact"].map((v) => ({ value: v, label: v })), accessor: (r) => r.whoKind },
        ...(acc.scope !== "own" ? [{ id: "host", label: "Collaborateur", options: employeeOptions.filter((o) => appointments.some((a) => a.assignedTo === o.value)), accessor: (r: Row) => r.assignedTo }] : []),
      ],
    }),
    [employeeOptions, acc.scope, appointments, view]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const k = React.useMemo(() => {
    const weekEnd = toISODate(addDays(new Date(), 7))
    const upcoming = rows.filter((r) => r.date >= today && (r.status === "planifie" || r.status === "confirme"))
    const past = rows.filter((r) => r.date < today && ["realise", "absent", "annule"].includes(r.status))
    return {
      today: upcoming.filter((r) => r.date === today).length,
      week: upcoming.filter((r) => r.date <= weekEnd).length,
      toConfirm: upcoming.filter((r) => r.status === "planifie").length,
      rate: past.length ? (past.filter((r) => r.status === "realise").length / past.length) * 100 : 0,
      noShow: past.filter((r) => r.status === "absent").length,
    }
  }, [rows, today])

  const setStatus = async (r: Appointment, status: Appointment["status"]) => {
    if (!(await update("appointments", r.id, { status }))) return
    toast.success(`Rendez-vous ${appointmentStatus[status].label.toLowerCase()}`, { description: `${r.title} — ${formatDate(r.date)}` })
  }
  const openNew = (p?: AppointmentPreset) => {
    setEditing(undefined)
    setPreset(p)
    setFormOpen(true)
  }

  const days = eachDayOfInterval({ start: weekStart, end: endOfWeek(weekStart, { weekStartsOn: 1 }) })

  const actionsFor = (r: Row) => [
    { label: "Confirmer", icon: LuCalendarCheck, onSelect: () => setStatus(r, "confirme"), hidden: !acc.write || r.status !== "planifie" },
    { label: "Marquer réalisé", icon: LuCheck, onSelect: () => setStatus(r, "realise"), hidden: !acc.write || !["planifie", "confirme", "reporte"].includes(r.status) },
    { label: "Client absent", icon: LuUserX, onSelect: () => setStatus(r, "absent"), hidden: !acc.write || !["planifie", "confirme"].includes(r.status) || r.date > today },
    { label: "Modifier / reporter", icon: LuPencil, onSelect: () => { setEditing(r); setPreset(undefined); setFormOpen(true) }, hidden: !acc.write },
    { label: "Annuler", icon: LuX, onSelect: () => setStatus(r, "annule"), hidden: !acc.write || ["annule", "realise"].includes(r.status) },
    { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete(r.id), hidden: !acc.write || !acc.global },
  ]

  const columns: Column<Row>[] = [
    { id: "date", header: "Date", accessor: (r) => `${r.date} ${r.startTime}`, cell: (r) => <div><div>{capitalize(formatDate(r.date, "EEE dd/MM/yyyy"))}</div><div className="text-xs text-muted-foreground">{r.startTime}–{r.end}</div></div>, exportValue: (r) => `${formatDate(r.date)} ${r.startTime}` },
    { id: "title", header: "Rendez-vous", accessor: (r) => r.title, cell: (r) => <div className="min-w-0"><div className="truncate font-medium">{r.title}</div><div className="truncate text-xs text-muted-foreground">{appointmentType[r.type]}</div></div>, className: "min-w-[200px] max-w-[260px]" },
    { id: "who", header: "Interlocuteur", accessor: (r) => r.who, cell: (r) => <div className="min-w-0"><div className="truncate">{r.who}</div><div className="truncate text-xs text-muted-foreground">{r.whoKind} · {r.phone}</div></div>, className: "max-w-[220px]" },
    { id: "location", header: "Lieu", accessor: (r) => r.location, hideOnMobile: true, className: "max-w-[200px] truncate" },
    { id: "host", header: "Collaborateur", accessor: (r) => employeeName(r.assignedTo), hideOnMobile: true, defaultHidden: acc.scope === "own" },
    { id: "duration", header: "Durée", accessor: (r) => r.durationMinutes, cell: (r) => `${r.durationMinutes} min`, align: "right", exportType: "number", defaultHidden: true },
    { id: "status", header: "Statut", accessor: (r) => appointmentStatus[r.status].label, cell: (r) => <StatusBadge def={appointmentStatus[r.status]} /> },
  ]

  return (
    <Page>
      <UrlActions
        onNew={() => acc.write && openNew()}
        onQuery={(q) => {
          // Lien depuis une fiche prospect / client : pré-sélectionne l'interlocuteur
          const p = prospects.find((x) => x.name === q)
          const c = clients.find((x) => x.name === q)
          if (acc.write && (p || c)) openNew(p ? { prospectId: p.id } : { clientId: c!.id })
          else filters.setSearch(q)
        }}
      />
      <PageHeader
        icon={LuCalendarClock}
        title={acc.scope === "own" ? "Mes rendez-vous" : "Rendez-vous"}
        description="Prise de rendez-vous clients et prospects : showroom, chantier, conseil couleur, démonstrations."
        actions={
          <>
            <ToggleGroup type="single" variant="outline" value={view} onValueChange={(v) => v && setView(v as "agenda" | "liste")}>
              <ToggleGroupItem value="agenda" aria-label="Agenda"><LuKanban /></ToggleGroupItem>
              <ToggleGroupItem value="liste" aria-label="Liste"><LuList /></ToggleGroupItem>
            </ToggleGroup>
            {acc.write && (
              <Button onClick={() => openNew()}>
                <LuCalendarPlus /> Nouveau rendez-vous
              </Button>
            )}
          </>
        }
      />
      <StatGrid>
        <StatCard index={0} label="Aujourd'hui" value={formatNumber(k.today)} icon={LuCalendarClock} />
        <StatCard index={1} label="Dans les 7 jours" value={formatNumber(k.week)} icon={LuCalendarCheck} tone="blue" hint={`${k.toConfirm} à confirmer`} />
        <StatCard index={2} label="Taux de réalisation" value={formatPercent(k.rate)} icon={LuCheck} tone="green" hint="rendez-vous passés" />
        <StatCard index={3} label="Absences clients" value={formatNumber(k.noShow)} icon={LuCalendarX} tone="red" />
      </StatGrid>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          {view === "agenda" ? (
            <div className="flex flex-col gap-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1">
                  <Button variant="outline" size="icon-sm" onClick={() => setWeekStart((w) => addWeeks(w, -1))} aria-label="Semaine précédente"><LuChevronLeft /></Button>
                  <Button variant="outline" size="sm" onClick={() => setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }))}>Cette semaine</Button>
                  <Button variant="outline" size="icon-sm" onClick={() => setWeekStart((w) => addWeeks(w, 1))} aria-label="Semaine suivante"><LuChevronRight /></Button>
                </div>
                <span className="text-sm font-medium">
                  Semaine du {format(days[0], "d MMMM", { locale: fr })} au {format(days[6], "d MMMM yyyy", { locale: fr })}
                </span>
              </div>
              <div className="grid grid-cols-1 gap-2 md:grid-cols-7">
                {days.map((d) => {
                  const iso = toISODate(d)
                  const items = data.filter((r) => r.date === iso).sort((a, b) => a.startTime.localeCompare(b.startTime))
                  return (
                    <div key={iso} className={cn("flex min-h-28 flex-col gap-1.5 rounded-lg border bg-muted/30 p-2", isSameDay(d, new Date()) && "border-primary/50 bg-primary/5")}>
                      <div className="flex items-baseline justify-between px-0.5">
                        <span className="text-xs font-medium text-muted-foreground uppercase">{format(d, "EEE", { locale: fr })}</span>
                        <span className={cn("text-sm font-semibold", isSameDay(d, new Date()) && "text-primary")}>{format(d, "d")}</span>
                      </div>
                      {items.map((r) => (
                        <button
                          key={r.id}
                          type="button"
                          onClick={() => setViewingId(r.id)}
                          className={cn("flex flex-col gap-0.5 rounded-md border border-l-4 bg-card px-2 py-1.5 text-left text-xs transition-colors hover:border-primary/40", statusBar[r.status], r.status === "annule" && "opacity-50")}
                        >
                          <span className="font-semibold tabular">{r.startTime}–{r.end}</span>
                          <span className="line-clamp-2 font-medium">{r.title}</span>
                          <span className="truncate text-muted-foreground">{r.who}</span>
                        </button>
                      ))}
                      {items.length === 0 && acc.write && iso >= today && (
                        <button type="button" onClick={() => openNew()} className="mt-auto rounded-md border border-dashed py-2 text-xs text-muted-foreground hover:border-primary hover:text-primary">
                          + Planifier
                        </button>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ) : (
            <DataTable
              data={data}
              columns={columns}
              getRowId={(r) => r.id}
              onRowClick={(r) => setViewingId(r.id)}
              defaultSort={{ id: "date", desc: true }}
              exportOptions={{ filename: "rendez-vous", title: "Rendez-vous", subtitle: filters.describe() }}
              rowActions={(r) => <RowActions actions={actionsFor(r)} />}
            />
          )}
        </CardContent>
      </Card>

      <AppointmentFormDialog open={formOpen} onOpenChange={setFormOpen} appointment={editing} preset={preset} />
      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewingId(null)}
        title={viewing?.title}
        description={viewing ? `${capitalize(formatDate(viewing.date, "EEEE d MMMM yyyy"))} · ${viewing.startTime}–${viewing.end}` : undefined}
        badge={viewing && <StatusBadge def={appointmentStatus[viewing.status]} />}
        footer={
          viewing &&
          acc.write && (
            <>
              {viewing.status === "planifie" && <Button variant="outline" onClick={() => setStatus(viewing, "confirme")}><LuCalendarCheck /> Confirmer</Button>}
              {["planifie", "confirme", "reporte"].includes(viewing.status) && <Button onClick={() => setStatus(viewing, "realise")}><LuCheck /> Marquer réalisé</Button>}
              <Button variant="outline" onClick={() => { const r = viewing; setViewingId(null); setEditing(r); setFormOpen(true) }}><LuPencil /> Modifier</Button>
            </>
          )
        }
      >
        {viewing && (
          <DescriptionList
            items={[
              { label: "Type", value: appointmentType[viewing.type] },
              { label: viewing.whoKind, value: viewing.who },
              { label: "Contact", value: viewing.contactName },
              { label: "Téléphone", value: <a className="inline-flex items-center gap-1.5 hover:underline" href={`tel:${viewing.phone}`}><LuPhone className="size-3.5" />{viewing.phone}</a> },
              { label: "Lieu", value: <span className="inline-flex items-center gap-1.5"><LuMapPin className="size-3.5" />{viewing.location}</span>, full: true },
              { label: "Collaborateur", value: employeeName(viewing.assignedTo) },
              { label: "Durée", value: `${viewing.durationMinutes} min` },
              ...(viewing.notes ? [{ label: "Notes", value: viewing.notes, full: true }] : []),
            ]}
          />
        )}
      </DetailSheet>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Supprimer ce rendez-vous ?"
        description="Préférez « Annuler » pour garder une trace dans l'historique."
        confirmLabel="Supprimer"
        destructive
        onConfirm={async () => {
          if (toDelete) {
            if (!(await remove("appointments", [toDelete]))) return
          }
          toast.success("Rendez-vous supprimé")
          setToDelete(null)
          setViewingId(null)
        }}
      />
    </Page>
  )
}
