-- ═══════════════════════════════════════════════════════════════════════════
-- PARŤÁK OS · 0005_fixes.sql
-- Dvě opravy zjištěné při ověření nasazení (kontrolní dotaz na v_project_health).
--
-- CHYBA 1: „1× blokovaný úkol“ se objevil mezi důvody, ale nepřičetl se do skóre.
--          Projekt „Nový web s objednávkami“ byl zelený se skóre 0 a přitom
--          měl vypsaný důvod. Důvod bez váhy = netransparentní skóre.
--
-- CHYBA 2: Trigger touch_project() při seedu přepsal last_activity_at na now(),
--          protože vkládání úkolů a milníků je „aktivita“. V provozu je to
--          správné chování, u seedu to znemožní otestovat pravidla
--          „bez aktivity“ a „čeká na klienta“.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── OPRAVA 1: blokovaný úkol má váhu ───────────────────────────────────────
insert into health_rules (key, label, value_num, weight)
values ('blocked_task','Blokovaný úkol', 1, 1)
on conflict (key) do update set weight = excluded.weight, is_active = true;

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
  + (case when b.blocked_tasks > 0 then health_weight('blocked_task') else 0 end)   -- ← OPRAVA 1
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

-- ── OPRAVA 2: srovnat aktivitu u ukázkových dat ────────────────────────────
-- Spustit POUZE u testovacích dat. V ostrém provozu nikdy nepřepisovat ručně.
update projects set last_activity_at = now() - interval '9 days'  where code = '2026-003';
update projects set last_activity_at = now() - interval '3 days'  where code = '2026-002';
update projects set last_activity_at = now() - interval '1 day'   where code = '2026-001';
update projects set last_activity_at = now() - interval '5 days'  where code = '2026-004';

-- ── Kontrola ───────────────────────────────────────────────────────────────
-- Očekávaný výsledek po opravě:
--   Business plán rozšíření servisu   red     7  (úkol po termínu, čeká na klienta 9 dní,
--                                                další krok po termínu, milník po termínu)
--   Marketing rozvozu — spuštění      orange  2  (chybí další krok)
--   Nový web s objednávkami           orange  2  (blokovaný úkol, deadline za 18 dní → ne)
--   Web a rezervace FitStudia         green   0
select name, health, score, reasons from v_project_health order by score desc;
