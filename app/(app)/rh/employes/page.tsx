"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { differenceInMonths, differenceInYears, subDays } from "date-fns"
import { LuBanknote, LuBriefcase, LuCalendarDays, LuEye, LuIdCard, LuPencil, LuTrash2, LuUserPlus, LuUsers, LuUserX } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChartCard } from "@/components/shared/chart-card"
import { DonutChart, RankingBars, topWithOther } from "@/components/shared/charts"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList, DetailSection, DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PersonCell, UserAvatar } from "@/components/shared/user-avatar"
import { EmployeeFormDialog } from "@/components/modules/hr/employee-form"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { ANNUAL_LEAVE_DAYS, workedMinutes } from "@/lib/calc"
import { formatDate, formatDuration, formatMoney, formatNumber, toDate, toISODate } from "@/lib/format"
import { contractType, department, employeeStatus, maritalStatus, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import { ROLE_LABEL } from "@/lib/access"
import type { Employee } from "@/lib/types"

function daysAgoISO(days: number) {
  return toISODate(subDays(new Date(), days))
}

type Row = Employee & { fullName: string; age: number; seniority: number }

export default function EmployeesPage() {
  const router = useRouter()
  const employees = useStore((s) => s.employees)
  const attendance = useStore((s) => s.attendance)
  const leaves = useStore((s) => s.leaves)
  const update = useStore((s) => s.update)
  const remove = useStore((s) => s.remove)
  const { locationName, locationOptions } = useLookups()
  const [formOpen, setFormOpen] = useTransientState(false)
  const [editing, setEditing] = useTransientState<Employee | undefined>(undefined)
  const [viewing, setViewing] = useTransientState<Row | null>(null)
  const [toDelete, setToDelete] = useTransientState<Row | null>(null)

  const rows = React.useMemo<Row[]>(() => {
    const now = new Date()
    return employees.map((e) => ({
      ...e,
      fullName: `${e.firstName} ${e.lastName}`,
      age: differenceInYears(now, toDate(e.birthDate) ?? now),
      seniority: differenceInMonths(now, toDate(e.hireDate) ?? now) / 12,
    }))
  }, [employees])

  const positions = React.useMemo(() => [...new Set(employees.map((e) => e.position))].sort().map((p) => ({ value: p, label: p })), [employees])

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Nom, matricule, poste, e-mail…", fields: (e) => [e.fullName, e.matricule, e.position, e.email, e.phone] },
      date: { label: "Date d'embauche", accessor: (e) => e.hireDate },
      facets: [
        { id: "department", label: "Service", options: toOptions(department), accessor: (e) => e.department },
        { id: "status", label: "Statut", options: toOptions(employeeStatus), accessor: (e) => e.status },
        { id: "contract", label: "Contrat", options: toOptions(contractType), accessor: (e) => e.contractType },
        { id: "location", label: "Affectation", options: locationOptions, accessor: (e) => e.locationId },
        { id: "position", label: "Poste", options: positions, accessor: (e) => e.position },
        { id: "role", label: "Rôle", options: toOptions(ROLE_LABEL), accessor: (e) => e.role },
        { id: "gender", label: "Sexe", options: [{ value: "H", label: "Hommes" }, { value: "F", label: "Femmes" }], accessor: (e) => e.gender },
      ],
      ranges: [
        { id: "salary", label: "Salaire de base", unit: "FCFA", accessor: (e) => e.baseSalary },
        { id: "seniority", label: "Ancienneté", unit: "ans", accessor: (e) => e.seniority },
        { id: "age", label: "Âge", unit: "ans", accessor: (e) => e.age },
      ],
    }),
    [locationOptions, positions]
  )
  const filters = useFilters(rows, config)
  const data = filters.filtered
  const active = React.useMemo(() => data.filter((e) => e.status !== "sorti"), [data])

  const k = {
    headcount: active.length,
    payroll: active.reduce((s, e) => s + e.baseSalary, 0),
    seniority: active.length ? active.reduce((s, e) => s + e.seniority, 0) / active.length : 0,
    women: active.filter((e) => e.gender === "F").length,
    onLeave: active.filter((e) => e.status === "conge").length,
  }
  const byDept = React.useMemo(() => {
    const m = new Map<string, number>()
    active.forEach((e) => m.set(department[e.department], (m.get(department[e.department]) ?? 0) + 1))
    return [...m].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value)
  }, [active])
  const byContract = React.useMemo(() => {
    const m = new Map<string, number>()
    active.forEach((e) => m.set(contractType[e.contractType], (m.get(contractType[e.contractType]) ?? 0) + 1))
    return topWithOther([...m].map(([name, value]) => ({ name, value })))
  }, [active])

  const openEdit = (e?: Employee) => {
    setEditing(e)
    setFormOpen(true)
  }

  const columns: Column<Row>[] = [
    { id: "name", header: "Employé", accessor: (e) => e.fullName, cell: (e) => <PersonCell name={e.fullName} sub={`${e.matricule} · ${e.position}`} />, className: "min-w-[230px]" },
    { id: "matricule", header: "Matricule", accessor: (e) => e.matricule, defaultHidden: true },
    { id: "position", header: "Poste", accessor: (e) => e.position, defaultHidden: true },
    { id: "department", header: "Service", accessor: (e) => department[e.department], hideOnMobile: true },
    { id: "location", header: "Affectation", accessor: (e) => locationName(e.locationId), hideOnMobile: true },
    { id: "contract", header: "Contrat", accessor: (e) => contractType[e.contractType], hideOnMobile: true },
    { id: "hireDate", header: "Embauche", accessor: (e) => e.hireDate, cell: (e) => <div><div>{formatDate(e.hireDate)}</div><div className="text-xs text-muted-foreground">{formatNumber(e.seniority, 1)} an(s)</div></div>, exportType: "date", hideOnMobile: true },
    { id: "salary", header: "Salaire de base", accessor: (e) => e.baseSalary, cell: (e) => formatMoney(e.baseSalary), align: "right", exportType: "money", footer: (r) => formatMoney(r.filter((e) => e.status !== "sorti").reduce((s, e) => s + e.baseSalary, 0)) },
    { id: "phone", header: "Téléphone", accessor: (e) => e.phone, defaultHidden: true },
    { id: "email", header: "E-mail", accessor: (e) => e.email, defaultHidden: true },
    { id: "role", header: "Rôle", accessor: (e) => ROLE_LABEL[e.role], hideOnMobile: true, defaultHidden: true },
    { id: "status", header: "Statut", accessor: (e) => employeeStatus[e.status].label, cell: (e) => <StatusBadge def={employeeStatus[e.status]} /> },
  ]

  // Indicateurs individuels (30 derniers jours) pour la fiche
  const profile = React.useMemo(() => {
    if (!viewing) return null
    const since = daysAgoISO(30)
    const att = attendance.filter((a) => a.employeeId === viewing.id && a.date >= since)
    const year = new Date().getFullYear().toString()
    const taken = leaves.filter((l) => l.employeeId === viewing.id && l.type === "annuel" && l.status === "approuve" && l.startDate.startsWith(year)).reduce((s, l) => s + l.days, 0)
    return {
      present: att.filter((a) => a.status === "present" || a.status === "retard" || a.status === "mission").length,
      late: att.filter((a) => a.status === "retard").length,
      absent: att.filter((a) => a.status === "absent").length,
      hours: att.reduce((s, a) => s + workedMinutes(a), 0),
      leaveTaken: taken,
      leaveLeft: Math.max(0, ANNUAL_LEAVE_DAYS - taken),
      pending: leaves.filter((l) => l.employeeId === viewing.id && l.status === "en_attente").length,
    }
  }, [viewing, attendance, leaves])

  return (
    <Page>
      <PageHeader
        icon={LuIdCard}
        title="Employés"
        description="Dossiers du personnel, contrats, affectations et rémunérations."
        actions={
          <Button onClick={() => openEdit()}>
            <LuUserPlus /> Nouvel employé
          </Button>
        }
      />
      <StatGrid>
        <StatCard index={0} label="Effectif" value={formatNumber(k.headcount)} icon={LuUsers} hint={`${k.women} femmes · ${k.headcount - k.women} hommes`} />
        <StatCard index={1} label="Masse salariale de base" value={formatMoney(k.payroll, { compact: true })} icon={LuBanknote} tone="blue" hint="par mois" />
        <StatCard index={2} label="Ancienneté moyenne" value={`${formatNumber(k.seniority, 1)} ans`} icon={LuBriefcase} tone="green" />
        <StatCard index={3} label="En congé" value={formatNumber(k.onLeave)} icon={LuCalendarDays} tone="orange" hint="actuellement" />
      </StatGrid>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <ChartCard title="Effectif par service">
          <RankingBars items={byDept} formatter={(v) => `${v}`} />
        </ChartCard>
        <ChartCard title="Types de contrat">
          <DonutChart data={byContract} formatter={(v) => `${v}`} centerValue={String(k.headcount)} centerLabel="employés" />
        </ChartCard>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          <FilterBar filters={filters} />
          <DataTable
            data={data}
            columns={columns}
            getRowId={(e) => e.id}
            onRowClick={setViewing}
            selectable
            defaultSort={{ id: "name" }}
            exportOptions={{ filename: "employes", title: "Registre du personnel", subtitle: filters.describe(), summary: [{ label: "Effectif", value: formatNumber(k.headcount) }, { label: "Masse salariale", value: formatMoney(k.payroll) }] }}
            bulkActions={(sel, clear) => (
              <Button variant="outline" size="sm" onClick={() => { sel.forEach((e) => update("employees", e.id, { status: "actif" })); toast.success("Statut mis à jour"); clear() }}>
                Marquer actifs
              </Button>
            )}
            rowActions={(e) => (
              <RowActions
                actions={[
                  { label: "Voir le dossier", icon: LuEye, onSelect: () => setViewing(e) },
                  { label: "Modifier", icon: LuPencil, onSelect: () => openEdit(e) },
                  { label: "Fiche de pointage", icon: LuCalendarDays, onSelect: () => router.push("/rh/pointage") },
                  { label: "Déclarer une sortie", icon: LuUserX, onSelect: () => { update("employees", e.id, { status: "sorti" }); toast.success("Sortie enregistrée", { description: e.fullName }) }, hidden: e.status === "sorti" },
                  { label: "Supprimer", icon: LuTrash2, destructive: true, separatorBefore: true, onSelect: () => setToDelete(e) },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>
      <EmployeeFormDialog open={formOpen} onOpenChange={setFormOpen} employee={editing} />
      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={
          viewing && (
            <span className="flex items-center gap-3">
              <UserAvatar name={viewing.fullName} className="size-9" />
              {viewing.fullName}
            </span>
          )
        }
        description={viewing ? `${viewing.matricule} · ${viewing.position}` : undefined}
        badge={viewing && <StatusBadge def={employeeStatus[viewing.status]} />}
        wide
        footer={viewing && <Button onClick={() => { const e = viewing; setViewing(null); openEdit(e) }}><LuPencil /> Modifier</Button>}
      >
        {viewing && profile && (
          <div className="flex flex-col">
            <DetailSection title="30 derniers jours">
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  ["Jours travaillés", formatNumber(profile.present)],
                  ["Retards", formatNumber(profile.late)],
                  ["Absences", formatNumber(profile.absent)],
                  ["Heures", formatDuration(profile.hours)],
                ].map(([l, v]) => (
                  <div key={l} className="rounded-lg bg-muted/60 p-3">
                    <div className="text-xs text-muted-foreground">{l}</div>
                    <div className="mt-1 font-semibold tabular">{v}</div>
                  </div>
                ))}
              </div>
            </DetailSection>
            <DetailSection title="Contrat">
              <DescriptionList
                items={[
                  { label: "Service", value: department[viewing.department] },
                  { label: "Affectation", value: locationName(viewing.locationId) },
                  { label: "Contrat", value: contractType[viewing.contractType] },
                  { label: "Rôle (accès)", value: ROLE_LABEL[viewing.role] },
                  { label: "Embauche", value: `${formatDate(viewing.hireDate)} (${formatNumber(viewing.seniority, 1)} an(s))` },
                  { label: "Salaire de base", value: formatMoney(viewing.baseSalary) },
                  { label: "Congés annuels", value: `${profile.leaveTaken} j pris · ${profile.leaveLeft} j restants${profile.pending ? ` · ${profile.pending} demande(s) en attente` : ""}` },
                  { label: "N° CNPS", value: viewing.cnpsNumber },
                  { label: "RIB", value: <span className="font-mono text-xs">{viewing.bankAccount}</span> },
                ]}
              />
            </DetailSection>
            <DetailSection title="État civil & coordonnées">
              <DescriptionList
                items={[
                  { label: "Date de naissance", value: `${formatDate(viewing.birthDate)} (${viewing.age} ans)` },
                  { label: "Situation", value: `${maritalStatus[viewing.maritalStatus]} · ${viewing.children} enfant(s)` },
                  { label: "Téléphone", value: viewing.phone },
                  { label: "E-mail", value: viewing.email },
                  { label: "Adresse", value: viewing.address, full: true },
                ]}
              />
            </DetailSection>
          </div>
        )}
      </DetailSheet>
      <ConfirmDialog
        open={!!toDelete}
        onOpenChange={(o) => !o && setToDelete(null)}
        title={`Supprimer le dossier de ${toDelete?.fullName ?? ""} ?`}
        description="Préférez « Déclarer une sortie » pour conserver l'historique (pointages, paie, congés)."
        confirmLabel="Supprimer"
        destructive
        onConfirm={() => {
          if (toDelete) remove("employees", [toDelete.id])
          toast.success("Dossier supprimé")
          setToDelete(null)
          setViewing(null)
        }}
      />
    </Page>
  )
}
