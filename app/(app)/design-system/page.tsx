"use client"

import * as React from "react"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { z } from "zod"
import { toast } from "sonner"
import {
  LuBell,
  LuBoxes,
  LuCircleDollarSign,
  LuDownload,
  LuInfo,
  LuPalette,
  LuPlus,
  LuShoppingCart,
  LuTrash2,
  LuTriangleAlert,
  LuUsers,
} from "react-icons/lu"

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Kbd } from "@/components/ui/kbd"
import { Label } from "@/components/ui/label"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { DateField, NumberField, SelectField, TextField } from "@/components/forms/fields"
import { FormGrid } from "@/components/shared/form-dialog"
import { Page, PageHeader, Section } from "@/components/shared/page"
import { StatCard, StatGrid } from "@/components/shared/stat-card"
import { StatusBadge } from "@/components/shared/status-badge"
import { PersonCell } from "@/components/shared/user-avatar"
import { Logo, LogoMark } from "@/components/layout/logo"
import { invoiceStatus } from "@/lib/labels"

const colorGroups: { title: string; description: string; tokens: { name: string; var: string; usage: string }[] }[] = [
  {
    title: "Marque",
    description: "Issues du logo Le Peintre Pardier. Le violet est la couleur d'action principale.",
    tokens: [
      { name: "Violet Pardier", var: "--brand-violet", usage: "Primaire, actions, focus" },
      { name: "Bleu", var: "--brand-blue", usage: "Information" },
      { name: "Vert", var: "--brand-green", usage: "Succès" },
      { name: "Orange", var: "--brand-orange", usage: "Avertissement" },
      { name: "Rouge", var: "--brand-red", usage: "Erreur, destruction" },
    ],
  },
  {
    title: "Sémantique",
    description: "Toujours accompagnées d'un libellé ou d'une icône — jamais la couleur seule.",
    tokens: [
      { name: "Primary", var: "--primary", usage: "Boutons principaux, liens actifs" },
      { name: "Success", var: "--success", usage: "Payé, approuvé, présent" },
      { name: "Warning", var: "--warning", usage: "En attente, stock bas, retard" },
      { name: "Info", var: "--info", usage: "Émis, planifié, en congé" },
      { name: "Destructive", var: "--destructive", usage: "En retard, rupture, suppression" },
    ],
  },
  {
    title: "Surfaces & texte",
    description: "Neutres légèrement teintés de violet pour une interface cohérente.",
    tokens: [
      { name: "Background", var: "--background", usage: "Fond de page" },
      { name: "Card", var: "--card", usage: "Cartes, tableaux" },
      { name: "Muted", var: "--muted", usage: "Zones secondaires, en-têtes de tableau" },
      { name: "Border", var: "--border", usage: "Séparateurs, contours" },
      { name: "Foreground", var: "--foreground", usage: "Texte principal" },
      { name: "Muted foreground", var: "--muted-foreground", usage: "Texte secondaire, légendes" },
    ],
  },
  {
    title: "Graphiques",
    description: "Ordre catégoriel fixe, validé pour le daltonisme (clair et sombre). « Autres » est toujours neutre.",
    tokens: [
      { name: "Série 1", var: "--chart-1", usage: "Mesure principale" },
      { name: "Série 2", var: "--chart-2", usage: "Mesure de comparaison" },
      { name: "Série 3", var: "--chart-3", usage: "3e série" },
      { name: "Série 4", var: "--chart-4", usage: "4e série" },
      { name: "Série 5", var: "--chart-5", usage: "5e série" },
      { name: "Autres", var: "--chart-6", usage: "Regroupement" },
    ],
  },
]

