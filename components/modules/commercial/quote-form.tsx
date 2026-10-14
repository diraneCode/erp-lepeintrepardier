"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, format } from "date-fns"

import { ComboboxField, DateField, SelectField, TextareaField } from "@/components/forms/fields"
import { LineItemsEditor, emptyLine, lineItemsSchema } from "@/components/forms/line-items-editor"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess, useScopedClientOptions } from "@/hooks/use-access"
import { quoteStatus, toOptions } from "@/lib/labels"
import { nextNumber, uid, useStore } from "@/lib/store"
import type { Quote } from "@/lib/types"

const schema = z
  .object({
    clientId: z.string().min(1, "Client requis"),
    ownerId: z.string().min(1, "Commercial requis"),
    date: z.string().min(1, "Date requise"),
    validUntil: z.string().min(1, "Date de validité requise"),
    status: z.enum(["brouillon", "envoye", "accepte", "refuse", "expire"]),
    items: lineItemsSchema,
    notes: z.string().optional(),
  })
  .refine((v) => v.validUntil >= v.date, { path: ["validUntil"], message: "Doit être postérieure à la date du devis" })
type FormValues = z.infer<typeof schema>

const today = () => format(new Date(), "yyyy-MM-dd")
const defaults = (q?: Quote, ownerId = ""): FormValues => ({
  clientId: q?.clientId ?? "",
  ownerId: q?.ownerId ?? ownerId,
  date: q?.date ?? today(),
  validUntil: q?.validUntil ?? format(addDays(new Date(), 30), "yyyy-MM-dd"),
  status: q?.status ?? "brouillon",
  items: q?.items ?? [{ ...emptyLine }],
  notes: q?.notes ?? "",
})

export function QuoteFormDialog({ open, onOpenChange, quote }: { open: boolean; onOpenChange: (o: boolean) => void; quote?: Quote }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions } = useLookups()
  const clientOptions = useScopedClientOptions()
  const acc = useModuleAccess("devis")
  const me = useCurrentUser()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(quote) })

  React.useEffect(() => {
    if (open) form.reset(defaults(quote, acc.global ? "" : me?.id ?? ""))
  }, [open, quote, form, acc.global, me])

  const onSubmit = form.handleSubmit((values) => {
    if (quote) {
      update("quotes", quote.id, values)
      toast.success("Devis mis à jour", { description: quote.number })
    } else {
      const number = nextNumber("DEV", useStore.getState().quotes, 4)
      add("quotes", { ...values, id: uid("d"), number })
      toast.success("Devis créé", { description: number })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={quote ? `Modifier le devis ${quote.number}` : "Nouveau devis"}
      description="Composez la proposition commerciale ligne par ligne."
      onSubmit={onSubmit}
      size="xl"
      submitLabel={quote ? "Enregistrer" : "Créer le devis"}
    >
      <div className="flex flex-col gap-6">
        <FormSection title="En-tête">
          <FormGrid cols={3}>
            <ComboboxField control={form.control} name="clientId" label="Client" required options={clientOptions} className="sm:col-span-2" />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(quoteStatus)} />
            <DateField control={form.control} name="date" label="Date du devis" required />
            <DateField control={form.control} name="validUntil" label="Valable jusqu'au" required />
            {acc.global && <ComboboxField control={form.control} name="ownerId" label="Commercial" required options={employeeOptions} />}
          </FormGrid>
        </FormSection>
        <FormSection title="Lignes">
          <LineItemsEditor control={form.control} setValue={form.setValue} error={form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message} />
        </FormSection>
        <TextareaField control={form.control} name="notes" label="Conditions / notes" rows={2} placeholder="Délais, conditions de paiement…" />
      </div>
    </FormDialog>
  )
}
