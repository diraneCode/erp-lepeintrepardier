"use client"

import * as React from "react"
import { Controller, useForm, useWatch, type FieldPath } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { AnimatePresence, motion } from "framer-motion"
import { z } from "zod"

import { optionalNumber } from "@/lib/validation"
import { toast } from "sonner"
import { differenceInYears, format } from "date-fns"
import { LuArrowLeft, LuArrowRight, LuBriefcase, LuCheck, LuCopy, LuFileText, LuKeyRound, LuPhoneCall, LuUser } from "react-icons/lu"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DateField, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { Spinner } from "@/components/ui/spinner"
import { DOC_ACCEPT, FileDropzone, IMAGE_ACCEPT } from "@/components/forms/file-dropzone"
import { FormGrid } from "@/components/shared/form-dialog"
import { useLookups } from "@/hooks/use-lookups"
import { DEFAULT_PASSWORD, ROLE_LABEL } from "@/lib/access"
import { POSITIONS, contractType, department, employeeStatus, maritalStatus, toOptions } from "@/lib/labels"
import { toDate } from "@/lib/format"
import { nextCode, uid, useStore } from "@/lib/store"
import type { Employee } from "@/lib/types"
import { cn } from "@/lib/utils"
import { lazyDialog } from "@/components/shared/lazy-dialog"

const SMIG = 41_875
const phone = z.string().trim().regex(/^\+?[0-9\s]{8,}$/, "Numéro de téléphone invalide")
const file = z.object({ id: z.string(), name: z.string(), type: z.string(), size: z.number(), uploadedAt: z.string() })
const requiredFile = (label: string) => file.optional().refine((f) => !!f, `${label} requis(e)`)

const schema = z
  .object({
    // Étape 1 — identité
    photo: requiredFile("Photo"),
    firstName: z.string().trim().min(2, "Prénom requis"),
    lastName: z.string().trim().min(2, "Nom requis"),
    gender: z.enum(["H", "F"]),
    birthDate: z.string().optional(),
    maritalStatus: z.enum(["celibataire", "marie", "divorce", "veuf"]),
    children: optionalNumber(z.number().int("Nombre entier").min(0).max(20, "20 au maximum")),
    phone,
    email: z.email("Adresse e-mail invalide"),
    address: z.string().trim().min(3, "Adresse requise"),
    // Étape 2 — poste & contrat
    position: z.string().min(1, "Poste requis"),
    department: z.string().optional(),
    locationId: z.string().min(1, "Affectation requise"),
    contractType: z.enum(["cdi", "cdd", "stage", "interim"]),
    hireDate: z.string().min(1, "Date d'embauche requise"),
    baseSalary: z.number({ error: "Salaire requis" }).positive("Doit être positif"),
    status: z.enum(["actif", "conge", "suspendu", "sorti"]),
    cnpsNumber: z.string().trim().min(5, "N° CNPS requis"),
    bankAccount: z.string().optional(),
    // Étape 3 — documents
    cni: requiredFile("CNI"),
    cv: requiredFile("CV"),
    plan: requiredFile("Plan de localisation"),
    diplome: requiredFile("Dernier diplôme"),
    // Étape 4 — contact d'urgence
    emergencyName: z.string().trim().min(2, "Nom du contact requis"),
    emergencyRelation: z.string().trim().min(2, "Lien de parenté requis"),
    emergencyPhone: phone,
  })
  .superRefine((v, ctx) => {
    const birth = toDate(v.birthDate)
    if (birth && differenceInYears(new Date(), birth) < 18) ctx.addIssue({ code: "custom", path: ["birthDate"], message: "L'employé doit être majeur" })
    if (v.birthDate && v.hireDate < v.birthDate) ctx.addIssue({ code: "custom", path: ["hireDate"], message: "Date d'embauche incohérente" })
    if (v.contractType !== "stage" && v.baseSalary < SMIG) ctx.addIssue({ code: "custom", path: ["baseSalary"], message: `Inférieur au SMIG (${SMIG.toLocaleString("fr-FR")} FCFA)` })
    if (v.emergencyPhone.replace(/\s/g, "") === v.phone.replace(/\s/g, "")) ctx.addIssue({ code: "custom", path: ["emergencyPhone"], message: "Doit différer du numéro de l'employé" })
  })
type FormValues = z.infer<typeof schema>

