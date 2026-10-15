"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { NumberField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { Button } from "@/components/ui/button"
import { computePayslip, overtimePay, recordedOvertime } from "@/lib/calc"
import { formatDuration, formatMoney, formatMonth } from "@/lib/format"
import { useStore } from "@/lib/store"
import type { Payslip } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const amount = z.number({ error: "Montant requis" }).min(0, "Doit être positif")
const schema = z.object({
  baseSalary: z.number({ error: "Montant requis" }).positive(),
  overtime: amount,
  bonuses: amount,
  transportAllowance: amount,
  housingAllowance: amount,
  otherDeductions: amount,
})
type FormValues = z.infer<typeof schema>

function PayslipFormDialogContent({ open, onOpenChange, payslip, employeeName }: { open: boolean; onOpenChange: (o: boolean) => void; payslip?: Payslip | null; employeeName?: string }) {
  const update = useStore((s) => s.update)
  const attendance = useStore((s) => s.attendance)
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })
  // Heures supplémentaires pointées sur la période du bulletin
  const pointedOvertime = React.useMemo(
    () =>
      payslip
        ? attendance
            .filter((a) => a.employeeId === payslip.employeeId && a.date.startsWith(payslip.period) && (a.status === "present" || a.status === "retard" || a.status === "mission"))
            .reduce((s, a) => s + recordedOvertime(a), 0)
        : 0,
    [attendance, payslip]
  )
  React.useEffect(() => {
    if (open && payslip)
      form.reset({
        baseSalary: payslip.baseSalary,
        overtime: payslip.overtime,
        bonuses: payslip.bonuses,
        transportAllowance: payslip.transportAllowance,
        housingAllowance: payslip.housingAllowance,
        otherDeductions: payslip.otherDeductions,
      })
  }, [open, payslip, form])
  const values = useWatch({ control: form.control })
  const safe = (v?: number) => (Number.isFinite(v) ? (v as number) : 0)
  const preview = computePayslip({
    baseSalary: safe(values.baseSalary),
    overtime: safe(values.overtime),
    bonuses: safe(values.bonuses),
    transportAllowance: safe(values.transportAllowance),
    housingAllowance: safe(values.housingAllowance),
    otherDeductions: safe(values.otherDeductions),
  })

  const suggestedOvertime = overtimePay(safe(values.baseSalary), pointedOvertime)
  const applyOvertime = () => form.setValue("overtime", suggestedOvertime, { shouldDirty: true, shouldValidate: true })

  const onSubmit = form.handleSubmit(async (v) => {
    if (!payslip) return
    if (!(await update("payslips", payslip.id, v))) return
    toast.success("Bulletin mis à jour", { description: `Net à payer : ${formatMoney(computePayslip(v).net)}` })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Éléments variables de paie" description={payslip ? `${employeeName} · ${formatMonth(payslip.period)}` : undefined} onSubmit={onSubmit} size="lg">
      <div className="flex flex-col gap-6">
        <FormSection title="Gains">
          <FormGrid cols={3}>
            <NumberField control={form.control} name="baseSalary" label="Salaire de base" required suffix="FCFA" step={5000} />
            <NumberField
              control={form.control}
              name="overtime"
              label="Heures supplémentaires"
              suffix="FCFA"
              step={1000}
              description={pointedOvertime ? `${formatDuration(pointedOvertime)} pointées → ${formatMoney(suggestedOvertime)}` : "Aucune heure sup. pointée"}
            />
            <NumberField control={form.control} name="bonuses" label="Primes" suffix="FCFA" step={5000} />
            <NumberField control={form.control} name="transportAllowance" label="Indemnité de transport" suffix="FCFA" step={1000} />
            <NumberField control={form.control} name="housingAllowance" label="Indemnité de logement" suffix="FCFA" step={1000} />
          </FormGrid>
        </FormSection>
        {pointedOvertime > 0 && safe(values.overtime) !== suggestedOvertime && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-2 text-sm">
            <span className="text-muted-foreground">
              Pointages du mois : <span className="font-medium text-foreground">{formatDuration(pointedOvertime)}</span> d&apos;heures sup., soit{" "}
              <span className="font-medium text-foreground">{formatMoney(suggestedOvertime)}</span> (majorations 20 / 30 / 40 %).
            </span>
            <Button type="button" variant="outline" size="xs" onClick={applyOvertime}>
              Appliquer
            </Button>
          </div>
        )}
        <FormSection title="Retenues">
          <FormGrid cols={3}>
            <NumberField control={form.control} name="otherDeductions" label="Avances / autres retenues" suffix="FCFA" step={5000} />
          </FormGrid>
        </FormSection>
        <dl className="grid grid-cols-2 gap-x-6 gap-y-1.5 rounded-lg bg-muted/60 p-4 text-sm sm:grid-cols-4">
          <dt className="text-muted-foreground">Brut</dt>
          <dd className="text-right font-medium tabular sm:text-left">{formatMoney(preview.gross)}</dd>
          <dt className="text-muted-foreground">Cotisations & impôts</dt>
          <dd className="text-right font-medium tabular sm:text-left">− {formatMoney(preview.deductions)}</dd>
          <dt className="font-semibold">Net à payer</dt>
          <dd className="text-right font-semibold text-primary tabular sm:text-left">{formatMoney(preview.net)}</dd>
          <dt className="text-muted-foreground">Coût employeur</dt>
          <dd className="text-right tabular sm:text-left">{formatMoney(preview.employerCost)}</dd>
        </dl>
      </div>
    </FormDialog>
  )
}

export const PayslipFormDialog = lazyDialog(PayslipFormDialogContent)
