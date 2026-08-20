-- ═══════════════════════════════════════════════════════════════════════════
-- PARŤÁK OS · 0003_views.sql
-- Odvozená data počítá databáze, ne frontend. Reporting nikdy nepřepisuje čísla ručně.
-- POZOR: všechny views mají security_invoker = true, aby platila RLS volajícího
--        uživatele (bez toho by view obcházel oprávnění).
-- ═══════════════════════════════════════════════════════════════════════════

-- ───────────────────────────────────────────────────────────────────────────
-- 1. Hodiny a otevřené úkoly na projektu
-- ───────────────────────────────────────────────────────────────────────────
create or replace view v_project_hours with (security_invoker = true) as
select p.id as project_id,
       coalesce(sum(te.hours), 0)                                    as actual_hours,
       coalesce(sum(te.hours) filter (where te.billable), 0)         as billable_hours,
       p.planned_hours,
       case when coalesce(p.planned_hours,0) > 0
            then round(coalesce(sum(te.hours),0) / p.planned_hours * 100, 1) end as hours_pct
from projects p
left join time_entries te on te.project_id = p.id
where p.deleted_at is null
group by p.id, p.planned_hours;

create or replace view v_project_tasks with (security_invoker = true) as
select p.id as project_id,
       count(t.id) filter (where t.status_code not in ('done','cancelled'))            as open_tasks,
       count(t.id) filter (where t.status_code not in ('done','cancelled')
                             and t.due_on < current_date)                             as overdue_tasks,
       count(t.id) filter (where t.status_code = 'blocked')                            as blocked_tasks,
       count(t.id) filter (where t.status_code = 'done')                               as done_tasks
from projects p
left join tasks t on t.project_id = p.id and t.deleted_at is null
where p.deleted_at is null
group by p.id;

-- ───────────────────────────────────────────────────────────────────────────
-- 2. ZDRAVÍ PROJEKTU — deterministicky, podle tabulky health_rules
-- ───────────────────────────────────────────────────────────────────────────
create or replace function health_rule(p_key text) returns numeric
language sql stable security definer set search_path = public as $$
  select value_num from health_rules where key = p_key and is_active;
$$;

create or replace function health_weight(p_key text) returns int
language sql stable security definer set search_path = public as $$
  select weight from health_rules where key = p_key and is_active;
$$;

create or replace view v_project_health with (security_invoker = true) as
with base as (
  select p.id,
         p.name,
         p.client_id,
         p.status_code,
         p.manager_id,
         p.due_on,
         p.next_action,
         p.next_action_on,
         p.last_activity_at,
         extract(day from now() - p.last_activity_at)::int          as days_idle,
         (p.due_on - current_date)                                  as days_to_due,
         pt.overdue_tasks,
         pt.blocked_tasks,
         ph.actual_hours,
         ph.hours_pct,
         (select count(*) from milestones m
           where m.project_id = p.id and not m.is_done and m.due_on < current_date) as overdue_milestones
  from projects p
  left join v_project_tasks pt on pt.project_id = p.id
  left join v_project_hours ph on ph.project_id = p.id
  where p.deleted_at is null
    and p.status_code not in ('done','cancelled','archived')
),
scored as (
  select b.*,
    (case when b.overdue_tasks >= health_rule('overdue_task_many') then health_weight('overdue_task_many')
          when b.overdue_tasks >= 1 then health_weight('overdue_task') else 0 end)
  + (case when b.days_to_due is not null and b.days_to_due < 0 then health_weight('deadline_passed')
          when b.days_to_due is not null and b.days_to_due <= health_rule('deadline_near_days') then health_weight('deadline_near_days')
          else 0 end)
  + (case when b.days_idle >= health_rule('no_activity_days_crit') then health_weight('no_activity_days_crit')
          when b.days_idle >= health_rule('no_activity_days') then health_weight('no_activity_days')
          else 0 end)
  + (case when b.status_code = 'waiting_client' and b.days_idle >= health_rule('waiting_client_days')
          then health_weight('waiting_client_days') else 0 end)
  + (case when b.hours_pct > health_rule('hours_over_budget') then health_weight('hours_over_budget')
          when b.hours_pct >= health_rule('hours_warning_pct') then health_weight('hours_warning_pct')
          else 0 end)
  + (case when b.next_action is null or btrim(b.next_action) = '' then health_weight('missing_next_action')
          when b.next_action_on is not null and b.next_action_on < current_date then health_weight('next_action_overdue')
          else 0 end)
  + (case when b.manager_id is null then health_weight('missing_manager') else 0 end)
  + (case when b.overdue_milestones > 0 then health_weight('milestone_overdue') else 0 end)
    as score
  from base b
)
select s.*,
  case when s.score >= health_rule('threshold_red') then 'red'
       when s.score >= health_rule('threshold_orange') then 'orange'
       else 'green' end as health,
  array_remove(array[
    case when s.overdue_tasks >= 1 then s.overdue_tasks || '× úkol po termínu' end,
    case when s.days_to_due < 0 then 'deadline prošel o ' || abs(s.days_to_due) || ' dní'
         when s.days_to_due <= health_rule('deadline_near_days') then 'deadline za ' || s.days_to_due || ' dní' end,
    case when s.days_idle >= health_rule('no_activity_days') then 'bez aktivity ' || s.days_idle || ' dní' end,
    case when s.status_code = 'waiting_client' and s.days_idle >= health_rule('waiting_client_days')
         then 'čeká na klienta ' || s.days_idle || ' dní' end,
    case when s.hours_pct > health_rule('hours_over_budget') then 'překročen rozpočet hodin (' || s.hours_pct || ' %)'
         when s.hours_pct >= health_rule('hours_warning_pct') then 'rozpočet hodin na ' || s.hours_pct || ' %' end,
    case when s.next_action is null or btrim(s.next_action) = '' then 'chybí další krok'
         when s.next_action_on < current_date then 'další krok po termínu' end,
    case when s.manager_id is null then 'bez projektového manažera' end,
    case when s.overdue_milestones > 0 then s.overdue_milestones || '× milník po termínu' end,
    case when s.blocked_tasks > 0 then s.blocked_tasks || '× blokovaný úkol' end
  ], null) as reasons