const STEPS: { title: string; icon: React.ComponentType<{ className?: string }>; fields: FieldPath<FormValues>[] }[] = [
  { title: "Identité", icon: LuUser, fields: ["photo", "firstName", "lastName", "gender", "birthDate", "maritalStatus", "children", "phone", "email", "address"] },
  { title: "Poste & contrat", icon: LuBriefcase, fields: ["position", "department", "locationId", "contractType", "hireDate", "baseSalary", "status", "cnpsNumber", "bankAccount"] },
  { title: "Documents", icon: LuFileText, fields: ["cni", "cv", "plan", "diplome"] },
  { title: "Contact d'urgence", icon: LuPhoneCall, fields: ["emergencyName", "emergencyRelation", "emergencyPhone"] },
]

const defaults = (e?: Employee): FormValues => ({
  photo: e?.documents?.photo,
  firstName: e?.firstName ?? "",
  lastName: e?.lastName ?? "",
  gender: e?.gender ?? "F",
  birthDate: e?.birthDate ?? "",
  maritalStatus: e?.maritalStatus ?? "celibataire",
  children: e?.children ?? Number.NaN,
  phone: e?.phone ?? "+237 ",
  email: e?.email ?? "",
  address: e?.address ?? "",
  position: e?.position ?? "",
  department: e?.department ?? "",
  locationId: e?.locationId ?? "",
  contractType: e?.contractType ?? "cdi",
  hireDate: e?.hireDate ?? format(new Date(), "yyyy-MM-dd"),
  baseSalary: e?.baseSalary ?? Number.NaN,
  status: e?.status ?? "actif",
  cnpsNumber: e?.cnpsNumber ?? "",
  bankAccount: e?.bankAccount ?? "",
  cni: e?.documents?.cni,
  cv: e?.documents?.cv,
  plan: e?.documents?.plan,
  diplome: e?.documents?.diplome,
  emergencyName: e?.emergencyContact?.name ?? "",
  emergencyRelation: e?.emergencyContact?.relation ?? "",
  emergencyPhone: e?.emergencyContact?.phone ?? "+237 ",
})

