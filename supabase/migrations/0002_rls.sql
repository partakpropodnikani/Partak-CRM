-- ═══════════════════════════════════════════════════════════════════════════
-- PARŤÁK OS · 0002_rls.sql
-- Oprávnění řešíme v databázi (RLS), nikoliv skrýváním tlačítek ve frontendu.
-- Model: owner/management vidí vše · pm vidí své projekty a jejich klienty
--        member vidí projekty, kde je členem nebo má úkol · partner jen sdílené
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Pomocné funkce (security definer, aby neobcházely samy sebe rekurzí)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function my_max_rank() returns int
language sql stable security definer set search_path = public as $$
  select coalesce(max(r.rank), 0)
  from user_roles ur join roles r on r.key = ur.role_key
  where ur.user_id = auth.uid();
$$;

create or replace function has_role(p_role text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from user_roles where user_id = auth.uid() and role_key = p_role);
$$;

-- owner + management
create or replace function is_manager() returns boolean
language sql stable as $$ select my_max_rank() >= 80 $$;

create or replace function is_owner() returns boolean
language sql stable as $$ select my_max_rank() >= 100 $$;

-- vidím projekt? (PM, člen týmu, řešitel úkolu, nebo management)
create or replace function can_see_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_manager()
      or exists (select 1 from projects p where p.id = p_project and p.manager_id = auth.uid())
      or exists (select 1 from project_members m where m.project_id = p_project and m.user_id = auth.uid())
      or exists (select 1 from tasks t where t.project_id = p_project and t.assignee_id = auth.uid());
$$;

