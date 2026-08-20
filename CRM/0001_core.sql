-- ═══════════════════════════════════════════════════════════════════════════
-- PARŤÁK OS · 0001_core.sql
-- Základní relační model. Projekt je hlavní objekt, klient je kontext.
-- Konvence: UUID PK, timestamptz, created_by/updated_by, soft delete, FK, indexy.
-- Číselníky jsou TABULKY (nikoliv enumy), aby je admin mohl měnit bez migrace.
-- ═══════════════════════════════════════════════════════════════════════════

create extension if not exists "pgcrypto";
create extension if not exists "citext";       -- case-insensitive e-maily
create extension if not exists "pg_trgm";      -- fulltext / fuzzy hledání
create extension if not exists "unaccent";     -- hledání bez diakritiky

-- ───────────────────────────────────────────────────────────────────────────
-- 0. Společné funkce
-- ───────────────────────────────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Lidé, role, oprávnění
-- ───────────────────────────────────────────────────────────────────────────
create table profiles (
  id            uuid primary key references auth.users(id) on delete cascade,
  full_name     text not null,
  email         citext,
  position      text,                       -- „Jednatel · obchod a strategie“
  color         text default '#3E5C76',
  weekly_capacity_hours numeric(5,2) default 40,
  internal_cost_rate    numeric(10,2),      -- interní nákladová sazba (zatím nepoužíváme)
  status        text not null default 'active'
                check (status in ('active','inactive','archived')),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid
);

create table roles (
  key         text primary key,             -- owner | management | pm | member | partner
  name        text not null,
  description text,
  rank        int  not null                 -- vyšší = větší oprávnění
);

insert into roles (key,name,description,rank) values
  ('owner','Owner / Admin','Kompletní přístup včetně administrace a financí',100),
  ('management','Management','Projekty, klienti, reporting, tým, finance (čtení)',80),
  ('pm','Project Manager','Přidělené projekty a jejich klienti',60),
  ('member','Člen týmu','Relevantní projekty a vlastní úkoly',40),
  ('partner','Externí partner','Pouze konkrétně sdílené projekty a úkoly',20);

create table user_roles (
  user_id   uuid not null references profiles(id) on delete cascade,
  role_key  text not null references roles(key),
  granted_at timestamptz not null default now(),
  granted_by uuid references profiles(id),
  primary key (user_id, role_key)
);

-- ───────────────────────────────────────────────────────────────────────────
-- 2. Číselníky (konfigurovatelné adminem)
-- ───────────────────────────────────────────────────────────────────────────
create table code_lists (
  key   text primary key,                   -- project_status | task_status | lead_stage | ...
  name  text not null
);

create table code_values (
  id          uuid primary key default gen_random_uuid(),
  list_key    text not null references code_lists(key) on delete cascade,
  code        text not null,
  label       text not null,
  color       text,
  sort_order  int  not null default 0,
  is_active   boolean not null default true,
  is_terminal boolean not null default false,   -- „konečný“ stav (Dokončeno, Zrušeno)
  unique (list_key, code)
);

insert into code_lists (key,name) values
  ('project_status','Stavy projektu'),
  ('project_phase','Fáze projektu'),
  ('task_status','Stavy úkolů'),
  ('priority','Priority'),
  ('lead_stage','Fáze obchodní pipeline'),
  ('lead_source','Zdroje leadů'),
  ('industry','Odvětví'),
  ('invoice_status','Stav fakturace'),
  ('document_category','Kategorie dokumentů'),
  ('partner_category','Kategorie partnerů'),
  ('client_package','Balíčky spolupráce');

