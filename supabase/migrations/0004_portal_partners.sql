-- ═══════════════════════════════════════════════════════════════════════════
-- PARŤÁK OS · 0004_portal_partners.sql
-- Externí identity: klientský portál + partneři na pozvánku.
--
-- Princip: jeden účet v auth.users = jeden profil. Profil má typ:
--   internal → tým Parťáka (5 lidí)
--   partner  → externí dodavatel (5–10)
--   client   → klient v portálu (100+)
--
-- BEZPEČNOSTNÍ PRAVIDLO: externí uživatel NIKDY nečte tabulky projects,
-- invoices, project_partners, project_costs přímo. Dostane jen views, které
-- vybírají bezpečné sloupce. Cena projektu, marže a provize partnerů
-- se ven nedostanou ani omylem.
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Typ účtu a vazby na externí subjekty
-- ───────────────────────────────────────────────────────────────────────────
alter table profiles add column if not exists account_type text not null default 'internal'
  check (account_type in ('internal','partner','client'));

create table if not exists partner_users (
  user_id    uuid primary key references profiles(id) on delete cascade,
  partner_id uuid not null references partners(id) on delete cascade,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists client_users (
  user_id    uuid primary key references profiles(id) on delete cascade,
  client_id  uuid not null references clients(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  can_see_finance boolean not null default true,   -- vidí ceny svých projektů
  can_see_documents boolean not null default true,
  can_write_messages boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists client_users_client_idx on client_users (client_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Pozvánky (partneři i klienti se registrují jen na pozvánku)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists invitations (
  id          uuid primary key default gen_random_uuid(),
  email       citext not null,
  account_type text not null check (account_type in ('internal','partner','client')),
  role_key    text references roles(key),
  partner_id  uuid references partners(id) on delete cascade,
  client_id   uuid references clients(id) on delete cascade,
  contact_id  uuid references contacts(id) on delete set null,
  invited_by  uuid references profiles(id),
  expires_at  timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references profiles(id),
  revoked_at  timestamptz,
  note        text,
  created_at  timestamptz not null default now(),
  constraint invite_target check (
       (account_type = 'internal' and partner_id is null and client_id is null)
    or (account_type = 'partner'  and partner_id is not null)
    or (account_type = 'client'   and client_id  is not null))
);
create unique index if not exists invitations_open_email
  on invitations (email) where accepted_at is null and revoked_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Registrace spotřebuje pozvánku (nahrazuje trigger z 0001)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  inv invitations%rowtype;
  v_type text := 'internal';
  v_role text := 'member';
begin
  select * into inv
  from invitations
  where email = new.email
    and accepted_at is null and revoked_at is null and expires_at > now()
  order by created_at desc limit 1;

  if inv.id is not null then
    v_type := inv.account_type;
    v_role := coalesce(inv.role_key,
                case inv.account_type when 'partner' then 'partner'
                                      else 'member' end);   -- klient roli v týmovém RBAC nemá
  elsif (select count(*) from user_roles) = 0 then
    v_type := 'internal'; v_role := 'owner';        -- první účet = zakladatel systému
  end if;

  insert into profiles (id, full_name, email, account_type)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.email, v_type)
  on conflict (id) do update set account_type = excluded.account_type;

  if v_type = 'internal' then
    insert into user_roles (user_id, role_key) values (new.id, v_role) on conflict do nothing;
  elsif v_type = 'partner' then
    insert into user_roles (user_id, role_key) values (new.id, 'partner') on conflict do nothing;
    insert into partner_users (user_id, partner_id) values (new.id, inv.partner_id)
      on conflict (user_id) do update set partner_id = excluded.partner_id;
  elsif v_type = 'client' then
    insert into client_users (user_id, client_id, contact_id)
      values (new.id, inv.client_id, inv.contact_id)
      on conflict (user_id) do update set client_id = excluded.client_id;
  end if;

  if inv.id is not null then
    update invitations set accepted_at = now(), accepted_by = new.id where id = inv.id;
  end if;

  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Pomocné funkce
-- ───────────────────────────────────────────────────────────────────────────
create or replace function my_account_type() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select account_type from profiles where id = auth.uid()), 'none');
$$;

create or replace function is_internal() returns boolean
language sql stable as $$ select my_account_type() = 'internal' $$;

create or replace function my_partner_id() returns uuid
language sql stable security definer set search_path = public as $$
  select partner_id from partner_users where user_id = auth.uid();
$$;

create or replace function my_client_id() returns uuid
language sql stable security definer set search_path = public as $$
  select client_id from client_users where user_id = auth.uid();
$$;

create or replace function can_client_see_finance() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_see_finance from client_users where user_id = auth.uid()), false);
$$;

