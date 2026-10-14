"use client"

import * as React from "react"
import { useForm, useWatch } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import { LuDatabase, LuHistory, LuInfo, LuKeyRound, LuLock, LuRotateCcw, LuUserCog } from "react-icons/lu"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { TextField } from "@/components/forms/fields"
import { FormGrid } from "@/components/shared/form-dialog"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { DataTable, type Column } from "@/components/shared/data-table"
import { DescriptionList } from "@/components/shared/detail-sheet"
import { FilterBar } from "@/components/shared/filter-bar"
import { Page, PageHeader } from "@/components/shared/page"
import { StatusBadge } from "@/components/shared/status-badge"
import { UserAvatar } from "@/components/shared/user-avatar"
import { useAccess } from "@/hooks/use-access"
import { useFilters, type FilterConfig } from "@/hooks/use-filters"
import { useLookups } from "@/hooks/use-lookups"
import { useTransientState } from "@/hooks/use-transient-state"
import { ACCESS, SCOPE_LABEL } from "@/lib/access"
import { formatDate, formatDateTime } from "@/lib/format"
import { contractType, department, employeeStatus, maritalStatus } from "@/lib/labels"
import { NAV_ITEMS } from "@/lib/nav"
import { useStore } from "@/lib/store"
import type { ActivityLog } from "@/lib/types"

const passwordSchema = z
  .object({
    current: z.string().min(1, "Mot de passe actuel requis"),
    next: z
      .string()
      .min(10, "10 caractères minimum")
      .regex(/[A-Z]/, "Au moins une majuscule")
      .regex(/[a-z]/, "Au moins une minuscule")
      .regex(/\d/, "Au moins un chiffre")
      .regex(/[^A-Za-z0-9]/, "Au moins un caractère spécial"),
    confirm: z.string().min(1, "Confirmation requise"),
  })
  .refine((v) => v.next === v.confirm, { path: ["confirm"], message: "Les mots de passe ne correspondent pas" })
  .refine((v) => v.next !== v.current, { path: ["next"], message: "Doit être différent du mot de passe actuel" })

export default function AccountPage() {
  const { user, roleLabel, isSuperAdmin } = useAccess()
  const [tab, setTab] = React.useState("infos")
  if (!user) return null
  const fullName = `${user.firstName} ${user.lastName}`

  return (
    <Page className="max-w-5xl">
      <PageHeader icon={LuUserCog} title="Mon compte" description="Consultez vos informations et gérez votre mot de passe." />
      <Card>
        <CardContent className="flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <UserAvatar name={fullName} className="size-16 text-lg" />
          <div className="min-w-0 flex-1">
            <div className="text-lg font-semibold">{fullName}</div>
            <div className="text-sm text-muted-foreground">
              {user.position} · {department[user.department]} · {user.matricule}
            </div>
          </div>
          <Badge variant="violet">{roleLabel}</Badge>
        </CardContent>
      </Card>
      <Tabs value={tab} onValueChange={setTab} className="gap-6">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="infos">Mes informations</TabsTrigger>
          <TabsTrigger value="securite">Mot de passe</TabsTrigger>
          <TabsTrigger value="activite">Activité</TabsTrigger>
          {isSuperAdmin && <TabsTrigger value="admin">Administration</TabsTrigger>}
        </TabsList>
        <TabsContent value="infos">
          <InfoTab />
        </TabsContent>
        <TabsContent value="securite">
          <PasswordTab />
        </TabsContent>
        <TabsContent value="activite">{tab === "activite" && <ActivityTab />}</TabsContent>
        {isSuperAdmin && (
          <TabsContent value="admin">
            <AdminTab />
          </TabsContent>
        )}
      </Tabs>
    </Page>
  )
}

