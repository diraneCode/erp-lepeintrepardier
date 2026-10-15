"use client"

import * as React from "react"
import { toast } from "sonner"
import { eachDayOfInterval, endOfMonth, format, getDay, isWeekend, startOfMonth, subMonths } from "date-fns"
import { fr } from "date-fns/locale"
import { LuAlarmClock, LuCalendarCheck, LuLogIn, LuLogOut, LuTimer, LuUserX } from "react-icons/lu"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { useCurrentUser } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useTransientState } from "@/hooks/use-transient-state"
import { DAILY_MINUTES, WORK_START, lateMinutes, overtimeMinutes, recordedOvertime, workedMinutes } from "@/lib/calc"
import { capitalize, formatDate, formatDuration, formatNumber, toISODate } from "@/lib/format"
import { attendanceStatus, toOptions } from "@/lib/labels"
import { useSubmitLock } from "@/components/shared/form-dialog"
import { useStore } from "@/lib/store"
import type { Attendance, AttendanceStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Tolérance avant qu'une arrivée soit comptée en retard */
const GRACE_MINUTES = 10

const cellColor: Record<AttendanceStatus, string> = {
  present: "bg-success/15 text-success",
  retard: "bg-warning/15 text-warning",
  absent: "bg-destructive/15 text-destructive",
  conge: "bg-info/15 text-info",
  mission: "bg-primary/15 text-primary",
}

type Row = Attendance & { worked: number; late: number; overtime: number }

function useNow(intervalMs = 15_000) {
  const [now, setNow] = React.useState(() => new Date())
  React.useEffect(() => {
    const id = setInterval(() => setNow(new Date()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return now
}

export default function MyAttendancePage() {
  const user = useCurrentUser()
  const attendance = useStore((s) => s.attendance)
  const leaves = useStore((s) => s.leaves)
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const log = useStore((s) => s.log)
  const now = useNow()
  const [confirmOut, setConfirmOut] = useTransientState(false)

  const today = toISODate(now)
  const mine = React.useMemo(() => attendance.filter((a) => a.employeeId === user?.id), [attendance, user])
  const todayRecord = mine.find((a) => a.date === today)
  const onLeave = leaves.some((l) => l.employeeId === user?.id && l.status === "approuve" && l.startDate <= today && l.endDate >= today)

  const clockIn = async () => {
    if (!user) return
    const time = format(new Date(), "HH:mm")
    const [h, m] = WORK_START.split(":").map(Number)
    const late = new Date().getHours() * 60 + new Date().getMinutes() > h * 60 + m + GRACE_MINUTES
    const record: Attendance = { id: `pt_${user.id}_${today}`, employeeId: user.id, date: today, checkIn: time, checkOut: null, breakMinutes: 60, status: late ? "retard" : "present" }
    if (todayRecord) {
      if (!(await update("attendance", todayRecord.id, record))) return
    } else if (!(await add("attendance", record))) return
    log("Pointage", "Mon pointage", `Arrivée à ${time}`)
    toast.success(`Arrivée enregistrée à ${time}`, { description: late ? "Arrivée après 08h10 : comptée en retard." : "Bonne journée !" })
  }

  // Un seul enregistrement même en cas de double clic
  const clockInLocked = useSubmitLock(clockIn)

  const clockOut = async () => {
    if (!todayRecord) return
    const time = format(new Date(), "HH:mm")
    // Heures supplémentaires : dépassement de la journée de 8 h (recalculé par la base)
    const extra = overtimeMinutes({ ...todayRecord, checkOut: time })
    if (!(await update("attendance", todayRecord.id, { checkOut: time, overtimeMinutes: extra }))) return
    log("Pointage", "Mon pointage", `Départ à ${time}`)
    toast.success(`Départ enregistré à ${time}`, {
      description: `Temps de travail : ${formatDuration(workedMinutes({ ...todayRecord, checkOut: time }))}${extra ? ` · heures sup. : ${formatDuration(extra)}` : ""}`,
    })
    setConfirmOut(false)
  }

  /* ---------- Mois ---------- */
  const months = React.useMemo(() => Array.from({ length: 6 }, (_, i) => format(subMonths(now, i), "yyyy-MM")), [now])
  const [month, setMonth] = React.useState(months[0])
  const monthRows = mine.filter((a) => a.date.startsWith(month))
  const days = eachDayOfInterval({ start: startOfMonth(new Date(`${month}-01T00:00:00`)), end: endOfMonth(new Date(`${month}-01T00:00:00`)) })
  const byDate = new Map(monthRows.map((a) => [a.date, a]))
  const m = {
    worked: monthRows.reduce((s, a) => s + workedMinutes(a), 0),
    expected: days.filter((d) => !isWeekend(d) && toISODate(d) <= today).length * DAILY_MINUTES,
    present: monthRows.filter((a) => a.status === "present" || a.status === "retard" || a.status === "mission").length,
    late: monthRows.filter((a) => a.status === "retard").length,
    lateMin: monthRows.reduce((s, a) => s + lateMinutes(a), 0),
    absent: monthRows.filter((a) => a.status === "absent").length,
    overtime: monthRows.reduce((s, a) => s + recordedOvertime(a), 0),
  }

  /* ---------- Historique ---------- */
  const rows = React.useMemo<Row[]>(() => mine.map((a) => ({ ...a, worked: workedMinutes(a), late: lateMinutes(a), overtime: recordedOvertime(a) })), [mine])
  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      date: { label: "Date", accessor: (r) => r.date, defaultPreset: "30d" },
      facets: [{ id: "status", label: "Statut", options: toOptions(attendanceStatus), accessor: (r) => r.status }],
      ranges: [{ id: "late", label: "Retard", unit: "min", accessor: (r) => r.late }],
    }),
    []
  )
  const filters = useFilters(rows, config)
  const columns: Column<Row>[] = [
    { id: "date", header: "Date", accessor: (r) => r.date, cell: (r) => capitalize(formatDate(r.date, "EEE dd/MM/yyyy")), exportType: "date" },
    { id: "checkIn", header: "Arrivée", accessor: (r) => r.checkIn ?? "", cell: (r) => <span className={cn("tabular", r.late && "text-warning")}>{r.checkIn ?? "—"}</span> },
    { id: "checkOut", header: "Départ", accessor: (r) => r.checkOut ?? "", cell: (r) => <span className="tabular">{r.checkOut ?? "—"}</span> },
    { id: "worked", header: "Travaillé", accessor: (r) => r.worked, cell: (r) => (r.worked ? formatDuration(r.worked) : "—"), exportValue: (r) => formatDuration(r.worked), align: "right", footer: (rs) => formatDuration(rs.reduce((s, r) => s + r.worked, 0)) },
    { id: "late", header: "Retard", accessor: (r) => r.late, cell: (r) => (r.late ? `${r.late} min` : "—"), align: "right", exportType: "number", hideOnMobile: true },
    { id: "overtime", header: "H. sup.", accessor: (r) => r.overtime, cell: (r) => (r.overtime ? formatDuration(r.overtime) : "—"), exportValue: (r) => formatDuration(r.overtime), align: "right", hideOnMobile: true },
    { id: "status", header: "Statut", accessor: (r) => attendanceStatus[r.status].label, cell: (r) => <StatusBadge def={attendanceStatus[r.status]} /> },
    { id: "note", header: "Observation", accessor: (r) => r.note ?? "", defaultHidden: true },
  ]

  if (!user) return null
  const weekend = isWeekend(now)
  const canIn = !onLeave && !todayRecord?.checkIn
  const canOut = !!todayRecord?.checkIn && !todayRecord.checkOut

  return (
    <Page>
      <PageHeader icon={LuTimer} title="Mon pointage" description="Enregistrez vos arrivées et départs, et suivez vos heures." />

      <Card>
        <CardContent className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex flex-col gap-1">
            <span className="text-sm text-muted-foreground">{capitalize(format(now, "EEEE d MMMM yyyy", { locale: fr }))}</span>
            <span className="text-4xl font-semibold tracking-tight tabular">{format(now, "HH:mm")}</span>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-sm">
              {onLeave ? (
                <Badge variant="info">En congé aujourd&apos;hui</Badge>
              ) : todayRecord ? (
                <>
                  <StatusBadge def={attendanceStatus[todayRecord.status]} />
                  <span className="text-muted-foreground">
                    Arrivée {todayRecord.checkIn ?? "—"} · Départ {todayRecord.checkOut ?? "—"}
                    {todayRecord.checkOut && ` · ${formatDuration(workedMinutes(todayRecord))}`}
                  </span>
                </>
              ) : (
                <span className="text-muted-foreground">{weekend ? "Week-end — pointage facultatif." : "Vous n'avez pas encore pointé aujourd'hui."}</span>
              )}
            </div>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Button size="lg" onClick={() => void clockInLocked.handleSubmit()} disabled={!canIn || clockInLocked.submitting}>
              <LuLogIn /> Pointer mon arrivée
            </Button>
            <Button size="lg" variant="outline" onClick={() => setConfirmOut(true)} disabled={!canOut}>
              <LuLogOut /> Pointer mon départ
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">Mon mois</h2>
        <Select value={month} onValueChange={setMonth}>
          <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
          <SelectContent>
            {months.map((p) => (
              <SelectItem key={p} value={p}>{capitalize(format(new Date(`${p}-01T00:00:00`), "MMMM yyyy", { locale: fr }))}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <StatGrid>
        <StatCard index={0} label="Jours travaillés" value={formatNumber(m.present)} icon={LuCalendarCheck} tone="green" />
        <StatCard index={1} label="Heures travaillées" value={formatDuration(m.worked)} icon={LuTimer} tone="blue" hint={`sur ${formatDuration(m.expected)} attendues`} />
        <StatCard index={2} label="Retards" value={formatNumber(m.late)} icon={LuAlarmClock} tone="orange" hint={`${formatDuration(m.lateMin)} cumulés`} />
        <StatCard index={3} label="Absences" value={formatNumber(m.absent)} icon={LuUserX} tone="red" hint={`${formatDuration(m.overtime)} d'heures sup.`} />
      </StatGrid>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Calendrier</CardTitle>
          <CardDescription className="flex flex-wrap gap-3">
            {(Object.keys(cellColor) as AttendanceStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5 text-xs">
                <span className={cn("size-3 rounded", cellColor[s])} />
                {attendanceStatus[s].label}
              </span>
            ))}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1.5 text-center text-xs">
            {["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"].map((d) => (
              <span key={d} className="pb-1 font-medium text-muted-foreground">{d}</span>
            ))}
            {Array.from({ length: (getDay(days[0]) + 6) % 7 }).map((_, i) => (
              <span key={`pad${i}`} />
            ))}
            {days.map((d) => {
              const iso = toISODate(d)
              const r = byDate.get(iso)
              const cell = (
                <div
                  className={cn(
                    "flex aspect-square flex-col items-center justify-center rounded-lg border text-sm sm:aspect-auto sm:h-16",
                    r ? cellColor[r.status] + " border-transparent" : isWeekend(d) ? "bg-muted/40 text-muted-foreground/60" : "text-muted-foreground",
                    iso === today && "ring-2 ring-primary"
                  )}
                >
                  <span className="font-medium">{format(d, "d")}</span>
                  {r?.checkIn && <span className="hidden text-[10px] sm:block">{r.checkIn}–{r.checkOut ?? "…"}</span>}
                </div>
              )
              return r ? (
                <Tooltip key={iso}>
                  <TooltipTrigger asChild>{cell}</TooltipTrigger>
                  <TooltipContent>
                    {formatDate(iso)} · {attendanceStatus[r.status].label}
                    {r.checkIn ? ` · ${r.checkIn}–${r.checkOut ?? "…"}` : ""}
                  </TooltipContent>
                </Tooltip>
              ) : (
                <React.Fragment key={iso}>{cell}</React.Fragment>
              )
            })}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Historique</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={filters.filtered}
            columns={columns}
            getRowId={(r) => r.id}
            defaultSort={{ id: "date", desc: true }}
            exportOptions={{ filename: "mon-pointage", title: `Fiche de pointage — ${user.firstName} ${user.lastName}`, subtitle: `${user.matricule} · ${filters.describe()}` }}
          />
        </CardContent>
      </Card>

      <ConfirmDialog
        open={confirmOut}
        onOpenChange={setConfirmOut}
        title="Pointer votre départ ?"
        description={`Départ enregistré à ${format(now, "HH:mm")}. Cette action clôture votre journée.`}
        confirmLabel="Confirmer le départ"
        onConfirm={clockOut}
      />
    </Page>
  )
}
