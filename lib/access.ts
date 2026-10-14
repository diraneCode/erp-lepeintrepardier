/* ==========================================================================
   Contrôle d'accès : chaque rôle a, pour chaque module, une portée de données
   ("all" = toute l'entreprise, "shop" = son site d'affectation, "own" = ses
   propres enregistrements) et un droit d'écriture. Un module absent de la
   matrice est inaccessible. L'espace personnel est accessible à tous.
   ========================================================================== */

/** Rôle = poste. Le super administrateur (direction) administre la plateforme. */
export type Role = "super_admin" | "caissiere" | "gestionnaire_stock" | "commercial" | "magasinier"

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

// Tout employé peut créer des prospects et des clients (rattachés à lui-même)
const BASE: Partial<Record<ModuleKey, Permission>> = {
  clients: rw("own"),
  prospects: rw("own"),
  depenses: rw("own"),
}

export const ACCESS: Record<Role, Partial<Record<ModuleKey, Permission>>> = {
  super_admin: Object.fromEntries(ALL_MODULES.map((m) => [m, rw("all")])),
  commercial: {
    ...BASE,
    dashboard: ro("own"),
    relances: rw("own"),
    opportunites: rw("own"),
    devis: rw("own"),
    ventes: rw("own"),
    facturation: ro("own"),
    marketing: rw("all"),
    rendez_vous: rw("own"),
    evenements: rw("all"),
    produits: ro("all"),
    stock: ro("all"),
  },
  caissiere: {
    ...BASE,
    dashboard: ro("shop"),
    clients: rw("shop"),
    relances: rw("own"),
    ventes: rw("shop"),
    facturation: rw("shop"),
    comptabilite: rw("all"),
    depenses: rw("shop"),
    produits: ro("all"),
    stock: ro("shop"),
  },
  gestionnaire_stock: {
    ...BASE,
    produits: rw("all"),
    stock: rw("all"),
    magasins: rw("all"),
  },
  magasinier: {
    ...BASE,
    produits: ro("all"),
    stock: rw("shop"),
    magasins: ro("shop"),
  },
}

export const ROLE_LABEL: Record<Role, string> = {
  super_admin: "Super administrateur",
  caissiere: "Caissière",
  gestionnaire_stock: "Gestionnaire de stock",
  commercial: "Commercial(e)",
  magasinier: "Magasinier",
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

export const DEFAULT_PASSWORD = "Pardier@2026"
