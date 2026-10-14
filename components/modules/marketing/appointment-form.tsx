"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { addDays, format } from "date-fns"

import { ComboboxField, DateField, NumberField, SelectField, TextareaField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useCurrentUser, useModuleAccess, useScopedData } from "@/hooks/use-access"
import { useLookups } from "@/hooks/use-lookups"
import { appointmentStatus, appointmentType, toOptions } from "@/lib/labels"
import { uid, useStore } from "@/lib/store"
import type { Appointment } from "@/lib/types"

const toMin = (t: string) => {
  const [h, m] = t.split(":").map(Number)
  return h * 60 + m
}

const schema = z
  .object({
    title: z.string().trim().min(3, "Objet requis"),
    type: z.enum(["visite_showroom", "visite_chantier", "conseil_couleur", "demonstration", "rendez_vous_commercial", "appel_video"]),
    linkType: z.enum(["client", "prospect", "libre"]),
    targetId: z.string(),
    contactName: z.string().trim().min(2, "Nom du contact requis"),
    phone: z.string().trim().regex(/^\+?[0-9\s]{8,}$/, "Numéro de téléphone invalide"),
    date: z.string().min(1, "Date requise"),
    startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Heure invalide"),
    durationMinutes: z.number({ error: "Durée requise" }).int().min(15, "15 minutes minimum").max(480, "8 heures maximum"),
    location: z.string().trim().min(2, "Lieu requis"),
    assignedTo: z.string().min(1, "Collaborateur requis"),
    status: z.enum(["planifie", "confirme", "realise", "reporte", "annule", "absent"]),
    notes: z.string().optional(),
  })
  .refine((v) => v.linkType === "libre" || !!v.targetId, { path: ["targetId"], message: "Sélectionnez le client ou le prospect" })
  .refine((v) => toMin(v.startTime) >= 7 * 60 && toMin(v.startTime) + v.durationMinutes <= 20 * 60, { path: ["startTime"], message: "Créneau hors des heures d'ouverture (7h–20h)" })
type FormValues = z.infer<typeof schema>

export interface AppointmentPreset {
  clientId?: string
  prospectId?: string
}