insert into code_values (list_key,code,label,sort_order,is_terminal) values
  ('project_status','draft','Návrh',10,false),
  ('project_status','prep','Příprava',20,false),
  ('project_status','running','Realizace',30,false),
  ('project_status','waiting_client','Čeká na klienta',40,false),
  ('project_status','review','Interní kontrola',50,false),
  ('project_status','handover','Předání',60,false),
  ('project_status','done','Dokončeno',70,true),
  ('project_status','paused','Pozastaveno',80,false),
  ('project_status','cancelled','Zrušeno',90,true),
  ('project_status','archived','Archivováno',100,true),
  ('project_phase','intake','Intake',10,false),
  ('project_phase','analysis','Analýza',20,false),
  ('project_phase','solution','Návrh řešení',30,false),
  ('project_phase','offer','Nabídka',40,false),
  ('project_phase','prep','Příprava',50,false),
  ('project_phase','delivery','Realizace',60,false),
  ('project_phase','qa','Interní kontrola',70,false),
  ('project_phase','handover','Předání',80,false),
  ('project_phase','review','Vyhodnocení',90,false),
  ('project_phase','followup','Follow-up',100,true),
  ('task_status','planned','Naplánováno',10,false),
  ('task_status','ready','Připraveno',20,false),
  ('task_status','doing','Probíhá',30,false),
  ('task_status','waiting','Čeká',40,false),
  ('task_status','blocked','Blokováno',50,false),
  ('task_status','done','Hotovo',60,true),
  ('task_status','cancelled','Zrušeno',70,true),
  ('priority','low','Nízká',10,false),
  ('priority','normal','Střední',20,false),
  ('priority','high','Vysoká',30,false),
  ('priority','critical','Kritická',40,false),
  -- pipeline dle reálného Notionu Parťáka
  ('lead_stage','lead','Lead',10,false),
  ('lead_stage','first_contact','První kontakt',20,false),
  ('lead_stage','diagnostics','Diagnostika',30,false),
  ('lead_stage','offer_sent','Nabídka odeslána',40,false),
  ('lead_stage','won','Klient (aktivní)',50,true),
  ('lead_stage','postponed','Odloženo',60,false),
  ('lead_stage','lost','Ztraceno',70,true),
  ('lead_source','referral','Doporučení',10,false),
  ('lead_source','web','Web',20,false),
  ('lead_source','social','Sociální sítě',30,false),
  ('lead_source','networking','Networking',40,false),
  ('lead_source','own','Vlastní kontakt',50,false),
  ('lead_source','partner','Partner / affiliate',60,false),
  ('lead_source','portal','Klientský portál',70,false),
  ('lead_source','other','Jiné',80,false),
  ('invoice_status','none','Nefakturováno',10,false),
  ('invoice_status','ready','Připraveno',20,false),
  ('invoice_status','partial','Částečně fakturováno',30,false),
  ('invoice_status','invoiced','Fakturováno',40,false),
  ('invoice_status','paid','Zaplaceno',50,true),
  ('invoice_status','cancelled','Storno',60,true),
  ('document_category','contract','Smlouva',10,false),
  ('document_category','offer','Nabídka',20,false),
  ('document_category','brief','Brief',30,false),
  ('document_category','client_input','Klientské podklady',40,false),
  ('document_category','internal','Interní podklady',50,false),
  ('document_category','output','Výstup',60,false),
  ('document_category','report','Report',70,false),
  ('document_category','invoicing','Fakturace',80,false),
  ('document_category','other','Ostatní',90,false),
  ('partner_category','accounting','Účetnictví',10,false),
  ('partner_category','legal','Právo',20,false),
  ('partner_category','marketing','Marketing',30,false),
  ('partner_category','it','IT',40,false),
  ('partner_category','dev','Development',50,false),
  ('partner_category','design','Design',60,false),
  ('partner_category','finance','Finance',70,false),
  ('partner_category','other','Další',80,false),
  ('client_package','s1','S1 — Základ',10,false),
  ('client_package','s2','S2 — Střední',20,false),
  ('client_package','s3','S3 — Prémium',30,false),
  ('client_package','s4','S4 — Automatizovaný',40,false),
  ('client_package','hourly','Hodinovka',50,false),
  ('client_package','custom','Individuální',60,false);

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Katalog služeb a typy projektů
-- ───────────────────────────────────────────────────────────────────────────
create table services (
  id              uuid primary key default gen_random_uuid(),
  code            text unique not null,
  name            text not null,
  problem_solved  text,
  target_client   text,
  scope_included  text,
  scope_excluded  text,
  price_from      numeric(12,2),
  pricing_model   text check (pricing_model in ('fixed','hourly','retainer','custom')),
  est_hours       numeric(6,2),
  process_summary text,
  deliverables    text,
  benefit         text,
  faq             text,
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id),
  updated_by      uuid
);

create table project_types (
  id           uuid primary key default gen_random_uuid(),
  code         text unique not null,
  name         text not null,
  service_id   uuid references services(id),
  is_active    boolean not null default true,
  sort_order   int not null default 0
);

