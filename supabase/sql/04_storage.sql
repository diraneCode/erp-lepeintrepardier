-- =============================================================================
-- Le Peintre Pardier ERP — 04 · Stockage des pièces des employés
-- À exécuter après 03_policies.sql.
--
-- Bucket privé « employee-files » : photo, CNI, CV, plan de localisation,
-- dernier diplôme. Chemin : employees/<id employé>/<type>-<horodatage>.<ext>
-- L'administration gère tous les fichiers ; un employé ne peut consulter que
-- les siens. Les fichiers sont servis par URL signée temporaire.
-- =============================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('employee-files', 'employee-files', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp', 'application/pdf'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "employee_files_select" on storage.objects;
drop policy if exists "employee_files_admin_insert" on storage.objects;
drop policy if exists "employee_files_admin_update" on storage.objects;
drop policy if exists "employee_files_admin_delete" on storage.objects;

create policy "employee_files_select" on storage.objects for select to authenticated
  using (
    bucket_id = 'employee-files'
    and (
      (select app.is_admin())
      or ((storage.foldername(name))[1] = 'employees' and (storage.foldername(name))[2] = (select app.my_employee_id()))
    )
  );

create policy "employee_files_admin_insert" on storage.objects for insert to authenticated
  with check (bucket_id = 'employee-files' and (select app.is_admin()));

create policy "employee_files_admin_update" on storage.objects for update to authenticated
  using (bucket_id = 'employee-files' and (select app.is_admin()));

create policy "employee_files_admin_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'employee-files' and (select app.is_admin()));