create or replace function can_client_see_docs() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select can_see_documents from client_users where user_id = auth.uid()), false);
$$;


-- ───────────────────────────────────────────────────────────────────────────
-- 5. Utažení stávajících politik — interní data jen pro interní účty
-- ───────────────────────────────────────────────────────────────────────────
drop policy if exists profiles_read on profiles;
create policy profiles_read on profiles for select to authenticated
  using (is_internal() or id = auth.uid());

drop policy if exists projects_select on projects;
create policy projects_select on projects for select to authenticated
  using (is_internal() and deleted_at is null and can_see_project(id));

drop policy if exists clients_select on clients;
create policy clients_select on clients for select to authenticated
  using (deleted_at is null and (
        (is_internal() and can_see_client(id))
     or id = my_client_id()));

drop policy if exists contacts_select on contacts;
create policy contacts_select on contacts for select to authenticated
  using (deleted_at is null and (
        (is_internal() and can_see_client(client_id))
     or client_id = my_client_id()));

drop policy if exists partners_select on partners;
create policy partners_select on partners for select to authenticated
  using (deleted_at is null and (
        (is_internal() and my_max_rank() >= 60)
     or id = my_partner_id()));

drop policy if exists time_select on time_entries;
create policy time_select on time_entries for select to authenticated
  using (is_internal() and (user_id = auth.uid() or is_manager()
      or (project_id is not null and can_edit_project(project_id))));

drop policy if exists meetings_select on meetings;
create policy meetings_select on meetings for select to authenticated
  using (is_internal() and deleted_at is null and (
    is_manager() or owner_id = auth.uid()
    or (project_id is not null and can_see_project(project_id))
    or (client_id is not null and can_see_client(client_id))));

-- úkoly: interní tým podle projektu, partner jen ty své
drop policy if exists tasks_select on tasks;
create policy tasks_select on tasks for select to authenticated
  using (deleted_at is null and (
       (is_internal() and project_id is not null and can_see_project(project_id))
    or (is_internal() and project_id is null and (assignee_id = auth.uid() or created_by = auth.uid() or is_manager()))
    or (my_account_type() = 'partner' and assignee_id = auth.uid())
  ));

-- poznámky: sdílitelné vidí i klient
drop policy if exists notes_select on notes;
create policy notes_select on notes for select to authenticated
  using (deleted_at is null and (
       (is_internal() and (author_id = auth.uid() or is_manager()
          or (project_id is not null and can_see_project(project_id))
          or (client_id is not null and can_see_client(client_id))))
    or (visibility = 'shareable' and client_id = my_client_id())
    or (visibility = 'shareable' and project_id in
          (select id from projects where client_id = my_client_id()))
  ));

-- dokumenty: klient vidí jen ty označené jako klientské
drop policy if exists documents_select on documents;
create policy documents_select on documents for select to authenticated
  using (deleted_at is null and (
       (is_internal() and (is_manager()
          or (project_id is not null and can_see_project(project_id))
          or (client_id is not null and can_see_client(client_id))))
    or (visibility = 'client' and coalesce(can_client_see_docs(), false) and (
            client_id = my_client_id()
         or project_id in (select id from projects where client_id = my_client_id())))
    or (my_account_type() = 'partner' and partner_id = my_partner_id())
  ));

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Zprávy mezi klientem a Parťákem (portál)
-- ───────────────────────────────────────────────────────────────────────────
create table if not exists portal_messages (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  project_id  uuid references projects(id) on delete set null,
  author_id   uuid references profiles(id),
  direction   text not null check (direction in ('from_client','from_us')),
  body        text not null,
  read_at     timestamptz,
  created_at  timestamptz not null default now()
);
create index if not exists portal_messages_client_idx on portal_messages (client_id, created_at desc);

alter table portal_messages enable row level security;
alter table partner_users   enable row level security;
alter table client_users    enable row level security;
alter table invitations     enable row level security;

create policy msg_internal on portal_messages for all to authenticated
  using (is_internal() and can_see_client(client_id))
  with check (is_internal() and can_see_client(client_id));

create policy msg_client_read on portal_messages for select to authenticated
  using (client_id = my_client_id());

create policy msg_client_write on portal_messages for insert to authenticated
  with check (client_id = my_client_id() and direction = 'from_client'
              and coalesce((select can_write_messages from client_users where user_id = auth.uid()), false));

