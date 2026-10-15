-- =============================================================================
-- Le Peintre Pardier ERP — 02 · Fonctions, déclencheurs et opérations métier
-- À exécuter après 01_schema.sql.
--
-- Principes de sécurité :
--  * toutes les fonctions SECURITY DEFINER fixent search_path = '' et
--    qualifient chaque objet ;
--  * les opérations métier vérifient explicitement le rôle de l'appelant ;
--  * les automatismes (journal, stock, règlements) ne s'exécutent que pour
--    un utilisateur connecté (auth.uid() non nul) : les imports réalisés avec
--    la clé service_role (script de démonstration) ne sont pas dédoublés.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Identité de l'appelant
-- -----------------------------------------------------------------------------
create or replace function app.my_employee_id() returns text
language sql stable security definer set search_path = '' as $$
  select e.id from public.employees e
  where e.user_id = (select auth.uid()) and e.status in ('actif', 'conge')
  limit 1
$$;

create or replace function app.my_role() returns text
language sql stable security definer set search_path = '' as $$
  select e.role from public.employees e
  where e.user_id = (select auth.uid()) and e.status in ('actif', 'conge')
  limit 1
$$;

create or replace function app.my_location() returns text
language sql stable security definer set search_path = '' as $$
  select e.location_id from public.employees e
  where e.user_id = (select auth.uid()) and e.status in ('actif', 'conge')
  limit 1
$$;

create or replace function app.is_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(app.my_role() = 'super_admin', false)
$$;

-- -----------------------------------------------------------------------------
-- Numérotation
-- -----------------------------------------------------------------------------
create or replace function app.next_counter(p_key text) returns integer
language sql volatile security definer set search_path = '' as $$
  insert into app.counters as c (key, value) values (p_key, 1)
  on conflict (key) do update set value = c.value + 1
  returning value
$$;

-- Attribue un numéro si absent ou déjà utilisé (saisies concurrentes).
-- TG_ARGV[0] : type de numérotation, TG_ARGV[1] : colonne cible.
create or replace function app.assign_number() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_kind text := tg_argv[0];
  v_col text := tg_argv[1];
  v_current text := to_jsonb(new) ->> v_col;
  v_date date := coalesce((to_jsonb(new) ->> 'date')::date, current_date);
  v_year text := to_char(v_date, 'YYYY');
  v_key text;
  v_candidate text;
  v_n integer;
  v_dup boolean;
begin
  if v_current is not null and v_current <> '' then
    execute format('select exists (select 1 from %I.%I where %I = $1 and id <> $2)', tg_table_schema, tg_table_name, v_col)
      into v_dup using v_current, new.id;
    if not v_dup then
      return new;
    end if;
  end if;

  v_key := case v_kind
    when 'quote' then 'quote-' || to_char(v_date, 'YYYY-MM')
    when 'client' then 'client'
    when 'prospect' then 'prospect'
    when 'employee' then 'employee'
    else v_kind || '-' || v_year
  end;

  loop
    v_n := app.next_counter(v_key);
    v_candidate := case v_kind
      when 'sale' then 'VTE-' || v_year || '-' || lpad(v_n::text, 5, '0')
      when 'invoice' then 'FAC-' || v_year || '-' || lpad(v_n::text, 5, '0')
      when 'journal' then 'EC-' || v_year || '-' || lpad(v_n::text, 5, '0')
      when 'expense' then 'DEP-' || v_year || '-' || lpad(v_n::text, 4, '0')
      when 'quote' then lpad(v_n::text, 2, '0') || '/' || to_char(v_date, 'YYYY/MM')
      when 'client' then 'CLI-' || lpad(v_n::text, 4, '0')
      when 'prospect' then 'PRO-' || lpad(v_n::text, 4, '0')
      when 'employee' then 'LPP-' || lpad(v_n::text, 4, '0')
      when 'cash' then 'CAI-' || v_year || '-' || lpad(v_n::text, 5, '0')
    end;
    execute format('select exists (select 1 from %I.%I where %I = $1)', tg_table_schema, tg_table_name, v_col)
      into v_dup using v_candidate;
    exit when not v_dup;
  end loop;

  return jsonb_populate_record(new, jsonb_build_object(v_col, v_candidate));
end;
$$;

drop trigger if exists number_sales on public.sales;
create trigger number_sales before insert on public.sales for each row execute function app.assign_number('sale', 'number');
drop trigger if exists number_invoices on public.invoices;
create trigger number_invoices before insert on public.invoices for each row execute function app.assign_number('invoice', 'number');
drop trigger if exists number_journal on public.journal_entries;
create trigger number_journal before insert on public.journal_entries for each row execute function app.assign_number('journal', 'number');
drop trigger if exists number_expenses on public.expenses;
create trigger number_expenses before insert on public.expenses for each row execute function app.assign_number('expense', 'number');
drop trigger if exists number_quotes on public.quotes;
create trigger number_quotes before insert on public.quotes for each row execute function app.assign_number('quote', 'number');
drop trigger if exists number_clients on public.clients;
create trigger number_clients before insert on public.clients for each row execute function app.assign_number('client', 'code');
drop trigger if exists number_prospects on public.prospects;
create trigger number_prospects before insert on public.prospects for each row execute function app.assign_number('prospect', 'code');
drop trigger if exists number_employees on public.employees;
create trigger number_employees before insert on public.employees for each row execute function app.assign_number('employee', 'matricule');
drop trigger if exists number_cash on public.cash_movements;
create trigger number_cash before insert on public.cash_movements for each row execute function app.assign_number('cash', 'number');

