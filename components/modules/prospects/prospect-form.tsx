"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"

import { ComboboxField, NumberField, SelectField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useCurrentUser, useModuleAccess } from "@/hooks/use-access"
import { useLookups } from "@/hooks/use-lookups"
import { cityOptions, clientSegment, leadSource, prospectStatus, toOptions } from "@/lib/labels"
import { toISODate } from "@/lib/format"
import { nextCode, uid, useStore } from "@/lib/store"
import type { Prospect } from "@/lib/types"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const schema = z
  .object({
    type: z.enum(["entreprise", "particulier"]),
    name: z.string().trim().min(2, "Nom requis"),
    contactName: z.string().trim().min(2, "Contact requis"),
    phone: z.string().trim().regex(/^\+?[0-9\s]{8,}$/, "Numéro de téléphone invalide"),
    email: z.union([z.email("Adresse e-mail invalide"), z.literal("")]),
    city: z.string().min(1, "Ville requise"),
    segment: z.enum(["btp", "particulier", "revendeur", "administration", "hotellerie"]),
    source: z.enum(["recommandation", "site_web", "salon", "appel_entrant", "terrain", "reseaux_sociaux", "evenement", "campagne"]),
    need: z.string().trim().min(3, "Décrivez le besoin"),
    potential: z.number({ error: "Montant requis" }).min(0),
    status: z.enum(["nouveau", "contacte", "qualifie", "perdu"]),
    ownerId: z.string().min(1, "Responsable requis"),
    nextAction: z.string().optional(),
    lostReason: z.string().optional(),
  })
  .refine((v) => v.status !== "perdu" || (v.lostReason ?? "").trim().length >= 3, { path: ["lostReason"], message: "Indiquez la raison de la perte" })
type FormValues = z.infer<typeof schema>

function ProspectFormDialogContent({ open, onOpenChange, prospect }: { open: boolean; onOpenChange: (o: boolean) => void; prospect?: Prospect }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions } = useLookups(["employeeOptions"])
  const acc = useModuleAccess("prospects")
  const me = useCurrentUser()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      type: prospect?.type ?? "entreprise",
      name: prospect?.name ?? "",
      contactName: prospect?.contactName ?? "",
      phone: prospect?.phone ?? "+237 ",
      email: prospect?.email ?? "",
      city: prospect?.city ?? "Douala",
      segment: prospect?.segment ?? "btp",
      source: prospect?.source ?? "terrain",
      need: prospect?.need ?? "",
      potential: prospect?.potential ?? 0,
      status: prospect && prospect.status !== "converti" ? prospect.status : "nouveau",
      ownerId: prospect?.ownerId ?? (acc.global ? "" : me?.id ?? ""),
      nextAction: prospect?.nextAction ?? "",
      lostReason: prospect?.lostReason ?? "",
    })
  }, [open, prospect, form, acc.global, me])

  const status = useWatch({ control: form.control, name: "status" })

  const onSubmit = form.handleSubmit(async (v) => {
    const payload = { ...v, lostReason: v.status === "perdu" ? v.lostReason : undefined, nextAction: v.nextAction || undefined }
    if (prospect) {
      if (!(await update("prospects", prospect.id, payload))) return
      toast.success("Prospect mis à jour", { description: v.name })
    } else {
      const code = nextCode("PRO", useStore.getState().prospects.map((p) => p.code))
      if (!(await add("prospects", { ...payload, id: uid("pp"), code, createdAt: toISODate(new Date()) }))) return
      toast.success("Prospect créé", { description: `${v.name} (${code})` })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={prospect ? "Modifier le prospect" : "Nouveau prospect"} description="Une piste commerciale à qualifier puis convertir en client." onSubmit={onSubmit} size="lg">
      <div className="flex flex-col gap-6">
        <FormSection title="Identité">
          <FormGrid>
            <TextField control={form.control} name="name" label="Entreprise / nom" required className="sm:col-span-2" />
            <SelectField control={form.control} name="type" label="Type" required options={[{ value: "entreprise", label: "Entreprise" }, { value: "particulier", label: "Particulier" }]} />
            <SelectField control={form.control} name="segment" label="Segment" required options={toOptions(clientSegment)} />
            <TextField control={form.control} name="contactName" label="Contact" required />
            <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
            <TextField control={form.control} name="email" label="E-mail" type="email" />
            <SelectField control={form.control} name="city" label="Ville" required options={cityOptions} />
          </FormGrid>
        </FormSection>
        <FormSection title="Qualification">
          <FormGrid>
            <TextareaField control={form.control} name="need" label="Besoin exprimé" required rows={2} className="sm:col-span-2" />
            <NumberField control={form.control} name="potential" label="Potentiel estimé" suffix="FCFA" min={0} step={100000} />
            <SelectField control={form.control} name="source" label="Origine" required options={toOptions(leadSource)} />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(prospectStatus).filter((o) => o.value !== "converti")} />
            {acc.global && <ComboboxField control={form.control} name="ownerId" label="Responsable" required options={employeeOptions} />}
            {status === "perdu" ? (
              <TextField control={form.control} name="lostReason" label="Raison de la perte" required className="sm:col-span-2" />
            ) : (
              <TextField control={form.control} name="nextAction" label="Prochaine action" placeholder="Ex : envoyer le catalogue" className="sm:col-span-2" />
            )}
          </FormGrid>
        </FormSection>
      </div>
    </FormDialog>
  )
}

export const ProspectFormDialog = lazyDialog(ProspectFormDialogContent)
