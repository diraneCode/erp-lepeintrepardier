-- =============================================================================
-- Le Peintre Pardier ERP — 05 · Index de performance
-- À exécuter après 04_storage.sql (réexécutable).
--
-- Chaque index correspond à une requête réellement effectuée :
--  · tri des listes chargées par l'application (plus récents d'abord, puis id
--    pour une pagination stable par tranches de 1 000 lignes) ;
--  · filtres des politiques RLS et des fonctions métier ;
--  · clés étrangères (suppressions et jointures sans parcours complet) ;
--  · recherche d'un article par code-barres en caisse.
-- =============================================================================

-- Tri des listes (ORDER BY <date> DESC, id)
create index if not exists sales_date_idx on public.sales (date desc, id);
create index if not exists invoices_date_idx on public.invoices (date desc, id);
create index if not exists quotes_date_idx on public.quotes (date desc, id);
create index if not exists payments_date_idx on public.payments (date desc, id);
create index if not exists stock_movements_date_id_idx on public.stock_movements (date desc, id);
create index if not exists expenses_date_idx on public.expenses (date desc, id);
create index if not exists journal_entries_date_id_idx on public.journal_entries (date desc, id);
create index if not exists attendance_date_id_idx on public.attendance (date desc, id);
create index if not exists leaves_requested_idx on public.leaves (requested_at desc, id);
create index if not exists notifications_date_idx on public.notifications (date desc, id);
create index if not exists activity_logs_date_idx on public.activity_logs (date desc, id);
create index if not exists clients_created_idx on public.clients (created_at desc, id);
create index if not exists prospects_created_idx on public.prospects (created_at desc, id);
create index if not exists followups_due_idx on public.followups (due_date desc, id);
create index if not exists appointments_date_idx on public.appointments (date desc, id);
create index if not exists events_start_idx on public.events (start_date desc, id);
create index if not exists payslips_period_idx on public.payslips (period desc, id);

-- Filtres RLS / fonctions métier
create index if not exists invoices_quote_idx on public.invoices (quote_id) where quote_id is not null;
create index if not exists invoices_status_due_idx on public.invoices (status, due_date);      -- relances : factures échues
create index if not exists quotes_status_date_idx on public.quotes (status, date);             -- relances : devis envoyés
create index if not exists expenses_status_idx on public.expenses (status);
create index if not exists leaves_status_idx on public.leaves (status, employee_id);
create index if not exists events_owner_idx on public.events (owner_id);
create index if not exists campaigns_owner_idx on public.campaigns (owner_id);
create index if not exists attendance_employee_idx on public.attendance (employee_id, date desc);

-- Clés étrangères non couvertes
create index if not exists opportunities_client_idx on public.opportunities (client_id);
create index if not exists prospects_client_idx on public.prospects (client_id) where client_id is not null;
create index if not exists appointments_client_idx on public.appointments (client_id) where client_id is not null;
create index if not exists appointments_prospect_idx on public.appointments (prospect_id) where prospect_id is not null;
create index if not exists events_trainer_idx on public.events (trainer_id) where trainer_id is not null;
create index if not exists promotions_category_idx on public.promotions (category_id) where category_id is not null;
create index if not exists shops_warehouse_idx on public.shops (supply_warehouse_id);
create index if not exists stock_levels_product_idx on public.stock_levels (product_id);

-- Recherche par code-barres (lecteur en caisse)
create index if not exists products_barcode_idx on public.products (barcode) where barcode is not null;

-- Statistiques à jour pour le planificateur
analyze;