create table project_templates (
  id              uuid primary key default gen_random_uuid(),
  project_type_id uuid not null references project_types(id) on delete cascade,
  name            text not null,
  description     text,
  default_hours   numeric(6,2),
  is_active       boolean not null default true,
  created_at      timestamptz not null default now()
);

create table template_items (
  id            uuid primary key default gen_random_uuid(),
  template_id   uuid not null references project_templates(id) on delete cascade,
  kind          text not null check (kind in ('milestone','task','document','input')),
  title         text not null,
  description   text,
  phase_code    text,                       -- code_values(list_key='project_phase')
  est_hours     numeric(6,2),
  role_hint     text,                       -- doporučená role, ne konkrétní osoba
  offset_days   int,                        -- termín = start projektu + offset
  depends_on_seq int,                       -- závislost v rámci šablony
  seq           int not null default 0
);

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Klienti, kontakty, leady
-- ───────────────────────────────────────────────────────────────────────────
create table clients (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  legal_name     text,
  reg_no         text,                      -- IČO
  vat_no         text,                      -- DIČ
  industry_code  text,
  package_code   text,
  website        text,
  address        text,
  annual_revenue numeric(14,2),
  source_code    text,
  acquired_on    date,
  owner_id       uuid references profiles(id),   -- odpovědná osoba
  relationship_status text not null default 'active'
                 check (relationship_status in ('prospect','active','inactive','ended')),
  notes          text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  created_by     uuid references profiles(id),
  updated_by     uuid,
  deleted_at     timestamptz
);
create index on clients (owner_id);
create index on clients using gin (name gin_trgm_ops);

create table contacts (
  id          uuid primary key default gen_random_uuid(),
  client_id   uuid not null references clients(id) on delete cascade,
  full_name   text not null,
  role_title  text,
  email       citext,
  phone       text,
  is_primary  boolean not null default false,
  notes       text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz
);
create index on contacts (client_id);
create unique index contacts_one_primary on contacts (client_id) where is_primary and deleted_at is null;

create table leads (
  id              uuid primary key default gen_random_uuid(),
  title           text not null,
  company         text,
  contact_name    text,
  email           citext,
  phone           text,
  stage_code      text not null default 'lead',
  source_code     text,
  estimated_value numeric(12,2),
  owner_id        uuid references profiles(id),
  next_action     text,
  next_action_on  date,
  notes           text,
  converted_client_id uuid references clients(id),
  converted_at    timestamptz,
  lost_reason     text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id),
  updated_by      uuid,
  deleted_at      timestamptz
);
create index on leads (stage_code, next_action_on);
create index on leads (owner_id);

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Partneři (dodavatelé / affiliate)
-- ───────────────────────────────────────────────────────────────────────────
create table partners (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  category_code text,
  specialization text,
  email         citext,
  phone         text,
  reg_no        text,
  commission_pct numeric(5,2),
  commission_fixed numeric(10,2),
  payout_mode   text check (payout_mode in ('invoice','via_us','client_discount')),
  capacity_projects int,
  owner_id      uuid references profiles(id),
  status        text not null default 'active'
                check (status in ('proposed','testing','active','paused','rejected')),
  notes         text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  deleted_at    timestamptz
);

