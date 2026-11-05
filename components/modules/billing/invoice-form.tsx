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
import { nextNumber, uid, useStore } from "@/lib/store"
import type { Invoice } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const schema = z
  .object({
    clientId: z.string().min(1, "Client requis"),
    boutiqueId: z.string().min(1, "Point de vente requis"),
    date: z.string().min(1, "Date requise"),
    dueDate: z.string().min(1, "Échéance requise"),
    status: z.enum(["brouillon", "emise"]),
    items: lineItemsSchema,
    notes: z.string().optional(),
  })
  .refine((v) => v.dueDate >= v.date, { path: ["dueDate"], message: "L'échéance doit suivre la date de facture" })
type FormValues = z.infer<typeof schema>

const defaults = (inv?: Invoice): FormValues => ({
  clientId: inv?.clientId ?? "",
  boutiqueId: inv?.boutiqueId ?? "",
  date: inv?.date ?? format(new Date(), "yyyy-MM-dd"),
  dueDate: inv?.dueDate ?? format(addDays(new Date(), 30), "yyyy-MM-dd"),
  status: inv?.status === "brouillon" ? "brouillon" : "emise",
  items: inv?.items ?? [{ ...emptyLine }],
  notes: inv?.notes ?? "",
})

function InvoiceFormDialogContent({ open, onOpenChange, invoice }: { open: boolean; onOpenChange: (o: boolean) => void; invoice?: Invoice }) {
  const createInvoice = useStore((s) => s.createInvoice)
  const updateInvoice = useStore((s) => s.updateInvoice)
  const { shopOptions: allShops } = useLookups(["shopOptions"])
  const clientOptions = useScopedClientOptions()
  const acc = useModuleAccess("facturation")
  const me = useCurrentUser()
  const myShop = allShops.find((s) => s.value === me?.locationId)
  const shopOptions = acc.global || !myShop ? allShops : [myShop]
  // Une facture émise le reste : son statut suit ensuite les encaissements
  const issued = !!invoice && invoice.status !== "brouillon"
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(invoice) })

  React.useEffect(() => {
    if (open) form.reset({ ...defaults(invoice), boutiqueId: invoice?.boutiqueId ?? (!acc.global && myShop ? myShop.value : "") })
  }, [open, invoice, form, acc.global, myShop])

  const onSubmit = form.handleSubmit(async (values) => {
    if (invoice) {
      if (!(await updateInvoice(invoice.id, { ...values, notes: values.notes ?? "" }))) return
      toast.success("Facture mise à jour", { description: invoice.number })
    } else {
      const number = nextNumber("FAC", useStore.getState().invoices)
      if (!(await createInvoice({ ...values, id: uid("f"), number, amountPaid: 0 }))) return
      toast.success(values.status === "brouillon" ? "Brouillon enregistré" : "Facture émise", { description: number })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={invoice ? `Modifier ${invoice.number}` : "Nouvelle facture"}
      description={
        invoice?.saleId
          ? "Facture issue d'une vente : les produits et quantités ne se corrigent qu'en annulant la vente."
          : issued
            ? "L'écriture de vente sera recalculée. Le total ne peut pas descendre sous le montant déjà encaissé."
            : "Une écriture de vente est générée automatiquement à l'émission."
      }
      onSubmit={onSubmit}
      size="xl"
      submitLabel={invoice ? "Enregistrer" : "Créer la facture"}
    >
      <div className="flex flex-col gap-6">
        <FormSection title="En-tête">
          <FormGrid cols={3}>
            <ComboboxField control={form.control} name="clientId" label="Client" required options={clientOptions} className="sm:col-span-2" />
            <SelectField control={form.control} name="status" label="Statut" required disabled={issued} options={[{ value: "brouillon", label: "Brouillon" }, { value: "emise", label: "Émise" }]} />
            <DateField control={form.control} name="date" label="Date de facture" required />
            <DateField control={form.control} name="dueDate" label="Échéance" required />
            <SelectField control={form.control} name="boutiqueId" label="Point de vente" required options={shopOptions} />
          </FormGrid>
        </FormSection>
        <FormSection title="Lignes">
          <LineItemsEditor control={form.control} setValue={form.setValue} error={form.formState.errors.items?.root?.message ?? form.formState.errors.items?.message} />
        </FormSection>
        <TextareaField control={form.control} name="notes" label="Mentions / notes" rows={2} />
      </div>
    </FormDialog>
  )
}

export const InvoiceFormDialog = lazyDialog(InvoiceFormDialogContent)