const typeScale = [
  { name: "Titre de page", className: "text-2xl font-semibold tracking-tight", spec: "24 px · 600 · -0,01em" },
  { name: "Titre de section", className: "text-base font-semibold", spec: "16 px · 600" },
  { name: "Chiffre clé", className: "text-2xl font-semibold tabular", spec: "24 px · 600 · chiffres tabulaires" },
  { name: "Corps", className: "text-sm", spec: "14 px · 400" },
  { name: "Secondaire", className: "text-sm text-muted-foreground", spec: "14 px · 400 · muted" },
  { name: "Légende", className: "text-xs text-muted-foreground", spec: "12 px · 400 · muted" },
  { name: "Étiquette", className: "text-xs font-semibold tracking-wide text-muted-foreground uppercase", spec: "12 px · 600 · capitales" },
]

const demoSchema = z.object({
  name: z.string().trim().min(3, "3 caractères minimum"),
  amount: z.number({ error: "Montant requis" }).positive("Doit être positif"),
  category: z.string().min(1, "Choisissez une catégorie"),
  date: z.string().min(1, "Date requise"),
})

export default function DesignSystemPage() {
  return (
    <Page>
      <PageHeader icon={LuPalette} title="Design system" description="Charte graphique Isonem : tokens, typographie, composants et règles d'usage." />
      <Tabs defaultValue="fondations" className="gap-6">
        <TabsList className="w-full justify-start overflow-x-auto sm:w-fit">
          <TabsTrigger value="fondations">Fondations</TabsTrigger>
          <TabsTrigger value="composants">Composants</TabsTrigger>
          <TabsTrigger value="formulaires">Formulaires</TabsTrigger>
          <TabsTrigger value="principes">Principes</TabsTrigger>
        </TabsList>

        <TabsContent value="fondations" className="flex flex-col gap-8">
          <Section title="Logo" description="Fond blanc conservé en thème sombre pour respecter les couleurs du logo.">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-8">
                <Logo className="h-16" />
                <div className="flex items-center gap-3">
                  <LogoMark className="size-10" />
                  <span className="text-sm text-muted-foreground">Emblème (barre latérale réduite)</span>
                </div>
              </CardContent>
            </Card>
          </Section>
          {colorGroups.map((g) => (
            <Section key={g.title} title={`Couleurs — ${g.title}`} description={g.description}>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                {g.tokens.map((t) => (
                  <div key={t.var} className="overflow-hidden rounded-xl border bg-card">
                    <div className="h-16 border-b" style={{ background: `var(${t.var})` }} />
                    <div className="p-3">
                      <div className="text-sm font-medium">{t.name}</div>
                      <code className="text-xs text-muted-foreground">{t.var}</code>
                      <div className="mt-1 text-xs text-muted-foreground">{t.usage}</div>
                    </div>
                  </div>
                ))}
              </div>
            </Section>
          ))}
          <Section title="Typographie" description="Geist Sans pour l'interface, Geist Mono pour les codes. Chiffres tabulaires pour les montants.">
            <Card>
              <CardContent className="flex flex-col divide-y">
                {typeScale.map((t) => (
                  <div key={t.name} className="flex flex-col gap-1 py-3 sm:flex-row sm:items-baseline sm:justify-between">
                    <span className={t.className}>{t.name} — 12 450 000 FCFA</span>
                    <span className="font-mono text-xs text-muted-foreground">{t.spec}</span>
                  </div>
                ))}
              </CardContent>
            </Card>
          </Section>
          <Section title="Rayons & espacements" description="Base 4 px. Rayon de référence 10 px (--radius).">
            <Card>
              <CardContent className="flex flex-wrap items-end gap-6">
                {[["sm", "rounded-sm"], ["md", "rounded-md"], ["lg", "rounded-lg"], ["xl", "rounded-xl"], ["full", "rounded-full"]].map(([n, c]) => (
                  <div key={n} className="flex flex-col items-center gap-2">
                    <div className={`size-16 border-2 border-primary bg-primary/10 ${c}`} />
                    <span className="text-xs text-muted-foreground">{n}</span>
                  </div>
                ))}
                <div className="flex items-end gap-2">
                  {[1, 2, 3, 4, 6, 8].map((s) => (
                    <div key={s} className="flex flex-col items-center gap-2">
                      <div className="bg-primary" style={{ width: s * 4, height: s * 4 }} />
                      <span className="text-xs text-muted-foreground">{s * 4}</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </Section>
          <Section title="Icônes" description="react-icons — jeu Lucide (lu), trait 2 px, 16 px dans les composants, 20 px dans les en-têtes.">
            <Card>
              <CardContent className="flex flex-wrap gap-4 text-muted-foreground">
                {[LuUsers, LuShoppingCart, LuBoxes, LuCircleDollarSign, LuBell, LuDownload, LuPlus, LuTrash2, LuInfo, LuTriangleAlert].map((I, i) => (
                  <span key={i} className="flex size-10 items-center justify-center rounded-lg border">
                    <I className="size-5" />
                  </span>
                ))}
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        <TabsContent value="composants" className="flex flex-col gap-8">
          <Section title="Boutons" description="Un seul bouton primaire par zone. Destructif réservé aux suppressions.">
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center gap-2">
                  <Button><LuPlus /> Primaire</Button>
                  <Button variant="outline">Secondaire</Button>
                  <Button variant="secondary">Tonal</Button>
                  <Button variant="ghost">Discret</Button>
                  <Button variant="link">Lien</Button>
                  <Button variant="destructive"><LuTrash2 /> Supprimer</Button>
                  <Button disabled>Désactivé</Button>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Button size="xs">XS</Button>
                  <Button size="sm">Small</Button>
                  <Button>Default</Button>
                  <Button size="lg">Large</Button>
                  <Button size="icon" variant="outline" aria-label="Exemple"><LuBell /></Button>
                </div>
              </CardContent>
            </Card>
          </Section>
          <Section title="Badges & statuts" description="Pastille + libellé : le statut reste lisible sans la couleur.">
            <Card>
              <CardContent className="flex flex-col gap-4">
                <div className="flex flex-wrap gap-2">
                  {Object.entries(invoiceStatus).map(([k, d]) => (
                    <StatusBadge key={k} def={d} />
                  ))}
                </div>
                <div className="flex flex-wrap gap-2">
                  <Badge>Default</Badge>
                  <Badge variant="violet">Violet</Badge>
                  <Badge variant="success">Success</Badge>
                  <Badge variant="warning">Warning</Badge>
                  <Badge variant="info">Info</Badge>
                  <Badge variant="destructive">Destructive</Badge>
                  <Badge variant="neutral">Neutral</Badge>
                  <Badge variant="outline">Outline</Badge>
                </div>
              </CardContent>
            </Card>
          </Section>
          <Section title="Indicateurs (KPI)">
            <StatGrid>
              <StatCard label="Chiffre d'affaires" value="48,2 M FCFA" icon={LuCircleDollarSign} delta={12.4} />
              <StatCard label="Dépenses" value="9,1 M FCFA" icon={LuDownload} tone="orange" delta={6.2} invertDelta />
              <StatCard label="Clients actifs" value="126" icon={LuUsers} tone="green" hint="+8 ce mois" />
              <StatCard label="Ruptures" value="3" icon={LuBoxes} tone="red" hint="à traiter" />
            </StatGrid>
          </Section>
          <Section title="Alertes, progression, chargement">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="flex flex-col gap-3">
                <Alert>
                  <LuInfo />
                  <AlertTitle>Information</AlertTitle>
                  <AlertDescription>Les exports reprennent toujours les filtres actifs.</AlertDescription>
                </Alert>
                <Alert variant="destructive">
                  <LuTriangleAlert />
                  <AlertTitle>Action irréversible</AlertTitle>
                  <AlertDescription>Les suppressions demandent toujours une confirmation.</AlertDescription>
                </Alert>
              </div>
              <Card>
                <CardContent className="flex flex-col gap-4">
                  <Progress value={68} />
                  <PersonCell name="Marie Mbarga" sub="ISO-0101 · Responsable de boutique" />
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">Recherche globale <Kbd>⌘K</Kbd></div>
                  <div className="flex flex-col gap-2">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-4 w-1/2" />
                  </div>
                </CardContent>
              </Card>
            </div>
          </Section>
        </TabsContent>

        <TabsContent value="formulaires" className="flex flex-col gap-8">
          <Section title="Formulaire type" description="react-hook-form + zod : validation au submit puis en direct, messages en français sous le champ.">
            <DemoForm />
          </Section>
          <Section title="Contrôles">
            <Card>
              <CardContent className="flex flex-wrap items-center gap-6">
                <div className="flex w-56 flex-col gap-2">
                  <Label htmlFor="ds-input">Champ texte</Label>
                  <Input id="ds-input" placeholder="Saisir…" />
                </div>
                <div className="flex w-56 flex-col gap-2">
                  <Label htmlFor="ds-err">Champ en erreur</Label>
                  <Input id="ds-err" aria-invalid defaultValue="abc" />
                </div>
                <label className="flex items-center gap-2 text-sm"><Checkbox defaultChecked /> Case à cocher</label>
                <label className="flex items-center gap-2 text-sm"><Switch defaultChecked /> Interrupteur</label>
              </CardContent>
            </Card>
          </Section>
        </TabsContent>

        <TabsContent value="principes">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {[
              ["Épuré, sans dégradé", "Aplats de couleur uniquement. Les cartes se distinguent par une bordure fine, pas par des ombres prononcées."],
              ["La couleur porte du sens", "Violet = action. Vert/orange/rouge/bleu = statuts. Jamais de couleur décorative sur les données."],
              ["Données d'abord", "Montants alignés à droite en chiffres tabulaires, FCFA explicite, totaux en pied de tableau."],
              ["Filtrer, puis exporter", "Chaque liste propose recherche, période, facettes et intervalles. Les exports PDF/Excel/CSV respectent les filtres et la sélection."],
              ["Confirmer l'irréversible", "Suppression et annulation passent par une boîte de confirmation ; préférer l'annulation qui garde l'historique."],
              ["Responsive", "Barre latérale en tiroir sur mobile, tableaux défilants horizontalement, colonnes secondaires masquées sous 768 px."],
              ["Accessible", "Contrastes AA, focus visible, libellés sur tous les champs, statuts lisibles sans la couleur, palette graphique validée daltonisme."],
              ["Mouvement sobre", "framer-motion pour les apparitions (≤ 250 ms) et les réorganisations ; aucune animation bloquante."],
            ].map(([t, d]) => (
              <Card key={t}>
                <CardHeader>
                  <CardTitle className="text-base">{t}</CardTitle>
                  <CardDescription>{d}</CardDescription>
                </CardHeader>
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </Page>
  )
}

function DemoForm() {
  const form = useForm<z.infer<typeof demoSchema>>({ resolver: zodResolver(demoSchema), defaultValues: { name: "", amount: Number.NaN, category: "", date: "" } })
  return (
    <Card>
      <form
        noValidate
        onSubmit={form.handleSubmit((v) => {
          toast.success("Formulaire valide", { description: JSON.stringify(v) })
          form.reset()
        })}
      >
        <CardContent className="flex flex-col gap-4">
          <FormGrid>
            <TextField control={form.control} name="name" label="Libellé" required placeholder="Ex : Peinture façade" />
            <NumberField control={form.control} name="amount" label="Montant" required suffix="FCFA" />
            <SelectField control={form.control} name="category" label="Catégorie" required options={[{ value: "a", label: "Peintures" }, { value: "b", label: "Outillage" }]} />
            <DateField control={form.control} name="date" label="Date" required />
          </FormGrid>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => form.reset()}>Réinitialiser</Button>
            <Button type="submit">Valider</Button>
          </div>
        </CardContent>
      </form>
    </Card>
  )
}
