"use client"

import * as React from "react"
import { toast } from "sonner"
import { format, subMonths } from "date-fns"
import { LuBanknote, LuBuilding2, LuCircleCheck, LuCoins, LuEye, LuFileDown, LuPencil, LuRefreshCw, LuWallet } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { ChartCard } from "@/components/shared/chart-card"
import { TimeBarChart } from "@/components/shared/charts"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DetailSheet } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PersonCell } from "@/components/shared/user-avatar"
import { PayslipFormDialog } from "@/components/modules/hr/payslip-form"
import { PayslipDetail, downloadPayslip } from "@/components/modules/hr/payslip-view"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useModuleAccess } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { computePayslip } from "@/lib/calc"
import { capitalize, formatDate, formatMoney, formatMonth, formatNumber, toISODate } from "@/lib/format"
import { department, payslipStatus, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Payslip } from "@/lib/types"

type Row = Payslip & ReturnType<typeof computePayslip> & { name: string; matricule: string; department: string; position: string }

export default function PayrollPage() {
  const payslips = useStore((s) => s.payslips)
  const update = useStore((s) => s.update)
  const generate = useStore((s) => s.generatePayslips)
  const acc = useModuleAccess("rh_paie")
  const { employeeById, employeeOptions } = useLookups()
  const [editing, setEditing] = useTransientState<Row | null>(null)
  const [viewing, setViewing] = useTransientState<Row | null>(null)

  const rows = React.useMemo<Row[]>(
    () =>
      payslips.flatMap((p) => {
        const e = employeeById.get(p.employeeId)
        if (!e) return []
        return [{ ...p, ...computePayslip(p), name: `${e.firstName} ${e.lastName}`, matricule: e.matricule, department: e.department, position: e.position }]
      }),
    [payslips, employeeById]
  )
  const periods = React.useMemo(() => [...new Set(payslips.map((p) => p.period))].sort().reverse(), [payslips])
  const currentPeriod = format(new Date(), "yyyy-MM")

  const config = React.useMemo<FilterConfig<Row>>(
    () => ({
      search: { placeholder: "Employé, matricule…", fields: (r) => [r.name, r.matricule, r.position] },
      facets: [
        { id: "period", label: "Période", options: periods.map((p) => ({ value: p, label: capitalize(formatMonth(p)) })), accessor: (r) => r.period },
        { id: "status", label: "Statut", options: toOptions(payslipStatus), accessor: (r) => r.status },
        { id: "department", label: "Service", options: toOptions(department), accessor: (r) => r.department },
        { id: "employee", label: "Employé", options: employeeOptions, accessor: (r) => r.employeeId },
      ],
      ranges: [
        { id: "gross", label: "Salaire brut", unit: "FCFA", accessor: (r) => r.gross },
        { id: "net", label: "Net à payer", unit: "FCFA", accessor: (r) => r.net },
      ],
    }),
    [periods, employeeOptions]
  )
  const filters = useFilters(rows, config)
  // Par défaut : période la plus récente
  React.useEffect(() => {
    if (periods.length && !filters.state.facets.period) filters.setFacet("period", [periods[0]])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periods.length])
  const data = filters.filtered

  const k = {
    gross: data.reduce((s, r) => s + r.gross, 0),
    net: data.reduce((s, r) => s + r.net, 0),
    social: data.reduce((s, r) => s + r.cnps, 0),
    taxes: data.reduce((s, r) => s + r.irpp + r.cac + r.cfc + r.rav + r.tdl, 0),
    cost: data.reduce((s, r) => s + r.employerCost, 0),
    toValidate: data.filter((r) => r.status === "brouillon").length,
    toPay: data.filter((r) => r.status === "valide").length,
  }

  const history = React.useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => format(subMonths(new Date(), 5 - i), "yyyy-MM"))
    return months.map((m) => {
      const own = rows.filter((r) => r.period === m)
      return { period: m, label: formatDate(`${m}-01`, "MMM yy"), net: own.reduce((s, r) => s + r.net, 0), deductions: own.reduce((s, r) => s + r.deductions, 0) }
    })
  }, [rows])

  const pdf = (r: Row) => {
    const e = employeeById.get(r.employeeId)
    if (e) void downloadPayslip(r, e)
  }

  const setStatus = (ids: string[], status: Payslip["status"]) => {
    ids.forEach((id) => update("payslips", id, { status, paidAt: status === "paye" ? toISODate(new Date()) : undefined }))
    toast.success(`${ids.length} bulletin(s) → ${payslipStatus[status].label}`)
  }

  const columns: Column<Row>[] = [
    { id: "name", header: "Employé", accessor: (r) => r.name, cell: (r) => <PersonCell name={r.name} sub={`${r.matricule} · ${r.position}`} />, className: "min-w-[220px]" },
    { id: "period", header: "Période", accessor: (r) => r.period, cell: (r) => capitalize(formatMonth(r.period)), exportValue: (r) => formatMonth(r.period), hideOnMobile: true },
    { id: "department", header: "Service", accessor: (r) => department[r.department as keyof typeof department], hideOnMobile: true, defaultHidden: true },
    { id: "base", header: "Base", accessor: (r) => r.baseSalary, cell: (r) => formatMoney(r.baseSalary, { currency: false }), align: "right", exportType: "money", hideOnMobile: true, defaultHidden: true },
    { id: "gross", header: "Brut", accessor: (r) => r.gross, cell: (r) => formatMoney(r.gross, { currency: false }), align: "right", exportType: "money", footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.gross, 0), { currency: false }) },
    { id: "cnps", header: "CNPS", accessor: (r) => r.cnps, cell: (r) => formatMoney(r.cnps, { currency: false }), align: "right", exportType: "money", hideOnMobile: true },
    { id: "irpp", header: "IRPP+CAC", accessor: (r) => r.irpp + r.cac, cell: (r) => formatMoney(r.irpp + r.cac, { currency: false }), align: "right", exportType: "money", hideOnMobile: true },
    { id: "deductions", header: "Retenues", accessor: (r) => r.deductions, cell: (r) => formatMoney(r.deductions, { currency: false }), align: "right", exportType: "money", hideOnMobile: true, footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.deductions, 0), { currency: false }) },
    { id: "net", header: "Net à payer", accessor: (r) => r.net, cell: (r) => <span className="font-semibold">{formatMoney(r.net, { currency: false })}</span>, align: "right", exportType: "money", footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.net, 0), { currency: false }) },
    { id: "cost", header: "Coût employeur", accessor: (r) => r.employerCost, cell: (r) => formatMoney(r.employerCost, { currency: false }), align: "right", exportType: "money", defaultHidden: true },
    { id: "status", header: "Statut", accessor: (r) => payslipStatus[r.status].label, cell: (r) => <StatusBadge def={payslipStatus[r.status]} /> },
  ]

  return (
    <Page>
      <PageHeader
        icon={LuBanknote}
        title="Bulletins de paie"
        description="Préparation, validation et paiement de la paie mensuelle."
        actions={
          acc.write && <Button
            onClick={() => {
              const n = generate(currentPeriod)
              toast[n ? "success" : "info"](n ? `${n} bulletin(s) générés` : "Tous les bulletins du mois existent déjà", { description: capitalize(formatMonth(currentPeriod)) })
              filters.setFacet("period", [currentPeriod])
            }}
          >
            <LuRefreshCw /> Générer la paie du mois
          </Button>
        }
      />
      <Card>
        <CardContent>
          <FilterBar filters={filters} />
        </CardContent>
      </Card>
      <StatGrid>
        <StatCard index={0} label="Masse salariale brute" value={formatMoney(k.gross, { compact: true })} icon={LuCoins} hint={`${formatNumber(data.length)} bulletin(s)`} />
        <StatCard index={1} label="Net à payer" value={formatMoney(k.net, { compact: true })} icon={LuWallet} tone="green" hint={`${k.toPay} validé(s) à payer`} />
        <StatCard index={2} label="Cotisations & impôts" value={formatMoney(k.social + k.taxes, { compact: true })} icon={LuBuilding2} tone="orange" hint={`CNPS ${formatMoney(k.social, { compact: true })}`} />
        <StatCard index={3} label="Coût employeur" value={formatMoney(k.cost, { compact: true })} icon={LuBanknote} tone="blue" hint={`${k.toValidate} brouillon(s)`} />
      </StatGrid>
      <ChartCard title="Évolution de la masse salariale" description="Net versé et retenues, 6 derniers mois">
        <TimeBarChart data={history} stacked series={[{ key: "net", label: "Net à payer", color: "var(--chart-1)" }, { key: "deductions", label: "Retenues", color: "var(--chart-2)" }]} />
      </ChartCard>
      <Card>
        <CardContent>
          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={setViewing}
            selectable={acc.write}
            pageSize={20}
            defaultSort={{ id: "name" }}
            exportOptions={{
              filename: "livre-de-paie",
              title: "Livre de paie",
              subtitle: filters.describe(),
              summary: [
                { label: "Brut", value: formatMoney(k.gross) },
                { label: "Net à payer", value: formatMoney(k.net) },
                { label: "Cotisations & impôts", value: formatMoney(k.social + k.taxes) },
                { label: "Coût employeur", value: formatMoney(k.cost) },
              ],
            }}
            bulkActions={(sel, clear) => (
              <>
                <Button variant="outline" size="sm" onClick={() => { setStatus(sel.filter((r) => r.status === "brouillon").map((r) => r.id), "valide"); clear() }}>
                  <LuCircleCheck /> Valider
                </Button>
                <Button variant="outline" size="sm" onClick={() => { setStatus(sel.filter((r) => r.status === "valide").map((r) => r.id), "paye"); clear() }}>
                  <LuWallet /> Marquer payés
                </Button>
              </>
            )}
            rowActions={(r) => (
              <RowActions
                actions={[
                  { label: "Voir le bulletin", icon: LuEye, onSelect: () => setViewing(r) },
                  { label: "Télécharger PDF", icon: LuFileDown, onSelect: () => pdf(r) },
                  { label: "Éléments variables", icon: LuPencil, onSelect: () => setEditing(r), hidden: r.status !== "brouillon" || !acc.write },
                  { label: "Valider", icon: LuCircleCheck, onSelect: () => setStatus([r.id], "valide"), hidden: r.status !== "brouillon" || !acc.write },
                  { label: "Marquer payé", icon: LuWallet, onSelect: () => setStatus([r.id], "paye"), hidden: r.status !== "valide" || !acc.write },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>
      <PayslipFormDialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)} payslip={editing} employeeName={editing?.name} />
      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing?.name}
        description={viewing ? `${viewing.matricule} · ${capitalize(formatMonth(viewing.period))}` : undefined}
        badge={viewing && <StatusBadge def={payslipStatus[viewing.status]} />}
        footer={
          viewing && (
            <>
              {viewing.status === "brouillon" && acc.write && (
                <Button variant="outline" onClick={() => { const r = viewing; setViewing(null); setEditing(r) }}>
                  <LuPencil /> Modifier
                </Button>
              )}
              <Button onClick={() => pdf(viewing)}>
                <LuFileDown /> PDF
              </Button>
            </>
          )
        }
      >
        {viewing && <PayslipDetail row={viewing} />}
      </DetailSheet>
    </Page>
  )
}