function EmployeeFormDialogContent({ open, onOpenChange, employee }: { open: boolean; onOpenChange: (o: boolean) => void; employee?: Employee }) {
  const add = useStore((s) => s.add)
  const update = useStore((s) => s.update)
  const { locationOptions } = useLookups(["locationOptions"])
  const form = useForm<FormValues>({ resolver: zodResolver(schema), defaultValues: defaults(employee), mode: "onTouched" })
  const [step, setStep] = React.useState(0)
  const [direction, setDirection] = React.useState(1)
  const isAdminAccount = employee?.role === "super_admin"
  // Identifiant attribué dès l'ouverture : les pièces sont déposées dans son dossier
  const draftId = React.useMemo(() => (open ? uid("e") : ""), [open])
  const employeeId = employee?.id ?? draftId

  React.useEffect(() => {
    if (!open) return
    form.reset(defaults(employee))
  }, [open, employee, form])

  // La fermeture remet l'assistant sur la première étape
  const close = (o: boolean) => {
    if (!o) {
      setStep(0)
      setDirection(1)
    }
    onOpenChange(o)
  }

  // Le poste détermine le service par défaut (modifiable)
  const position = useWatch({ control: form.control, name: "position" })
  React.useEffect(() => {
    const def = POSITIONS.find((p) => p.label === position)
    if (def && form.formState.dirtyFields.position) form.setValue("department", def.department)
  }, [position, form])

  const positionOptions = isAdminAccount
    ? [{ value: employee!.position, label: `${employee!.position} (super administrateur)` }]
    : POSITIONS.map((p) => ({ value: p.label, label: p.label }))
  const roleOfPosition = isAdminAccount ? "super_admin" : POSITIONS.find((p) => p.label === position)?.role

  const goTo = async (target: number) => {
    if (target > step) {
      const ok = await form.trigger(STEPS[step].fields, { shouldFocus: true })
      if (!ok) return
    }
    setDirection(target > step ? 1 : -1)
    setStep(target)
  }

  const onValid = async (v: FormValues) => {
    if (useStore.getState().employees.some((e) => e.email.toLowerCase() === v.email.toLowerCase() && e.id !== employee?.id)) {
      form.setError("email", { message: "Cette adresse est déjà utilisée" })
      setStep(0)
      return
    }
    const def = POSITIONS.find((p) => p.label === v.position)
    const role = isAdminAccount ? "super_admin" : def?.role ?? "commercial"
    const payload: Omit<Employee, "id" | "matricule"> = {
      firstName: v.firstName,
      lastName: v.lastName,
      gender: v.gender,
      email: v.email,
      phone: v.phone,
      birthDate: v.birthDate || undefined,
      hireDate: v.hireDate,
      department: (v.department || def?.department || employee?.department || "commercial") as Employee["department"],
      position: v.position,
      contractType: v.contractType,
      baseSalary: v.baseSalary,
      locationId: v.locationId,
      status: v.status,
      cnpsNumber: v.cnpsNumber,
      bankAccount: v.bankAccount?.trim() || undefined,
      address: v.address,
      maritalStatus: v.maritalStatus,
      children: v.children !== undefined && Number.isFinite(v.children) ? v.children : undefined,
      role,
      documents: { photo: v.photo, cni: v.cni, cv: v.cv, plan: v.plan, diplome: v.diplome },
      emergencyContact: { name: v.emergencyName, relation: v.emergencyRelation, phone: v.emergencyPhone },
    }
    if (employee) {
      if (!(await update("employees", employee.id, payload))) return
      toast.success("Dossier mis à jour", { description: `${v.firstName} ${v.lastName}` })
    } else {
      const matricule = nextCode("LPP", useStore.getState().employees.map((e) => e.matricule))
      // Le serveur crée le compte de connexion avec le mot de passe initial
      if (!(await add("employees", { ...payload, id: draftId, matricule }))) return
      toast.success("Employé ajouté", { description: `${v.firstName} ${v.lastName} — mot de passe initial : ${DEFAULT_PASSWORD}`, duration: 10_000 })
    }
    close(false)
  }

  // Ramène sur la première étape contenant une erreur
  const onInvalid = (errors: Partial<Record<FieldPath<FormValues>, unknown>>) => {
    const first = STEPS.findIndex((s) => s.fields.some((f) => f in errors))
    if (first >= 0) setStep(first)
  }

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (step < STEPS.length - 1) void goTo(step + 1)
    else void form.handleSubmit(onValid, onInvalid)()
  }

  const fileField = (name: "photo" | "cni" | "cv" | "plan" | "diplome", label: string, description: string, image = false) => (
    <Controller
      control={form.control}
      name={name}
      render={({ field, fieldState }) => (
        <FileDropzone
          label={label}
          required
          description={description}
          accept={image ? IMAGE_ACCEPT : DOC_ACCEPT}
          image={image}
          folder={`employees/${employeeId}`}
          kind={name}
          value={field.value}
          onChange={(f) => {
            field.onChange(f)
            void form.trigger(name)
          }}
          invalid={fieldState.invalid}
          error={fieldState.error?.message}
        />
      )}
    />
  )

  const copyPassword = () => {
    void navigator.clipboard?.writeText(DEFAULT_PASSWORD)
    toast.success("Mot de passe copié")
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-3xl">
        <DialogHeader className="border-b px-5 py-4">
          <DialogTitle>{employee ? `Dossier de ${employee.firstName} ${employee.lastName}` : "Nouvel employé"}</DialogTitle>
          <DialogDescription>{employee ? employee.matricule : "Étape par étape : identité, poste, documents et contact d'urgence."}</DialogDescription>
          {/* Indicateur d'étapes */}
          <ol className="mt-3 grid grid-cols-4 gap-2">
            {STEPS.map((s, i) => {
              const done = i < step
              const current = i === step
              return (
                <li key={s.title}>
                  <button type="button" onClick={() => void goTo(i)} className="group flex w-full flex-col gap-1.5 text-left" aria-current={current ? "step" : undefined}>
                    <span className={cn("h-1 rounded-full bg-muted transition-colors", (done || current) && "bg-primary")} />
                    <span className={cn("flex items-center gap-1.5 text-xs", current ? "font-semibold text-foreground" : "text-muted-foreground")}>
                      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-full border text-[10px]", done && "border-primary bg-primary text-primary-foreground", current && "border-primary text-primary")}>
                        {done ? <LuCheck className="size-3" /> : i + 1}
                      </span>
                      <span className="hidden truncate sm:inline">{s.title}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto px-5 py-5">
            <AnimatePresence mode="wait" initial={false} custom={direction}>
              <motion.div
                key={step}
                custom={direction}
                initial={{ opacity: 0, x: direction * 24 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: direction * -24 }}
                transition={{ duration: 0.18 }}
                className="flex flex-col gap-5"
              >
                {step === 0 && (
                  <>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-[220px_1fr]">
                      {fileField("photo", "Photo d'identité", "JPG, PNG ou WebP · compressée automatiquement", true)}
                      <FormGrid>
                        <TextField control={form.control} name="firstName" label="Prénom" required />
                        <TextField control={form.control} name="lastName" label="Nom" required />
                        <SelectField control={form.control} name="gender" label="Sexe" required options={[{ value: "F", label: "Femme" }, { value: "H", label: "Homme" }]} />
                        <DateField control={form.control} name="birthDate" label="Date de naissance" description="Facultative" />
                      </FormGrid>
                    </div>
                    <FormGrid cols={3}>
                      <SelectField control={form.control} name="maritalStatus" label="Situation familiale" required options={toOptions(maritalStatus)} />
                      <NumberField control={form.control} name="children" label="Enfants à charge" min={0} step={1} description="Facultatif" />
                      <TextField control={form.control} name="phone" label="Téléphone" required type="tel" />
                      <TextField control={form.control} name="email" label="E-mail (identifiant de connexion)" required type="email" className="sm:col-span-2" />
                      <TextField control={form.control} name="address" label="Adresse" required />
                    </FormGrid>
                  </>
                )}
                {step === 1 && (
                  <FormGrid cols={3}>
                    <SelectField control={form.control} name="position" label="Poste" required options={positionOptions} disabled={isAdminAccount} />
                    <SelectField control={form.control} name="department" label="Service" options={toOptions(department)} description="Facultatif — déduit du poste" />
                    <div className="flex flex-col justify-center rounded-lg bg-muted/60 px-3 py-2 text-sm">
                      <span className="text-xs text-muted-foreground">Accès à la plateforme</span>
                      <span className="font-semibold">{roleOfPosition ? ROLE_LABEL[roleOfPosition] : "Choisissez un poste"}</span>
                    </div>
                    <SelectField control={form.control} name="locationId" label="Affectation" required options={locationOptions} />
                    <SelectField control={form.control} name="contractType" label="Type de contrat" required options={toOptions(contractType)} />
                    <DateField control={form.control} name="hireDate" label="Date d'embauche" required />
                    <NumberField control={form.control} name="baseSalary" label="Salaire de base mensuel" required suffix="FCFA" min={0} step={5000} />
                    <SelectField control={form.control} name="status" label="Statut" required options={toOptions(employeeStatus)} />
                    <TextField control={form.control} name="cnpsNumber" label="N° CNPS" required />
                    <TextField control={form.control} name="bankAccount" label="RIB" description="Facultatif" className="sm:col-span-3" />
                  </FormGrid>
                )}
                {step === 2 && (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    {fileField("cni", "Carte nationale d'identité", "PDF (5 Mo max.) ou image · recto/verso dans un seul fichier")}
                    {fileField("cv", "Curriculum vitae", "PDF (5 Mo max.) ou image")}
                    {fileField("plan", "Plan de localisation", "Plan du domicile · PDF (5 Mo max.) ou image")}
                    {fileField("diplome", "Dernier diplôme", "PDF (5 Mo max.) ou image")}
                  </div>
                )}
                {step === 3 && (
                  <>
                    <FormGrid cols={3}>
                      <TextField control={form.control} name="emergencyName" label="Nom du contact" required />
                      <TextField control={form.control} name="emergencyRelation" label="Lien de parenté" required placeholder="Ex : épouse, frère, mère" />
                      <TextField control={form.control} name="emergencyPhone" label="Téléphone" required type="tel" />
                    </FormGrid>
                    {!employee && (
                      <div className="flex flex-col gap-3 rounded-xl border-2 border-warning/50 bg-warning/10 p-4 sm:flex-row sm:items-center">
                        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-warning/20 text-warning">
                          <LuKeyRound className="size-5" />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-semibold">Mot de passe initial d&apos;un nouveau compte :</p>
                          <p className="mt-1 font-mono text-2xl font-bold tracking-wider text-foreground">{DEFAULT_PASSWORD}</p>
                          <p className="mt-1 text-xs text-muted-foreground">À transmettre à l&apos;employé, qui pourra le changer depuis « Mon compte ». Identifiant : son adresse e-mail.</p>
                        </div>
                        <Button type="button" variant="outline" onClick={copyPassword}>
                          <LuCopy /> Copier
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
          <DialogFooter className="m-0 shrink-0 flex-row items-center justify-between gap-2 rounded-b-xl border-t px-5 py-3 sm:justify-between">
            <span className="text-xs text-muted-foreground">Étape {step + 1} / {STEPS.length}</span>
            <div className="flex gap-2">
              {step === 0 ? (
                <Button type="button" variant="outline" onClick={() => close(false)}>
                  Annuler
                </Button>
              ) : (
                <Button type="button" variant="outline" onClick={() => void goTo(step - 1)}>
                  <LuArrowLeft /> Précédent
                </Button>
              )}
              {step < STEPS.length - 1 ? (
                <Button type="submit">
                  Suivant <LuArrowRight />
                </Button>
              ) : (
                <Button type="submit" disabled={form.formState.isSubmitting}>
                  {form.formState.isSubmitting ? <Spinner /> : <LuCheck />} {employee ? "Enregistrer" : "Créer l'employé"}
                </Button>
              )}
            </div>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export const EmployeeFormDialog = lazyDialog(EmployeeFormDialogContent)
