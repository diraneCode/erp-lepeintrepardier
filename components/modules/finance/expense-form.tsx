"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { format } from "date-fns"

import { ComboboxField, DateField, NumberField, SelectField, SwitchField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess } from "@/hooks/use-access"
import { expenseCategory, paymentMethod, toOptions } from "@/lib/labels"
import { nextNumber, uid, useStore } from "@/lib/store"
import type { Expense } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const schema = z.object({
  date: z.string().min(1, "Date requise").refine((d) => d <= format(new Date(), "yyyy-MM-dd"), "La date ne peut être dans le futur"),
  category: z.enum(["loyer", "transport", "fournitures", "marketing", "maintenance", "energie", "telecom", "impots", "achats", "autres"]),
  description: z.string().trim().min(3, "Description requise"),
  supplier: z.string().trim().min(2, "Fournisseur / bénéficiaire requis"),
  amount: z.number({ error: "Montant requis" }).positive("Le montant doit être positif").max(100_000_000, "Montant anormalement élevé"),
  paymentMethod: z.enum(["especes", "mobile_money", "carte", "virement", "cheque"]),
  locationId: z.string().min(1, "Site requis"),
  submittedBy: z.string().min(1, "Demandeur requis"),
  hasReceipt: z.boolean(),
})
type FormValues = z.infer<typeof schema>

const defaults = (e?: Expense): FormValues => ({
  date: e?.date ?? format(new Date(), "yyyy-MM-dd"),
  category: e?.category ?? "fournitures",
  description: e?.description ?? "",
  supplier: e?.supplier ?? "",
  amount: e?.amount ?? Number.NaN,
  paymentMethod: e?.paymentMethod === "credit" ? "virement" : e?.paymentMethod ?? "especes",
  locationId: e?.locationId ?? "",
  submittedBy: e?.submittedBy ?? "",
  hasReceipt: e?.hasReceipt ?? true,
})

function ExpenseFormDialogContent({ open, onOpenChange, expense }: { open: boolean; onOpenChange: (o: boolean) => void; expense?: Expense }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { locationOptions: allLocations, employeeOptions } = useLookups(["locationOptions", "employeeOptions"])
  const acc = useModuleAccess("depenses")
  const me = useCurrentUser()
  const locationOptions = acc.global ? allLocations : allLocations.filter((l) => l.value === me?.locationId)
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(expense) })
  React.useEffect(() => {
    if (open)
      form.reset({
        ...defaults(expense),
        submittedBy: expense?.submittedBy ?? (acc.global ? "" : me?.id ?? ""),
        locationId: expense?.locationId ?? (acc.global ? "" : me?.locationId ?? ""),
      })
  }, [open, expense, form, acc.global, me])

  const onSubmit = form.handleSubmit(async (v) => {
    if (expense) {
      if (!(await update("expenses", expense.id, v))) return
      toast.success("Dépense mise à jour", { description: expense.number })
    } else {
      const number = nextNumber("DEP", useStore.getState().expenses, 4)
      if (!(await add("expenses", { ...v, id: uid("x"), number, status: "en_attente" }))) return
      toast.success("Dépense soumise pour approbation", { description: number })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={expense ? `Modifier ${expense.number}` : "Nouvelle dépense"} description="Les dépenses sont soumises à approbation avant paiement." onSubmit={onSubmit} size="lg">
      <FormGrid>
        <TextField control={form.control} name="description" label="Objet" required className="sm:col-span-2" placeholder="Ex : Carburant camion livraison" />
        <SelectField control={form.control} name="category" label="Catégorie" required options={toOptions(expenseCategory)} />
        <NumberField control={form.control} name="amount" label="Montant TTC" required suffix="FCFA" min={0} step={500} />
        <TextField control={form.control} name="supplier" label="Fournisseur / bénéficiaire" required />
        <DateField control={form.control} name="date" label="Date de la dépense" required />
        <SelectField control={form.control} name="paymentMethod" label="Mode de paiement" required options={toOptions(paymentMethod).filter((o) => o.value !== "credit")} />
        <SelectField control={form.control} name="locationId" label="Site concerné" required options={locationOptions} />
        {acc.global && <ComboboxField control={form.control} name="submittedBy" label="Demandeur" required options={employeeOptions} />}
        <SwitchField control={form.control} name="hasReceipt" label="Justificatif fourni" description="Facture ou reçu joint" />
      </FormGrid>
    </FormDialog>
  )
}

export const ExpenseFormDialog = lazyDialog(ExpenseFormDialogContent)
