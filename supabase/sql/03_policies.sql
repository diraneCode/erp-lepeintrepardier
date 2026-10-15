-- =============================================================================
-- Le Peintre Pardier ERP — 03 · Sécurité au niveau des lignes (RLS)
-- À exécuter après 02_functions.sql.
--
-- Chaque table est fermée par défaut puis ouverte selon le rôle (= poste) et
-- le périmètre de l'utilisateur : ses propres données, son site d'affectation,
-- ou toute l'entreprise pour le super administrateur. Un employé suspendu ou
-- sorti n'a plus aucun accès (app.my_role() renvoie NULL).
-- Les appels sont enveloppés dans (select …) pour n'être évalués qu'une fois
-- par requête (performances).
-- =============================================================================

-- Accès de base : uniquement les utilisateurs authentifiés, jamais anon
revoke all on all tables in schema public from anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
revoke all on all tables in schema app from anon, authenticated;

do $$
declare t text;
begin
  foreach t in array array[
    'warehouses', 'shops', 'shop_targets', 'employees', 'categories', 'products', 'clients', 'prospects',
    'opportunities', 'quotes', 'sales', 'invoices', 'payments', 'followups', 'stock_levels', 'stock_movements',
    'campaigns', 'promotions', 'appointments', 'events', 'attendance', 'leaves', 'payslips', 'expenses',
    'journal_entries', 'notifications', 'activity_logs', 'cash_movements'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Supprime les anciennes politiques (script ré-exécutable)
do $$
declare p record;
begin
  for p in select schemaname, tablename, policyname from pg_policies where schemaname = 'public' loop
    execute format('drop policy if exists %I on %I.%I', p.policyname, p.schemaname, p.tablename);
  end loop;
end $$;

-- -----------------------------------------------------------------------------
-- Référentiels lisibles par tout employé actif
-- -----------------------------------------------------------------------------
create policy warehouses_select on public.warehouses for select to authenticated
  using ((select app.my_employee_id()) is not null);
create policy warehouses_write on public.warehouses for all to authenticated
  using ((select app.my_role()) in ('super_admin', 'gestionnaire_stock'))
  with check ((select app.my_role()) in ('super_admin', 'gestionnaire_stock'));

create policy shops_select on public.shops for select to authenticated
  using ((select app.my_employee_id()) is not null);
create policy shops_write on public.shops for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy categories_select on public.categories for select to authenticated
  using ((select app.my_employee_id()) is not null);
create policy categories_write on public.categories for all to authenticated
  using ((select app.my_role()) in ('super_admin', 'gestionnaire_stock'))
  with check ((select app.my_role()) in ('super_admin', 'gestionnaire_stock'));

create policy products_select on public.products for select to authenticated
  using ((select app.my_employee_id()) is not null);
create policy products_write on public.products for all to authenticated
  using ((select app.my_role()) in ('super_admin', 'gestionnaire_stock'))
  with check ((select app.my_role()) in ('super_admin', 'gestionnaire_stock'));

create policy notifications_select on public.notifications for select to authenticated
  using ((select app.my_employee_id()) is not null);
create policy notifications_admin on public.notifications for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Objectifs des boutiques
-- -----------------------------------------------------------------------------
create policy shop_targets_select on public.shop_targets for select to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and shop_id = (select app.my_location())));
create policy shop_targets_write on public.shop_targets for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Employés : dossier complet réservé à l'administration (et à soi-même en lecture).
-- Les autres employés n'ont accès qu'à l'annuaire (fonction employee_directory).
-- -----------------------------------------------------------------------------
create policy employees_select on public.employees for select to authenticated
  using ((select app.is_admin()) or user_id = (select auth.uid()));
create policy employees_write on public.employees for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Clients : tous les clients pour ceux qui facturent ou établissent des proformas
-- (administration, caissière, commercial, gestionnaire de stock) ; pour les autres, leurs clients et ceux à qui ils ont vendu.
-- La modification reste réservée au responsable du client et à l'administration.
-- -----------------------------------------------------------------------------
create policy clients_select on public.clients for select to authenticated
  using (
    (select app.my_role()) in ('super_admin', 'caissiere', 'commercial', 'gestionnaire_stock')
    or owner_id = (select app.my_employee_id())
    or exists (
      select 1 from public.sales s
      where s.client_id = clients.id
        and (s.seller_id = (select app.my_employee_id())
             or ((select app.my_role()) = 'caissiere' and s.boutique_id = (select app.my_location())))
    )
  );
create policy clients_insert on public.clients for insert to authenticated
  with check ((select app.my_employee_id()) is not null and ((select app.is_admin()) or owner_id = (select app.my_employee_id())));
create policy clients_update on public.clients for update to authenticated
  using ((select app.is_admin()) or owner_id = (select app.my_employee_id()));
create policy clients_delete on public.clients for delete to authenticated using ((select app.is_admin()));

-- Prospects : tout employé peut en créer ; chacun voit les siens
create policy prospects_select on public.prospects for select to authenticated
  using ((select app.is_admin()) or owner_id = (select app.my_employee_id()));
