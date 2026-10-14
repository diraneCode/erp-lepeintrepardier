/* ==========================================================================
   Contrôle d'accès : chaque rôle a, pour chaque module, une portée de données
   ("all" = toute l'entreprise, "shop" = son site d'affectation, "own" = ses
   propres enregistrements) et un droit d'écriture. Un module absent de la
   matrice est inaccessible. L'espace personnel est accessible à tous.
   ========================================================================== */

export type Role =
  | "super_admin"
  | "directeur_commercial"
  | "commercial"
  | "responsable_boutique"
  | "caissiere"
  | "vendeur"
  | "comptable"
  | "rh"
  | "gestionnaire_stock"
  | "magasinier"
  | "marketing"
  | "employe"

export type ModuleKey =
  | "dashboard"
  | "clients"
  | "prospects"
  | "relances"
  | "rendez_vous"
  | "evenements"
  | "opportunites"
  | "devis"
  | "ventes"
  | "facturation"
  | "marketing"
  | "produits"
  | "stock"
  | "magasins"
  | "boutiques"
  | "comptabilite"
  | "depenses"
  | "rh_employes"
  | "rh_pointage"
  | "rh_conges"
  | "rh_paie"
  | "design_system"

export type Scope = "all" | "shop" | "own"

export interface Permission {
  scope: Scope
  write: boolean
}

const rw = (scope: Scope): Permission => ({ scope, write: true })
const ro = (scope: Scope): Permission => ({ scope, write: false })

const ALL_MODULES: ModuleKey[] = [
  "dashboard",
  "clients",
  "prospects",
  "relances",
  "rendez_vous",
  "evenements",
  "opportunites",
  "devis",
  "ventes",
  "facturation",
  "marketing",
  "produits",
  "stock",
  "magasins",
  "boutiques",
  "comptabilite",
  "depenses",
  "rh_employes",
  "rh_pointage",
  "rh_conges",
  "rh_paie",
  "design_system",
]

export const ACCESS: Record<Role, Partial<Record<ModuleKey, Permission>>> = {
  super_admin: Object.fromEntries(ALL_MODULES.map((m) => [m, rw("all")])),
  directeur_commercial: {
    dashboard: ro("all"),
    clients: rw("all"),
    prospects: rw("all"),
    relances: rw("all"),
    opportunites: rw("all"),
    devis: rw("all"),
    ventes: rw("all"),
    facturation: rw("all"),
    marketing: ro("all"),
    rendez_vous: rw("all"),
    evenements: rw("all"),
    produits: ro("all"),
    stock: ro("all"),
    boutiques: rw("all"),
    depenses: rw("own"),
  },
  commercial: {
    dashboard: ro("own"),
    clients: rw("own"),
    prospects: rw("own"),
    relances: rw("own"),
    opportunites: rw("own"),
    devis: rw("own"),
    ventes: rw("own"),
    facturation: ro("own"),
    rendez_vous: rw("own"),
    evenements: ro("all"),
    produits: ro("all"),
    stock: ro("all"),
    depenses: rw("own"),
  },
  responsable_boutique: {
    dashboard: ro("shop"),
    clients: rw("shop"),
    prospects: rw("own"),
    relances: rw("own"),
    ventes: rw("shop"),
    facturation: rw("shop"),
    rendez_vous: rw("shop"),
    evenements: ro("all"),
    produits: ro("all"),
    stock: rw("shop"),
    boutiques: ro("shop"),
    depenses: rw("shop"),
  },
  caissiere: {
    dashboard: ro("own"),
    clients: rw("shop"),
    ventes: rw("own"),
    facturation: rw("shop"),
    produits: ro("all"),
    stock: ro("shop"),
    depenses: rw("own"),
  },
  vendeur: {
    dashboard: ro("own"),
    clients: rw("own"),
    prospects: rw("own"),
    ventes: rw("own"),
    rendez_vous: rw("own"),
    produits: ro("all"),
    stock: ro("shop"),
    depenses: rw("own"),
  },
  comptable: {
    dashboard: ro("all"),
    clients: ro("all"),
    relances: rw("all"),
    ventes: ro("all"),
    facturation: rw("all"),
    comptabilite: rw("all"),
    depenses: rw("all"),
    rh_paie: ro("all"),
  },
  rh: {
    rh_employes: rw("all"),
    rh_pointage: rw("all"),
    rh_conges: rw("all"),
    rh_paie: rw("all"),
    evenements: rw("all"),
    depenses: rw("own"),
  },
  gestionnaire_stock: {
    produits: rw("all"),
    stock: rw("all"),
    magasins: ro("all"),
    depenses: rw("own"),
  },
  magasinier: {
    produits: ro("all"),
    stock: rw("shop"),
    magasins: ro("shop"),
    depenses: rw("own"),
  },
  marketing: {
    marketing: rw("all"),
    prospects: rw("all"),
    rendez_vous: rw("all"),
    evenements: rw("all"),
    clients: ro("all"),
    produits: ro("all"),
    depenses: rw("own"),
  },
  employe: {
    depenses: rw("own"),
  },
}

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super administrateur",
  directeur_commercial: "Directeur commercial",
  commercial: "Commercial",
  responsable_boutique: "Responsable de boutique",
  caissiere: "Caissière",
  vendeur: "Vendeur",
  comptable: "Comptable",
  rh: "Ressources humaines",
  gestionnaire_stock: "Gestionnaire de stock",
  magasinier: "Magasinier",
  marketing: "Marketing",
  employe: "Employé",
}

export const SCOPE_LABEL: Record<Scope, string> = {
  all: "Toute l'entreprise",
  shop: "Son site d'affectation",
  own: "Ses propres données",
}

export function permissionFor(role: Role | undefined, module: ModuleKey): Permission | null {
  if (!role) return null
  return ACCESS[role]?.[module] ?? null
}

export const DEFAULT_PASSWORD = "Isonem@2026"
