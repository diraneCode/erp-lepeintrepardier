"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, format } from "date-fns"

import { ComboboxField, DateField, SelectField, SwitchField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid } from "@/components/shared/form-dialog"
import { useCurrentUser, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useLookups } from "@/hooks/use-lookups"
import { followupChannel, followupTarget, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { Followup, FollowupTarget } from "@/lib/types"

const day = (n = 0) => format(addDays(new Date(), n), "yyyy-MM-dd")

/** Options de cible d'une relance, limitées au périmètre de l'utilisateur. */
export function useFollowupTargets() {
  const { prospects, clients, quotes, invoices } = useScopedData()
  const { clientName } = useLookups()
  return React.useMemo(
    () => ({
      prospect: prospects.filter((p) => p.status !== "converti" && p.status !== "perdu").map((p) => ({ value: p.id, label: p.name, hint: p.code })),
      client: clients.map((c) => ({ value: c.id, label: c.name, hint: c.code })),
      devis: quotes.filter((q) => q.status === "envoye" || q.status === "brouillon").map((q) => ({ value: q.id, label: `${q.number} — ${clientName(q.clientId)}`, hint: q.date })),
      facture: invoices.filter((i) => i.status === "emise" || i.status === "partielle").map((i) => ({ value: i.id, label: `${i.number} — ${clientName(i.clientId)}`, hint: i.dueDate })),
    }),
    [prospects, clients, quotes, invoices, clientName]
  )
}

const schema = z.object({
  targetType: z.enum(["prospect", "client", "devis", "facture"]),
  targetId: z.string().min(1, "Choisissez l'élément à relancer"),
  subject: z.string().trim().min(3, "Objet requis"),
  channel: z.enum(["appel", "email", "sms", "whatsapp", "visite"]),
  priority: z.enum(["haute", "normale", "basse"]),
  dueDate: z.string().min(1, "Date requise"),
  ownerId: z.string().min(1, "Responsable requis"),
  notes: z.string().optional(),
})
type FormValues = z.infer<typeof schema>

export interface FollowupPreset {
  targetType?: FollowupTarget
  targetId?: string
  subject?: string
}

export function FollowupFormDialog({ open, onOpenChange, followup, preset }: { open: boolean; onOpenChange: (o: boolean) => void; followup?: Followup; preset?: FollowupPreset }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const acc = useModuleAccess("relances")
  const me = useCurrentUser()
  const { employeeOptions } = useLookups()
  const targets = useFollowupTargets()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  React.useEffect(() => {
    if (!open) return
    form.reset({
      targetType: followup?.targetType ?? preset?.targetType ?? "prospect",
      targetId: followup?.targetId ?? preset?.targetId ?? "",
      subject: followup?.subject ?? preset?.subject ?? "",
      channel: followup?.channel ?? "appel",
      priority: followup?.priority ?? "normale",
      dueDate: followup?.dueDate ?? day(1),
      ownerId: followup?.ownerId ?? (acc.global ? "" : me?.id ?? ""),
      notes: followup?.notes ?? "",
    })
  }, [open, followup, preset, form, acc.global, me])

  const targetType = useWatch({ control: form.control, name: "targetType" }) ?? "prospect"
  const prevType = React.useRef(targetType)
  React.useEffect(() => {
    if (prevType.current !== targetType && form.formState.dirtyFields.targetType) form.setValue("targetId", "")
    prevType.current = targetType
  }, [targetType, form])

  const onSubmit = form.handleSubmit((v) => {
    if (followup) {
      update("followups", followup.id, v)
      toast.success("Relance mise à jour")
    } else {
      add("followups", { ...v, id: uid("rl"), status: "a_faire", createdAt: day() })
      toast.success("Relance programmée", { description: `${v.subject} — ${format(new Date(`${v.dueDate}T00:00:00`), "dd/MM/yyyy")}` })
    }
    onOpenChange(false)
  })

  // Une cible imposée (ex. depuis une fiche) n'est plus modifiable
  const locked = !!preset?.targetId && !followup
  const options = targets[targetType]
  const currentMissing = locked && !options.some((o) => o.value === preset?.targetId)

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={followup ? "Modifier la relance" : "Programmer une relance"} onSubmit={onSubmit} size="lg">
      <FormGrid>
        <SelectField control={form.control} name="targetType" label="Relance concernant" required options={toOptions(followupTarget)} disabled={locked} />
        <ComboboxField
          control={form.control}
          name="targetId"
          label={followupTarget[targetType]}
          required
          options={currentMissing ? [{ value: preset!.targetId!, label: preset?.subject ?? "Élément sélectionné" }, ...options] : options}
          disabled={locked}
        />
        <TextField control={form.control} name="subject" label="Objet" required className="sm:col-span-2" placeholder="Ex : relance paiement, rappel devis…" />
        <SelectField control={form.control} name="channel" label="Canal" required options={toOptions(followupChannel)} />
        <SelectField control={form.control} name="priority" label="Priorité" required options={[{ value: "haute", label: "Haute" }, { value: "normale", label: "Normale" }, { value: "basse", label: "Basse" }]} />
        <DateField control={form.control} name="dueDate" label="À effectuer le" required />
        {acc.global && <ComboboxField control={form.control} name="ownerId" label="Responsable" required options={employeeOptions} />}
        <TextareaField control={form.control} name="notes" label="Notes" rows={2} className="sm:col-span-2" />
      </FormGrid>
    </FormDialog>
  )
}

const doneSchema = z
  .object({
    outcome: z.string().trim().min(3, "Décrivez le résultat de la relance"),
    scheduleNext: z.boolean(),
    nextDate: z.string().optional(),
    nextChannel: z.enum(["appel", "email", "sms", "whatsapp", "visite"]),
  })
  .refine((v) => !v.scheduleNext || !!v.nextDate, { path: ["nextDate"], message: "Date de la prochaine relance requise" })
type DoneValues = z.infer<typeof doneSchema>

export function CompleteFollowupDialog({ followup, onOpenChange }: { followup: Followup | null; onOpenChange: (o: boolean) => void }) {
  const complete = useStore((s) => s.completeFollowup)
  const form = useForm<DoneValues>({ resolver: zodResolver(doneSchema) })
  React.useEffect(() => {
    if (followup) form.reset({ outcome: "", scheduleNext: false, nextDate: day(7), nextChannel: followup.channel })
  }, [followup, form])
  const scheduleNext = useWatch({ control: form.control, name: "scheduleNext" })

  const onSubmit = form.handleSubmit((v) => {
    if (!followup) return
    complete(followup.id, v.outcome, v.scheduleNext && v.nextDate ? { dueDate: v.nextDate, channel: v.nextChannel } : undefined)
    toast.success("Relance effectuée", { description: v.scheduleNext ? "Prochaine relance programmée" : undefined })
    onOpenChange(false)
  })

  return (
    <FormDialog open={!!followup} onOpenChange={onOpenChange} title="Compte rendu de relance" description={followup?.subject} onSubmit={onSubmit} submitLabel="Marquer comme effectuée">
      <FormGrid cols={1}>
        <TextareaField control={form.control} name="outcome" label="Résultat" required rows={3} placeholder="Ex : promesse de paiement sous 7 jours" />
        <SwitchField control={form.control} name="scheduleNext" label="Programmer une nouvelle relance" />
        {scheduleNext && (
          <FormGrid>
            <DateField control={form.control} name="nextDate" label="Prochaine relance le" required />
            <SelectField control={form.control} name="nextChannel" label="Canal" required options={toOptions(followupChannel)} />
          </FormGrid>
        )}
      </FormGrid>
    </FormDialog>
  )
}