create table partner_ratings (
  id          uuid primary key default gen_random_uuid(),
  partner_id  uuid not null references partners(id) on delete cascade,
  project_id  uuid,
  quality     int check (quality between 1 and 5),
  speed       int check (speed between 1 and 5),
  communication int check (communication between 1 and 5),
  reliability int check (reliability between 1 and 5),
  value_for_money int check (value_for_money between 1 and 5),
  note        text,
  rated_by    uuid references profiles(id),
  created_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 6. PROJEKT — hlavní objekt systému
-- ───────────────────────────────────────────────────────────────────────────
create table projects (
  id              uuid primary key default gen_random_uuid(),
  code            text unique,               -- např. 2026-014
  name            text not null,
  client_id       uuid not null references clients(id) on delete restrict,
  project_type_id uuid references project_types(id),
  template_id     uuid references project_templates(id),
  description     text,
  expected_result text,                      -- co má být výsledkem
  result_rating   text check (result_rating in ('met','partial','not_met')),
  result_note     text,
  status_code     text not null default 'draft',
  phase_code      text not null default 'intake',
  priority_code   text not null default 'normal',
  manager_id      uuid references profiles(id),      -- PM
  next_action     text,
  next_action_on  date,
  started_on      date,
  due_on          date,
  completed_on    date,
  price           numeric(12,2),
  pricing_model   text check (pricing_model in ('fixed','hourly','retainer','custom')),
  hourly_rate     numeric(10,2),
  planned_hours   numeric(7,2),
  invoiced_amount numeric(12,2) default 0,
  invoice_status_code text default 'none',
  drive_url       text,
  last_activity_at timestamptz not null default now(),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  created_by      uuid references profiles(id),
  updated_by      uuid,
  deleted_at      timestamptz
);
create index on projects (client_id);
create index on projects (status_code, due_on);
create index on projects (manager_id);
create index on projects (last_activity_at);

-- služby na projektu (projekt = vrstvy služeb; N:M)
create table project_services (
  project_id uuid not null references projects(id) on delete cascade,
  service_id uuid not null references services(id) on delete restrict,
  primary key (project_id, service_id)
);

-- členové projektového týmu
create table project_members (
  project_id uuid not null references projects(id) on delete cascade,
  user_id    uuid not null references profiles(id) on delete cascade,
  role_hint  text,
  allocation_pct int,
  primary key (project_id, user_id)
);

-- zapojení partnera do projektu včetně hodnoty zakázky a provize
create table project_partners (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  partner_id   uuid not null references partners(id) on delete restrict,
  order_value  numeric(12,2),
  commission_pct numeric(5,2),
  commission_amount numeric(12,2) generated always as
      (case when order_value is not null and commission_pct is not null
            then round(order_value * commission_pct / 100, 2) end) stored,
  commission_status text not null default 'pending'
      check (commission_status in ('pending','approved','paid','cancelled')),
  paid_on      date,
  note         text,
  created_at   timestamptz not null default now()
);
create index on project_partners (project_id);
create index on project_partners (partner_id);

create table milestones (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  title       text not null,
  description text,
  due_on      date,
  done_on     date,
  is_done     boolean not null default false,
  seq         int not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index on milestones (project_id, is_done, due_on);

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Úkoly a závislosti
-- ───────────────────────────────────────────────────────────────────────────
create table tasks (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid references projects(id) on delete cascade,   -- NULL = interní/obchodní úkol
  lead_id       uuid references leads(id) on delete cascade,
  milestone_id  uuid references milestones(id) on delete set null,
  kind          text not null default 'project'
                check (kind in ('project','internal','sales','admin')),
  title         text not null,
  description   text,
  assignee_id   uuid references profiles(id),
  status_code    text not null default 'planned',
  priority_code  text not null default 'normal',
  due_on        date,
  est_hours     numeric(6,2),
  from_template boolean not null default false,
  waiting_for   text,                        -- na koho/co se čeká
  done_at       timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  created_by    uuid references profiles(id),
  updated_by    uuid,
  deleted_at    timestamptz,
  constraint task_has_parent check (project_id is not null or lead_id is not null or kind <> 'project')
);
create index on tasks (assignee_id, status_code, due_on);
create index on tasks (project_id, status_code);

create table task_collaborators (
  task_id uuid not null references tasks(id) on delete cascade,
  user_id uuid not null references profiles(id) on delete cascade,
  primary key (task_id, user_id)
);

create table task_dependencies (
  task_id       uuid not null references tasks(id) on delete cascade,  -- tento úkol
  depends_on_id uuid not null references tasks(id) on delete cascade,  -- čeká na tento
  primary key (task_id, depends_on_id),
  constraint no_self_dependency check (task_id <> depends_on_id)
);

create table task_checklist (
  id       uuid primary key default gen_random_uuid(),
  task_id  uuid not null references tasks(id) on delete cascade,
  title    text not null,
  is_done  boolean not null default false,
  seq      int not null default 0
);

-- ───────────────────────────────────────────────────────────────────────────
-- 8. Čas
-- ───────────────────────────────────────────────────────────────────────────
create table time_entries (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete restrict,
  project_id  uuid references projects(id) on delete set null,
  task_id     uuid references tasks(id) on delete set null,
  entry_date  date not null default current_date,
  hours       numeric(6,2) not null check (hours > 0),
  note        text,
  billable    boolean not null default true,
  started_at  timestamptz,                   -- pro timer
  stopped_at  timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid
);
create index on time_entries (project_id, entry_date);
create index on time_entries (user_id, entry_date);

create table running_timers (
  user_id    uuid primary key references profiles(id) on delete cascade,
  project_id uuid references projects(id) on delete set null,
  task_id    uuid references tasks(id) on delete set null,
  started_at timestamptz not null default now(),
  note       text
);

-- ───────────────────────────────────────────────────────────────────────────
-- 9. Schůzky, poznámky, dokumenty
-- ───────────────────────────────────────────────────────────────────────────
create table meetings (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  client_id   uuid references clients(id) on delete set null,
  project_id  uuid references projects(id) on delete set null,
  partner_id  uuid references partners(id) on delete set null,
  kind        text not null default 'client'
              check (kind in ('client','internal','sales','partner')),
  starts_at   timestamptz not null,
  duration_min int,
  location    text,
  agenda      text,
  minutes     text,                          -- zápis
  decisions   text,
  transcript_url text,
  owner_id    uuid references profiles(id),
  is_done     boolean not null default false,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz
);
create index on meetings (starts_at);
create index on meetings (client_id);

create table meeting_participants (
  id         uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references meetings(id) on delete cascade,
  user_id    uuid references profiles(id) on delete cascade,
  contact_id uuid references contacts(id) on delete cascade,
  external_name text,
  check (user_id is not null or contact_id is not null or external_name is not null)
);

create table notes (
  id          uuid primary key default gen_random_uuid(),
  body        text not null,
  visibility  text not null default 'internal'
              check (visibility in ('internal','shareable')),   -- příprava pro klientskou zónu
  client_id   uuid references clients(id) on delete cascade,
  project_id  uuid references projects(id) on delete cascade,
  task_id     uuid references tasks(id) on delete cascade,
  partner_id  uuid references partners(id) on delete cascade,
  author_id   uuid references profiles(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz
);
create index on notes (project_id);
create index on notes (client_id);

create table documents (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category_code text,
  visibility    text not null default 'internal'
                check (visibility in ('internal','client')),
  storage       text not null default 'gdrive'
                check (storage in ('gdrive','supabase','external')),
  url           text,
  storage_path  text,
  mime_type     text,
  size_bytes    bigint,
  client_id     uuid references clients(id) on delete cascade,
  project_id    uuid references projects(id) on delete cascade,
  task_id       uuid references tasks(id) on delete cascade,
  partner_id    uuid references partners(id) on delete cascade,
  uploaded_by   uuid references profiles(id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz
);
create index on documents (project_id);
create index on documents (client_id);

create table contracts (
  id            uuid primary key default gen_random_uuid(),
  party_type    text not null check (party_type in ('client','partner')),
  client_id     uuid references clients(id) on delete cascade,
  partner_id    uuid references partners(id) on delete cascade,
  contract_type text not null,               -- GDPR / NDA / Podmínky / Provize
  status        text not null default 'draft'
                check (status in ('draft','sent','signed','terminated')),
  signed_on     date,
  valid_until   date,
  document_id   uuid references documents(id) on delete set null,
  note          text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  updated_by    uuid,
  check ((party_type='client' and client_id is not null) or (party_type='partner' and partner_id is not null))
);

-- ───────────────────────────────────────────────────────────────────────────
-- 10. Finance projektu (ne účetnictví)
-- ───────────────────────────────────────────────────────────────────────────
create table invoices (
  id           uuid primary key default gen_random_uuid(),
  number       text unique,
  project_id   uuid references projects(id) on delete set null,
  client_id    uuid references clients(id) on delete set null,
  amount       numeric(12,2) not null,
  vat_amount   numeric(12,2),
  issued_on    date,
  due_on       date,
  paid_on      date,
  status       text not null default 'draft'
               check (status in ('draft','issued','paid','overdue','cancelled')),
  external_id  text,                         -- ID ve Fakturoidu
  external_url text,
  note         text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  updated_by   uuid
);
create index on invoices (project_id);
create index on invoices (status, due_on);

create table project_costs (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  partner_id  uuid references partners(id) on delete set null,
  title       text not null,
  amount      numeric(12,2) not null,
  cost_date   date not null default current_date,
  note        text,
  created_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 11. Knowledge base
-- ───────────────────────────────────────────────────────────────────────────
create table kb_articles (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  category    text not null,                 -- Procesy / Metodiky / Obchod / ...
  body        text not null,
  author_id   uuid references profiles(id),
  process_owner_id uuid references profiles(id),
  service_id  uuid references services(id),
  template_id uuid references project_templates(id),
  is_published boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  updated_by  uuid,
  deleted_at  timestamptz
);
create index on kb_articles using gin (title gin_trgm_ops);

-- ───────────────────────────────────────────────────────────────────────────
-- 12. Notifikace, aktivity, uložené pohledy
-- ───────────────────────────────────────────────────────────────────────────
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references profiles(id) on delete cascade,
  kind        text not null,                 -- task_overdue | project_at_risk | ...
  severity    text not null default 'info' check (severity in ('info','warning','critical')),
  title       text not null,
  body        text,
  entity_type text,
  entity_id   uuid,
  read_at     timestamptz,
  snoozed_until date,
  channel     text not null default 'in_app'
              check (channel in ('in_app','email','push','slack')),
  created_at  timestamptz not null default now()
);
create index on notifications (user_id, read_at);

create table activity_log (
  id          bigserial primary key,
  occurred_at timestamptz not null default now(),
  actor_id    uuid references profiles(id),
  actor_kind  text not null default 'user' check (actor_kind in ('user','system','ai','integration')),
  entity_type text not null,
  entity_id   uuid not null,
  action      text not null,                 -- created | updated | status_changed | deleted
  field       text,
  old_value   text,
  new_value   text,
  context     jsonb
);
create index on activity_log (entity_type, entity_id, occurred_at desc);
create index on activity_log (occurred_at desc);

create table saved_views (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  name        text not null,
  module      text not null,                 -- projects | tasks | leads | ...
  filters     jsonb not null default '{}',
  is_shared   boolean not null default false,
  created_at  timestamptz not null default now()
);

-- ───────────────────────────────────────────────────────────────────────────
-- 13. AI a automatizace (datově připraveno, chová se read+propose)
-- ───────────────────────────────────────────────────────────────────────────
create table ai_actions (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id),
  mode          text not null check (mode in ('read','propose','execute')),
  request       text not null,
  context_refs  jsonb,                       -- na které záznamy AI koukala
  proposal      jsonb,
  decision      text check (decision in ('approved','rejected','expired')),
  decided_at    timestamptz,
  executed_at   timestamptz,
  affected      jsonb,
  model         text,
  tokens_in     int,
  tokens_out    int,
  created_at    timestamptz not null default now()
);

create table automations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  is_active   boolean not null default false,
  trigger_event text not null,               -- project.status_changed | lead.stage_changed
  conditions  jsonb not null default '[]',   -- [{field,op,value}]
  actions     jsonb not null default '[]',   -- [{type,params}]
  created_by  uuid references profiles(id),
  created_at  timestamptz not null default now(),
  last_run_at timestamptz
);

create table automation_runs (
  id            bigserial primary key,
  automation_id uuid references automations(id) on delete cascade,
  triggered_at  timestamptz not null default now(),
  entity_type   text,
  entity_id     uuid,
  status        text not null check (status in ('success','skipped','failed')),
  detail        jsonb
);

-- ───────────────────────────────────────────────────────────────────────────
-- 14. Konfigurace zdraví projektu (transparentní a měnitelná)
-- ───────────────────────────────────────────────────────────────────────────
create table health_rules (
  key         text primary key,
  label       text not null,
  value_num   numeric not null,
  weight      int not null default 1,
  is_active   boolean not null default true
);

insert into health_rules (key,label,value_num,weight) values
  ('overdue_task','Úkol po termínu',1,2),
  ('overdue_task_many','3 a více úkolů po termínu',3,3),
  ('deadline_passed','Deadline projektu prošel',0,3),
  ('deadline_near_days','Deadline se blíží (dní)',7,1),
  ('no_activity_days','Bez aktivity (dní)',10,2),
  ('no_activity_days_crit','Bez aktivity kriticky (dní)',21,3),
  ('waiting_client_days','Čeká na klienta (dní)',7,2),
  ('hours_over_budget','Překročen rozpočet hodin',100,2),
  ('hours_warning_pct','Rozpočet hodin nad (%)',85,1),
  ('missing_next_action','Chybí další krok',0,2),
  ('next_action_overdue','Další krok po termínu',0,1),
  ('missing_manager','Projekt bez PM',0,1),
  ('milestone_overdue','Milník po termínu',0,2),
  ('threshold_orange','Hranice oranžové',2,0),
  ('threshold_red','Hranice červené',5,0);

-- ───────────────────────────────────────────────────────────────────────────
-- 15. Triggery updated_at
-- ───────────────────────────────────────────────────────────────────────────
do $$
declare t text;
begin
  foreach t in array array['profiles','services','clients','contacts','leads','partners',
    'projects','milestones','tasks','time_entries','meetings','notes','contracts',
    'invoices','kb_articles']
  loop
    execute format('create trigger trg_%s_updated before update on %I for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- ───────────────────────────────────────────────────────────────────────────
-- 16. Automatický activity log + last_activity_at na projektu
-- ───────────────────────────────────────────────────────────────────────────
create or replace function log_activity() returns trigger
language plpgsql security definer as $$
declare
  v_entity text := tg_argv[0];
  v_id uuid;
begin
  if tg_op = 'INSERT' then
    v_id := new.id;
    insert into activity_log (actor_id, entity_type, entity_id, action)
    values (auth.uid(), v_entity, v_id, 'created');
  elsif tg_op = 'UPDATE' then
    v_id := new.id;
    if v_entity = 'project' then
      if new.status_code is distinct from old.status_code then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'status_changed','status_code',old.status_code,new.status_code);
      end if;
      if new.phase_code is distinct from old.phase_code then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'updated','phase_code',old.phase_code,new.phase_code);
      end if;
      if new.due_on is distinct from old.due_on then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'updated','due_on',old.due_on::text,new.due_on::text);
      end if;
      if new.manager_id is distinct from old.manager_id then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'updated','manager_id',old.manager_id::text,new.manager_id::text);
      end if;
      if new.next_action is distinct from old.next_action then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'updated','next_action',old.next_action,new.next_action);
      end if;
      if new.price is distinct from old.price then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'updated','price',old.price::text,new.price::text);
      end if;
    elsif v_entity = 'task' then
      if new.status_code is distinct from old.status_code then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'status_changed','status_code',old.status_code,new.status_code);
      end if;
      if new.assignee_id is distinct from old.assignee_id then
        insert into activity_log (actor_id, entity_type, entity_id, action, field, old_value, new_value)
        values (auth.uid(), v_entity, v_id, 'updated','assignee_id',old.assignee_id::text,new.assignee_id::text);
      end if;
    else
      insert into activity_log (actor_id, entity_type, entity_id, action)
      values (auth.uid(), v_entity, v_id, 'updated');
    end if;
  elsif tg_op = 'DELETE' then
    insert into activity_log (actor_id, entity_type, entity_id, action)
    values (auth.uid(), v_entity, old.id, 'deleted');
    return old;
  end if;
  return new;