create policy prospects_insert on public.prospects for insert to authenticated
  with check ((select app.my_employee_id()) is not null and ((select app.is_admin()) or owner_id = (select app.my_employee_id())));
create policy prospects_update on public.prospects for update to authenticated
  using ((select app.is_admin()) or owner_id = (select app.my_employee_id()));
create policy prospects_delete on public.prospects for delete to authenticated using ((select app.is_admin()));

-- Relances
create policy followups_select on public.followups for select to authenticated
  using ((select app.is_admin()) or owner_id = (select app.my_employee_id()));
create policy followups_insert on public.followups for insert to authenticated
  with check ((select app.my_role()) in ('super_admin', 'commercial', 'caissiere')
              and ((select app.is_admin()) or owner_id = (select app.my_employee_id())));
create policy followups_update on public.followups for update to authenticated
  using ((select app.is_admin()) or owner_id = (select app.my_employee_id()));
create policy followups_delete on public.followups for delete to authenticated using ((select app.is_admin()));

-- Opportunités & proformas : commerciaux (les leurs) et administration
create policy opportunities_select on public.opportunities for select to authenticated
  using ((select app.is_admin()) or owner_id = (select app.my_employee_id()));
create policy opportunities_insert on public.opportunities for insert to authenticated
  with check ((select app.is_admin()) or ((select app.my_role()) = 'commercial' and owner_id = (select app.my_employee_id())));
create policy opportunities_update on public.opportunities for update to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) = 'commercial' and owner_id = (select app.my_employee_id())));
create policy opportunities_delete on public.opportunities for delete to authenticated using ((select app.is_admin()));

create policy quotes_select on public.quotes for select to authenticated
  using ((select app.is_admin()) or owner_id = (select app.my_employee_id()));
-- Proformas : commerciaux et gestionnaire de stock (les leurs), administration
create policy quotes_insert on public.quotes for insert to authenticated
  with check ((select app.is_admin()) or ((select app.my_role()) in ('commercial', 'gestionnaire_stock') and owner_id = (select app.my_employee_id())));
create policy quotes_update on public.quotes for update to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) in ('commercial', 'gestionnaire_stock') and owner_id = (select app.my_employee_id())));
create policy quotes_delete on public.quotes for delete to authenticated using ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Ventes (création via public.create_sale) & facturation
-- -----------------------------------------------------------------------------
create policy sales_select on public.sales for select to authenticated
  using (
    (select app.is_admin())
    or seller_id = (select app.my_employee_id())
    or ((select app.my_role()) = 'caissiere' and boutique_id = (select app.my_location()))
  );
create policy sales_update on public.sales for update to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and boutique_id = (select app.my_location())))
  with check ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and boutique_id = (select app.my_location())));
create policy sales_admin on public.sales for insert to authenticated with check ((select app.is_admin()));
create policy sales_delete on public.sales for delete to authenticated using ((select app.is_admin()));

create policy invoices_select on public.invoices for select to authenticated
  using (
    (select app.is_admin())
    or ((select app.my_role()) = 'caissiere' and boutique_id = (select app.my_location()))
    or ((select app.my_role()) = 'commercial' and (
          exists (select 1 from public.clients c where c.id = invoices.client_id and c.owner_id = (select app.my_employee_id()))
       or exists (select 1 from public.sales s where s.id = invoices.sale_id and s.seller_id = (select app.my_employee_id()))
       or exists (select 1 from public.quotes q where q.id = invoices.quote_id and q.owner_id = (select app.my_employee_id()))))
  );
create policy invoices_insert on public.invoices for insert to authenticated
  with check ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and boutique_id = (select app.my_location())));
create policy invoices_update on public.invoices for update to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and boutique_id = (select app.my_location())))
  with check ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and boutique_id = (select app.my_location())));
create policy invoices_delete on public.invoices for delete to authenticated using ((select app.is_admin()));

-- Règlements : visibles si la facture l'est (la RLS des factures s'applique)
create policy payments_select on public.payments for select to authenticated
  using (exists (select 1 from public.invoices i where i.id = payments.invoice_id));
create policy payments_insert on public.payments for insert to authenticated
  with check (
    (select app.is_admin())
    or ((select app.my_role()) = 'caissiere'
        and exists (select 1 from public.invoices i where i.id = payments.invoice_id and i.boutique_id = (select app.my_location())))
  );
create policy payments_delete on public.payments for delete to authenticated using ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Stock (les niveaux ne se modifient que par des mouvements)
-- -----------------------------------------------------------------------------
create policy stock_levels_select on public.stock_levels for select to authenticated
  using (
    (select app.my_role()) in ('super_admin', 'gestionnaire_stock', 'commercial')
    or ((select app.my_employee_id()) is not null and location_id = (select app.my_location()))
  );
create policy stock_levels_admin on public.stock_levels for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

create policy stock_movements_select on public.stock_movements for select to authenticated
  using (
    (select app.my_role()) in ('super_admin', 'gestionnaire_stock', 'commercial')
    or ((select app.my_employee_id()) is not null
        and (from_location_id = (select app.my_location()) or to_location_id = (select app.my_location())))
  );
