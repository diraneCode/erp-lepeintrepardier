"use client"

import { toast } from "sonner"

import { DescriptionList } from "@/components/shared/detail-sheet"
import { computePayslip } from "@/lib/calc"
import { exportPayslipPDF } from "@/lib/export"
import { capitalize, formatDate, formatMoney, formatMonth } from "@/lib/format"
import { department, payslipStatus } from "@/lib/labels"
import type { Employee, Payslip } from "@/lib/types"

export type PayslipRow = Payslip & ReturnType<typeof computePayslip>

export function withTotals(p: Payslip): PayslipRow {
  return { ...p, ...computePayslip(p) }
}

const earnings = (r: PayslipRow): [string, number][] => [
  ["Salaire de base", r.baseSalary],
  ["Heures supplémentaires", r.overtime],
  ["Primes", r.bonuses],
  ["Indemnité de transport", r.transportAllowance],
  ["Indemnité de logement", r.housingAllowance],
]

const deductions = (r: PayslipRow): [string, number][] => [
  ["CNPS (4,2 %)", r.cnps],
  ["IRPP", r.irpp],
  ["CAC (10 % de l'IRPP)", r.cac],
  ["Crédit foncier (1 %)", r.cfc],
  ["Redevance audiovisuelle", r.rav],
  ["Taxe de développement local", r.tdl],
  ["Avances / autres retenues", r.otherDeductions],
]

export function downloadPayslip(r: PayslipRow, e: Employee) {
  return exportPayslipPDF({
    period: capitalize(formatMonth(r.period)),
    employee: {
      name: `${e.firstName} ${e.lastName}`,
      matricule: e.matricule,
      position: e.position,
      department: department[e.department],
      cnps: e.cnpsNumber,
      hireDate: e.hireDate,
      bank: e.bankAccount ?? "Non renseigné",
    },
    earnings: earnings(r).filter(([, v]) => v > 0),
    deductions: deductions(r).filter(([, v]) => v > 0),
    gross: r.gross,
    net: r.net,
    employerCost: r.employerCost,
    status: payslipStatus[r.status].label,
  }).then(() => toast.success("Bulletin PDF généré", { description: `${e.firstName} ${e.lastName} · ${formatMonth(r.period)}` }))
}

function PayLines({ lines, total }: { lines: [string, number][]; total: [string, number] }) {
  return (
    <dl className="flex flex-col divide-y rounded-lg border text-sm">
      {lines
        .filter(([, v]) => v > 0)
        .map(([l, v]) => (
          <div key={l} className="flex justify-between gap-3 px-3 py-2">
            <dt className="text-muted-foreground">{l}</dt>
            <dd className="tabular">{formatMoney(v)}</dd>
          </div>
        ))}
      <div className="flex justify-between gap-3 bg-muted/50 px-3 py-2 font-semibold">
        <dt>{total[0]}</dt>
        <dd className="tabular">{formatMoney(total[1])}</dd>
      </div>
    </dl>
  )
}

/** Détail d'un bulletin : gains, retenues, net à payer. */
export function PayslipDetail({ row, showEmployerCost = true }: { row: PayslipRow; showEmployerCost?: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Gains</h3>
        <PayLines lines={earnings(row)} total={["Salaire brut", row.gross]} />
      </section>
      <section className="flex flex-col gap-2">
        <h3 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Retenues salariales</h3>
        <PayLines lines={deductions(row)} total={["Total retenues", row.deductions]} />
      </section>
      <div className="flex items-center justify-between rounded-lg bg-primary px-4 py-3 text-primary-foreground">
        <span className="text-sm">Net à payer</span>
        <span className="text-lg font-semibold tabular">{formatMoney(row.net)}</span>
      </div>
      <DescriptionList
        items={[
          ...(showEmployerCost ? [{ label: "Coût employeur estimé", value: formatMoney(row.employerCost) }] : []),
          { label: "Payé le", value: formatDate(row.paidAt) },
        ]}
      />
      <p className="text-xs text-muted-foreground">Barème simplifié à titre indicatif — à valider par le service paie.</p>
    </div>
  )
}