end $$;

create trigger trg_log_project after insert or update or delete on projects
  for each row execute function log_activity('project');
create trigger trg_log_task after insert or update or delete on tasks
  for each row execute function log_activity('task');
create trigger trg_log_client after insert or update or delete on clients
  for each row execute function log_activity('client');
create trigger trg_log_invoice after insert or update or delete on invoices
  for each row execute function log_activity('invoice');
create trigger trg_log_contract after insert or update or delete on contracts
  for each row execute function log_activity('contract');
create trigger trg_log_document after insert or update or delete on documents
  for each row execute function log_activity('document');

-- projekt „žije“ při jakékoliv navazující aktivitě
create or replace function touch_project() returns trigger
language plpgsql as $$
declare pid uuid;
begin
  pid := coalesce(new.project_id, old.project_id);
  if pid is not null then
    update projects set last_activity_at = now() where id = pid;
  end if;
  return coalesce(new, old);
end $$;

create trigger trg_touch_from_task after insert or update on tasks
  for each row execute function touch_project();
create trigger trg_touch_from_time after insert on time_entries
  for each row execute function touch_project();
create trigger trg_touch_from_note after insert on notes
  for each row execute function touch_project();
create trigger trg_touch_from_milestone after insert or update on milestones
  for each row execute function touch_project();

-- ───────────────────────────────────────────────────────────────────────────
-- 17. Automatické vytvoření profilu při registraci uživatele
-- ───────────────────────────────────────────────────────────────────────────
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name, email)
  values (new.id,
          coalesce(new.raw_user_meta_data->>'full_name', split_part(new.email,'@',1)),
          new.email)
  on conflict (id) do nothing;
  -- první uživatel v systému se stane ownerem, ostatní členy týmu
  insert into user_roles (user_id, role_key)
  values (new.id, case when (select count(*) from user_roles) = 0 then 'owner' else 'member' end)
  on conflict do nothing;
  return new;
end $$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