create policy stock_movements_insert on public.stock_movements for insert to authenticated
  with check (
    (select app.my_role()) in ('super_admin', 'gestionnaire_stock')
    or ((select app.my_role()) = 'magasinier' and (
          from_location_id = (select app.my_location())
       or (type in ('entree', 'ajustement') and to_location_id = (select app.my_location()))))
  );
create policy stock_movements_delete on public.stock_movements for delete to authenticated using ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Marketing
-- -----------------------------------------------------------------------------
create policy campaigns_all on public.campaigns for all to authenticated
  using ((select app.my_role()) in ('super_admin', 'commercial'))
  with check ((select app.my_role()) in ('super_admin', 'commercial'));
create policy promotions_all on public.promotions for all to authenticated
  using ((select app.my_role()) in ('super_admin', 'commercial'))
  with check ((select app.my_role()) in ('super_admin', 'commercial'));
create policy events_all on public.events for all to authenticated
  using ((select app.my_role()) in ('super_admin', 'commercial'))
  with check ((select app.my_role()) in ('super_admin', 'commercial'));

create policy appointments_select on public.appointments for select to authenticated
  using ((select app.is_admin()) or assigned_to = (select app.my_employee_id()));
create policy appointments_insert on public.appointments for insert to authenticated
  with check ((select app.is_admin()) or ((select app.my_role()) = 'commercial' and assigned_to = (select app.my_employee_id())));
create policy appointments_update on public.appointments for update to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) = 'commercial' and assigned_to = (select app.my_employee_id())));
create policy appointments_delete on public.appointments for delete to authenticated using ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Ressources humaines
-- -----------------------------------------------------------------------------
create policy attendance_select on public.attendance for select to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create policy attendance_insert on public.attendance for insert to authenticated
  with check ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create policy attendance_update on public.attendance for update to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create policy attendance_delete on public.attendance for delete to authenticated using ((select app.is_admin()));

create policy leaves_select on public.leaves for select to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create policy leaves_insert on public.leaves for insert to authenticated
  with check ((select app.is_admin()) or (employee_id = (select app.my_employee_id()) and status = 'en_attente'));
create policy leaves_update on public.leaves for update to authenticated
  using ((select app.is_admin()) or employee_id = (select app.my_employee_id()));
create policy leaves_delete on public.leaves for delete to authenticated using ((select app.is_admin()));

create policy payslips_select on public.payslips for select to authenticated
  using ((select app.is_admin()) or (employee_id = (select app.my_employee_id()) and status <> 'brouillon'));
create policy payslips_write on public.payslips for all to authenticated
  using ((select app.is_admin())) with check ((select app.is_admin()));

-- -----------------------------------------------------------------------------
-- Finance
-- -----------------------------------------------------------------------------
create policy expenses_select on public.expenses for select to authenticated
  using (
    (select app.is_admin())
    or submitted_by = (select app.my_employee_id())
    or ((select app.my_role()) = 'caissiere' and location_id = (select app.my_location()))
  );
create policy expenses_insert on public.expenses for insert to authenticated
  with check (
    (select app.is_admin())
    or ((select app.my_employee_id()) is not null and submitted_by = (select app.my_employee_id()) and status = 'en_attente')
  );
create policy expenses_update on public.expenses for update to authenticated
  using ((select app.is_admin()) or submitted_by = (select app.my_employee_id()));
create policy expenses_delete on public.expenses for delete to authenticated
  using ((select app.is_admin()) or (submitted_by = (select app.my_employee_id()) and status = 'en_attente'));

create policy journal_select on public.journal_entries for select to authenticated
  using ((select app.my_role()) in ('super_admin', 'caissiere'));
create policy journal_insert on public.journal_entries for insert to authenticated
  with check ((select app.my_role()) in ('super_admin', 'caissiere'));
create policy journal_update on public.journal_entries for update to authenticated
  using ((select app.my_role()) in ('super_admin', 'caissiere'));
create policy journal_delete on public.journal_entries for delete to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and status = 'brouillon'));

-- -----------------------------------------------------------------------------
-- Journal d'activité
-- -----------------------------------------------------------------------------
create policy activity_select on public.activity_logs for select to authenticated
  using ((select app.is_admin()) or user_id = (select app.my_employee_id()));
create policy activity_insert on public.activity_logs for insert to authenticated
  with check (user_id = (select app.my_employee_id()));

-- -----------------------------------------------------------------------------
-- Caisse : la caissière voit et alimente la caisse de sa boutique ;
-- l'administration voit toutes les caisses. Aucune modification ni suppression :
-- le brouillard de caisse reste intact (une erreur se corrige par une opération inverse).
-- -----------------------------------------------------------------------------
create policy cash_select on public.cash_movements for select to authenticated
  using ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and location_id = (select app.my_location())));
create policy cash_insert on public.cash_movements for insert to authenticated
  with check (
    kind in ('apport', 'autre_entree', 'versement_banque', 'autre_sortie')
    and ((select app.is_admin()) or ((select app.my_role()) = 'caissiere' and location_id = (select app.my_location())))
  );
