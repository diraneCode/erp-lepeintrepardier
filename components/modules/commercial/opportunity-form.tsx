"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { ComboboxField, DateField, NumberField, SelectField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess, useScopedClientOptions } from "@/hooks/use-access"
import { opportunitySource, opportunityStage, toOptions } from "@/lib/labels"
import { toISODate } from "@/lib/format"
import { uid, useStore } from "@/lib/store"
import type { Opportunity, OpportunityStage } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

export const STAGE_PROBABILITY: Record<OpportunityStage, number> = {
  prospection: 10,
  qualification: 25,
  proposition: 50,
  negociation: 75,
  gagnee: 100,
  perdue: 0,
}

const schema = z.object({
  title: z.string().trim().min(3, "Intitulé requis (3 caractères min.)"),
  clientId: z.string().min(1, "Client requis"),
  amount: z.number({ error: "Montant requis" }).positive("Le montant doit être supérieur à 0"),
  stage: z.enum(["prospection", "qualification", "proposition", "negociation", "gagnee", "perdue"]),
  probability: z.number({ error: "Probabilité requise" }).min(0).max(100, "Maximum 100 %"),
  expectedClose: z.string().min(1, "Date de clôture requise"),
  ownerId: z.string().min(1, "Responsable requis"),
  source: z.enum(["recommandation", "site_web", "salon", "appel_entrant", "terrain", "reseaux_sociaux"]),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

const defaults = (o?: Opportunity): FormValues => ({
  title: o?.title ?? "",
  clientId: o?.clientId ?? "",
  amount: o?.amount ?? Number.NaN,
  stage: o?.stage ?? "prospection",
  probability: o?.probability ?? 10,
  expectedClose: o?.expectedClose ?? toISODate(new Date(Date.now() + 30 * 86_400_000)),
  ownerId: o?.ownerId ?? "",
  source: o?.source ?? "terrain",
  notes: o?.notes ?? "",
})

function OpportunityFormDialogContent({ open, onOpenChange, opportunity }: { open: boolean; onOpenChange: (o: boolean) => void; opportunity?: Opportunity }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions } = useLookups(["employeeOptions"])
  const clientOptions = useScopedClientOptions()
  const acc = useModuleAccess("opportunites")
  const me = useCurrentUser()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(opportunity) })

  React.useEffect(() => {
    if (open) form.reset({ ...defaults(opportunity), ownerId: opportunity?.ownerId ?? (acc.global ? "" : me?.id ?? "") })
  }, [open, opportunity, form, acc.global, me])

  const stage = form.watch("stage")
  React.useEffect(() => {
    if (form.formState.dirtyFields.stage) form.setValue("probability", STAGE_PROBABILITY[stage])
  }, [stage, form])

  const onSubmit = form.handleSubmit(async (values) => {
    if (opportunity) {
      if (!(await update("opportunities", opportunity.id, values))) return
      toast.success("Opportunité mise à jour")
    } else {
      if (!(await add("opportunities", { ...values, id: uid("o"), createdAt: toISODate(new Date()) }))) return
      toast.success("Opportunité créée", { description: values.title })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={opportunity ? "Modifier l'opportunité" : "Nouvelle opportunité"}
      description="Suivez une affaire du premier contact jusqu'à la signature."
      onSubmit={onSubmit}
      size="lg"
    >
      <FormGrid>
        <TextField control={form.control} name="title" label="Intitulé" required className="sm:col-span-2" placeholder="Ex : Ravalement résidence — Douala" />
        <ComboboxField control={form.control} name="clientId" label="Client" required options={clientOptions} />
        {acc.global && <ComboboxField control={form.control} name="ownerId" label="Responsable" required options={employeeOptions} />}
        <NumberField control={form.control} name="amount" label="Montant estimé" required suffix="FCFA" min={0} step={50000} />
        <DateField control={form.control} name="expectedClose" label="Clôture prévue" required />
        <SelectField control={form.control} name="stage" label="Étape" required options={toOptions(opportunityStage)} />
        <NumberField control={form.control} name="probability" label="Probabilité" suffix="%" min={0} step={5} />
        <SelectField control={form.control} name="source" label="Origine" required options={toOptions(opportunitySource)} />
        <TextareaField control={form.control} name="notes" label="Notes" rows={3} className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  )
}

export const OpportunityFormDialog = lazyDialog(OpportunityFormDialogContent)