function InfoTab() {
  const { user, role } = useAccess()
  const { locationName } = useLookups()
  if (!user || !role) return null
  const modules = NAV_ITEMS.filter((i) => i.module && ACCESS[role][i.module])
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start gap-3 rounded-lg border bg-muted/40 px-4 py-3 text-sm">
        <LuInfo className="mt-0.5 size-4 shrink-0 text-info" />
        <span className="text-muted-foreground">Ces informations sont gérées par le service des ressources humaines. Pour toute correction, adressez-vous à votre responsable RH.</span>
      </div>
      <Card>
        <CardHeader>
          <CardTitle>Identité</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList
            items={[
              { label: "Nom complet", value: `${user.firstName} ${user.lastName}` },
              { label: "Matricule", value: user.matricule },
              { label: "Date de naissance", value: formatDate(user.birthDate) },
              { label: "Situation familiale", value: `${maritalStatus[user.maritalStatus]} · ${user.children} enfant(s)` },
              { label: "E-mail professionnel", value: user.email },
              { label: "Téléphone", value: user.phone },
              { label: "Adresse", value: user.address, full: true },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Poste & contrat</CardTitle>
        </CardHeader>
        <CardContent>
          <DescriptionList
            items={[
              { label: "Poste", value: user.position },
              { label: "Service", value: department[user.department] },
              { label: "Affectation", value: locationName(user.locationId) },
              { label: "Contrat", value: contractType[user.contractType] },
              { label: "Date d'embauche", value: formatDate(user.hireDate) },
              { label: "Statut", value: <StatusBadge def={employeeStatus[user.status]} /> },
              { label: "N° CNPS", value: user.cnpsNumber },
              { label: "Compte bancaire", value: <span className="font-mono text-xs">{user.bankAccount}</span> },
            ]}
          />
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LuLock className="size-4" /> Mes accès</CardTitle>
          <CardDescription>Modules accessibles avec votre rôle, en plus de votre espace personnel.</CardDescription>
        </CardHeader>
        <CardContent>
          {modules.length === 0 ? (
            <p className="text-sm text-muted-foreground">Accès limité à votre espace personnel (pointage, congés, bulletins de paie) et à vos notes de frais.</p>
          ) : (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {modules.map((m) => {
                const p = ACCESS[role][m.module!]!
                return (
                  <li key={m.href} className="flex items-center gap-3 rounded-lg border px-3 py-2 text-sm">
                    <m.icon className="size-4 shrink-0 text-primary" />
                    <span className="min-w-0 flex-1 truncate font-medium">{m.title}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{SCOPE_LABEL[p.scope]}{p.write ? "" : " · lecture"}</span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function PasswordTab() {
  const changePassword = useStore((s) => s.changePassword)
  const form = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema), defaultValues: { current: "", next: "", confirm: "" } })
  const next = useWatch({ control: form.control, name: "next" }) ?? ""
  const checks = [
    [/.{10,}/, "10 caractères"],
    [/[A-Z]/, "Une majuscule"],
    [/[a-z]/, "Une minuscule"],
    [/\d/, "Un chiffre"],
    [/[^A-Za-z0-9]/, "Un caractère spécial"],
  ] as const
  const score = checks.filter(([re]) => re.test(next)).length

  const onSubmit = form.handleSubmit((v) => {
    const error = changePassword(v.current, v.next)
    if (error) {
      form.setError("current", { message: error })
      return
    }
    form.reset()
    toast.success("Mot de passe modifié", { description: "Utilisez-le lors de votre prochaine connexion." })
  })

  return (
    <Card>
      <form onSubmit={onSubmit} noValidate>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><LuKeyRound className="size-4" /> Changer mon mot de passe</CardTitle>
          <CardDescription>Choisissez un mot de passe robuste que vous n&apos;utilisez nulle part ailleurs.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4 py-6">
          <FormGrid>
            <TextField control={form.control} name="current" label="Mot de passe actuel" type="password" required autoComplete="current-password" className="sm:col-span-2" />
            <TextField control={form.control} name="next" label="Nouveau mot de passe" type="password" required autoComplete="new-password" />
            <TextField control={form.control} name="confirm" label="Confirmer le nouveau mot de passe" type="password" required autoComplete="new-password" />
          </FormGrid>
          <div className="flex flex-col gap-2">
            <div className="flex gap-1" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <span key={i} className={`h-1.5 flex-1 rounded-full ${i < score ? (score < 3 ? "bg-destructive" : score < 5 ? "bg-warning" : "bg-success") : "bg-muted"}`} />
              ))}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {checks.map(([re, label]) => (
                <span key={label} className={re.test(next) ? "text-success" : "text-muted-foreground"}>
                  {re.test(next) ? "✓" : "○"} {label}
                </span>
              ))}
            </div>
          </div>
        </CardContent>
        <CardFooter className="justify-end gap-2 border-t">
          <Button type="button" variant="outline" onClick={() => form.reset()}>
            Annuler
          </Button>
          <Button type="submit">Mettre à jour</Button>
        </CardFooter>
      </form>
    </Card>
  )
}

function ActivityTab() {
  const all = useStore((s) => s.activity)
  const userId = useStore((s) => s.currentUserId)
  const activity = React.useMemo(() => all.filter((a) => a.userId === userId), [all, userId])
  const modules = React.useMemo(() => [...new Set(activity.map((a) => a.module))].map((m) => ({ value: m, label: m })), [activity])
  const actions = React.useMemo(() => [...new Set(activity.map((a) => a.action))].map((m) => ({ value: m, label: m })), [activity])
  const config = React.useMemo<FilterConfig<ActivityLog>>(
    () => ({
      search: { placeholder: "Rechercher dans mon historique…", fields: (a) => [a.action, a.module, a.details] },
      date: { label: "Date", accessor: (a) => a.date },
      facets: [
        { id: "module", label: "Module", options: modules, accessor: (a) => a.module },
        { id: "action", label: "Action", options: actions, accessor: (a) => a.action },
      ],
    }),
    [modules, actions]
  )
  const filters = useFilters(activity, config)
  const columns: Column<ActivityLog>[] = [
    { id: "date", header: "Date", accessor: (a) => a.date, cell: (a) => <span className="whitespace-nowrap">{formatDateTime(a.date)}</span>, exportValue: (a) => formatDateTime(a.date) },
    { id: "action", header: "Action", accessor: (a) => a.action, cell: (a) => <span className="font-medium">{a.action}</span> },
    { id: "module", header: "Module", accessor: (a) => a.module },
    { id: "details", header: "Détails", accessor: (a) => a.details },
  ]
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LuHistory className="size-4" /> Mon historique d&apos;activité</CardTitle>
        <CardDescription>Actions effectuées avec votre compte.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <FilterBar filters={filters} />
        <DataTable data={filters.filtered} columns={columns} getRowId={(a) => a.id} defaultSort={{ id: "date", desc: true }} exportOptions={{ filename: "mon-activite", title: "Mon historique d'activité", subtitle: filters.describe() }} />
      </CardContent>
    </Card>
  )
}

function AdminTab() {
  const resetData = useStore((s) => s.resetData)
  const [confirmReset, setConfirmReset] = useTransientState(false)
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><LuDatabase className="size-4" /> Données de démonstration</CardTitle>
        <CardDescription>Les données sont stockées localement dans ce navigateur. Réservé au super administrateur.</CardDescription>
      </CardHeader>
      <CardContent>
        <Button variant="destructive" onClick={() => setConfirmReset(true)}>
          <LuRotateCcw /> Réinitialiser les données
        </Button>
      </CardContent>
      <ConfirmDialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Réinitialiser toutes les données ?"
        description="Toutes les saisies (y compris les mots de passe modifiés) seront remplacées par le jeu de démonstration initial."
        confirmLabel="Réinitialiser"
        destructive
        onConfirm={() => {
          resetData()
          toast.success("Données réinitialisées")
          setConfirmReset(false)
        }}
      />
    </Card>
  )
}