from scored s;

-- ───────────────────────────────────────────────────────────────────────────
-- 3. Moje práce — dnes a tento týden
-- ───────────────────────────────────────────────────────────────────────────
create or replace view v_my_today with (security_invoker = true) as
select t.id, t.title, t.due_on, t.priority_code, t.status_code,
       p.id as project_id, p.name as project_name, c.name as client_name,
       case when t.due_on < current_date then 'overdue'
            when t.due_on = current_date then 'today' else 'upcoming' end as bucket
from tasks t
left join projects p on p.id = t.project_id
left join clients c on c.id = p.client_id
where t.deleted_at is null
  and t.assignee_id = auth.uid()
  and t.status_code not in ('done','cancelled')
  and (t.due_on is null or t.due_on <= current_date + 7);

create or replace view v_capacity_week with (security_invoker = true) as
select pr.id as user_id,
       pr.full_name,
       pr.weekly_capacity_hours,
       coalesce(sum(t.est_hours) filter (
         where t.status_code not in ('done','cancelled')
           and t.due_on between current_date and current_date + 7), 0) as planned_hours_7d,
       coalesce((select sum(te.hours) from time_entries te
                 where te.user_id = pr.id
                   and te.entry_date >= date_trunc('week', current_date)::date), 0) as logged_hours_this_week,
       coalesce(pr.weekly_capacity_hours, 0) - coalesce(sum(t.est_hours) filter (
         where t.status_code not in ('done','cancelled')
           and t.due_on between current_date and current_date + 7), 0) as free_hours
from profiles pr
left join tasks t on t.assignee_id = pr.id and t.deleted_at is null
where pr.status = 'active'
group by pr.id, pr.full_name, pr.weekly_capacity_hours;

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Blokované úkoly (dopad závislostí)
-- ───────────────────────────────────────────────────────────────────────────
create or replace view v_blocked_tasks with (security_invoker = true) as
select t.id            as task_id,
       t.title         as task_title,
       t.project_id,
       b.id            as blocked_by_id,
       b.title         as blocked_by_title,
       b.status_code   as blocked_by_status,
       b.assignee_id   as blocked_by_assignee,
       b.due_on        as blocked_by_due
from tasks t
join task_dependencies d on d.task_id = t.id
join tasks b on b.id = d.depends_on_id
where t.deleted_at is null
  and b.status_code not in ('done','cancelled');

-- ───────────────────────────────────────────────────────────────────────────
-- 5. Finance projektu — marže včetně provizí partnerům
-- ───────────────────────────────────────────────────────────────────────────
create or replace view v_project_finance with (security_invoker = true) as
select p.id as project_id,
       p.name,
       p.price,
       p.pricing_model,
       p.invoiced_amount,
       coalesce((select sum(i.amount) from invoices i where i.project_id = p.id and i.status = 'paid'), 0) as paid_amount,
       coalesce((select sum(pc.amount) from project_costs pc where pc.project_id = p.id), 0)              as direct_costs,
       coalesce((select sum(pp.commission_amount) from project_partners pp where pp.project_id = p.id), 0) as partner_commissions,
       ph.actual_hours,
       case when p.hourly_rate is not null then round(ph.actual_hours * p.hourly_rate, 2) end             as hours_value,
       p.price
       - coalesce((select sum(pc.amount) from project_costs pc where pc.project_id = p.id), 0)
       + coalesce((select sum(pp.commission_amount) from project_partners pp where pp.project_id = p.id), 0)
         as gross_margin_estimate
