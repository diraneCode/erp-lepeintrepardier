"use client"

import * as React from "react"
import { useForm, type Control, type UseFormSetValue } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, format } from "date-fns"

import { ComboboxField, DateField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields"
import { lineItemsSchema } from "@/components/forms/line-items-editor"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { ProformaEditor, type ProformaForm } from "@/components/modules/commercial/proforma-editor"
import { useCurrentUser, useModuleAccess, useScopedClientOptions } from "@/hooks/use-access"
import { useLookups } from "@/hooks/use-lookups"
import { quoteStatus, toOptions } from "@/lib/labels"
import { nextProformaNumber } from "@/lib/proforma"
import { uid, useStore } from "@/lib/store"
import type { LineItem, Quote } from "@/lib/types"

const surfaceSchema = z.object({
  designation: z.string().trim().min(2, "Désignation requise"),
  quantity: z.number({ error: "Quantité requise" }).positive("Doit être positive"),
  unit: z.string().trim().min(1, "Unité requise"),
  treatment: z.string(),
  commercialName: z.string(),
})

const schema = z
  .object({
    clientId: z.string().min(1, "Client requis"),
    ownerId: z.string().min(1, "Commercial requis"),
    date: z.string().min(1, "Date requise"),
    validUntil: z.string().min(1, "Date de validité requise"),
    status: z.enum(["brouillon", "envoye", "accepte", "refuse", "expire"]),
    project: z.string().trim().min(3, "Intitulé du projet requis"),
    site: z.string().trim().min(2, "Lieu requis"),
    issuedIn: z.string().trim().min(2, "Ville requise"),
    surfaces: z.array(surfaceSchema),
    items: lineItemsSchema,
    applyTax: z.boolean(),
    notes: z.string().optional(),
  })
  .refine((v) => v.validUntil >= v.date, { path: ["validUntil"], message: "Doit être postérieure à la date de la proforma" })
type FormValues = z.infer<typeof schema>

const defaults = (q?: Quote, ownerId = ""): FormValues => ({
  clientId: q?.clientId ?? "",
  ownerId: q?.ownerId ?? ownerId,
  date: q?.date ?? format(new Date(), "yyyy-MM-dd"),
  validUntil: q?.validUntil ?? format(addDays(new Date(), 30), "yyyy-MM-dd"),
  status: q?.status ?? "brouillon",
  project: q?.project ?? "",
  site: q?.site ?? "",
  issuedIn: q?.issuedIn ?? "Douala",
  surfaces: q?.surfaces ?? [{ designation: "", quantity: Number.NaN, unit: "m²", treatment: "", commercialName: "" }],
  // Les anciennes lignes sans rubrique sont rangées dans « Traitement »
  items: q?.items.map((i) => ({ ...i, section: i.section ?? "traitement", custom: i.custom ?? !i.productId })) ?? [],
  applyTax: q ? q.items.some((i) => i.taxRate > 0) : false,
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
    if (open) form.reset(defaults(quote, me?.id ?? ""))
  }, [open, quote, form, acc.global, me])

  const onSubmit = form.handleSubmit((values) => {
    const { applyTax, ...rest } = values
    const items: LineItem[] = values.items.map((i) => ({ ...i, discount: 0, taxRate: applyTax ? 19.25 : 0 }))
    if (quote) {
      update("quotes", quote.id, { ...rest, items })
      toast.success("Proforma mise à jour", { description: quote.number })
    } else {
      const number = nextProformaNumber(useStore.getState().quotes, new Date(`${values.date}T00:00:00`))
      add("quotes", { ...rest, items, id: uid("d"), number })
      toast.success("Proforma créée", { description: `N° ${number}` })
    }
    onOpenChange(false)
  })

  const itemsError = form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={quote ? `Modifier la proforma ${quote.number}` : "Nouvelle facture proforma"}
      description="Les quantités des produits se calculent à partir de la surface et de la couverture."
      onSubmit={onSubmit}
      size="xl"
      submitLabel={quote ? "Enregistrer" : "Créer la proforma"}
    >
      <div className="flex flex-col gap-6">
        <FormSection title="En-tête">
          <FormGrid cols={3}>
            <ComboboxField control={form.control} name="clientId" label="Doit (client)" required options={clientOptions} className="sm:col-span-2" />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(quoteStatus)} />
            <TextField control={form.control} name="project" label="Projet" required placeholder="Ex : Traitement parking" className="sm:col-span-2" />
            <TextField control={form.control} name="site" label="Lieu" required placeholder="Ex : Yaoundé - Bastos" />
            <DateField control={form.control} name="date" label="Date" required />
            <DateField control={form.control} name="validUntil" label="Valable jusqu'au" required />
            <TextField control={form.control} name="issuedIn" label="Fait à" required />
            {acc.global && <ComboboxField control={form.control} name="ownerId" label="Commercial" required options={employeeOptions} />}
          </FormGrid>
        </FormSection>
        <ProformaEditor
          control={form.control as unknown as Control<ProformaForm>}
          setValue={form.setValue as unknown as UseFormSetValue<ProformaForm>}
          error={itemsError}
        />
        <FormGrid>
          <SwitchField control={form.control} name="applyTax" label="Appliquer la TVA (19,25 %)" description="Désactivée : montants présentés hors taxes, comme sur la proforma type" />
          <TextareaField control={form.control} name="notes" label="Conditions / notes" rows={3} placeholder="Délais, conditions de paiement…" />
        </FormGrid>
      </div>
    </FormDialog>
  )
}