create policy pu_read on partner_users for select to authenticated
  using (is_internal() or user_id = auth.uid());
create policy pu_admin on partner_users for all to authenticated
  using (is_manager()) with check (is_manager());

create policy cu_read on client_users for select to authenticated
  using (is_internal() or user_id = auth.uid());
create policy cu_admin on client_users for all to authenticated
  using (is_manager()) with check (is_manager());

create policy inv_admin on invitations for all to authenticated
  using (is_manager()) with check (is_manager());

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Bezpečné views pro externí uživatele
--    Záměrně BEZ security_invoker → view běží s právy vlastníka a filtruje
--    samo. Proto musí mít vždy explicitní where na auth.uid().
-- ───────────────────────────────────────────────────────────────────────────
-- 7a. Klient vidí své projekty — bez marže, bez interních poznámek
create or replace view v_portal_projects as
select p.id,
       p.name,
       p.expected_result,
       cv_s.label            as status,
       cv_f.label            as phase,
       p.started_on,
       p.due_on,
       p.completed_on,
       case when can_client_see_finance() then p.price end        as price,
       case when can_client_see_finance() then p.invoiced_amount end as invoiced_amount,
       (select count(*) from milestones m where m.project_id = p.id)                    as milestones_total,
       (select count(*) from milestones m where m.project_id = p.id and m.is_done)      as milestones_done,
       p.next_action_on      as next_step_on
from projects p
left join code_values cv_s on cv_s.list_key='project_status' and cv_s.code = p.status_code
left join code_values cv_f on cv_f.list_key='project_phase'  and cv_f.code = p.phase_code
where p.deleted_at is null
  and p.client_id = my_client_id();

-- 7b. Klient vidí milníky svých projektů (postup prací)
create or replace view v_portal_milestones as
select m.id, m.project_id, m.title, m.due_on, m.is_done, m.done_on
from milestones m
join projects p on p.id = m.project_id
where p.client_id = my_client_id() and p.deleted_at is null;

-- 7c. Partner vidí projekty, na kterých se podílí — bez ceny projektu,
--     ale VČETNĚ své vlastní provize (svoje čísla vidět má)
create or replace view v_partner_projects as
select p.id,
       p.name,
       c.name                as client_name,
       cv_s.label            as status,
       p.due_on,
       pp.order_value        as my_order_value,
       pp.commission_pct     as my_commission_pct,
       pp.commission_amount  as my_commission_amount,
       pp.commission_status  as my_commission_status,
       pp.paid_on            as my_commission_paid_on
from project_partners pp
join projects p on p.id = pp.project_id and p.deleted_at is null
join clients  c on c.id = p.client_id
left join code_values cv_s on cv_s.list_key='project_status' and cv_s.code = p.status_code
where pp.partner_id = my_partner_id();

-- 7d. Partner vidí své úkoly
create or replace view v_partner_tasks as
select t.id, t.title, t.description, t.due_on, t.status_code, t.est_hours,
       p.name as project_name, c.name as client_name
from tasks t
left join projects p on p.id = t.project_id
left join clients  c on c.id = p.client_id
where t.deleted_at is null
  and t.assignee_id = auth.uid()
  and my_account_type() = 'partner';

grant select on v_portal_projects, v_portal_milestones, v_partner_projects, v_partner_tasks to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Požadavek z portálu se založí jako lead (klient chce další práci)
-- ───────────────────────────────────────────────────────────────────────────
create or replace function portal_request_work(p_text text) returns uuid
language plpgsql security definer set search_path = public as $$
declare v_client uuid; v_id uuid;
begin
  v_client := my_client_id();
  if v_client is null then raise exception 'Pouze klient portálu může zakládat požadavek'; end if;

  insert into leads (title, company, stage_code, source_code, notes, owner_id, next_action, next_action_on)
  select 'Požadavek z portálu: ' || c.name, c.name, 'lead', 'portal', p_text, c.owner_id,
         'Ozvat se klientovi k požadavku', current_date + 1
  from clients c where c.id = v_client
  returning id into v_id;

  insert into portal_messages (client_id, author_id, direction, body)
  values (v_client, auth.uid(), 'from_client', p_text);

  return v_id;
end $$;

grant execute on function portal_request_work(text) to authenticated;

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Kontrola po nasazení
-- ───────────────────────────────────────────────────────────────────────────
comment on view v_portal_projects is
  'Klientský portál. Test před spuštěním: přihlas se jako klient a ověř, že select * from projects vrátí 0 řádků, zatímco v_portal_projects vrátí jen jeho projekty.';
