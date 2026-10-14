"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { differenceInYears, format } from "date-fns"

import { ComboboxField, DateField, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { FormDialog, FormGrid, FormSection } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { useAccess } from "@/hooks/use-access"
import { DEFAULT_PASSWORD, ROLE_LABEL } from "@/lib/access"
import { POSITIONS, contractType, department, employeeStatus, maritalStatus, toOptions } from "@/lib/labels"
import { toDate } from "@/lib/format"
import { nextCode, uid, useStore } from "@/lib/store"
import type { Employee } from "@/lib/types"

const SMIG = 41_875

const schema = z
  .object({
    firstName: z.string().trim().min(2, "Prénom requis"),
    lastName: z.string().trim().min(2, "Nom requis"),
    gender: z.enum(["H", "F"]),
    birthDate: z.string().min(1, "Date de naissance requise"),
    email: z.email("Adresse e-mail invalide"),
    phone: z.string().trim().regex(/^\+?[0-9\s]{8,}$/, "Numéro invalide"),
    address: z.string().trim().min(3, "Adresse requise"),
    maritalStatus: z.enum(["celibataire", "marie", "divorce", "veuf"]),
    children: z.number({ error: "Requis" }).int().min(0).max(20),
    department: z.enum(["direction", "commercial", "logistique", "comptabilite", "rh", "marketing", "boutique", "technique"]),
    position: z.string().trim().min(2, "Poste requis"),
    contractType: z.enum(["cdi", "cdd", "stage", "interim"]),
    hireDate: z.string().min(1, "Date d'embauche requise"),
    baseSalary: z.number({ error: "Salaire requis" }).positive(),
    locationId: z.string().min(1, "Affectation requise"),
    status: z.enum(["actif", "conge", "suspendu", "sorti"]),
    cnpsNumber: z.string().trim().min(5, "N° CNPS requis"),
    bankAccount: z.string().trim().min(10, "RIB requis"),
    role: z.enum(["super_admin", "directeur_commercial", "commercial", "responsable_boutique", "caissiere", "vendeur", "comptable", "rh", "gestionnaire_stock", "magasinier", "marketing", "employe"]),
  })
  .superRefine((v, ctx) => {
    const birth = toDate(v.birthDate)
    if (birth && differenceInYears(new Date(), birth) < 18) ctx.addIssue({ code: "custom", path: ["birthDate"], message: "L'employé doit être majeur" })
    if (v.hireDate < v.birthDate) ctx.addIssue({ code: "custom", path: ["hireDate"], message: "Date d'embauche incohérente" })
    if (v.contractType !== "stage" && v.baseSalary < SMIG) ctx.addIssue({ code: "custom", path: ["baseSalary"], message: `Inférieur au SMIG (${SMIG.toLocaleString("fr-FR")} FCFA)` })
  })
type FormValues = z.infer<typeof schema>

const defaults = (e?: Employee): FormValues => ({
  firstName: e?.firstName ?? "",
  lastName: e?.lastName ?? "",
  gender: e?.gender ?? "H",
  birthDate: e?.birthDate ?? "1995-01-01",
  email: e?.email ?? "",
  phone: e?.phone ?? "+237 ",
  address: e?.address ?? "",
  maritalStatus: e?.maritalStatus ?? "celibataire",
  children: e?.children ?? 0,
  department: e?.department ?? "boutique",
  position: e?.position ?? "",
  contractType: e?.contractType ?? "cdi",
  hireDate: e?.hireDate ?? format(new Date(), "yyyy-MM-dd"),
  baseSalary: e?.baseSalary ?? Number.NaN,
  locationId: e?.locationId ?? "",
  status: e?.status ?? "actif",
  cnpsNumber: e?.cnpsNumber ?? "",
  bankAccount: e?.bankAccount ?? "",
  role: e?.role ?? "employe",
})

export function EmployeeFormDialog({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee?: Employee }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { locationOptions } = useLookups()
  const { isSuperAdmin } = useAccess()
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(employee) })
  const position = useWatch({ control: form.control, name: "position" })
  const positionOptions = React.useMemo(() => {
    const known = POSITIONS.map((p) => ({ value: p.label, label: p.label, hint: ROLE_LABEL[p.role] }))
    // Conserve un poste historique absent de la liste
    return employee && !POSITIONS.some((p) => p.label === employee.position) ? [{ value: employee.position, label: employee.position }, ...known] : known
  }, [employee])
  React.useEffect(() => {
    // Le choix d'un poste propose le service et le rôle d'accès correspondants
    const def = POSITIONS.find((p) => p.label === position)
    if (!def || !form.formState.dirtyFields.position) return
    form.setValue("department", def.department)
    if (isSuperAdmin) form.setValue("role", def.role)
  }, [position, form, isSuperAdmin])
  React.useEffect(() => {
    if (open) form.reset(defaults(employee))
  }, [open, employee, form])

  const onSubmit = form.handleSubmit((v) => {
    if (useStore.getState().employees.some((e) => e.email === v.email && e.id !== employee?.id)) {
      form.setError("email", { message: "Cette adresse est déjà utilisée" })
      return
    }
    if (employee) update("employees", employee.id, v)
    else {
      const id = uid("e")
      add("employees", { ...v, id, matricule: nextCode("ISO", useStore.getState().employees.map((e) => e.matricule)) })
      // Compte de connexion créé avec le mot de passe initial
      useStore.setState((s) => ({ passwords: { ...s.passwords, [id]: DEFAULT_PASSWORD } }))
    }
    toast.success(employee ? "Dossier mis à jour" : "Employé ajouté", { description: `${v.firstName} ${v.lastName}` })
    onOpenChange(false)
  })

  return (
    <FormDialog open={open} onOpenChange={onOpenChange} title={employee ? `Modifier ${employee.firstName} ${employee.lastName}` : "Nouvel employé"} description={employee?.matricule} onSubmit={onSubmit} size="xl">
      <div className="flex flex-col gap-6">
        <FormSection title="État civil">
          <FormGrid cols={3}>
            <TextField control={form.control} name="firstName" label="Prénom" required />
            <TextField control={form.control} name="lastName" label="Nom" required />
            <SelectField control={form.control} name="gender" label="Sexe" required options={[{ value: "H", label: "Homme" }, { value: "F", label: "Femme" }]} />
            <DateField control={form.control} name="birthDate" label="Date de naissance" required />
            <SelectField control={form.control} name="maritalStatus" label="Situation familiale" required options={toOptions(maritalStatus)} />
            <NumberField control={form.control} name="children" label="Enfants à charge" min={0} step={1} />
          </FormGrid>
        </FormSection>
        <FormSection title="Coordonnées">
          <FormGrid cols={3}>
            <TextField control={form.control} name="email" label="E-mail professionnel" required type="email" />
            <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
            <TextField control={form.control} name="address" label="Adresse" required />
          </FormGrid>
        </FormSection>
        <FormSection title="Contrat">
          <FormGrid cols={3}>
            <SelectField control={form.control} name="department" label="Service" required options={toOptions(department)} />
            <ComboboxField control={form.control} name="position" label="Poste" required options={positionOptions} placeholder="Choisir un poste" />
            <SelectField control={form.control} name="locationId" label="Affectation" required options={locationOptions} />
            <SelectField control={form.control} name="contractType" label="Type de contrat" required options={toOptions(contractType)} />
            <DateField control={form.control} name="hireDate" label="Date d'embauche" required />
            <SelectField control={form.control} name="status" label="Statut" required options={toOptions(employeeStatus)} />
            <NumberField control={form.control} name="baseSalary" label="Salaire de base mensuel" required suffix="FCFA" min={0} step={5000} />
            <TextField control={form.control} name="cnpsNumber" label="N° CNPS" required />
            <TextField control={form.control} name="bankAccount" label="RIB" required />
          </FormGrid>
        </FormSection>
        <FormSection title="Accès à la plateforme">
          <FormGrid>
            <SelectField
              control={form.control}
              name="role"
              label="Rôle"
              required
              options={toOptions(ROLE_LABEL)}
              disabled={!isSuperAdmin}
              description={isSuperAdmin ? `Mot de passe initial d'un nouveau compte : ${DEFAULT_PASSWORD}` : "Seul le super administrateur peut modifier les rôles."}
            />
          </FormGrid>
        </FormSection>
      </div>
    </FormDialog>
  )
}