-- vidím klienta? (management, nebo mám u něj alespoň jeden viditelný projekt)
create or replace function can_see_client(p_client uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_manager()
      or exists (select 1 from clients c where c.id = p_client and c.owner_id = auth.uid())
      or exists (select 1 from projects p where p.client_id = p_client and can_see_project(p.id));
$$;

-- můžu editovat projekt? (management nebo PM projektu)
create or replace function can_edit_project(p_project uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select is_manager()
      or exists (select 1 from projects p where p.id = p_project and p.manager_id = auth.uid());
$$;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Zapnutí RLS
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','user_roles','roles','code_lists','code_values',
    'services','project_types','project_templates','template_items',
    'clients','contacts','leads','partners','partner_ratings',
    'projects','project_services','project_members','project_partners','milestones',
    'tasks','task_collaborators','task_dependencies','task_checklist',
    'time_entries','running_timers','meetings','meeting_participants','notes','documents',
    'contracts','invoices','project_costs','kb_articles','notifications','activity_log',
    'saved_views','ai_actions','automations','automation_runs','health_rules']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Čtení referenčních dat — každý přihlášený
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['roles','code_lists','code_values','services','project_types',
    'project_templates','template_items','kb_articles','health_rules','profiles']
  loop
    execute format($f$create policy %I on %I for select to authenticated using (true)$f$,
                   t || '_read', t);
  end loop;
end $$;

-- zápis referenčních dat jen owner
do $$
declare t text;
begin
  foreach t in array array['code_lists','code_values','services','project_types',
    'project_templates','template_items','health_rules','roles','user_roles']
  loop
    execute format($f$create policy %I on %I for all to authenticated using (is_owner()) with check (is_owner())$f$,
                   t || '_admin', t);
  end loop;
end $$;

create policy user_roles_read on user_roles for select to authenticated using (true);

create policy profiles_self_update on profiles for update to authenticated
  using (id = auth.uid() or is_owner()) with check (id = auth.uid() or is_owner());

-- KB smí editovat management
create policy kb_write on kb_articles for all to authenticated
  using (is_manager()) with check (is_manager());

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Klienti a kontakty
-- ───────────────────────────────────────────────────────────────────────────
create policy clients_select on clients for select to authenticated
  using (deleted_at is null and can_see_client(id));
create policy clients_insert on clients for insert to authenticated
  with check (my_max_rank() >= 60);                      -- pm a výš zakládá klienty
create policy clients_update on clients for update to authenticated
  using (is_manager() or owner_id = auth.uid())
  with check (is_manager() or owner_id = auth.uid());
create policy clients_delete on clients for delete to authenticated
  using (is_owner());

create policy contacts_select on contacts for select to authenticated
  using (deleted_at is null and can_see_client(client_id));
create policy contacts_write on contacts for all to authenticated
  using (my_max_rank() >= 60 and can_see_client(client_id))
  with check (my_max_rank() >= 60 and can_see_client(client_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Leady — obchod vidí management a vlastník leadu
-- ───────────────────────────────────────────────────────────────────────────
create policy leads_select on leads for select to authenticated
  using (deleted_at is null and (is_manager() or owner_id = auth.uid()));
create policy leads_write on leads for all to authenticated
  using (is_manager() or owner_id = auth.uid())
  with check (is_manager() or owner_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Projekty a jejich podřízené entity
-- ───────────────────────────────────────────────────────────────────────────
create policy projects_select on projects for select to authenticated
  using (deleted_at is null and can_see_project(id));
create policy projects_insert on projects for insert to authenticated
  with check (my_max_rank() >= 60);
create policy projects_update on projects for update to authenticated
  using (can_edit_project(id)) with check (can_edit_project(id));
create policy projects_delete on projects for delete to authenticated
  using (is_owner());

create policy pservices_all on project_services for all to authenticated
  using (can_see_project(project_id)) with check (can_edit_project(project_id));
create policy pmembers_select on project_members for select to authenticated
  using (can_see_project(project_id));
create policy pmembers_write on project_members for all to authenticated
  using (can_edit_project(project_id)) with check (can_edit_project(project_id));

-- partnerská zapojení a provize: čtení management + PM, zápis management
create policy ppartners_select on project_partners for select to authenticated
  using (can_edit_project(project_id));
create policy ppartners_write on project_partners for all to authenticated
  using (is_manager()) with check (is_manager());

create policy milestones_select on milestones for select to authenticated
  using (can_see_project(project_id));
create policy milestones_write on milestones for all to authenticated
  using (can_edit_project(project_id)) with check (can_edit_project(project_id));

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Úkoly — vidím projektové úkoly svých projektů + vlastní interní
-- ───────────────────────────────────────────────────────────────────────────
create policy tasks_select on tasks for select to authenticated
  using (deleted_at is null and (
       (project_id is not null and can_see_project(project_id))
    or (project_id is null and (assignee_id = auth.uid() or created_by = auth.uid() or is_manager()))
  ));
create policy tasks_insert on tasks for insert to authenticated
  with check (project_id is null or can_see_project(project_id));
-- řešitel smí měnit svůj úkol; PM/management cokoliv na projektu
create policy tasks_update on tasks for update to authenticated
  using (assignee_id = auth.uid() or (project_id is not null and can_edit_project(project_id)) or is_manager())
  with check (assignee_id = auth.uid() or (project_id is not null and can_edit_project(project_id)) or is_manager());
create policy tasks_delete on tasks for delete to authenticated
  using (is_manager() or (project_id is not null and can_edit_project(project_id)));

create policy tcollab_all on task_collaborators for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and (t.project_id is null or can_see_project(t.project_id))))
  with check (exists (select 1 from tasks t where t.id = task_id and (t.project_id is null or can_see_project(t.project_id))));
create policy tdeps_all on task_dependencies for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and (t.project_id is null or can_see_project(t.project_id))))
  with check (exists (select 1 from tasks t where t.id = task_id and (t.project_id is null or can_see_project(t.project_id))));
create policy tcheck_all on task_checklist for all to authenticated
  using (exists (select 1 from tasks t where t.id = task_id and (t.project_id is null or can_see_project(t.project_id))))
  with check (exists (select 1 from tasks t where t.id = task_id and (t.project_id is null or can_see_project(t.project_id))));

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Čas — svůj čas píše každý sám, management vidí vše
-- ───────────────────────────────────────────────────────────────────────────
create policy time_select on time_entries for select to authenticated
  using (user_id = auth.uid() or is_manager() or (project_id is not null and can_edit_project(project_id)));
create policy time_write on time_entries for all to authenticated
  using (user_id = auth.uid() or is_manager()) with check (user_id = auth.uid() or is_manager());
create policy timers_self on running_timers for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Schůzky, poznámky, dokumenty
-- ───────────────────────────────────────────────────────────────────────────
create policy meetings_select on meetings for select to authenticated
  using (deleted_at is null and (
    is_manager() or owner_id = auth.uid()
    or (project_id is not null and can_see_project(project_id))
    or (client_id is not null and can_see_client(client_id))));
