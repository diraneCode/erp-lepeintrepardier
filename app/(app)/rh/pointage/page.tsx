"use client"

import * as React from "react"
import { eachDayOfInterval, endOfMonth, format, isWeekend, startOfMonth, subMonths } from "date-fns"
import { fr } from "date-fns/locale"
import { LuAlarmClock, LuClock, LuClockArrowUp, LuLogIn, LuPencil, LuPlus, LuTimer, LuUserCheck, LuUserX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { ChartCard } from "@/components/shared/chart-card"
import { TimeBarChart, bucketByPeriod } from "@/components/shared/charts"
import { DataTable, type Column } from "@/components/shared/data-table"
import { ExportMenu } from "@/components/shared/export-menu"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PersonCell } from "@/components/shared/user-avatar"
import { AttendanceFormDialog } from "@/components/modules/hr/attendance-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { DAILY_MINUTES, lateMinutes, recordedOvertime, workedMinutes } from "@/lib/calc"
import { capitalize, formatDate, formatDuration, formatNumber, formatPercent } from "@/lib/format"
import { attendanceStatus, department, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Attendance, AttendanceStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

type Row = Attendance & { name: string; department: string; locationId: string; worked: number; late: number; overtime: number }

const cellColor: Record<AttendanceStatus, string> = {
  present: "bg-success/15 text-success",
  retard: "bg-warning/15 text-warning",
  absent: "bg-destructive/15 text-destructive",
  conge: "bg-info/15 text-info",
  mission: "bg-primary/15 text-primary",
}
const cellLetter: Record<AttendanceStatus, string> = { present: "P", retard: "R", absent: "A", conge: "C", mission: "M" }

export default function AttendancePage() {
  const [tab, setTab] = React.useState("registre")
  const [formOpen, setFormOpen] = useTransientState(false)
  const [record, setRecord] = useTransientState<Partial<Attendance> | undefined>(undefined)
  const openForm = (r?: Partial<Attendance>) => {
    setRecord(r)
    setFormOpen(true)
  }

  return (
    <Page>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <PageHeader
          icon={LuClock}
          title="Fiches de pointage"
          description="Présences, retards, heures travaillées et heures supplémentaires."
          actions={
            <>
              <TabsList>
                <TabsTrigger value="registre">Registre</TabsTrigger>
                <TabsTrigger value="fiche">Fiche mensuelle</TabsTrigger>
              </TabsList>
              <Button onClick={() => openForm()}>
                <LuLogIn /> Pointer
              </Button>
            </>
          }
        />
        <TabsContent value="registre">
          <RegisterTab onEdit={openForm} />
        </TabsContent>
        <TabsContent value="fiche">{tab === "fiche" && <MonthlySheet onEdit={openForm} />}</TabsContent>
      </Tabs>
      <AttendanceFormDialog open={formOpen} onOpenChange={setFormOpen} record={record} />
    </Page>
  )
}

function useAttendanceRows() {
  const attendance = useStore((s) => s.attendance)
  const { employeeById } = useLookups(["employeeById"])
  return React.useMemo<Row[]>(
    () =>
      attendance.flatMap((a) => {
        const e = employeeById.get(a.employeeId)
        if (!e) return []
        return [{ ...a, name: `${e.firstName} ${e.lastName}`, department: e.department, locationId: e.locationId, worked: workedMinutes(a), late: lateMinutes(a), overtime: recordedOvertime(a) }]
      }),
    [attendance, employeeById]
  )
}

function RegisterTab({ onEdit }: { onEdit: (r?: Partial<Attendance>) => void }) {
  const rows = useAttendanceRows()
  const { employeeOptions, locationOptions, locationName } = useLookups(["employeeOptions", "locationOptions", "locationName"])

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Employé, observation…", fields: (r) => [r.name, r.note] },
      date: { label: "Date", accessor: (r) => r.date, defaultPreset: "7d" },
      facets: [
        { id: "employee", label: "Employé", options: employeeOptions, accessor: (r) => r.employeeId },
        { id: "status", label: "Statut", options: toOptions(attendanceStatus), accessor: (r) => r.status },
        { id: "department", label: "Service", options: toOptions(department), accessor: (r) => r.department },
        { id: "location", label: "Site", options: locationOptions, accessor: (r) => r.locationId },
      ],
      ranges: [
        { id: "late", label: "Retard", unit: "min", accessor: (r) => r.late },
        { id: "worked", label: "Temps travaillé", unit: "min", accessor: (r) => r.worked },
        { id: "overtime", label: "Heures sup.", unit: "min", accessor: (r) => r.overtime },
      ],
    }),
    [employeeOptions, locationOptions]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered

  const k = React.useMemo(() => {
    const expected = data.filter((r) => r.status !== "conge").length
    const present = data.filter((r) => r.status === "present" || r.status === "retard" || r.status === "mission").length
    return {
      rate: expected ? (present / expected) * 100 : 0,
      late: data.filter((r) => r.status === "retard").length,
      lateMin: data.reduce((s, r) => s + r.late, 0),
      absent: data.filter((r) => r.status === "absent").length,
      worked: data.reduce((s, r) => s + r.worked, 0),
      overtime: data.reduce((s, r) => s + r.overtime, 0),
      overtimeStaff: new Set(data.filter((r) => r.overtime > 0).map((r) => r.employeeId)).size,
    }
  }, [data])

  const trend = React.useMemo(
    () =>
      bucketByPeriod(
        data,
        (r) => r.date,
        {
          present: (r) => (r.status === "present" || r.status === "mission" ? 1 : 0),
          retard: (r) => (r.status === "retard" ? 1 : 0),
          absent: (r) => (r.status === "absent" ? 1 : 0),
        },
        filters.state.date
      ),
    [data, filters.state.date]
  )

  const columns: Column<Row>[] = [
    { id: "date", header: "Date", accessor: (r) => r.date, cell: (r) => <span className="whitespace-nowrap">{capitalize(formatDate(r.date, "EEE dd/MM/yyyy"))}</span>, exportType: "date" },
    { id: "name", header: "Employé", accessor: (r) => r.name, cell: (r) => <PersonCell name={r.name} sub={department[r.department as keyof typeof department]} />, className: "min-w-[200px]" },
    { id: "location", header: "Site", accessor: (r) => locationName(r.locationId), hideOnMobile: true, defaultHidden: true },
    { id: "checkIn", header: "Arrivée", accessor: (r) => r.checkIn ?? "", cell: (r) => <span className={cn("tabular", r.late > 0 && "font-medium text-warning")}>{r.checkIn ?? "—"}</span> },
    { id: "checkOut", header: "Départ", accessor: (r) => r.checkOut ?? "", cell: (r) => <span className="tabular">{r.checkOut ?? (r.checkIn ? <span className="text-xs text-info">en poste</span> : "—")}</span> },
    { id: "break", header: "Pause", accessor: (r) => r.breakMinutes, cell: (r) => (r.breakMinutes ? `${r.breakMinutes} min` : "—"), align: "right", exportType: "number", hideOnMobile: true },
    { id: "worked", header: "Travaillé", accessor: (r) => r.worked, cell: (r) => (r.worked ? formatDuration(r.worked) : "—"), exportValue: (r) => formatDuration(r.worked), align: "right", footer: (rs) => formatDuration(rs.reduce((s, r) => s + r.worked, 0)) },
    { id: "late", header: "Retard", accessor: (r) => r.late, cell: (r) => (r.late ? `${r.late} min` : "—"), align: "right", exportType: "number", hideOnMobile: true },
    { id: "overtime", header: "H. sup.", accessor: (r) => r.overtime, cell: (r) => (r.overtime ? formatDuration(r.overtime) : "—"), exportValue: (r) => formatDuration(r.overtime), align: "right", hideOnMobile: true, footer: (rs) => formatDuration(rs.reduce((s, r) => s + r.overtime, 0)) },
    { id: "status", header: "Statut", accessor: (r) => attendanceStatus[r.status].label, cell: (r) => <StatusBadge def={attendanceStatus[r.status]} /> },
    { id: "note", header: "Observation", accessor: (r) => r.note ?? "", defaultHidden: true },
  ]

  return (
    <div className="flex flex-col gap-6">
      <Card>
        <CardContent>
          <FilterBar filters={filters} />
        </CardContent>
      </Card>
      <StatGrid className="sm:grid-cols-3 xl:grid-cols-5">
        <StatCard index={0} label="Taux de présence" value={formatPercent(k.rate)} icon={LuUserCheck} tone="green" hint="hors congés" />
        <StatCard index={1} label="Retards" value={formatNumber(k.late)} icon={LuAlarmClock} tone="orange" hint={`${formatDuration(k.lateMin)} cumulés`} />
        <StatCard index={2} label="Absences" value={formatNumber(k.absent)} icon={LuUserX} tone="red" />
        <StatCard index={3} label="Heures travaillées" value={formatDuration(k.worked).replace(" 00", "")} icon={LuTimer} tone="blue" hint="sur la période" />
        <StatCard index={4} label="Heures supplémentaires" value={formatDuration(k.overtime).replace(" 00", "")} icon={LuClockArrowUp} tone="violet" hint={`${formatNumber(k.overtimeStaff)} employé(s) concerné(s)`} />
      </StatGrid>
      <ChartCard title="Présences quotidiennes" description={`Nombre de pointages par ${trend.granularity}`}>
        <TimeBarChart
          data={trend.data}
          stacked
          formatter={(v) => formatNumber(v)}
          series={[
            { key: "present", label: "Présents", color: "var(--chart-1)" },
            { key: "retard", label: "Retards", color: "var(--chart-2)" },
            { key: "absent", label: "Absents", color: "var(--chart-5)" },
          ]}
        />
      </ChartCard>
      <Card>
        <CardContent>
          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={onEdit}
            pageSize={20}
            defaultSort={{ id: "date", desc: true }}
            exportOptions={{
              filename: "registre-pointage",
              title: "Registre de pointage",
              subtitle: filters.describe(),
              summary: [
                { label: "Taux de présence", value: formatPercent(k.rate) },
                { label: "Retards", value: formatNumber(k.late) },
                { label: "Absences", value: formatNumber(k.absent) },
                { label: "Heures sup.", value: formatDuration(k.overtime) },
              ],
            }}
            rowActions={(r) => <RowActions actions={[{ label: "Modifier", icon: LuPencil, onSelect: () => onEdit(r) }]} />}
          />
        </CardContent>
      </Card>
    </div>
  )
}

