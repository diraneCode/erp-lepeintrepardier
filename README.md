# Isonem CRM

Frontend du CRM/ERP d'Isonem (Le Peintre Pardier) — Next.js 16, React 19, Tailwind CSS 4, shadcn/ui.

## Démarrer

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build && pnpm start
```

Connexion : choisissez un compte de démonstration sur `/login` (mot de passe `Isonem@2026`).

Les données sont générées au premier lancement (jeu de démonstration camerounais) et
conservées dans le `localStorage` du navigateur. Réinitialisation : *Mon compte → Préférences*.

## Modules

| Route | Module |
| --- | --- |
| `/` | Tableau de bord |
| `/commercial/prospects`, `/commercial/relances`, `/commercial/clients`, `/commercial/opportunites`, `/commercial/devis` | Gestion commerciale : prospects, relances, clients, pipeline, devis |
| `/ventes`, `/facturation` | Ventes, facturation & encaissements |
| `/marketing`, `/marketing/rendez-vous`, `/marketing/evenements` | Campagnes & promotions, prise de rendez-vous, séminaires & formations |
| `/produits`, `/stock`, `/magasins`, `/boutiques` | Catalogue, stock & mouvements, entrepôts, points de vente |
| `/comptabilite`, `/depenses` | Journal, grand livre, balance, résultat (SYSCOHADA) ; dépenses |
| `/rh/employes`, `/rh/pointage`, `/rh/conges`, `/rh/paie` | Employés, fiches de pointage, congés, bulletins de paie |
| `/moi/pointage`, `/moi/conges`, `/moi/paie` | Espace personnel : pointage, congés, bulletins (tous les employés) |
| `/compte`, `/design-system`, `/login` | Mon compte (consultation + mot de passe), charte graphique, connexion |

## Rôles et accès

`lib/access.ts` définit, pour chaque rôle, les modules accessibles, la portée des données
(`all` : toute l'entreprise · `shop` : son site d'affectation · `own` : ses propres données) et le
droit d'écriture. `hooks/use-access.ts` fournit l'utilisateur connecté et les données filtrées
(`useScopedData`). Les filtres par personne (commercial, vendeur, responsable…) ne sont proposés
qu'aux profils à portée globale. Rôles : super administrateur, directeur commercial, commercial,
responsable de boutique, caissière, vendeur, gestionnaire de stock, magasinier, comptable, RH,
marketing, employé. Le poste choisi dans la fiche employé propose le rôle correspondant (`POSITIONS` dans `lib/labels.ts`).

## Architecture

- `lib/types.ts` — modèle de données · `lib/data/seed.ts` — jeu de démonstration
- `lib/store.ts` — store zustand persisté + actions métier (vente → stock → facture → écriture comptable)
- `lib/export.ts` — exports PDF (jsPDF), Excel (write-excel-file), CSV ; facture/devis/bulletin PDF
- `hooks/use-filters.ts` + `components/shared/filter-bar.tsx` — recherche, période, facettes, intervalles
- `components/shared/data-table.tsx` — tri, pagination, sélection, colonnes, totaux, export
- `components/forms/*` — champs react-hook-form + zod
- `app/globals.css` — tokens du design system (clair/sombre, palette graphique validée daltonisme)