export function AppointmentFormDialog({ open, onOpenChange, appointment, preset }: { open: boolean; onOpenChange: (o: boolean) => void; appointment?: Appointment; preset?: AppointmentPreset }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const all = useStore((s) => s.appointments)
  const employees = useStore((s) => s.employees)
  const acc = useModuleAccess("rendez_vous")
  const me = useCurrentUser()
  const { clients, prospects } = useScopedData()
  const { employeeOptions, shopById } = useLookups()
  const form = useForm<FormValues>({ resolver: zodResolver(schema) })

  // Collaborateurs sélectionnables selon la portée
  const hostOptions = acc.global ? employeeOptions : acc.scope === "shop" ? employeeOptions.filter((o) => employees.find((e) => e.id === o.value)?.locationId === me?.locationId) : employeeOptions.filter((o) => o.value === me?.id)

  React.useEffect(() => {
    if (!open) return
    const a = appointment
    const linkType: FormValues["linkType"] = a?.clientId || preset?.clientId ? "client" : a?.prospectId || preset?.prospectId ? "prospect" : "libre"
    const c = clients.find((x) => x.id === (a?.clientId ?? preset?.clientId))
    const p = prospects.find((x) => x.id === (a?.prospectId ?? preset?.prospectId))
    form.reset({
      title: a?.title ?? "",
      type: a?.type ?? "conseil_couleur",
      linkType,
      targetId: a?.clientId ?? a?.prospectId ?? preset?.clientId ?? preset?.prospectId ?? "",
      contactName: a?.contactName ?? c?.contactName ?? p?.contactName ?? "",
      phone: a?.phone ?? c?.phone ?? p?.phone ?? "+237 ",
      date: a?.date ?? format(addDays(new Date(), 1), "yyyy-MM-dd"),
      startTime: a?.startTime ?? "10:00",
      durationMinutes: a?.durationMinutes ?? 60,
      location: a?.location ?? (me ? shopById.get(me.locationId)?.name ?? "Siège Douala" : ""),
      assignedTo: a?.assignedTo ?? me?.id ?? "",
      status: a?.status ?? "planifie",
      notes: a?.notes ?? "",
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, appointment, preset])

  const [linkType, targetId, type] = useWatch({ control: form.control, name: ["linkType", "targetId", "type"] })
  const lastTarget = React.useRef("")
  React.useEffect(() => {
    // Pré-remplit le contact à partir de la fiche sélectionnée
    if (!targetId || targetId === lastTarget.current) return
    lastTarget.current = targetId
    const src = linkType === "client" ? clients.find((c) => c.id === targetId) : prospects.find((p) => p.id === targetId)
    if (src && form.formState.dirtyFields.targetId) {
      form.setValue("contactName", src.contactName)
      form.setValue("phone", src.phone)
    }
  }, [targetId, linkType, clients, prospects, form])
  React.useEffect(() => {
    if (type && form.formState.dirtyFields.type && !form.getValues("title")) form.setValue("title", appointmentType[type])
  }, [type, form])

  const onSubmit = form.handleSubmit((v) => {
    const start = toMin(v.startTime)
    const conflict = all.find(
      (a) =>
        a.id !== appointment?.id &&
        a.assignedTo === v.assignedTo &&
        a.date === v.date &&
        (a.status === "planifie" || a.status === "confirme") &&
        start < toMin(a.startTime) + a.durationMinutes &&
        toMin(a.startTime) < start + v.durationMinutes
    )
    if (conflict && (v.status === "planifie" || v.status === "confirme")) {
      form.setError("startTime", { message: `Conflit avec « ${conflict.title} » à ${conflict.startTime}` })
      return
    }
    const { linkType: lt, targetId: tid, ...rest } = v
    const payload = { ...rest, clientId: lt === "client" ? tid : undefined, prospectId: lt === "prospect" ? tid : undefined }
    if (appointment) {
      update("appointments", appointment.id, payload)
      toast.success("Rendez-vous mis à jour")
    } else {
      add("appointments", { ...payload, id: uid("rdv"), createdAt: format(new Date(), "yyyy-MM-dd") })
      toast.success("Rendez-vous planifié", { description: `${format(new Date(`${v.date}T00:00:00`), "dd/MM/yyyy")} à ${v.startTime}` })
    }
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={appointment ? "Modifier le rendez-vous" : "Nouveau rendez-vous"} onSubmit={onSubmit} size="lg">
      <div className="flex flex-col gap-6">
        <FormSection title="Objet">
          <FormGrid>
            <SelectField control={form.control} name="type" label="Type" required options={toOptions(appointmentType)} />
            <TextField control={form.control} name="title" label="Intitulé" required />
          </FormGrid>
        </FormSection>
        <FormSection title="Interlocuteur">
          <FormGrid>
            <SelectField
              control={form.control}
              name="linkType"
              label="Rendez-vous avec"
              required
              options={[{ value: "client", label: "Un client" }, { value: "prospect", label: "Un prospect" }, { value: "libre", label: "Un autre contact" }]}
            />
            {linkType !== "libre" ? (
              <ComboboxField
                control={form.control}
                name="targetId"
                label={linkType === "client" ? "Client" : "Prospect"}
                required
                options={linkType === "client" ? clients.map((c) => ({ value: c.id, label: c.name, hint: c.code })) : prospects.filter((p) => p.status !== "perdu").map((p) => ({ value: p.id, label: p.name, hint: p.code }))}
              />
            ) : (
              <div className="hidden sm:block" />
            )}
            <TextField control={form.control} name="contactName" label="Contact" required />
            <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
          </FormGrid>
        </FormSection>
        <FormSection title="Créneau">
          <FormGrid cols={3}>
            <DateField control={form.control} name="date" label="Date" required />
            <TextField control={form.control} name="startTime" label="Heure" required type="time" />
            <NumberField control={form.control} name="durationMinutes" label="Durée" required suffix="min" min={15} step={15} />
            <TextField control={form.control} name="location" label="Lieu" required className="sm:col-span-2" placeholder="Boutique, adresse du chantier, visioconférence…" />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(appointmentStatus)} />
            <ComboboxField control={form.control} name="assignedTo" label="Collaborateur" required options={hostOptions} disabled={hostOptions.length <= 1} />
            <TextareaField control={form.control} name="notes" label="Notes" rows={2} className="sm:col-span-2" />
          </FormGrid>
        </FormSection>
      </div>
    </FormDialog>
  )
}