function MonthlySheet({ onEdit }: { onEdit: (r?: Partial<Attendance>) => void }) {
  const rows = useAttendanceRows()
  const employees = useStore((s) => s.employees)
  const { locationOptions } = useLookups(["locationOptions"])
  const months = React.useMemo(() => Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), i), "yyyy-MM")), [])
  const [month, setMonth] = React.useState(months[0])
  const [dept, setDept] = React.useState("all")
  const [loc, setLoc] = React.useState("all")

  const days = React.useMemo(() => {
    const start = startOfMonth(new Date(`${month}-01T00:00:00`))
    return eachDayOfInterval({ start, end: endOfMonth(start) })
  }, [month])
  const people = employees.filter((e) => e.status !== "sorti" && (dept === "all" || e.department === dept) && (loc === "all" || e.locationId === loc))
  const index = React.useMemo(() => {
    const m = new Map<string, Row>()
    rows.forEach((r) => r.date.startsWith(month) && m.set(`${r.employeeId}|${r.date}`, r))
    return m
  }, [rows, month])

  const summary = people.map((e) => {
    const own = rows.filter((r) => r.employeeId === e.id && r.date.startsWith(month))
    const workingDays = days.filter((d) => !isWeekend(d) && d <= new Date()).length
    return {
      id: e.id,
      name: `${e.firstName} ${e.lastName}`,
      matricule: e.matricule,
      present: own.filter((r) => r.status === "present" || r.status === "mission").length,
      late: own.filter((r) => r.status === "retard").length,
      absent: own.filter((r) => r.status === "absent").length,
      leave: own.filter((r) => r.status === "conge").length,
      worked: own.reduce((s, r) => s + r.worked, 0),
      expected: workingDays * DAILY_MINUTES,
      overtime: own.reduce((s, r) => s + r.overtime, 0),
    }
  })
  type S = (typeof summary)[number]

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardContent className="flex flex-wrap items-center gap-2">
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger className="w-44"><SelectValue /></SelectTrigger>
            <SelectContent>
              {months.map((m) => (
                <SelectItem key={m} value={m}>{capitalize(format(new Date(`${m}-01T00:00:00`), "MMMM yyyy", { locale: fr }))}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={dept} onValueChange={setDept}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les services</SelectItem>
              {toOptions(department).map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={loc} onValueChange={setLoc}>
            <SelectTrigger className="w-56"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Tous les sites</SelectItem>
              {locationOptions.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="ml-auto flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
            {(Object.keys(cellLetter) as AttendanceStatus[]).map((s) => (
              <span key={s} className="inline-flex items-center gap-1.5">
                <span className={cn("flex size-5 items-center justify-center rounded text-[10px] font-semibold", cellColor[s])}>{cellLetter[s]}</span>
                {attendanceStatus[s].label}
              </span>
            ))}
            <ExportMenu
              getOptions={() => ({
                filename: `fiche-pointage-${month}`,
                title: "Fiche de pointage mensuelle",
                subtitle: capitalize(format(new Date(`${month}-01T00:00:00`), "MMMM yyyy", { locale: fr })),
                orientation: "landscape",
                rows: summary,
                columns: [
                  { header: "Matricule", value: (s: S) => s.matricule },
                  { header: "Employé", value: (s: S) => s.name },
                  { header: "Présent", value: (s: S) => s.present, type: "number" },
                  { header: "Retards", value: (s: S) => s.late, type: "number" },
                  { header: "Absences", value: (s: S) => s.absent, type: "number" },
                  { header: "Congés", value: (s: S) => s.leave, type: "number" },
                  { header: "Heures travaillées", value: (s: S) => formatDuration(s.worked) },
                  { header: "Heures attendues", value: (s: S) => formatDuration(s.expected) },
                  { header: "Heures sup.", value: (s: S) => formatDuration(s.overtime) },
                  ...days.map((d) => ({ header: format(d, "dd"), value: (s: S) => { const r = index.get(`${s.id}|${format(d, "yyyy-MM-dd")}`); return r ? cellLetter[r.status] : isWeekend(d) ? "·" : "" } })),
                ],
              })}
            />
          </div>
        </CardContent>
      </Card>
      <div className="overflow-x-auto rounded-xl border bg-card scrollbar-thin">
        <table className="w-full border-collapse text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 z-10 min-w-48 bg-muted px-3 py-2 text-left font-medium text-muted-foreground">Employé</th>
              {days.map((d) => (
                <th key={d.toISOString()} className={cn("min-w-8 px-0.5 py-2 text-center font-medium", isWeekend(d) ? "text-muted-foreground/50" : "text-muted-foreground")}>
                  <div className="text-[10px] uppercase">{format(d, "EEEEE", { locale: fr })}</div>
                  <div>{format(d, "d")}</div>
                </th>
              ))}
              <th className="min-w-20 px-2 py-2 text-right font-medium text-muted-foreground">Heures</th>
              <th className="min-w-16 px-2 py-2 text-right font-medium text-muted-foreground">H. sup.</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {summary.map((s) => (
              <tr key={s.id} className="hover:bg-muted/30">
                <td className="sticky left-0 z-10 bg-card px-3 py-1.5">
                  <div className="truncate font-medium">{s.name}</div>
                  <div className="text-[11px] text-muted-foreground">{s.present + s.late} j · {s.late} R · {s.absent} A</div>
                </td>
                {days.map((d) => {
                  const iso = format(d, "yyyy-MM-dd")
                  const r = index.get(`${s.id}|${iso}`)
                  return (
                    <td key={iso} className={cn("p-0.5 text-center", isWeekend(d) && "bg-muted/40")}>
                      {r ? (
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <button
                              type="button"
                              onClick={() => onEdit(r)}
                              className={cn("mx-auto flex size-7 items-center justify-center rounded text-[11px] font-semibold transition-transform hover:scale-110", cellColor[r.status])}
                            >
                              {cellLetter[r.status]}
                            </button>
                          </TooltipTrigger>
                          <TooltipContent>
                            {formatDate(r.date)} · {attendanceStatus[r.status].label}
                            {r.checkIn ? ` · ${r.checkIn}–${r.checkOut ?? "…"}` : ""}
                          </TooltipContent>
                        </Tooltip>
                      ) : !isWeekend(d) && d <= new Date() ? (
                        <button type="button" onClick={() => onEdit({ employeeId: s.id, date: iso })} className="mx-auto flex size-7 items-center justify-center rounded border border-dashed text-muted-foreground/50 hover:border-primary hover:text-primary" aria-label="Saisir">
                          <LuPlus className="size-3" />
                        </button>
                      ) : null}
                    </td>
                  )
                })}
                <td className="px-2 text-right font-medium tabular">{formatDuration(s.worked)}</td>
                <td className="px-2 text-right tabular text-muted-foreground">{s.overtime ? formatDuration(s.overtime) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {summary.length === 0 && <p className="py-10 text-center text-sm text-muted-foreground">Aucun employé pour cette sélection.</p>}
      </div>
    </div>
  )
}