create policy meetings_write on meetings for all to authenticated
  using (is_manager() or owner_id = auth.uid() or (project_id is not null and can_edit_project(project_id)))
  with check (is_manager() or owner_id = auth.uid() or (project_id is not null and can_edit_project(project_id)));
create policy mparts_all on meeting_participants for all to authenticated
  using (exists (select 1 from meetings m where m.id = meeting_id and (m.owner_id = auth.uid() or is_manager()
        or (m.project_id is not null and can_see_project(m.project_id)))))
  with check (exists (select 1 from meetings m where m.id = meeting_id and (m.owner_id = auth.uid() or is_manager()
        or (m.project_id is not null and can_edit_project(m.project_id)))));

create policy notes_select on notes for select to authenticated
  using (deleted_at is null and (
    author_id = auth.uid() or is_manager()
    or (project_id is not null and can_see_project(project_id))
    or (client_id is not null and can_see_client(client_id))));
create policy notes_write on notes for all to authenticated
  using (author_id = auth.uid() or is_manager())
  with check (author_id = auth.uid() or is_manager()
    or (project_id is not null and can_see_project(project_id)));

create policy documents_select on documents for select to authenticated
  using (deleted_at is null and (
    is_manager()
    or (project_id is not null and can_see_project(project_id))
    or (client_id is not null and can_see_client(client_id))));
create policy documents_write on documents for all to authenticated
  using (is_manager() or (project_id is not null and can_edit_project(project_id)))
  with check (is_manager() or (project_id is not null and can_see_project(project_id)));

-- ───────────────────────────────────────────────────────────────────────────
-- 10. Finance a smlouvy — pouze management/owner
-- ───────────────────────────────────────────────────────────────────────────
create policy invoices_manage on invoices for all to authenticated
  using (is_manager()) with check (is_manager());
create policy costs_manage on project_costs for all to authenticated
  using (is_manager()) with check (is_manager());
create policy contracts_manage on contracts for all to authenticated
  using (is_manager()) with check (is_manager());

-- ───────────────────────────────────────────────────────────────────────────
-- 11. Partneři — čtení pm a výš, zápis management
-- ───────────────────────────────────────────────────────────────────────────
create policy partners_select on partners for select to authenticated
  using (deleted_at is null and my_max_rank() >= 60);
create policy partners_write on partners for all to authenticated
  using (is_manager()) with check (is_manager());
create policy pratings_select on partner_ratings for select to authenticated
  using (my_max_rank() >= 60);
create policy pratings_write on partner_ratings for all to authenticated
  using (my_max_rank() >= 60) with check (rated_by = auth.uid() or is_manager());

-- ───────────────────────────────────────────────────────────────────────────
-- 12. Notifikace, audit, pohledy, AI
-- ───────────────────────────────────────────────────────────────────────────
create policy notif_self on notifications for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- audit log je jen ke čtení pro management, zapisují triggery (security definer)
create policy audit_read on activity_log for select to authenticated
  using (is_manager() or actor_id = auth.uid());

create policy views_own on saved_views for all to authenticated
  using (user_id = auth.uid() or is_shared) with check (user_id = auth.uid());

create policy ai_self on ai_actions for select to authenticated
  using (user_id = auth.uid() or is_owner());
create policy ai_insert on ai_actions for insert to authenticated
  with check (user_id = auth.uid());
create policy ai_update on ai_actions for update to authenticated
  using (user_id = auth.uid() or is_owner()) with check (user_id = auth.uid() or is_owner());

create policy autom_admin on automations for all to authenticated
  using (is_owner()) with check (is_owner());
create policy autom_runs_read on automation_runs for select to authenticated
  using (is_manager());

-- ───────────────────────────────────────────────────────────────────────────
-- 13. Pravidlo pro AI: service role nikdy neobchází RLS v uživatelském kontextu
-- ───────────────────────────────────────────────────────────────────────────
comment on function can_see_project(uuid) is
  'AI vrstva MUSÍ číst data přes klienta s JWT uživatele, ne přes service_role. Tím platí stejná RLS jako v UI.';
