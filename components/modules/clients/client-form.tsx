"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { ComboboxField, NumberField, SelectField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useCurrentUser, useModuleAccess } from "@/hooks/use-access"
import { clientSegment, clientStatus, cityOptions, toOptions } from "@/lib/labels"
import { toISODate } from "@/lib/format"
import { nextCode, uid, useStore } from "@/lib/store"
import type { Client } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const schema = z.object({
  name: z.string().trim().min(2, "Le nom doit contenir au moins 2 caractères"),
  type: z.enum(["entreprise", "particulier"]),
  contactName: z.string().trim().min(2, "Nom du contact requis"),
  email: z.union([z.email("Adresse e-mail invalide"), z.literal("")]),
  phone: z.string().trim().regex(/^\+?[0-9\s]{8,}$/, "Numéro de téléphone invalide"),
  city: z.string().min(1, "Ville requise"),
  address: z.string().trim().min(3, "Adresse requise"),
  segment: z.enum(["btp", "particulier", "revendeur", "administration", "hotellerie"]),
  status: z.enum(["actif", "inactif"]),
  ownerId: z.string().min(1, "Commercial requis"),
  creditLimit: z.number({ error: "Montant requis" }).min(0, "Le plafond doit être positif"),
  notes: z.string().optional(),
})

type FormValues = z.infer<typeof schema>

const defaults = (c?: Client): FormValues => ({
  name: c?.name ?? "",
  type: c?.type ?? "entreprise",
  contactName: c?.contactName ?? "",
  email: c?.email ?? "",
  phone: c?.phone ?? "+237 ",
  city: c?.city ?? "Douala",
  address: c?.address ?? "",
  segment: c?.segment ?? "btp",
  status: c?.status ?? "actif",
  ownerId: c?.ownerId ?? "",
  creditLimit: c?.creditLimit ?? 0,
  notes: c?.notes ?? "",
})

function ClientFormDialogContent({ open, onOpenChange, client }: { open: boolean; onOpenChange: (o: boolean) => void; client?: Client }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const log = useStore((s) => s.log)
  const { employeeOptions } = useLookups(["employeeOptions"])
  const acc = useModuleAccess("clients")
  const me = useCurrentUser()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(client) })

  React.useEffect(() => {
    // Hors vision globale, le client est rattaché à l'utilisateur connecté
    if (open) form.reset({ ...defaults(client), ownerId: client?.ownerId ?? (acc.global ? "" : me?.id ?? "") })
  }, [open, client, form, acc.global, me])

  const onSubmit = form.handleSubmit(async (values) => {
    if (client) {
      if (!(await update("clients", client.id, values))) return
      log("Modification", "Clients", values.name)
      toast.success("Client mis à jour", { description: values.name })
    } else {
      const code = nextCode("CLI", useStore.getState().clients.map((c) => c.code))
      if (!(await add("clients", { ...values, id: uid("cl"), code, createdAt: toISODate(new Date()) }))) return
      log("Création", "Clients", values.name)
      toast.success("Client créé", { description: `${values.name} (${code})` })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={client ? "Modifier le client" : "Nouveau client"}
      description={client ? `${client.code} · ${client.name}` : "Renseignez les informations du client ou du prospect."}
      onSubmit={onSubmit}
      size="lg"
      submitLabel={client ? "Enregistrer" : "Créer le client"}
    >
      <div className="flex flex-col gap-6">
        <FormSection title="Identité">
          <FormGrid>
            <TextField control={form.control} name="name" label="Raison sociale / nom" required placeholder="Ex : BatiPlus Sarl" className="sm:col-span-2" />
            <SelectField control={form.control} name="type" label="Type" required options={[{ value: "entreprise", label: "Entreprise" }, { value: "particulier", label: "Particulier" }]} />
            <SelectField control={form.control} name="segment" label="Segment" required options={toOptions(clientSegment)} />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(clientStatus)} />
            {acc.global && <ComboboxField control={form.control} name="ownerId" label="Commercial responsable" required options={employeeOptions} placeholder="Choisir un commercial" />}
          </FormGrid>
        </FormSection>
        <FormSection title="Coordonnées">
          <FormGrid>
            <TextField control={form.control} name="contactName" label="Personne de contact" required />
            <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
            <TextField control={form.control} name="email" label="E-mail" type="email" placeholder="contact@exemple.cm" />
            <SelectField control={form.control} name="city" label="Ville" required options={cityOptions} />
            <TextField control={form.control} name="address" label="Adresse" required className="sm:col-span-2" placeholder="Quartier, rue, repère" />
          </FormGrid>
        </FormSection>
        <FormSection title="Conditions commerciales">
          <FormGrid>
            <NumberField control={form.control} name="creditLimit" label="Plafond de crédit" suffix="FCFA" min={0} step={50000} description="0 = paiement comptant uniquement" />
            <TextareaField control={form.control} name="notes" label="Notes internes" rows={3} className="sm:col-span-2" />
          </FormGrid>
        </FormSection>
      </div>
    </FormDialog>
  )
}

export const ClientFormDialog = lazyDialog(ClientFormDialogContent)
