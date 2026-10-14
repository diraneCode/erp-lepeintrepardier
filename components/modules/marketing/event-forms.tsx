"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, format } from "date-fns"

import { ComboboxField, DateField, NumberField, SelectField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useCurrentUser } from "@/hooks/use-access"
import { useLookups } from "@/hooks/use-lookups"
import { eventAudience, eventStatus, eventType, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { MarketingEvent } from "@/lib/types"

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide")

const eventSchema = z
  .object({
    title: z.string().trim().min(3, "Intitulé requis"),
    type: z.enum(["formation", "seminaire", "atelier", "demonstration", "salon"]),
    audience: z.enum(["clients", "artisans", "revendeurs", "interne", "grand_public"]),
    startDate: z.string().min(1, "Date de début requise"),
    endDate: z.string().min(1, "Date de fin requise"),
    startTime: time,
    endTime: time,
    location: z.string().trim().min(3, "Lieu requis"),
    trainerId: z.string(),
    externalSpeaker: z.string().optional(),
    capacity: z.number({ error: "Capacité requise" }).int().min(1, "Au moins 1 place"),
    budget: z.number({ error: "Budget requis" }).min(0),
    cost: z.number({ error: "Montant requis" }).min(0),
    fee: z.number({ error: "Montant requis" }).min(0),
    status: z.enum(["planifie", "inscriptions", "complet", "termine", "annule"]),
    description: z.string().trim().min(10, "Décrivez l'événement (10 caractères min.)"),
    program: z.string().optional(),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ["endDate"], message: "La fin doit suivre le début" })
  .refine((v) => v.startDate !== v.endDate || v.endTime > v.startTime, { path: ["endTime"], message: "L'heure de fin doit suivre l'heure de début" })
  .refine((v) => !!v.trainerId || (v.externalSpeaker ?? "").trim().length >= 3, { path: ["externalSpeaker"], message: "Indiquez un animateur interne ou un intervenant externe" })
type EventValues = z.infer<typeof eventSchema>

export function EventFormDialog({ open, onOpenChange, event }: { open: boolean; onOpenChange: (o: boolean) => void; event?: MarketingEvent }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { employeeOptions } = useLookups()
  const me = useCurrentUser()
  const form = useForm<EventValues>({ resolver: zodResolver(eventSchema) })

  React.useEffect(() => {
    if (!open) return
    const d = format(addDays(new Date(), 14), "yyyy-MM-dd")
    form.reset({
      title: event?.title ?? "",
      type: event?.type ?? "formation",
      audience: event?.audience ?? "artisans",
      startDate: event?.startDate ?? d,
      endDate: event?.endDate ?? d,
      startTime: event?.startTime ?? "09:00",
      endTime: event?.endTime ?? "17:00",
      location: event?.location ?? "Salle de formation — siège Bassa",
      trainerId: event?.trainerId ?? "",
      externalSpeaker: event?.externalSpeaker ?? "",
      capacity: event?.capacity ?? 25,
      budget: event?.budget ?? 300_000,
      cost: event?.cost ?? 0,
      fee: event?.fee ?? 0,
      status: event?.status ?? "planifie",
      description: event?.description ?? "",
      program: event?.program ?? "",
    })
  }, [open, event, form])

  const onSubmit = form.handleSubmit((v) => {
    if (event && v.capacity < event.participants.filter((p) => p.status !== "annule").length) {
      form.setError("capacity", { message: "Inférieure au nombre d'inscrits actuel" })
      return
    }
    const payload = { ...v, trainerId: v.trainerId || undefined, externalSpeaker: v.externalSpeaker || undefined }
    if (event) {
      update("events", event.id, payload)
      toast.success("Événement mis à jour", { description: v.title })
    } else {
      add("events", { ...payload, id: uid("ev"), participants: [], ownerId: me?.id ?? "" })
      toast.success("Événement créé", { description: v.title })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={event ? "Modifier l'événement" : "Organiser un séminaire / une formation"} onSubmit={onSubmit} size="xl">
      <div className="flex flex-col gap-6">
        <FormSection title="Événement">
          <FormGrid cols={3}>
            <TextField control={form.control} name="title" label="Intitulé" required className="sm:col-span-2" />
            <SelectField control={form.control} name="type" label="Type" required options={toOptions(eventType)} />
            <SelectField control={form.control} name="audience" label="Public" required options={toOptions(eventAudience)} />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(eventStatus)} />
            <NumberField control={form.control} name="capacity" label="Places" required min={1} step={1} />
          </FormGrid>
        </FormSection>
        <FormSection title="Date & lieu">
          <FormGrid cols={3}>
            <DateField control={form.control} name="startDate" label="Du" required />
            <DateField control={form.control} name="endDate" label="Au" required />
            <TextField control={form.control} name="location" label="Lieu" required />
            <TextField control={form.control} name="startTime" label="Heure de début" required type="time" />
            <TextField control={form.control} name="endTime" label="Heure de fin" required type="time" />
          </FormGrid>
        </FormSection>
        <FormSection title="Animation & budget">
          <FormGrid cols={3}>
            <ComboboxField control={form.control} name="trainerId" label="Animateur interne" options={employeeOptions} />
            <TextField control={form.control} name="externalSpeaker" label="Intervenant externe" placeholder="Nom / organisme" className="sm:col-span-2" />
            <NumberField control={form.control} name="budget" label="Budget" suffix="FCFA" min={0} step={50000} />
            <NumberField control={form.control} name="cost" label="Dépensé" suffix="FCFA" min={0} step={10000} />
            <NumberField control={form.control} name="fee" label="Frais d'inscription" suffix="FCFA" min={0} step={1000} description="0 = gratuit" />
          </FormGrid>
        </FormSection>
        <FormGrid>
          <TextareaField control={form.control} name="description" label="Description" required rows={3} />
          <TextareaField control={form.control} name="program" label="Programme" rows={3} placeholder="Accueil · théorie · pratique · évaluation…" />
        </FormGrid>
      </div>
    </FormDialog>
  )
}

const participantSchema = z.object({
  clientId: z.string(),
  name: z.string().trim().min(2, "Nom requis"),
  company: z.string().optional(),
  phone: z.string().trim().regex(/^\+?[0-9\s]{8,}$/, "Numéro de téléphone invalide"),
  email: z.union([z.email("Adresse e-mail invalide"), z.literal("")]),
  status: z.enum(["inscrit", "confirme", "present", "absent", "annule"]),
})
type ParticipantValues = z.infer<typeof participantSchema>

export function ParticipantFormDialog({ event, open, onOpenChange }: { event: MarketingEvent | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const update = useStore((s) => s.update)
  const clients = useStore((s) => s.clients)
  const form = useForm<ParticipantValues>({ resolver: zodResolver(participantSchema) })
  React.useEffect(() => {
    if (open) form.reset({ clientId: "", name: "", company: "", phone: "+237 ", email: "", status: "inscrit" })
  }, [open, form])

  const clientId = useWatch({ control: form.control, name: "clientId" })
  React.useEffect(() => {
    // Reprend les coordonnées du client sélectionné
    const c = clients.find((x) => x.id === clientId)
    if (c) {
      form.setValue("name", c.contactName)
      form.setValue("company", c.name)
      form.setValue("phone", c.phone)
      form.setValue("email", c.email)
    }
  }, [clientId, clients, form])

  const onSubmit = form.handleSubmit((v) => {
    if (!event) return
    const active = event.participants.filter((p) => p.status !== "annule").length
    if (v.status !== "annule" && active >= event.capacity) {
      form.setError("name", { message: `Événement complet (${event.capacity} places)` })
      return
    }
    if (event.participants.some((p) => p.phone.replace(/\s/g, "") === v.phone.replace(/\s/g, "") && p.status !== "annule")) {
      form.setError("phone", { message: "Ce participant est déjà inscrit" })
      return
    }
    const participant = { ...v, id: uid("pa"), clientId: v.clientId || undefined, company: v.company || undefined, email: v.email || undefined, registeredAt: format(new Date(), "yyyy-MM-dd") }
    const participants = [...event.participants, participant]
    const full = participants.filter((p) => p.status !== "annule").length >= event.capacity
    update("events", event.id, { participants, status: full && event.status === "inscriptions" ? "complet" : event.status })
    toast.success("Participant inscrit", { description: v.name })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title="Inscrire un participant" description={event?.title} onSubmit={onSubmit}>
      <FormGrid>
        <div className="flex flex-col gap-2 sm:col-span-2">
          <span className="text-sm font-medium">Client existant (facultatif)</span>
          <ComboboxField control={form.control} name="clientId" options={clients.map((c) => ({ value: c.id, label: c.name, hint: c.contactName }))} placeholder="Rechercher un client…" />
        </div>
        <TextField control={form.control} name="name" label="Nom du participant" required />
        <TextField control={form.control} name="company" label="Entreprise" />
        <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
        <TextField control={form.control} name="email" label="E-mail" type="email" />
        <SelectField control={form.control} name="status" label="Statut" required options={[{ value: "inscrit", label: "Inscrit" }, { value: "confirme", label: "Confirmé" }, { value: "present", label: "Présent" }]} />
      </FormGrid>
    </FormDialog>
  )
}
