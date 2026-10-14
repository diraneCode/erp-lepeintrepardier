import type { IconType } from "react-icons"

import type { ModuleKey } from "@/lib/access"
import {
  LuBanknote,
  LuBoxes,
  LuCalculator,
  LuCalendarDays,
  LuClock,
  LuFileText,
  LuIdCard,
  LuLayoutDashboard,
  LuMegaphone,
  LuPackage,
  LuPalette,
  LuUserSearch,
  LuBellRing,
  LuCalendarClock,
  LuPresentation,
  LuPlane,
  LuTimer,
  LuReceipt,
  LuShoppingCart,
  LuStore,
  LuTarget,
  LuUserCog,
  LuUsers,
  LuWallet,
  LuWarehouse,
} from "react-icons/lu"

export interface NavItem {
  title: string
  href: string
  icon: IconType
  description: string
  keywords?: string
  /** Module requis ; absent = accessible à tout employé connecté */
  module?: ModuleKey
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const NAV: NavGroup[] = [
  {
    label: "Pilotage",
    items: [{ title: "Accueil", href: "/", icon: LuLayoutDashboard, description: "Tableau de bord et vue d'ensemble" }],
  },
  {
    label: "Gestion commerciale",
    items: [
      { title: "Prospects", href: "/commercial/prospects", icon: LuUserSearch, description: "Pistes commerciales à convertir", keywords: "leads pistes", module: "prospects" },
      { title: "Relances", href: "/commercial/relances", icon: LuBellRing, description: "Relances devis, factures et prospects", keywords: "rappels suivi", module: "relances" },
      { title: "Clients", href: "/commercial/clients", icon: LuUsers, description: "Clients et prospects", keywords: "contacts", module: "clients" },
      { title: "Opportunités", href: "/commercial/opportunites", icon: LuTarget, description: "Pipeline commercial", keywords: "pipeline affaires", module: "opportunites" },
      { title: "Devis", href: "/commercial/devis", icon: LuFileText, description: "Propositions commerciales", keywords: "quotes", module: "devis" },
      { title: "Ventes", href: "/ventes", icon: LuShoppingCart, description: "Ventes et commandes", keywords: "commandes caisse", module: "ventes" },
      { title: "Facturation", href: "/facturation", icon: LuReceipt, description: "Factures et encaissements", keywords: "factures paiements", module: "facturation" },
    ],
  },
  {
    label: "Marketing",
    items: [
      { title: "Campagnes & promotions", href: "/marketing", icon: LuMegaphone, description: "Campagnes et codes promotionnels", keywords: "campagnes codes promo", module: "marketing" },
      { title: "Rendez-vous", href: "/marketing/rendez-vous", icon: LuCalendarClock, description: "Prise et suivi des rendez-vous", keywords: "agenda rdv", module: "rendez_vous" },
      { title: "Séminaires & formations", href: "/marketing/evenements", icon: LuPresentation, description: "Formations, ateliers, séminaires", keywords: "evenements atelier formation", module: "evenements" },
    ],
  },
  {
    label: "Produits & logistique",
    items: [
      { title: "Produits", href: "/produits", icon: LuPackage, description: "Catalogue et catégories", keywords: "articles catalogue", module: "produits" },
      { title: "Stock", href: "/stock", icon: LuBoxes, description: "Niveaux et mouvements de stock", keywords: "inventaire", module: "stock" },
      { title: "Magasins", href: "/magasins", icon: LuWarehouse, description: "Entrepôts et dépôts", keywords: "entrepots", module: "magasins" },
      { title: "Boutiques", href: "/boutiques", icon: LuStore, description: "Points de vente", keywords: "points de vente", module: "boutiques" },
    ],
  },
  {
    label: "Finance",
    items: [
      { title: "Comptabilité", href: "/comptabilite", icon: LuCalculator, description: "Journal, grand livre, balance", keywords: "ecritures syscohada", module: "comptabilite" },
      { title: "Dépenses", href: "/depenses", icon: LuWallet, description: "Notes de frais et charges", keywords: "charges frais", module: "depenses" },
    ],
  },
  {
    label: "Ressources humaines",
    items: [
      { title: "Employés", href: "/rh/employes", icon: LuIdCard, description: "Dossiers du personnel", keywords: "personnel salaries", module: "rh_employes" },
      { title: "Fiches de pointage", href: "/rh/pointage", icon: LuClock, description: "Présences et heures", keywords: "presence horaires", module: "rh_pointage" },
      { title: "Congés", href: "/rh/conges", icon: LuCalendarDays, description: "Demandes et soldes de congés", keywords: "absences vacances", module: "rh_conges" },
      { title: "Bulletins de paie", href: "/rh/paie", icon: LuBanknote, description: "Paie mensuelle", keywords: "salaires paie", module: "rh_paie" },
    ],
  },
  {
    label: "Mon espace",
    items: [
      { title: "Mon pointage", href: "/moi/pointage", icon: LuTimer, description: "Pointer et consulter mes présences", keywords: "presence arrivee depart" },
      { title: "Mes congés", href: "/moi/conges", icon: LuPlane, description: "Mes demandes et mon solde", keywords: "absence vacances" },
      { title: "Mes bulletins de paie", href: "/moi/paie", icon: LuFileText, description: "Consulter et télécharger mes bulletins", keywords: "salaire" },
      { title: "Mon compte", href: "/compte", icon: LuUserCog, description: "Mes informations et mon mot de passe", keywords: "profil mot de passe" },
    ],
  },
  {
    label: "Administration",
    items: [{ title: "Design system", href: "/design-system", icon: LuPalette, description: "Charte graphique et composants", keywords: "ui couleurs", module: "design_system" }],
  },
]

export const NAV_ITEMS = NAV.flatMap((g) => g.items.map((i) => ({ ...i, group: g.label })))

export function findNavItem(pathname: string) {
  return (
    NAV_ITEMS.find((i) => i.href === pathname) ??
    NAV_ITEMS.filter((i) => i.href !== "/" && pathname.startsWith(i.href)).sort((a, b) => b.href.length - a.href.length)[0]
  )
}

/** Navigation visible pour un utilisateur donné. */
export function visibleNav(can: (module: ModuleKey) => boolean) {
  return NAV.map((g) => ({ ...g, items: g.items.filter((i) => !i.module || can(i.module)) })).filter((g) => g.items.length > 0)
}

/** Module requis pour accéder à une URL (undefined = libre d'accès une fois connecté). */
export function moduleForPath(pathname: string): ModuleKey | undefined {
  return findNavItem(pathname)?.module
}