-- -----------------------------------------------------------------------------
-- Calculs de documents (identiques à lib/calc.ts)
-- -----------------------------------------------------------------------------
create or replace function app.doc_totals(p_items jsonb, out subtotal numeric, out tax numeric, out total numeric)
language sql immutable set search_path = '' as $$
  with l as (
    select (i ->> 'quantity')::numeric * (i ->> 'unitPrice')::numeric * (1 - coalesce((i ->> 'discount')::numeric, 0) / 100) as sub,
           coalesce((i ->> 'taxRate')::numeric, 0) as rate
    from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) i
  )
  select round(coalesce(sum(sub), 0)),
         round(coalesce(sum(sub * rate / 100), 0)),
         round(coalesce(sum(sub), 0) + coalesce(sum(sub * rate / 100), 0))
  from l
$$;

create or replace function app.treasury_account(p_method text) returns text
language sql immutable set search_path = '' as $$
  select case p_method when 'especes' then '571' when 'mobile_money' then '585' else '521' end
$$;

create or replace function app.expense_account(p_category text) returns text
language sql immutable set search_path = '' as $$
  select case p_category
    when 'loyer' then '622' when 'transport' then '612' when 'fournitures' then '605'
    when 'marketing' then '627' when 'maintenance' then '624' when 'energie' then '6051'
    when 'telecom' then '628' when 'impots' then '641' when 'achats' then '601' else '658' end
$$;