from projects p
left join v_project_hours ph on ph.project_id = p.id
where p.deleted_at is null;

-- ───────────────────────────────────────────────────────────────────────────
-- 6. Reporting — týdenní a měsíční
-- ───────────────────────────────────────────────────────────────────────────
create or replace view v_report_weekly with (security_invoker = true) as
select date_trunc('week', current_date)::date as week_start,
  (select count(*) from leads l where l.created_at >= date_trunc('week', current_date)) as new_leads,
  (select count(*) from projects p where p.created_at >= date_trunc('week', current_date) and p.deleted_at is null) as new_projects,
  (select count(*) from projects p where p.completed_on >= date_trunc('week', current_date)::date) as completed_projects,
  (select count(*) from projects p where p.status_code not in ('done','cancelled','archived') and p.deleted_at is null) as active_projects,
  (select count(*) from v_project_health h where h.health = 'red') as projects_at_risk,
  (select count(*) from tasks t where t.deleted_at is null and t.status_code not in ('done','cancelled') and t.due_on < current_date) as overdue_tasks,
  (select coalesce(sum(te.hours),0) from time_entries te where te.entry_date >= date_trunc('week', current_date)::date) as hours_logged;

create or replace view v_report_monthly with (security_invoker = true) as
select date_trunc('month', current_date)::date as month_start,
  (select count(*) from clients c where c.relationship_status = 'active' and c.deleted_at is null) as active_clients,
  (select count(*) from projects p where p.created_at >= date_trunc('month', current_date) and p.deleted_at is null) as new_projects,
  (select count(*) from projects p where p.completed_on >= date_trunc('month', current_date)::date) as completed_projects,
  (select coalesce(sum(i.amount),0) from invoices i where i.issued_on >= date_trunc('month', current_date)::date) as invoiced_amount,
  (select coalesce(sum(i.amount),0) from invoices i where i.paid_on   >= date_trunc('month', current_date)::date) as paid_amount,
  (select coalesce(sum(te.hours),0) from time_entries te where te.entry_date >= date_trunc('month', current_date)::date) as hours_logged,
  (select coalesce(sum(pp.commission_amount),0) from project_partners pp
     where pp.commission_status in ('approved','paid') and pp.created_at >= date_trunc('month', current_date)) as partner_commissions;

-- ───────────────────────────────────────────────────────────────────────────
-- 7. Globální hledání (jeden dotaz přes všechny entity)
-- ───────────────────────────────────────────────────────────────────────────
create or replace view v_search with (security_invoker = true) as
select 'project'::text as entity, p.id, p.name as title,
       coalesce(c.name,'') as subtitle, p.updated_at
from projects p left join clients c on c.id = p.client_id where p.deleted_at is null
union all
select 'client', c.id, c.name, coalesce(c.industry_code,''), c.updated_at
from clients c where c.deleted_at is null
union all
select 'contact', ct.id, ct.full_name, coalesce(cl.name,''), ct.updated_at
from contacts ct join clients cl on cl.id = ct.client_id where ct.deleted_at is null
union all
select 'lead', l.id, l.title, coalesce(l.company,''), l.updated_at
from leads l where l.deleted_at is null
union all
select 'task', t.id, t.title, coalesce(p.name,''), t.updated_at
from tasks t left join projects p on p.id = t.project_id where t.deleted_at is null
union all
select 'partner', pa.id, pa.name, coalesce(pa.specialization,''), pa.updated_at
from partners pa where pa.deleted_at is null
union all
select 'kb', k.id, k.title, k.category, k.updated_at
from kb_articles k where k.deleted_at is null;

-- pomocná funkce pro hledání bez diakritiky
create or replace function search_all(q text)
returns table (entity text, id uuid, title text, subtitle text, updated_at timestamptz)
language sql stable security invoker as $$
  select v.entity, v.id, v.title, v.subtitle, v.updated_at
  from v_search v
  where unaccent(lower(v.title)) like '%' || unaccent(lower(q)) || '%'
     or unaccent(lower(v.subtitle)) like '%' || unaccent(lower(q)) || '%'
  order by v.updated_at desc
  limit 40;
$$;
