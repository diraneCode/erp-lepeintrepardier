"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, format } from "date-fns"

import { ComboboxField, DateField, SelectField, TextareaField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { ANNUAL_LEAVE_DAYS, businessDaysBetween } from "@/lib/calc"
import { leaveType, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { Leave } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const schema = z
  .object({
    employeeId: z.string().min(1, "Employé requis"),
    type: z.enum(["annuel", "maladie", "maternite", "sans_solde", "exceptionnel", "recuperation"]),
    startDate: z.string().min(1, "Date de début requise"),
    endDate: z.string().min(1, "Date de fin requise"),
    reason: z.string().trim().min(3, "Motif requis"),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "La fin doit suivre le début" })
  .refine((v) => businessDaysBetween(v.startDate, v.endDate) > 0, { path: ["endDate"], message: "La période ne contient aucun jour ouvré" })
type FormValues = z.infer<typeof schema>

export function annualTaken(leaves: Leave[], employeeId: string, year: string, excludeId?: string) {
  return leaves
    .filter((l) => l.employeeId === employeeId && l.type === "annuel" && (l.status === "approuve" || l.status === "en_attente") && l.startDate.startsWith(year) && l.id !== excludeId)
    .reduce((s, l) => s + l.days, 0)
}

function LeaveFormDialogContent({
  open,
  onOpenChange,
  leave,
  employeeId: lockedEmployee,
}: {
  open: boolean
  onOpenChange: (o: boolean) => void
  leave?: Leave
  /** Espace personnel : la demande est faite pour cet employé uniquement */
  employeeId?: string
}) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const leaves = useStore((s) => s.leaves)
  const { employeeOptions } = useLookups(["employeeOptions"])
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open)
      form.reset({
        employeeId: leave?.employeeId ?? lockedEmployee ?? "",
        type: leave?.type ?? "annuel",
        startDate: leave?.startDate ?? format(addDays(new Date(), 7), "yyyy-MM-dd"),
        endDate: leave?.endDate ?? format(addDays(new Date(), 11), "yyyy-MM-dd"),
        reason: leave?.reason ?? "Congé annuel",
      })
  }, [open, leave, form, lockedEmployee])

  const [employeeId, type, start, end] = useWatch({ control: form.control, name: ["employeeId", "type", "startDate", "endDate"] })
  const days = start && end ? businessDaysBetween(start, end) : 0
  const taken = employeeId && start ? annualTaken(leaves, employeeId, start.slice(0, 4), leave?.id) : 0

  const onSubmit = form.handleSubmit(async (v) => {
    const n = businessDaysBetween(v.startDate, v.endDate)
    const overlap = leaves.some((l) => l.employeeId === v.employeeId && l.id !== leave?.id && (l.status === "approuve" || l.status === "en_attente") && l.startDate <= v.endDate && l.endDate >= v.startDate)
    if (overlap) {
      form.setError("startDate", { message: "Chevauche une autre demande de cet employé" })
      return
    }
    if (v.type === "annuel" && annualTaken(leaves, v.employeeId, v.startDate.slice(0, 4), leave?.id) + n > ANNUAL_LEAVE_DAYS) {
      form.setError("endDate", { message: `Solde insuffisant (${ANNUAL_LEAVE_DAYS - taken} j disponibles)` })
      return
    }
    if (leave) {
      if (!(await update("leaves", leave.id, { ...v, days: n }))) return
    } else if (!(await add("leaves", { ...v, id: uid("l"), days: n, status: "en_attente", requestedAt: format(new Date(), "yyyy-MM-dd") }))) return
    toast.success(leave ? "Demande mise à jour" : "Demande de congé soumise", { description: `${n} jour(s) ouvré(s)` })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={leave ? "Modifier la demande" : "Nouvelle demande de congé"} onSubmit={onSubmit} size="lg">
      <FormGrid>
        {!lockedEmployee && <ComboboxField control={form.control} name="employeeId" label="Employé" required options={employeeOptions} />}
        <SelectField control={form.control} name="type" label="Type de congé" required options={toOptions(leaveType)} className={lockedEmployee ? "sm:col-span-2" : undefined} />
        <DateField control={form.control} name="startDate" label="Du" required />
        <DateField control={form.control} name="endDate" label="Au (inclus)" required />
        <TextareaField control={form.control} name="reason" label="Motif" required rows={2} className="sm:col-span-2" />
        <div className="grid grid-cols-2 gap-3 rounded-lg bg-muted/60 p-3 text-sm sm:col-span-2">
          <div>
            <div className="text-xs text-muted-foreground">Durée</div>
            <div className="font-semibold tabular">{days} jour(s) ouvré(s)</div>
          </div>
          {type === "annuel" && employeeId && (
            <div>
              <div className="text-xs text-muted-foreground">Solde annuel après demande</div>
              <div className={days + taken > ANNUAL_LEAVE_DAYS ? "font-semibold text-destructive tabular" : "font-semibold tabular"}>
                {ANNUAL_LEAVE_DAYS - taken - days} / {ANNUAL_LEAVE_DAYS} j
              </div>
            </div>
          )}
        </div>
      </FormGrid>
    </FormDialog>
  )
}

export const LeaveFormDialog = lazyDialog(LeaveFormDialogContent)