create or replace function app.add_journal(p_date date, p_journal text, p_label text, p_reference text, p_lines jsonb)
returns void language sql volatile security definer set search_path = '' as $$
  -- Les lignes à zéro (ex. TVA d'une vente non taxée) ne sont pas reportées
  insert into public.journal_entries (number, date, journal, label, reference, lines, status)
  values ('', p_date, p_journal, p_label, p_reference,
          coalesce((select jsonb_agg(l) from jsonb_array_elements(p_lines) l
                    where coalesce((l ->> 'debit')::numeric, 0) <> 0 or coalesce((l ->> 'credit')::numeric, 0) <> 0), '[]'::jsonb),
          'valide')
$$;

create or replace function app.log(p_action text, p_module text, p_details text)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.activity_logs (user_id, action, module, details)
  select app.my_employee_id(), p_action, p_module, p_details
  where app.my_employee_id() is not null
$$;

-- -----------------------------------------------------------------------------
-- Automatismes
-- -----------------------------------------------------------------------------

-- Facture émise → écriture de vente (411 / 701 / 4431)
create or replace function app.on_invoice_journal() returns trigger
language plpgsql security definer set search_path = '' as $$
declare t record;
begin
  if (select auth.uid()) is null then return new; end if;
  if new.status in ('brouillon', 'annulee') then return new; end if;
  if tg_op = 'UPDATE' and old.status <> 'brouillon' then return new; end if;
  select * into t from app.doc_totals(new.items);
  perform app.add_journal(new.date, 'VE', 'Facture ' || new.number, new.number, jsonb_build_array(
    jsonb_build_object('account', '411', 'label', 'Client — ' || new.number, 'debit', t.total, 'credit', 0),
    jsonb_build_object('account', '701', 'label', 'Ventes de marchandises', 'debit', 0, 'credit', t.subtotal),
    jsonb_build_object('account', '4431', 'label', 'TVA collectée', 'debit', 0, 'credit', t.tax)
  ));
  return new;
end;
$$;
drop trigger if exists invoice_journal on public.invoices;
create trigger invoice_journal after insert or update of status on public.invoices
  for each row execute function app.on_invoice_journal();

-- Règlement → mise à jour de la facture + écriture de trésorerie
create or replace function app.on_payment() returns trigger
language plpgsql security definer set search_path = '' as $$
declare inv public.invoices; v_total numeric; v_paid numeric;
begin
  if (select auth.uid()) is null then return new; end if;
  select * into inv from public.invoices where id = new.invoice_id for update;
  if inv.status in ('brouillon', 'annulee') then
    raise exception '%', case inv.status
      when 'brouillon' then 'Impossible d''encaisser une facture en brouillon : émettez-la d''abord'
      else 'Impossible d''encaisser une facture annulée' end using errcode = 'P0001';
  end if;
  select total into v_total from app.doc_totals(inv.items);
  v_paid := inv.amount_paid + new.amount;
  if v_paid > v_total + 1 then
    raise exception 'Le montant encaissé dépasse le reste à payer de la facture' using errcode = 'P0001';
  end if;
  update public.invoices
    set amount_paid = v_paid, status = case when v_paid >= v_total then 'payee' else 'partielle' end
    where id = inv.id;
  perform app.add_journal(new.date, case when new.method = 'especes' then 'CA' else 'BQ' end,
    'Règlement ' || inv.number, new.reference, jsonb_build_array(
      jsonb_build_object('account', app.treasury_account(new.method), 'label', 'Encaissement client', 'debit', new.amount, 'credit', 0),
      jsonb_build_object('account', '411', 'label', 'Client — ' || inv.number, 'debit', 0, 'credit', new.amount)
    ));
  -- Espèces : l'argent entre dans la caisse de la boutique de la facture
  if new.method = 'especes' then
    insert into public.cash_movements (number, date, location_id, direction, kind, amount, label, reference, client_name, payment_id)
    values ('', new.date, inv.boutique_id, 'entree', 'encaissement', new.amount, 'Règlement facture ' || inv.number, inv.number,
            (select c.name from public.clients c where c.id = inv.client_id), new.id);
  end if;
  return new;
end;
$$;
drop trigger if exists payment_apply on public.payments;
create trigger payment_apply after insert on public.payments for each row execute function app.on_payment();

-- Mouvement de stock → niveaux de stock
create or replace function app.adjust_stock(p_product text, p_location text, p_delta integer)
returns void language sql volatile security definer set search_path = '' as $$
  insert into public.stock_levels as s (product_id, location_id, quantity)
  values (p_product, p_location, greatest(0, p_delta))
  on conflict (product_id, location_id) do update set quantity = greatest(0, s.quantity + p_delta)
$$;

create or replace function app.on_stock_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.type = 'entree' and new.to_location_id is not null then
    perform app.adjust_stock(new.product_id, new.to_location_id, new.quantity);
  elsif new.type = 'sortie' and new.from_location_id is not null then
    perform app.adjust_stock(new.product_id, new.from_location_id, -new.quantity);
  elsif new.type = 'transfert' then
    if new.from_location_id is null or new.to_location_id is null or new.from_location_id = new.to_location_id then
      raise exception 'Transfert invalide : origine et destination requises et distinctes' using errcode = 'P0001';
    end if;
    perform app.adjust_stock(new.product_id, new.from_location_id, -new.quantity);
    perform app.adjust_stock(new.product_id, new.to_location_id, new.quantity);
  elsif new.type = 'ajustement' and new.to_location_id is not null then
    perform app.adjust_stock(new.product_id, new.to_location_id, new.quantity);
  end if;
  return new;
end;
$$;
drop trigger if exists stock_movement_apply on public.stock_movements;
create trigger stock_movement_apply after insert on public.stock_movements for each row execute function app.on_stock_movement();

-- Suppression d'une boutique ou d'un entrepôt : ses niveaux de stock disparaissent avec lui
create or replace function app.on_location_deleted() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  delete from public.stock_levels where location_id = old.id;
  return old;
end;
$$;
drop trigger if exists shop_deleted on public.shops;
create trigger shop_deleted after delete on public.shops for each row execute function app.on_location_deleted();
drop trigger if exists warehouse_deleted on public.warehouses;
create trigger warehouse_deleted after delete on public.warehouses for each row execute function app.on_location_deleted();

-- Contrôle du stock disponible avant une sortie ou un transfert
create or replace function app.check_stock() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_available integer;
begin
  if (select auth.uid()) is null then return new; end if;
  new.user_id := coalesce(app.my_employee_id(), new.user_id);
  if new.type in ('sortie', 'transfert') then
    select quantity into v_available from public.stock_levels where product_id = new.product_id and location_id = new.from_location_id;
    if coalesce(v_available, 0) < new.quantity then
      raise exception 'Stock insuffisant pour « % » : % disponible(s), % demandé(s)',
        (select p.name from public.products p where p.id = new.product_id),
        coalesce(v_available, 0), new.quantity using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists stock_movement_check on public.stock_movements;
create trigger stock_movement_check before insert on public.stock_movements for each row execute function app.check_stock();

-- Dépense payée → écriture d'achat / de trésorerie
create or replace function app.on_expense_paid() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.status = 'payee' and (tg_op = 'INSERT' or old.status <> 'payee') then
    -- Payée en espèces : la somme sort de la caisse du site de la dépense
    if new.payment_method = 'especes' then
      insert into public.cash_movements (number, location_id, direction, kind, amount, label, reference, client_name, expense_id)
      values ('', new.location_id, 'sortie', 'depense', new.amount, new.description, new.number, new.supplier, new.id);
    end if;
    perform app.add_journal(current_date,
      case when new.category = 'achats' then 'AC' when new.payment_method = 'especes' then 'CA' else 'BQ' end,
      new.description || ' — ' || new.supplier, new.number, jsonb_build_array(
        jsonb_build_object('account', app.expense_account(new.category), 'label', new.description, 'debit', new.amount, 'credit', 0),
        jsonb_build_object('account', app.treasury_account(new.payment_method), 'label', 'Paiement', 'debit', 0, 'credit', new.amount)
      ));
  end if;
  return new;
end;
$$;
drop trigger if exists expense_paid on public.expenses;
create trigger expense_paid after insert or update of status on public.expenses for each row execute function app.on_expense_paid();

-- -----------------------------------------------------------------------------
-- Garde-fous (champs réservés à l'administration)
-- -----------------------------------------------------------------------------
create or replace function app.guard_owner() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or app.is_admin() then return new; end if;
  if (to_jsonb(new) ->> tg_argv[0]) is distinct from (to_jsonb(old) ->> tg_argv[0]) then
    raise exception 'Seul un administrateur peut réattribuer cet élément' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_clients on public.clients;
create trigger guard_clients before update on public.clients for each row execute function app.guard_owner('owner_id');
drop trigger if exists guard_prospects on public.prospects;
create trigger guard_prospects before update on public.prospects for each row execute function app.guard_owner('owner_id');
drop trigger if exists guard_quotes on public.quotes;
create trigger guard_quotes before update on public.quotes for each row execute function app.guard_owner('owner_id');
drop trigger if exists guard_opportunities on public.opportunities;
create trigger guard_opportunities before update on public.opportunities for each row execute function app.guard_owner('owner_id');
drop trigger if exists guard_followups on public.followups;
create trigger guard_followups before update on public.followups for each row execute function app.guard_owner('owner_id');
drop trigger if exists guard_appointments on public.appointments;
create trigger guard_appointments before update on public.appointments for each row execute function app.guard_owner('assigned_to');

-- Dépenses : seul l'administrateur décide du statut
create or replace function app.guard_expense() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or app.is_admin() then return new; end if;
  if new.status is distinct from old.status or new.approved_by is distinct from old.approved_by then
    raise exception 'Seul un administrateur peut approuver, rejeter ou payer une dépense' using errcode = '42501';
  end if;
  if old.status <> 'en_attente' then
    raise exception 'Une dépense traitée ne peut plus être modifiée' using errcode = '42501';
  end if;
  if new.submitted_by is distinct from old.submitted_by then
    raise exception 'Le demandeur ne peut pas être modifié' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_expenses on public.expenses;
create trigger guard_expenses before update on public.expenses for each row execute function app.guard_expense();

-- Congés : l'employé ne peut qu'annuler ou modifier une demande en attente
create or replace function app.guard_leave() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or app.is_admin() then return new; end if;
  if new.status is distinct from old.status then
    if new.status <> 'annule' then
      raise exception 'Seul un administrateur peut approuver ou refuser un congé' using errcode = '42501';
    end if;
    return new;
  end if;
  if old.status <> 'en_attente' then
    raise exception 'Une demande traitée ne peut plus être modifiée' using errcode = '42501';
  end if;
  if new.employee_id is distinct from old.employee_id or new.approver_id is distinct from old.approver_id then
    raise exception 'Modification non autorisée' using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists guard_leaves on public.leaves;
create trigger guard_leaves before update on public.leaves for each row execute function app.guard_leave();

-- Pointage : un employé ne pointe que pour lui-même et pour aujourd'hui
-- Heures supplémentaires d'une journée : temps effectif au-delà de 8 h (en minutes)
create or replace function app.overtime_minutes(p_in text, p_out text, p_break integer)
returns integer language sql immutable set search_path = '' as $$
  select case
    when p_in is null or p_out is null or p_out <= p_in then 0
    else greatest(0,
      (split_part(p_out, ':', 1)::int * 60 + split_part(p_out, ':', 2)::int)
      - (split_part(p_in, ':', 1)::int * 60 + split_part(p_in, ':', 2)::int)
      - coalesce(p_break, 0) - 480)
  end
$$;

create or replace function app.guard_attendance() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null or app.is_admin() then return new; end if;
  if new.employee_id <> app.my_employee_id() or new.date <> (now() at time zone 'Africa/Douala')::date then
    raise exception 'Vous ne pouvez pointer que pour vous-même, le jour même' using errcode = '42501';
  end if;
  -- Un employé ne fixe pas ses heures supplémentaires : elles découlent de ses heures d'arrivée et de départ
  new.overtime_minutes := least(720, app.overtime_minutes(new.check_in, new.check_out, new.break_minutes));
  return new;
end;
$$;
drop trigger if exists guard_attendance on public.attendance;
create trigger guard_attendance before insert or update on public.attendance for each row execute function app.guard_attendance();

-- -----------------------------------------------------------------------------
-- Annuaire des employés (colonnes non sensibles, visibles par tous les connectés)
-- -----------------------------------------------------------------------------
create or replace function public.employee_directory()
returns table (
  id text, matricule text, first_name text, last_name text, gender text, email text, phone text,
  department text, "position" text, location_id text, role text, status text, photo jsonb
)
language sql stable security definer set search_path = '' as $$
  select e.id, e.matricule, e.first_name, e.last_name, e.gender, e.email, e.phone,
         e.department, e.position, e.location_id, e.role, e.status, e.documents -> 'photo'
  from public.employees e
  where app.my_employee_id() is not null
$$;

-- -----------------------------------------------------------------------------
-- Opérations métier (appelées par l'application via supabase.rpc)
-- -----------------------------------------------------------------------------

-- Vente : enregistre la vente, sort le stock, crée la facture et l'encaissement
create or replace function public.create_sale(p_sale jsonb, p_create_invoice boolean default false)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_role text := app.my_role();
  v_me text := app.my_employee_id();
  v_sale public.sales;
  v_invoice public.invoices;
  v_item jsonb;
  v_total numeric;
  v_sub numeric;
  v_tax numeric;
begin
  if v_role is null or v_role not in ('super_admin', 'commercial', 'caissiere') then
    raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501';
  end if;
  v_sale := jsonb_populate_record(null::public.sales, p_sale);
  v_sale.id := coalesce(v_sale.id, gen_random_uuid()::text);
  v_sale.number := coalesce(v_sale.number, '');
  if v_role = 'commercial' and v_sale.seller_id <> v_me then
    raise exception 'Un commercial ne peut enregistrer que ses propres ventes' using errcode = '42501';
  end if;
  if v_role = 'caissiere' and v_sale.boutique_id <> app.my_location() then
    raise exception 'Vente hors de votre boutique' using errcode = '42501';
  end if;
  if v_sale.status = 'annulee' then
    raise exception 'Une vente ne peut pas être enregistrée directement comme annulée' using errcode = 'P0001';
  end if;
  if v_sale.payment_method = 'credit' and v_sale.client_id is null then
    raise exception 'Une vente à crédit doit être rattachée à un client' using errcode = 'P0001';
  end if;
  if jsonb_array_length(coalesce(v_sale.items, '[]'::jsonb)) = 0 then
    raise exception 'La vente ne contient aucune ligne' using errcode = 'P0001';
  end if;

  insert into public.sales select v_sale.* returning * into v_sale;

  if v_sale.status <> 'brouillon' then
    for v_item in select * from jsonb_array_elements(v_sale.items) loop
      if coalesce(v_item ->> 'productId', '') <> '' then
        insert into public.stock_movements (product_id, type, quantity, from_location_id, reason, reference, user_id)
        values (v_item ->> 'productId', 'sortie', (v_item ->> 'quantity')::integer, v_sale.boutique_id, 'Vente comptoir', v_sale.number, v_me);
      end if;
    end loop;
  end if;

  if p_create_invoice and v_sale.client_id is not null and v_sale.status <> 'brouillon' then
    insert into public.invoices (number, client_id, boutique_id, date, due_date, items, status, amount_paid, sale_id)
    values ('', v_sale.client_id, v_sale.boutique_id, v_sale.date, v_sale.date, v_sale.items, 'emise', 0, v_sale.id)
    returning * into v_invoice;
    update public.sales set invoice_id = v_invoice.id where id = v_sale.id returning * into v_sale;
    if v_sale.payment_method <> 'credit' then
      select total into v_total from app.doc_totals(v_sale.items);
      insert into public.payments (invoice_id, date, amount, method, reference)
      values (v_invoice.id, v_sale.date, v_total, v_sale.payment_method, v_sale.number);
    end if;
  elsif v_sale.status <> 'brouillon' and v_sale.payment_method <> 'credit' then
    -- Vente payée sans facture (client comptoir) : écriture de vente et, en espèces, entrée en caisse
    select subtotal, tax, total into v_sub, v_tax, v_total from app.doc_totals(v_sale.items);
    perform app.add_journal(v_sale.date, case when v_sale.payment_method = 'especes' then 'CA' else 'BQ' end,
      'Vente ' || v_sale.number, v_sale.number, jsonb_build_array(
        jsonb_build_object('account', app.treasury_account(v_sale.payment_method), 'label', 'Vente comptoir', 'debit', v_total, 'credit', 0),
        jsonb_build_object('account', '701', 'label', 'Ventes de marchandises', 'debit', 0, 'credit', v_sub),
        jsonb_build_object('account', '4431', 'label', 'TVA collectée', 'debit', 0, 'credit', v_tax)
      ));
    if v_sale.payment_method = 'especes' then
      insert into public.cash_movements (number, date, location_id, direction, kind, amount, label, reference, client_name, sale_id)
      values ('', v_sale.date, v_sale.boutique_id, 'entree', 'vente', v_total, 'Vente ' || v_sale.number, v_sale.number,
              coalesce((select c.name from public.clients c where c.id = v_sale.client_id), 'Client comptoir'), v_sale.id);
    end if;
  end if;

  perform app.log('Création', 'Ventes', 'Vente ' || v_sale.number);
  return to_jsonb(v_sale);
end;
$$;

-- Annulation : réintègre le stock et annule la facture liée
create or replace function public.cancel_sale(p_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_role text := app.my_role();
  v_sale public.sales;
  v_item jsonb;
  v_sub numeric;
  v_tax numeric;
  v_total numeric;
  v_refund numeric;
begin
  select * into v_sale from public.sales where id = p_id for update;
  if not found then raise exception 'Vente introuvable' using errcode = 'P0002'; end if;
  if not (v_role = 'super_admin'
          or (v_role = 'caissiere' and v_sale.boutique_id = app.my_location())
          or (v_role = 'commercial' and v_sale.seller_id = app.my_employee_id())) then
    raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501';
  end if;
  if v_sale.status = 'annulee' then return; end if;
  if v_sale.status <> 'brouillon' then
    for v_item in select * from jsonb_array_elements(v_sale.items) loop
      if coalesce(v_item ->> 'productId', '') <> '' then
        insert into public.stock_movements (product_id, type, quantity, to_location_id, reason, reference, user_id)
        values (v_item ->> 'productId', 'entree', (v_item ->> 'quantity')::integer, v_sale.boutique_id, 'Annulation de vente', v_sale.number, app.my_employee_id());
      end if;
    end loop;
  end if;
  if v_sale.status <> 'brouillon' and v_sale.payment_method <> 'credit' then
    select subtotal, tax, total into v_sub, v_tax, v_total from app.doc_totals(v_sale.items);
    if v_sale.invoice_id is null then
      -- Contre-passation de l'écriture de vente comptoir
      perform app.add_journal((now() at time zone 'Africa/Douala')::date, case when v_sale.payment_method = 'especes' then 'CA' else 'BQ' end,
        'Annulation vente ' || v_sale.number, v_sale.number, jsonb_build_array(
          jsonb_build_object('account', '701', 'label', 'Ventes de marchandises', 'debit', v_sub, 'credit', 0),
          jsonb_build_object('account', '4431', 'label', 'TVA collectée', 'debit', v_tax, 'credit', 0),
          jsonb_build_object('account', app.treasury_account(v_sale.payment_method), 'label', 'Remboursement client', 'debit', 0, 'credit', v_total)
        ));
    end if;
    -- Espèces rendues au client : sortie de caisse
    if v_sale.payment_method = 'especes' then
      v_refund := case when v_sale.invoice_id is null then v_total
                       else coalesce((select sum(p.amount) from public.payments p where p.invoice_id = v_sale.invoice_id and p.method = 'especes'), 0) end;
      if v_refund > 0 then
        insert into public.cash_movements (number, location_id, direction, kind, amount, label, reference, sale_id)
        values ('', v_sale.boutique_id, 'sortie', 'annulation', v_refund, 'Remboursement — annulation vente ' || v_sale.number, v_sale.number, v_sale.id);
      end if;
    end if;
  end if;
  update public.sales set status = 'annulee' where id = p_id;
  if v_sale.invoice_id is not null then
    update public.invoices set status = 'annulee' where id = v_sale.invoice_id;
  end if;
  perform app.log('Annulation', 'Ventes', 'Vente ' || v_sale.number);
end;
$$;

-- Proforma acceptée → facture
create or replace function public.convert_quote_to_invoice(p_quote_id text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_quote public.quotes;
  v_client public.clients;
  v_invoice public.invoices;
  v_shop text;
begin
  select * into v_quote from public.quotes where id = p_quote_id for update;
  if not found then raise exception 'Proforma introuvable' using errcode = 'P0002'; end if;
  if not (app.is_admin() or (app.my_role() = 'commercial' and v_quote.owner_id = app.my_employee_id())) then
    raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501';
  end if;
  if v_quote.invoice_id is not null then
    raise exception 'Cette proforma a déjà été facturée' using errcode = 'P0001';
  end if;
  select * into v_client from public.clients where id = v_quote.client_id;
  select s.id into v_shop from public.shops s where s.id = app.my_location();
  if v_shop is null then select s.id into v_shop from public.shops s order by s.code limit 1; end if;
  insert into public.invoices (number, client_id, boutique_id, date, due_date, items, status, amount_paid, quote_id)
  values ('', v_quote.client_id, v_shop, current_date,
          current_date + case when v_client.type = 'entreprise' then 30 else 7 end,
          v_quote.items, 'emise', 0, v_quote.id)
  returning * into v_invoice;
  update public.quotes set status = 'accepte', invoice_id = v_invoice.id where id = v_quote.id;
  perform app.log('Facturation', 'Devis', 'Proforma ' || v_quote.number || ' → ' || v_invoice.number);
  return to_jsonb(v_invoice);
end;
$$;

-- Prospect → client
create or replace function public.convert_prospect(p_id text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_p public.prospects;
  v_client public.clients;
begin
  select * into v_p from public.prospects where id = p_id for update;
  if not found then raise exception 'Prospect introuvable' using errcode = 'P0002'; end if;
  if not (app.is_admin() or v_p.owner_id = app.my_employee_id()) then
    raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501';
  end if;
  if v_p.status = 'converti' then return null; end if;
  insert into public.clients (code, type, name, contact_name, email, phone, city, address, segment, status, owner_id, credit_limit, notes)
  values ('', v_p.type, v_p.name, v_p.contact_name, v_p.email, v_p.phone, v_p.city, v_p.city, v_p.segment, 'actif', v_p.owner_id, 0,
          'Converti depuis le prospect ' || v_p.code || ' — besoin : ' || v_p.need)
  returning * into v_client;
  update public.prospects set status = 'converti', client_id = v_client.id, last_contact = current_date, next_action = null where id = p_id;
  update public.followups set target_type = 'client', target_id = v_client.id
    where target_type = 'prospect' and target_id = p_id and status = 'a_faire';
  perform app.log('Conversion', 'Prospects', v_p.name || ' → client ' || v_client.code);
  return v_client.code;
end;
$$;

-- Compte rendu de relance (+ relance suivante éventuelle)
create or replace function public.complete_followup(p_id text, p_outcome text, p_next_date date default null, p_next_channel text default null)
returns void language plpgsql security definer set search_path = '' as $$
declare v_f public.followups;
begin
  select * into v_f from public.followups where id = p_id for update;
  if not found then raise exception 'Relance introuvable' using errcode = 'P0002'; end if;
  if not (app.is_admin() or v_f.owner_id = app.my_employee_id()) then
    raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501';
  end if;
  if length(trim(coalesce(p_outcome, ''))) < 3 then
    raise exception 'Compte rendu requis' using errcode = 'P0001';
  end if;
  update public.followups set status = 'fait', outcome = p_outcome, done_at = current_date where id = p_id;
  if v_f.target_type = 'prospect' then
    update public.prospects set last_contact = current_date,
      status = case when status = 'nouveau' then 'contacte' else status end
      where id = v_f.target_id;
  end if;
  if p_next_date is not null then
    insert into public.followups (target_type, target_id, subject, channel, priority, due_date, status, owner_id, notes)
    values (v_f.target_type, v_f.target_id, v_f.subject, coalesce(p_next_channel, v_f.channel), v_f.priority, p_next_date, 'a_faire', v_f.owner_id, 'Suite : ' || p_outcome);
  end if;
  perform app.log('Relance', 'Relances', v_f.subject || ' — ' || p_outcome);
end;
$$;

-- Génère les relances manquantes du périmètre de l'appelant
create or replace function public.generate_followups()
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_role text := app.my_role();
  v_me text := app.my_employee_id();
  v_loc text := app.my_location();
  v_count integer := 0;
  v_n integer;
begin
  if v_role is null or v_role not in ('super_admin', 'commercial', 'caissiere') then
    raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501';
  end if;

  insert into public.followups (target_type, target_id, subject, channel, priority, due_date, status, owner_id)
  select 'facture', i.id, 'Relance paiement ' || i.number, 'appel',
         case when i.due_date < current_date - 30 then 'haute' else 'normale' end,
         current_date, 'a_faire', coalesce(c.owner_id, v_me)
  from public.invoices i
  join public.clients c on c.id = i.client_id
  where i.status in ('emise', 'partielle') and i.due_date < current_date
    and (v_role = 'super_admin' or (v_role = 'caissiere' and i.boutique_id = v_loc) or (v_role = 'commercial' and c.owner_id = v_me))
    and not exists (select 1 from public.followups f where f.target_type = 'facture' and f.target_id = i.id and f.status in ('a_faire', 'reporte'));
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  insert into public.followups (target_type, target_id, subject, channel, priority, due_date, status, owner_id)
  select 'devis', q.id, 'Relance devis ' || q.number, 'appel', 'normale', current_date, 'a_faire', q.owner_id
  from public.quotes q
  where q.status = 'envoye' and q.date <= current_date - 7
    and (v_role = 'super_admin' or q.owner_id = v_me)
    and not exists (select 1 from public.followups f where f.target_type = 'devis' and f.target_id = q.id and f.status in ('a_faire', 'reporte'));
  get diagnostics v_n = row_count;
  v_count := v_count + v_n;

  perform app.log('Génération', 'Relances', v_count || ' relance(s) créée(s)');
  return v_count;
end;
$$;

-- Bulletins de paie du mois (administration)
-- Montant des heures supplémentaires du mois (Code du travail camerounais, décret n° 95/677) :
-- taux horaire = salaire de base / 173,33 h ; majoration de 20 % jusqu'à 8 h par semaine,
-- 30 % de 8 à 16 h, 40 % au-delà (barème hebdomadaire ramené au mois : 32 h puis 64 h).
create or replace function app.overtime_pay(p_base numeric, p_minutes integer)
returns numeric language sql immutable set search_path = '' as $$
  select round((p_base / 173.33) * (
           least(h, 32) * 1.2
         + least(greatest(h - 32, 0), 32) * 1.3
         + greatest(h - 64, 0) * 1.4) / 100) * 100
  from (select coalesce(p_minutes, 0) / 60.0 as h) x
$$;

create or replace function public.generate_payslips(p_period text)
returns integer language plpgsql security definer set search_path = '' as $$
declare v_n integer;
begin
  if not app.is_admin() then raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501'; end if;
  if p_period !~ '^\d{4}-\d{2}$' then raise exception 'Période de paie invalide' using errcode = 'P0001'; end if;
  with ot as (
    select a.employee_id, sum(a.overtime_minutes)::int as minutes
    from public.attendance a
    where to_char(a.date, 'YYYY-MM') = p_period and a.status in ('present', 'retard', 'mission')
    group by a.employee_id
  ), ins as (
    insert into public.payslips (employee_id, period, base_salary, overtime, bonuses, transport_allowance, housing_allowance, other_deductions, status)
    select e.id, p_period, e.base_salary, app.overtime_pay(e.base_salary, coalesce(ot.minutes, 0)), 0,
           case when e.base_salary < 300000 then 25000 else 40000 end,
           case when e.base_salary >= 400000 then round(e.base_salary * 0.15 / 1000) * 1000 else 0 end,
           0, 'brouillon'
    from public.employees e
    left join ot on ot.employee_id = e.id
    where e.status <> 'sorti' and e.hire_date <= (p_period || '-28')::date
    -- Bulletins encore en brouillon : heures supplémentaires recalculées
    on conflict (employee_id, period) do update set overtime = excluded.overtime
      where public.payslips.status = 'brouillon'
    returning (xmax = 0) as inserted
  )
  select count(*) filter (where inserted) into v_n from ins;
  perform app.log('Génération', 'Paie', v_n || ' bulletin(s) pour ' || p_period);
  return v_n;
end;
$$;

-- Notifications lues par l'utilisateur courant
create or replace function public.mark_notifications_read(p_ids text[] default null)
returns void language sql volatile security definer set search_path = '' as $$
  update public.notifications n
    set read_by = array_append(n.read_by, app.my_employee_id())
  where app.my_employee_id() is not null
    and not (app.my_employee_id() = any (n.read_by))
    and (p_ids is null or n.id = any (p_ids))
$$;

-- -----------------------------------------------------------------------------
-- Caisse
-- -----------------------------------------------------------------------------

-- Solde d'une caisse : entrées − sorties
create or replace function app.cash_balance(p_location text) returns numeric
language sql stable security definer set search_path = '' as $$
  select coalesce(sum(case when direction = 'entree' then amount else -amount end), 0)
  from public.cash_movements where location_id = p_location
$$;

-- Montant lisible : 1 250 000
create or replace function app.fmt_amount(p numeric) returns text
language sql immutable set search_path = '' as $$
  select replace(to_char(round(p), 'FM999,999,999,990'), ',', ' ')
$$;

-- Avant insertion : sens déduit du type, auteur, contrôles de saisie et de solde
create or replace function app.before_cash_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_balance numeric;
begin
  new.direction := case when new.kind in ('vente', 'encaissement', 'apport', 'autre_entree') then 'entree' else 'sortie' end;
  if (select auth.uid()) is null then return new; end if;
  new.user_id := coalesce(app.my_employee_id(), new.user_id);
  if new.kind = 'versement_banque' then
    if coalesce(trim(new.bank_name), '') = '' or new.deposit_mode is null then
      raise exception 'Indiquez la banque et le mode de versement' using errcode = 'P0001';
    end if;
  end if;
  if coalesce(trim(new.label), '') = '' then
    raise exception 'Le libellé de l''opération est obligatoire' using errcode = 'P0001';
  end if;
  -- Une sortie saisie en caisse ne peut pas dépasser l'argent disponible
  if new.kind in ('versement_banque', 'autre_sortie') then
    v_balance := app.cash_balance(new.location_id);
    if v_balance < new.amount then
      raise exception 'Solde de caisse insuffisant : % FCFA disponibles', app.fmt_amount(v_balance) using errcode = 'P0001';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists cash_movement_check on public.cash_movements;
create trigger cash_movement_check before insert on public.cash_movements for each row execute function app.before_cash_movement();

-- Après insertion : écritures des opérations saisies directement en caisse
-- (ventes, règlements et dépenses ont déjà leurs propres écritures)
create or replace function app.after_cash_movement() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then return new; end if;
  if new.kind = 'versement_banque' then
    perform app.add_journal(new.date, 'CA', 'Versement banque ' || new.bank_name, coalesce(nullif(new.slip_number, ''), new.number), jsonb_build_array(
      jsonb_build_object('account', '521', 'label', 'Versement ' || new.bank_name, 'debit', new.amount, 'credit', 0),
      jsonb_build_object('account', '571', 'label', 'Caisse', 'debit', 0, 'credit', new.amount)));
  elsif new.kind = 'apport' then
    perform app.add_journal(new.date, 'CA', new.label, new.number, jsonb_build_array(
      jsonb_build_object('account', '571', 'label', 'Caisse', 'debit', new.amount, 'credit', 0),
      jsonb_build_object('account', '521', 'label', 'Approvisionnement de caisse', 'debit', 0, 'credit', new.amount)));
  elsif new.kind = 'autre_entree' then
    perform app.add_journal(new.date, 'CA', new.label, new.number, jsonb_build_array(
      jsonb_build_object('account', '571', 'label', 'Caisse', 'debit', new.amount, 'credit', 0),
      jsonb_build_object('account', '758', 'label', 'Produits divers', 'debit', 0, 'credit', new.amount)));
  elsif new.kind = 'autre_sortie' then
    perform app.add_journal(new.date, 'CA', new.label, new.number, jsonb_build_array(
      jsonb_build_object('account', '658', 'label', 'Charges diverses', 'debit', new.amount, 'credit', 0),
      jsonb_build_object('account', '571', 'label', 'Caisse', 'debit', 0, 'credit', new.amount)));
  end if;
  perform app.log('Caisse', 'Caisse', new.label || ' — ' || app.fmt_amount(new.amount) || ' FCFA');
  return new;
end;
$$;
drop trigger if exists cash_movement_journal on public.cash_movements;
create trigger cash_movement_journal after insert on public.cash_movements for each row execute function app.after_cash_movement();

-- Dépense payée directement en caisse (enregistrée « Payée », sort de la caisse)
create or replace function public.cash_expense(p jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_role text := app.my_role();
  v_location text := p ->> 'locationId';
  v_amount numeric := (p ->> 'amount')::numeric;
  v_balance numeric;
  v_number text;
begin
  if not (v_role = 'super_admin' or (v_role = 'caissiere' and v_location = app.my_location())) then
    raise exception 'Accès refusé : cette action n''est pas autorisée pour votre profil' using errcode = '42501';
  end if;
  if v_amount is null or v_amount <= 0 then
    raise exception 'Le montant doit être supérieur à 0' using errcode = 'P0001';
  end if;
  if coalesce(trim(p ->> 'description'), '') = '' or coalesce(trim(p ->> 'supplier'), '') = '' then
    raise exception 'Indiquez le motif de la dépense et le bénéficiaire' using errcode = 'P0001';
  end if;
  v_balance := app.cash_balance(v_location);
  if v_balance < v_amount then
    raise exception 'Solde de caisse insuffisant : % FCFA disponibles', app.fmt_amount(v_balance) using errcode = 'P0001';
  end if;
  insert into public.expenses (number, date, category, description, supplier, amount, payment_method, location_id, status, submitted_by, approved_by, has_receipt)
  values ('', coalesce((p ->> 'date')::date, (now() at time zone 'Africa/Douala')::date), coalesce(p ->> 'category', 'autres'),
          trim(p ->> 'description'), trim(p ->> 'supplier'), v_amount, 'especes', v_location, 'payee',
          app.my_employee_id(), app.my_employee_id(), coalesce((p ->> 'hasReceipt')::boolean, false))
  returning number into v_number;
  return v_number;
end;
$$;

-- -----------------------------------------------------------------------------
-- Compteurs de la barre latérale (une requête légère au lieu de 7 tables).
-- SECURITY INVOKER : les politiques RLS de l'appelant s'appliquent.
-- -----------------------------------------------------------------------------
create or replace function public.nav_counters()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with today as (select (now() at time zone 'Africa/Douala')::date as d)
  select jsonb_build_object(
    'leaves', (select count(*) from public.leaves where status = 'en_attente'),
    'invoices', (select count(*) from public.invoices, today
                 where status in ('emise', 'partielle') and due_date < today.d),
    'stock', (select count(*) from public.stock_levels l join public.products p on p.id = l.product_id
              where l.quantity <= p.min_stock),
    'expenses', (select count(*) from public.expenses where status = 'en_attente'),
    'followups', (select count(*) from public.followups, today
                  where status in ('a_faire', 'reporte') and due_date <= today.d)
  )
$$;

-- -----------------------------------------------------------------------------
-- Mise en service : rattache un utilisateur Auth existant comme super administrateur
-- Usage (éditeur SQL) : select app.bootstrap_admin('prenom.nom@pardier.com', 'Prénom', 'Nom');
-- -----------------------------------------------------------------------------
create or replace function app.bootstrap_admin(p_email text, p_first_name text, p_last_name text)
returns text language plpgsql security definer set search_path = '' as $$
declare v_uid uuid; v_id text;
begin
  select id into v_uid from auth.users where lower(email) = lower(p_email);
  if v_uid is null then
    raise exception 'Créez d''abord l''utilisateur % dans Authentication > Users', p_email;
  end if;
  insert into public.employees (user_id, matricule, first_name, last_name, gender, email, phone, hire_date, department, position,
                                contract_type, base_salary, location_id, status, role)
  values (v_uid, '', p_first_name, p_last_name, 'H', lower(p_email), '', current_date, 'direction', 'Directeur général',
          'cdi', 0, 'siege', 'actif', 'super_admin')
  on conflict (email) do update set user_id = excluded.user_id, role = 'super_admin', status = 'actif'
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Droits d'exécution
-- -----------------------------------------------------------------------------
revoke all on all functions in schema app from public, anon, authenticated;
grant usage on schema app to authenticated;
grant execute on function app.my_employee_id(), app.my_role(), app.my_location(), app.is_admin() to authenticated;

revoke all on function public.employee_directory(), public.create_sale(jsonb, boolean), public.cancel_sale(text),
  public.convert_quote_to_invoice(text), public.convert_prospect(text), public.complete_followup(text, text, date, text),
  public.generate_followups(), public.generate_payslips(text), public.mark_notifications_read(text[]), public.nav_counters(), public.cash_expense(jsonb) from public, anon;
grant execute on function public.employee_directory(), public.create_sale(jsonb, boolean), public.cancel_sale(text),
  public.convert_quote_to_invoice(text), public.convert_prospect(text), public.complete_followup(text, text, date, text),
  public.generate_followups(), public.generate_payslips(text), public.mark_notifications_read(text[]), public.nav_counters(), public.cash_expense(jsonb) to authenticated;
