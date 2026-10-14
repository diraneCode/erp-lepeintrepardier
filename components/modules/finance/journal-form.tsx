"use client"

import * as React from "react"
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"
import { LuPlus, LuTrash2 } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Combobox, DateField, SelectField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { ACCOUNTS } from "@/lib/data/accounts"
import { formatMoney } from "@/lib/format"
import { journalCode, toOptions } from "@/lib/labels"
import { nextNumber, uid, useStore } from "@/lib/store"
import { cn } from "@/lib/utils"

const lineSchema = z
  .object({
    account: z.string().min(1, "Compte requis"),
    label: z.string().trim().min(2, "Libellé requis"),
    debit: z.number().min(0),
    credit: z.number().min(0),
  })
  .refine((l) => (l.debit > 0) !== (l.credit > 0), { path: ["debit"], message: "Saisir un débit OU un crédit" })

const schema = z
  .object({
    date: z.string().min(1, "Date requise"),
    journal: z.enum(["VE", "AC", "BQ", "CA", "OD", "PA"]),
    label: z.string().trim().min(3, "Libellé requis"),
    reference: z.string().trim().min(2, "Pièce justificative requise"),
    status: z.enum(["brouillon", "valide"]),
    lines: z.array(lineSchema).min(2, "Une écriture comporte au moins deux lignes"),
  })
  .refine((v) => Math.round(v.lines.reduce((s, l) => s + (l.debit || 0) - (l.credit || 0), 0)) === 0, {
    path: ["lines"],
    message: "L'écriture n'est pas équilibrée : total débit ≠ total crédit",
  })
type FormValues = z.infer<typeof schema>

const accountOptions = ACCOUNTS.map((a) => ({ value: a.code, label: `${a.code} — ${a.name}`, hint: `Classe ${a.class}` }))

export function JournalEntryFormDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const add = useStore((s) => s.add)
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })
  const { fields, append, remove } = useFieldArray({ control: form.control, name: "lines" })
  const lines = useWatch({ control: form.control, name: "lines" }) ?? []
  const debit = lines.reduce((s, l) => s + (Number.isFinite(l?.debit) ? l.debit : 0), 0)
  const credit = lines.reduce((s, l) => s + (Number.isFinite(l?.credit) ? l.credit : 0), 0)

  React.useEffect(() => {
    if (open)
      form.reset({
        date: format(new Date(), "yyyy-MM-dd"),
        journal: "OD",
        label: "",
        reference: "",
        status: "valide",
        lines: [
          { account: "", label: "", debit: 0, credit: 0 },
          { account: "", label: "", debit: 0, credit: 0 },
        ],
      })
  }, [open, form])

  const onSubmit = form.handleSubmit((v) => {
    const number = nextNumber("EC", useStore.getState().journalEntries)
    add("journalEntries", { ...v, id: uid("je"), number })
    toast.success("Écriture enregistrée", { description: number })
    onOpenChange(false)
  })

  const linesError = form.formState.errors.lines?.root?.message ?? form.formState.errors.lines?.message
  const num = (v: string) => (v === "" ? 0 : Number(v))

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Nouvelle écriture comptable" description="Saisie en partie double — l'écriture doit être équilibrée." onSubmit={onSubmit} size="xl">
      <div className="flex flex-col gap-6">
        <FormSection title="En-tête">
          <FormGrid cols={3}>
            <DateField control={form.control} name="date" label="Date" required />
            <SelectField control={form.control} name="journal" label="Journal" required options={toOptions(journalCode).map((o) => ({ ...o, label: `${o.value} — ${o.label}` }))} />
            <SelectField control={form.control} name="status" label="Statut" required options={[{ value: "brouillon", label: "Brouillard" }, { value: "valide", label: "Validée" }]} />
            <TextField control={form.control} name="label" label="Libellé" required className="sm:col-span-2" />
            <TextField control={form.control} name="reference" label="Pièce" required placeholder="N° de pièce" />
          </FormGrid>
        </FormSection>
        <FormSection title="Lignes">
          <div className="hidden grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_130px_130px_36px] gap-2 px-1 text-xs font-medium text-muted-foreground md:grid">
            <span>Compte</span>
            <span>Libellé</span>
            <span className="text-right">Débit</span>
            <span className="text-right">Crédit</span>
            <span />
          </div>
          {fields.map((f, i) => {
            const err = form.formState.errors.lines?.[i]
            return (
              <div key={f.id} className="grid grid-cols-2 gap-2 rounded-lg border p-3 md:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)_130px_130px_36px] md:border-0 md:p-0">
                <div className="col-span-2 md:col-span-1">
                  <Controller
                    control={form.control}
                    name={`lines.${i}.account`}
                    render={({ field, fieldState }) => <Combobox value={field.value} onChange={field.onChange} options={accountOptions} placeholder="Compte…" invalid={fieldState.invalid} />}
                  />
                </div>
                <Controller control={form.control} name={`lines.${i}.label`} render={({ field, fieldState }) => <Input {...field} placeholder="Libellé" aria-invalid={fieldState.invalid} className="col-span-2 md:col-span-1" />} />
                <Controller control={form.control} name={`lines.${i}.debit`} render={({ field }) => <Input type="number" min={0} aria-label="Débit" aria-invalid={!!err?.debit} className="text-right tabular" value={field.value || ""} onChange={(e) => field.onChange(num(e.target.value))} />} />
                <Controller control={form.control} name={`lines.${i}.credit`} render={({ field }) => <Input type="number" min={0} aria-label="Crédit" className="text-right tabular" value={field.value || ""} onChange={(e) => field.onChange(num(e.target.value))} />} />
                <Button type="button" variant="ghost" size="icon" className="justify-self-end text-muted-foreground hover:text-destructive" onClick={() => remove(i)} disabled={fields.length <= 2} aria-label="Supprimer la ligne">
                  <LuTrash2 />
                </Button>
                {err && <p className="col-span-full text-xs text-destructive">{err.account?.message ?? err.label?.message ?? err.debit?.message}</p>}
              </div>
            )
          })}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <Button type="button" variant="outline" size="sm" onClick={() => append({ account: "", label: form.getValues("label") ?? "", debit: 0, credit: 0 })}>
              <LuPlus /> Ajouter une ligne
            </Button>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-muted/60 p-3 text-sm sm:w-72">
              <dt className="text-muted-foreground">Total débit</dt>
              <dd className="text-right tabular">{formatMoney(debit)}</dd>
              <dt className="text-muted-foreground">Total crédit</dt>
              <dd className="text-right tabular">{formatMoney(credit)}</dd>
              <dt className="border-t pt-1 font-medium">Écart</dt>
              <dd className={cn("border-t pt-1 text-right font-semibold tabular", Math.round(debit - credit) === 0 ? "text-success" : "text-destructive")}>{formatMoney(debit - credit)}</dd>
            </dl>
          </div>
          {linesError && <p className="text-sm text-destructive">{linesError}</p>}
        </FormSection>
      </div>
    </FormDialog>
  )
}
