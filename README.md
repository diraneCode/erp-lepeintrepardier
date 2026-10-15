# Le Peintre Pardier ERP

ERP Le Peintre Pardier — Next.js 16, React 19, Supabase (Postgres, Auth, Storage), React Query, Tailwind CSS 4, shadcn/ui.

## Démarrer

### 1. Supabase

1. Créez un projet sur [supabase.com](https://supabase.com).
2. Dans **SQL Editor**, exécutez dans l'ordre les scripts de `supabase/sql/` :
   `01_schema.sql` → `02_functions.sql` → `03_policies.sql` → `04_storage.sql` → `05_indexes.sql`
   (ils peuvent être réexécutés sans perte de données).
3. **Authentication → Sign In / Providers** : désactivez *Allow new users to sign up*
   (les comptes sont créés par l'administrateur depuis RH → Employés) et gardez *Email* activé.

### 2. Variables d'environnement

```bash
cp .env.example .env.local   # puis renseignez les 3 valeurs (Settings → API)
```

`SUPABASE_SERVICE_ROLE_KEY` reste côté serveur (création des comptes, seed) : ne la préfixez jamais par `NEXT_PUBLIC_`.

### 3. Premier administrateur

- **Avec les données de démonstration** : `pnpm seed` (crée les comptes de tous les employés,
  mot de passe `Pardier@2026`, et affiche les e-mails).
- **Base vierge** : créez l'utilisateur dans *Authentication → Users → Add user*
  (cochez *Auto Confirm User*), puis dans le SQL Editor :
  `select app.bootstrap_admin('prenom.nom@pardier.com', 'Prénom', 'Nom');`

### 4. Lancer

```bash
pnpm install
pnpm dev      # http://localhost:3000
pnpm build && pnpm start
```

Chaque nouvel employé reçoit le mot de passe initial `Pardier@2026`, à changer dans *Mon compte*.
Le super administrateur peut le réinitialiser (*Mon compte → Administration*).

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
qu'aux profils à portée globale. Postes (= rôles) : caissière, gestionnaire de stock, commercial(e),
magasinier, plus le super administrateur. Tout employé peut créer prospects et clients ; ceux qui facturent
(caissière, commercial·e, administration) voient et peuvent choisir tous les clients, mais seul le responsable
d'un client (ou l'administration) modifie sa fiche.
Le filtrage côté interface est doublé par la sécurité de la base : chaque table est protégée par des
politiques RLS qui appliquent la même matrice (`supabase/sql/03_policies.sql`). Les pièces des employés
(photo, CNI, CV, plan, diplôme) sont dans le bucket privé `employee-files`, servies par URL signée.

## Architecture

- `lib/types.ts` — modèle de données · `lib/data/seed.ts` — jeu de démonstration
- `supabase/sql/` — schéma, fonctions métier transactionnelles (vente → stock → facture → paiement →
  écritures comptables, numérotation), politiques RLS, stockage
- `lib/store.ts` — accès aux données (React Query + Supabase) : `useStore((s) => s.sales)` charge et met
  en cache la table, les actions écrivent avec mise à jour optimiste puis revalidation
- `app/api/admin/employees` — comptes de connexion des employés (service role, super admin uniquement)
- `proxy.ts` — rafraîchit la session Supabase et redirige vers `/login` sans session

### Robustesse et performance

- Chaque page ne charge que les tables qu'elle affiche (`useScopedData([...])`, `useLookups([...])`),
  les formulaires ne chargent leurs listes qu'à leur première ouverture (`lazyDialog`), les compteurs
  du menu viennent d'une seule fonction SQL (`nav_counters`).
- Données de référence (catalogue, sites, annuaire) gardées 30 min en mémoire ; données courantes
  revalidées après 1 min ; URL signées des fichiers réutilisées ~1 h.
- Squelette pendant le premier chargement, écran « Réessayer » si une requête échoue, bandeau hors
  connexion, écrans d'erreur (`error.tsx`, `global-error.tsx`) si une page plante.
- Formulaires et confirmations verrouillés pendant l'enregistrement (aucun double envoi) ; le succès
  n'est annoncé qu'après la réponse de la base, sinon le formulaire reste ouvert avec l'erreur.
- Images compressées dans le navigateur avant envoi (photo 800 px, documents 2000 px, JPEG) ;
  PDF limités à 5 Mo, limite également imposée par le bucket.
- `lib/export.ts` — exports PDF (jsPDF), Excel (write-excel-file), CSV ; facture/devis/bulletin PDF
- `hooks/use-filters.ts` + `components/shared/filter-bar.tsx` — recherche, période, facettes, intervalles
- `components/shared/data-table.tsx` — tri, pagination, sélection, colonnes, totaux, export
- `components/forms/*` — champs react-hook-form + zod
- `app/globals.css` — tokens du design system (clair/sombre, palette graphique validée daltonisme)
