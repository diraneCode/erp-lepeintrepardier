-- =============================================================================
-- Le Peintre Pardier ERP — 01 · Schéma
-- À exécuter en premier dans l'éditeur SQL de Supabase.
-- Les identifiants sont des textes (générés par l'application ou par défaut ici).
-- Les montants sont en FCFA (numeric). Les lignes de documents sont en jsonb.
-- =============================================================================


create schema if not exists app;

-- -----------------------------------------------------------------------------
-- Compteurs de numérotation (factures, ventes, proformas…)
-- -----------------------------------------------------------------------------
create table if not exists app.counters (
  key text primary key,
  value integer not null default 0
);

-- -----------------------------------------------------------------------------
-- Sites
-- -----------------------------------------------------------------------------
create table if not exists public.warehouses (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  type text not null check (type in ('entrepot', 'depot')),
  city text not null,
  address text not null,
  manager_id text,
  phone text not null default '',
  capacity integer not null default 0 check (capacity >= 0),
  status text not null default 'actif' check (status in ('actif', 'inactif', 'maintenance')),
  created_at date not null default current_date
);

create table if not exists public.shops (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  city text not null,
  address text not null,
  manager_id text,
  phone text not null default '',
  opening_hours text not null default '',
  monthly_target numeric(16, 2) not null default 0 check (monthly_target >= 0),
  supply_warehouse_id text references public.warehouses (id) on delete set null,
  status text not null default 'ouverte' check (status in ('ouverte', 'fermee', 'travaux')),
  opened_at date not null default current_date
);

create table if not exists public.shop_targets (
  id text primary key default gen_random_uuid()::text,
  shop_id text not null references public.shops (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  amount numeric(16, 2) not null check (amount >= 0),
  unique (shop_id, period)
);

-- -----------------------------------------------------------------------------
-- Employés (un employé = un compte Supabase Auth)
-- -----------------------------------------------------------------------------
create table if not exists public.employees (
  id text primary key default gen_random_uuid()::text,
  user_id uuid unique references auth.users (id) on delete set null,
  matricule text not null unique,
  first_name text not null,
  last_name text not null,
  gender text not null check (gender in ('H', 'F')),
  email text not null unique,
  phone text not null,
  birth_date date,
  hire_date date not null,
  department text not null,
  position text not null,
  contract_type text not null check (contract_type in ('cdi', 'cdd', 'stage', 'interim')),
  base_salary numeric(16, 2) not null check (base_salary >= 0),
  location_id text not null,
  status text not null default 'actif' check (status in ('actif', 'conge', 'suspendu', 'sorti')),
  cnps_number text not null default '',
  bank_account text,
  address text not null default '',
  marital_status text not null default 'celibataire' check (marital_status in ('celibataire', 'marie', 'divorce', 'veuf')),
  children integer check (children is null or children between 0 and 20),
  role text not null check (role in ('super_admin', 'caissiere', 'gestionnaire_stock', 'commercial', 'magasinier')),
  documents jsonb not null default '{}'::jsonb,
  emergency_contact jsonb
);
create index if not exists employees_location_idx on public.employees (location_id);

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------
create table if not exists public.categories (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  description text not null default '',
  color text not null default '#4b2e9e'
);

create table if not exists public.products (
  id text primary key default gen_random_uuid()::text,
  sku text not null unique,
  name text not null,
  category_id text not null references public.categories (id) on delete restrict,
  brand text not null default '',
  unit text not null,
  purchase_price numeric(16, 2) not null check (purchase_price >= 0),
  sale_price numeric(16, 2) not null check (sale_price >= 0),
  tax_rate numeric(5, 2) not null default 0,
  min_stock integer not null default 0,
  status text not null default 'actif' check (status in ('actif', 'inactif')),
  barcode text,
  supplier text not null default '',
  promo_price numeric(16, 2) check (promo_price is null or promo_price >= 0),
  promo_end_date date,
  specification text,
  packaging text,
  coverage numeric(10, 2),
  expiry_date date,
  description text,
  created_at date not null default current_date
);
create index if not exists products_category_idx on public.products (category_id);

-- -----------------------------------------------------------------------------
-- Gestion commerciale
-- -----------------------------------------------------------------------------
create table if not exists public.clients (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  type text not null check (type in ('entreprise', 'particulier')),
  name text not null,
  contact_name text not null,
  email text not null default '',
  phone text not null,
  city text not null,
  address text not null default '',
  segment text not null,
  status text not null default 'actif' check (status in ('actif', 'inactif')),
  owner_id text not null references public.employees (id),
  credit_limit numeric(16, 2) not null default 0,
  created_at date not null default current_date,
  notes text
);
create index if not exists clients_owner_idx on public.clients (owner_id);

create table if not exists public.prospects (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  type text not null check (type in ('entreprise', 'particulier')),
  name text not null,
  contact_name text not null,
  phone text not null,
  email text not null default '',
  city text not null,
  segment text not null,
  source text not null,
  need text not null,
  potential numeric(16, 2) not null default 0,
  status text not null default 'nouveau' check (status in ('nouveau', 'contacte', 'qualifie', 'converti', 'perdu')),
  owner_id text not null references public.employees (id),
  created_at date not null default current_date,
  last_contact date,
  next_action text,
  lost_reason text,
  client_id text references public.clients (id) on delete set null
);
create index if not exists prospects_owner_idx on public.prospects (owner_id);

create table if not exists public.opportunities (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  client_id text not null references public.clients (id) on delete cascade,
  amount numeric(16, 2) not null check (amount >= 0),
  stage text not null,
  probability integer not null check (probability between 0 and 100),
  expected_close date not null,
  owner_id text not null references public.employees (id),
  source text not null,
  created_at date not null default current_date,
  notes text
);
create index if not exists opportunities_owner_idx on public.opportunities (owner_id);

create table if not exists public.quotes (
  id text primary key default gen_random_uuid()::text,
  number text not null unique,
  client_id text not null references public.clients (id) on delete restrict,
  date date not null,
  valid_until date not null,
  items jsonb not null default '[]'::jsonb,
  status text not null default 'brouillon' check (status in ('brouillon', 'envoye', 'accepte', 'refuse', 'expire')),
  owner_id text not null references public.employees (id),
  notes text,
  invoice_id text,
  project text,
  site text,
  issued_in text,
  surfaces jsonb
);
create index if not exists quotes_owner_idx on public.quotes (owner_id);
create index if not exists quotes_client_idx on public.quotes (client_id);

-- -----------------------------------------------------------------------------
-- Ventes & facturation
-- -----------------------------------------------------------------------------
create table if not exists public.sales (
  id text primary key default gen_random_uuid()::text,
  number text not null unique,
  date date not null,
  client_id text references public.clients (id) on delete set null,
  boutique_id text not null references public.shops (id),
  seller_id text not null references public.employees (id),
  items jsonb not null default '[]'::jsonb,
  payment_method text not null,
  status text not null check (status in ('brouillon', 'confirmee', 'livree', 'annulee')),
  channel text not null,
  invoice_id text,
  notes text
);
create index if not exists sales_seller_idx on public.sales (seller_id);
create index if not exists sales_boutique_idx on public.sales (boutique_id, date);
create index if not exists sales_client_idx on public.sales (client_id);

create table if not exists public.invoices (
  id text primary key default gen_random_uuid()::text,
  number text not null unique,
  client_id text not null references public.clients (id) on delete restrict,
  boutique_id text not null references public.shops (id),
  date date not null,
  due_date date not null,
  items jsonb not null default '[]'::jsonb,
  status text not null check (status in ('brouillon', 'emise', 'partielle', 'payee', 'annulee')),
  amount_paid numeric(16, 2) not null default 0 check (amount_paid >= 0),
  sale_id text references public.sales (id) on delete set null,
  quote_id text references public.quotes (id) on delete set null,
  notes text,
  check (due_date >= date)
);
create index if not exists invoices_client_idx on public.invoices (client_id);
create index if not exists invoices_boutique_idx on public.invoices (boutique_id, date);
create index if not exists invoices_sale_idx on public.invoices (sale_id);

create table if not exists public.payments (
  id text primary key default gen_random_uuid()::text,
  invoice_id text not null references public.invoices (id) on delete cascade,
  date date not null,
  amount numeric(16, 2) not null check (amount > 0),
  method text not null,
  reference text not null
);
create index if not exists payments_invoice_idx on public.payments (invoice_id);

create table if not exists public.followups (
  id text primary key default gen_random_uuid()::text,
  target_type text not null check (target_type in ('prospect', 'client', 'devis', 'facture')),
  target_id text not null,
  subject text not null,
  channel text not null,
  priority text not null default 'normale' check (priority in ('haute', 'normale', 'basse')),
  due_date date not null,
  status text not null default 'a_faire' check (status in ('a_faire', 'fait', 'reporte', 'annule')),
  owner_id text not null references public.employees (id),
  notes text,
  outcome text,
  done_at date,
  created_at date not null default current_date
);
create index if not exists followups_owner_idx on public.followups (owner_id, status, due_date);
create index if not exists followups_target_idx on public.followups (target_type, target_id);

-- -----------------------------------------------------------------------------
-- Stock
-- -----------------------------------------------------------------------------
create table if not exists public.stock_levels (
  id text primary key default gen_random_uuid()::text,
  product_id text not null references public.products (id) on delete cascade,
  location_id text not null,
  quantity integer not null default 0 check (quantity >= 0),
  unique (product_id, location_id)
);
create index if not exists stock_levels_location_idx on public.stock_levels (location_id);

create table if not exists public.stock_movements (
  id text primary key default gen_random_uuid()::text,
  date timestamp not null default (now() at time zone 'Africa/Douala'),
  product_id text not null references public.products (id) on delete cascade,
  type text not null check (type in ('entree', 'sortie', 'transfert', 'ajustement')),
  quantity integer not null check (quantity <> 0),
  from_location_id text,
  to_location_id text,
  reason text not null,
  reference text not null,
  user_id text
);
create index if not exists stock_movements_date_idx on public.stock_movements (date);
create index if not exists stock_movements_from_idx on public.stock_movements (from_location_id);
create index if not exists stock_movements_to_idx on public.stock_movements (to_location_id);

-- -----------------------------------------------------------------------------
-- Marketing
-- -----------------------------------------------------------------------------
create table if not exists public.campaigns (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  channel text not null,
  status text not null,
  segment text not null,
  start_date date not null,
  end_date date not null,
  budget numeric(16, 2) not null default 0,
  spent numeric(16, 2) not null default 0,
  reach integer not null default 0,
  leads integer not null default 0,
  conversions integer not null default 0,
  revenue numeric(16, 2) not null default 0,
  owner_id text not null references public.employees (id),
  description text,
  check (end_date >= start_date)
);

create table if not exists public.promotions (
  id text primary key default gen_random_uuid()::text,
  code text not null unique,
  name text not null,
  type text not null check (type in ('pourcentage', 'montant')),
  value numeric(16, 2) not null check (value > 0),
  min_amount numeric(16, 2) not null default 0,
  category_id text references public.categories (id) on delete set null,
  start_date date not null,
  end_date date not null,
  usage_count integer not null default 0,
  usage_limit integer not null default 0,
  active boolean not null default true
);

create table if not exists public.appointments (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  type text not null,
  client_id text references public.clients (id) on delete set null,
  prospect_id text references public.prospects (id) on delete set null,
  contact_name text not null,
  phone text not null,
  date date not null,
  start_time text not null check (start_time ~ '^\d{2}:\d{2}$'),
  duration_minutes integer not null check (duration_minutes between 15 and 480),
  location text not null,
  assigned_to text not null references public.employees (id),
  status text not null,
  notes text,
  created_at date not null default current_date
);
create index if not exists appointments_assignee_idx on public.appointments (assigned_to, date);

create table if not exists public.events (
  id text primary key default gen_random_uuid()::text,
  title text not null,
  type text not null,
  audience text not null,
  start_date date not null,
  end_date date not null,
  start_time text not null,
  end_time text not null,
  location text not null,
  trainer_id text references public.employees (id) on delete set null,
  external_speaker text,
  capacity integer not null check (capacity > 0),
  budget numeric(16, 2) not null default 0,
  cost numeric(16, 2) not null default 0,
  fee numeric(16, 2) not null default 0,
  status text not null,
  description text not null default '',
  program text,
  participants jsonb not null default '[]'::jsonb,
  owner_id text not null references public.employees (id),
  check (end_date >= start_date)
);

-- -----------------------------------------------------------------------------
-- Ressources humaines
-- -----------------------------------------------------------------------------
create table if not exists public.attendance (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references public.employees (id) on delete cascade,
  date date not null,
  check_in text,
  check_out text,
  break_minutes integer not null default 0 check (break_minutes between 0 and 240),
  overtime_minutes integer not null default 0 check (overtime_minutes between 0 and 720),
  status text not null check (status in ('present', 'retard', 'absent', 'conge', 'mission')),
  note text,
  unique (employee_id, date)
);
-- Mise à niveau d'une base existante : TVA à 0 % par défaut sur les nouveaux produits
alter table public.products alter column tax_rate set default 0;
-- Mise à niveau d'une base existante : heures supplémentaires (en minutes)
alter table public.attendance add column if not exists overtime_minutes integer not null default 0;
do $$ begin
  alter table public.attendance add constraint attendance_overtime_minutes_check check (overtime_minutes between 0 and 720);
exception when duplicate_object then null; end $$;
create index if not exists attendance_date_idx on public.attendance (date);

create table if not exists public.leaves (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references public.employees (id) on delete cascade,
  type text not null,
  start_date date not null,
  end_date date not null,
  days integer not null check (days >= 0),
  reason text not null,
  status text not null default 'en_attente' check (status in ('en_attente', 'approuve', 'refuse', 'annule')),
  requested_at date not null default current_date,
  approver_id text,
  comment text,
  check (end_date >= start_date)
);
create index if not exists leaves_employee_idx on public.leaves (employee_id);

create table if not exists public.payslips (
  id text primary key default gen_random_uuid()::text,
  employee_id text not null references public.employees (id) on delete cascade,
  period text not null check (period ~ '^\d{4}-\d{2}$'),
  base_salary numeric(16, 2) not null,
  overtime numeric(16, 2) not null default 0,
  bonuses numeric(16, 2) not null default 0,
  transport_allowance numeric(16, 2) not null default 0,
  housing_allowance numeric(16, 2) not null default 0,
  other_deductions numeric(16, 2) not null default 0,
  status text not null default 'brouillon' check (status in ('brouillon', 'valide', 'paye')),
  paid_at date,
  unique (employee_id, period)
);

-- -----------------------------------------------------------------------------
-- Finance
-- -----------------------------------------------------------------------------
create table if not exists public.expenses (
  id text primary key default gen_random_uuid()::text,
  number text not null unique,
  date date not null,
  category text not null,
  description text not null,
  supplier text not null,
  amount numeric(16, 2) not null check (amount > 0),
  payment_method text not null,
  location_id text not null,
  status text not null default 'en_attente' check (status in ('en_attente', 'approuvee', 'rejetee', 'payee')),
  submitted_by text not null references public.employees (id),
  approved_by text,
  has_receipt boolean not null default false
);
create index if not exists expenses_submitter_idx on public.expenses (submitted_by);
create index if not exists expenses_location_idx on public.expenses (location_id, date);

create table if not exists public.journal_entries (
  id text primary key default gen_random_uuid()::text,
  number text not null unique,
  date date not null,
  journal text not null check (journal in ('VE', 'AC', 'BQ', 'CA', 'OD', 'PA')),
  label text not null,
  reference text not null,
  lines jsonb not null default '[]'::jsonb,
  status text not null default 'valide' check (status in ('brouillon', 'valide'))
);
create index if not exists journal_entries_date_idx on public.journal_entries (date);

-- -----------------------------------------------------------------------------
-- Caisse : brouillard de caisse par site (boutique). Chaque entrée ou sortie
-- d'espèces est tracée ; le solde = entrées − sorties. Aucune ligne n'est
-- modifiable ni supprimable : une erreur se corrige par une opération inverse.
-- -----------------------------------------------------------------------------
create table if not exists public.cash_movements (
  id text primary key default gen_random_uuid()::text,
  number text not null unique,
  date date not null default ((now() at time zone 'Africa/Douala')::date),
  created_at timestamp not null default (now() at time zone 'Africa/Douala'),
  location_id text not null,
  direction text not null check (direction in ('entree', 'sortie')),
  kind text not null check (kind in ('vente', 'encaissement', 'apport', 'autre_entree', 'depense', 'versement_banque', 'annulation', 'autre_sortie')),
  amount numeric(16, 2) not null check (amount > 0),
  label text not null,
  reference text,
  client_name text,
  bank_name text,
  bank_account text,
  deposit_mode text check (deposit_mode is null or deposit_mode in ('especes', 'cheque', 'mobile_money')),
  slip_number text,
  depositor text,
  sale_id text references public.sales (id) on delete set null,
  payment_id text references public.payments (id) on delete set null,
  expense_id text references public.expenses (id) on delete set null,
  user_id text,
  note text
);
create index if not exists cash_movements_location_idx on public.cash_movements (location_id, date desc, created_at desc);
create index if not exists cash_movements_date_idx on public.cash_movements (date desc, id);
create index if not exists cash_movements_payment_idx on public.cash_movements (payment_id) where payment_id is not null;
create index if not exists cash_movements_expense_idx on public.cash_movements (expense_id) where expense_id is not null;
create index if not exists cash_movements_sale_idx on public.cash_movements (sale_id) where sale_id is not null;

-- -----------------------------------------------------------------------------
-- Notifications & journal d'activité
-- -----------------------------------------------------------------------------
create table if not exists public.notifications (
  id text primary key default gen_random_uuid()::text,
  date timestamp not null default (now() at time zone 'Africa/Douala'),
  title text not null,
  description text not null,
  module text not null,
  href text not null,
  tone text not null default 'info',
  read_by text[] not null default '{}'
);

create table if not exists public.activity_logs (
  id text primary key default gen_random_uuid()::text,
  user_id text not null,
  date timestamp not null default (now() at time zone 'Africa/Douala'),
  action text not null,
  module text not null,
  details text not null
);
create index if not exists activity_logs_user_idx on public.activity_logs (user_id, date desc);
