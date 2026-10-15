"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"

import { ComboboxField, DateField, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { DAILY_MINUTES, MAX_DAILY_OVERTIME, overtimeMinutes, workedMinutes } from "@/lib/calc"
import { formatDuration } from "@/lib/format"
import { attendanceStatus, toOptions } from "@/lib/labels"
import { useStore } from "@/lib/store"
import type { Attendance } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Format HH:MM")

const schema = z
  .object({
    employeeId: z.string().min(1, "Employé requis"),
    date: z.string().min(1, "Date requise"),
    status: z.enum(["present", "retard", "absent", "conge", "mission"]),
    checkIn: z.union([time, z.literal("")]),
    checkOut: z.union([time, z.literal("")]),
    breakMinutes: z.number({ error: "Requis" }).int().min(0).max(240, "Maximum 4 h"),
    overtimeMinutes: z.number({ error: "Requis" }).int("Nombre entier de minutes").min(0).max(MAX_DAILY_OVERTIME, "Maximum 12 h par jour"),
    note: z.string().optional(),
  })
  .superRefine((v, ctx) => {
    const working = v.status === "present" || v.status === "retard" || v.status === "mission"
    if (working && !v.checkIn) ctx.addIssue({ code: "custom", path: ["checkIn"], message: "Heure d'arrivée requise" })
    if (v.checkIn && v.checkOut && v.checkOut <= v.checkIn) ctx.addIssue({ code: "custom", path: ["checkOut"], message: "Le départ doit suivre l'arrivée" })
    if (v.status === "absent" && !v.note?.trim()) ctx.addIssue({ code: "custom", path: ["note"], message: "Motif d'absence requis" })
  })
type FormValues = z.infer<typeof schema>

function AttendanceFormDialogContent({ open, onOpenChange, record }: { open: boolean; onOpenChange: (o: boolean) => void; record?: Partial<Attendance> }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions } = useLookups(["employeeOptions"])
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (open)
      form.reset({
        employeeId: record?.employeeId ?? "",
        date: record?.date ?? format(new Date(), "yyyy-MM-dd"),
        status: record?.status ?? "present",
        checkIn: record?.checkIn ?? (record?.id ? "" : format(new Date(), "HH:mm")),
        checkOut: record?.checkOut ?? "",
        breakMinutes: record?.breakMinutes ?? 60,
        overtimeMinutes: record?.overtimeMinutes ?? (record?.checkIn ? overtimeMinutes({ checkIn: record.checkIn, checkOut: record.checkOut ?? null, breakMinutes: record.breakMinutes ?? 0 }) : 0),
        note: record?.note ?? "",
      })
  }, [open, record, form])

  const [status, checkIn, checkOut, breakMinutes, overtimeValueRaw] = useWatch({ control: form.control, name: ["status", "checkIn", "checkOut", "breakMinutes", "overtimeMinutes"] })
  const overtimeValue = Number.isFinite(overtimeValueRaw) ? overtimeValueRaw : 0
  const worked = workedMinutes({ checkIn: checkIn || null, checkOut: checkOut || null, breakMinutes: Number.isFinite(breakMinutes) ? breakMinutes : 0 })
  const working = status === "present" || status === "retard" || status === "mission"
  const computedOvertime = Math.max(0, worked - DAILY_MINUTES)

  // Tant que les RH ne l'ont pas modifié, le champ suit le dépassement calculé
  React.useEffect(() => {
    if (!form.formState.dirtyFields.overtimeMinutes) form.setValue("overtimeMinutes", working ? computedOvertime : 0)
  }, [computedOvertime, working, form])

  const onSubmit = form.handleSubmit(async (v) => {
    const payload = {
      ...v,
      checkIn: working ? v.checkIn || null : null,
      checkOut: working ? v.checkOut || null : null,
      breakMinutes: working ? v.breakMinutes : 0,
      overtimeMinutes: working ? v.overtimeMinutes : 0,
    }
    const existing = useStore.getState().attendance.find((a) => a.employeeId === v.employeeId && a.date === v.date)
    const id = record?.id ?? existing?.id
    if (id) {
      if (!(await update("attendance", id, payload))) return
    } else if (!(await add("attendance", { ...payload, id: `pt_${v.employeeId}_${v.date}` }))) return
    toast.success(id ? "Pointage mis à jour" : "Pointage enregistré")
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={record?.id ? "Modifier le pointage" : "Saisir un pointage"} description="Un seul pointage par employé et par jour : une saisie existante est remplacée." onSubmit={onSubmit} size="lg">
      <FormGrid>
        <ComboboxField control={form.control} name="employeeId" label="Employé" required options={employeeOptions} disabled={!!record?.id} />
        <DateField control={form.control} name="date" label="Date" required disabled={!!record?.id} />
        <SelectField control={form.control} name="status" label="Statut" required options={toOptions(attendanceStatus)} />
        <NumberField control={form.control} name="breakMinutes" label="Pause" suffix="min" min={0} step={15} disabled={!working} />
        <TextField control={form.control} name="checkIn" label="Arrivée" type="time" disabled={!working} />
        <TextField control={form.control} name="checkOut" label="Départ" type="time" disabled={!working} />
        <NumberField
          control={form.control}
          name="overtimeMinutes"
          label="Heures supplémentaires"
          suffix="min"
          min={0}
          step={15}
          disabled={!working}
          description={working ? `Dépassement de la journée de 8 h : ${computedOvertime ? formatDuration(computedOvertime) : "aucun"}` : undefined}
        />
        <TextField control={form.control} name="note" label={status === "absent" ? "Motif d'absence" : "Observation"} required={status === "absent"} className="sm:col-span-2" />
        {working && (
          <div className="rounded-lg bg-muted/60 px-3 py-2 text-sm sm:col-span-2">
            Temps de travail effectif : <span className="font-semibold tabular">{formatDuration(worked)}</span>
            {overtimeValue > 0 && (
              <>
                {" "}· heures sup. retenues : <span className="font-semibold tabular">{formatDuration(overtimeValue)}</span>
              </>
            )}
          </div>
        )}
      </FormGrid>
    </FormDialog>
  )
}

export const AttendanceFormDialog = lazyDialog(AttendanceFormDialogContent)
