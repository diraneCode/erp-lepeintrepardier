"use client"

import * as React from "react"
import { LuBanknote, LuCoins, LuEye, LuFileDown, LuReceipt, LuWallet } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DetailSheet } from "@/components/shared/detail-sheet"
import { Page, PageHeader } from "@/components/shared/page"
import { RowActions } from "@/components/shared/row-actions"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PayslipDetail, downloadPayslip, withTotals, type PayslipRow } from "@/components/modules/hr/payslip-view"
import { useCurrentUser } from "@/hooks/use-access"
import { useTransientState } from "@/hooks/use-transient-state"
import { capitalize, formatDate, formatMoney, formatMonth, formatNumber } from "@/lib/format"
import { payslipStatus } from "@/lib/labels"
import { useStore } from "@/lib/store"

export default function MyPayslipsPage() {
  const user = useCurrentUser()
  const payslips = useStore((s) => s.payslips)
  const [viewing, setViewing] = useTransientState<PayslipRow | null>(null)

  // Les brouillons ne sont pas visibles par l'employé tant que la paie n'est pas validée
  const mine = React.useMemo(
    () => payslips.filter((p) => p.employeeId === user?.id && p.status !== "brouillon").map(withTotals),
    [payslips, user]
  )
  const years = React.useMemo(() => [...new Set(mine.map((p) => p.period.slice(0, 4)))].sort().reverse(), [mine])
  const [year, setYear] = React.useState<string>("all")
  const data = year === "all" ? mine : mine.filter((p) => p.period.startsWith(year))
  const last = [...mine].sort((a, b) => b.period.localeCompare(a.period))[0]

  const columns: Column<PayslipRow>[] = [
    { id: "period", header: "Période", accessor: (r) => r.period, cell: (r) => <span className="font-medium">{capitalize(formatMonth(r.period))}</span>, exportValue: (r) => formatMonth(r.period) },
    { id: "gross", header: "Brut", accessor: (r) => r.gross, cell: (r) => formatMoney(r.gross), align: "right", exportType: "money", footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.gross, 0)) },
    { id: "deductions", header: "Retenues", accessor: (r) => r.deductions, cell: (r) => formatMoney(r.deductions), align: "right", exportType: "money", hideOnMobile: true },
    { id: "net", header: "Net à payer", accessor: (r) => r.net, cell: (r) => <span className="font-semibold">{formatMoney(r.net)}</span>, align: "right", exportType: "money", footer: (rs) => formatMoney(rs.reduce((s, r) => s + r.net, 0)) },
    { id: "paidAt", header: "Payé le", accessor: (r) => r.paidAt ?? "", cell: (r) => formatDate(r.paidAt), exportType: "date", hideOnMobile: true },
    { id: "status", header: "Statut", accessor: (r) => payslipStatus[r.status].label, cell: (r) => <StatusBadge def={payslipStatus[r.status]} /> },
  ]

  if (!user) return null
  return (
    <Page>
      <PageHeader
        icon={LuReceipt}
        title="Mes bulletins de paie"
        description="Consultez et téléchargez vos bulletins de salaire."
        actions={
          years.length > 0 && (
            <Select value={year} onValueChange={setYear}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les années</SelectItem>
                {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          )
        }
      />
      <StatGrid>
        <StatCard index={0} label="Dernier net à payer" value={last ? formatMoney(last.net, { compact: true }) : "—"} icon={LuWallet} tone="green" hint={last ? capitalize(formatMonth(last.period)) : undefined} />
        <StatCard index={1} label="Cumul brut" value={formatMoney(data.reduce((s, r) => s + r.gross, 0), { compact: true })} icon={LuCoins} hint={year === "all" ? "toutes périodes" : year} />
        <StatCard index={2} label="Cumul net" value={formatMoney(data.reduce((s, r) => s + r.net, 0), { compact: true })} icon={LuBanknote} tone="blue" />
        <StatCard index={3} label="Bulletins disponibles" value={formatNumber(data.length)} icon={LuReceipt} tone="orange" />
      </StatGrid>
      <Card>
        <CardContent>
          <DataTable
            data={data}
            columns={columns}
            getRowId={(r) => r.id}
            onRowClick={setViewing}
            defaultSort={{ id: "period", desc: true }}
            emptyDescription="Aucun bulletin validé pour le moment."
            exportOptions={{ filename: "mes-bulletins", title: `Récapitulatif de paie — ${user.firstName} ${user.lastName}`, subtitle: `${user.matricule}${year === "all" ? "" : ` · ${year}`}` }}
            rowActions={(r) => (
              <RowActions
                actions={[
                  { label: "Voir le bulletin", icon: LuEye, onSelect: () => setViewing(r) },
                  { label: "Télécharger le PDF", icon: LuFileDown, onSelect: () => void downloadPayslip(r, user) },
                ]}
              />
            )}
          />
        </CardContent>
      </Card>
      <DetailSheet
        open={!!viewing}
        onOpenChange={(o) => !o && setViewing(null)}
        title={viewing ? capitalize(formatMonth(viewing.period)) : ""}
        description={`${user.firstName} ${user.lastName} · ${user.matricule}`}
        badge={viewing && <StatusBadge def={payslipStatus[viewing.status]} />}
        footer={
          viewing && (
            <Button onClick={() => void downloadPayslip(viewing, user)}>
              <LuFileDown /> Télécharger le PDF
            </Button>
          )
        }
      >
        {viewing && <PayslipDetail row={viewing} showEmployerCost={false} />}
      </DetailSheet>
    </Page>
  )
}
