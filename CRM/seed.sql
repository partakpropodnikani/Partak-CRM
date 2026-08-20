-- ═══════════════════════════════════════════════════════════════════════════
-- PARŤÁK OS · seed.sql
-- Spustit PO vytvoření uživatelů v Supabase Auth (Authentication → Users).
-- Skript hledá uživatele podle e-mailu; pokud neexistuje, přeskočí ho bez chyby.
-- Uprav e-maily na skutečné firemní adresy před spuštěním.
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  u_petr   uuid;
  u_martin uuid;
  s_bp uuid; s_web uuid; s_mkt uuid; s_ucto uuid; s_pravo uuid; s_auto uuid;
  t_web uuid; t_bp uuid; t_mkt uuid;
  tpl_web uuid; tpl_bp uuid;
  c1 uuid; c2 uuid; c3 uuid;
  p1 uuid; p2 uuid; p3 uuid; p4 uuid;
  pa1 uuid; pa2 uuid; pa3 uuid;
  m1 uuid; tk1 uuid; tk2 uuid;
begin
  select id into u_petr   from auth.users where email = 'petr@partakpropodnikani.cz'   limit 1;
  select id into u_martin from auth.users where email = 'martin@partakpropodnikani.cz' limit 1;

  -- profily a role
  if u_petr is not null then
    insert into profiles (id, full_name, email, position, color, weekly_capacity_hours)
    values (u_petr,'Petr Bilanský','petr@partakpropodnikani.cz','Jednatel · obchod a strategie','#1A1814',40)
    on conflict (id) do nothing;
    insert into user_roles (user_id, role_key) values (u_petr,'owner') on conflict do nothing;
  end if;

  if u_martin is not null then
    insert into profiles (id, full_name, email, position, color, weekly_capacity_hours)
    values (u_martin,'Martin Duspiva','martin@partakpropodnikani.cz','Marketing a výkon','#A6854B',40)
    on conflict (id) do nothing;
    insert into user_roles (user_id, role_key) values (u_martin,'management') on conflict do nothing;
  end if;

  -- ── katalog služeb ───────────────────────────────────────────────────────
  insert into services (code,name,problem_solved,target_client,scope_included,scope_excluded,price_from,pricing_model,est_hours,process_summary,deliverables,benefit)
  values
   ('bp','Business plán','Podnikatel neví, jestli a jak záměr dává ekonomicky smysl.','Začínající podnikatelé a firmy před investicí.','Analýza trhu, business model, finanční model, rizika, akční plán.','Realizaci opatření, průběžné vedení firmy.',25000,'fixed',20,'Intake → analýza → draft → zpětná vazba → finalizace → prezentace.','Dokument business plánu + prezentační schůzka.','Rozhodnutí podložené čísly místo pocitů.'),
   ('web','Web, který prodává','Web nepřináší poptávky, působí zastarale, nejde měřit.','SME, které chtějí z webu obchodní kanál.','Struktura, texty, design, implementace, základní SEO a měření.','Dlouhodobou tvorbu obsahu, placené kampaně.',45000,'fixed',40,'Zadání → analýza → wireframe → texty → design → implementace → QA → předání.','Funkční web + předávací dokumentace.','Web začne nosit poptávky.'),
   ('mkt','Marketingová strategie a kampaně','Marketing se dělá nahodile, bez čísel a bez výsledků.','Firmy, které chtějí předvídatelný přísun poptávek.','Strategie, kanály, nastavení kampaní, KPI, vyhodnocení.','Kreativní produkci velkého rozsahu (řeší partner).',15000,'retainer',12,'Audit → strategie → schválení → nastavení → měsíční vyhodnocení.','Strategie + běžící kampaně + měsíční report.','Předvídatelný přísun poptávek s jasnou cenou.'),
   ('ucto','Účetnictví a daně (přes partnera)','Podnikatel řeší účetnictví nahodile a pozdě.','Malé firmy a OSVČ.','Zprostředkování a koordinace účetní, kontrola procesu.','Samotné vedení účetnictví (dělá partner).',500,'custom',2,'Předání partnerovi → nastavení procesu → kontrola.','Fungující účetní proces.','Klid a soulad se zákonem.'),
   ('pravo','Právní služby (přes partnera)','Chybí smlouvy, podmínky, ochrana firmy.','Firmy před smluvním vztahem nebo v konfliktu.','Zadání, koordinace právníka, revize dokumentů.','Zastupování před soudem.',3000,'custom',3,'Definice potřeby → partner → revize → předání.','Právní dokument nebo stanovisko.','Firma není v riziku.'),
   ('auto','Automatizace a AI','Ruční práce a chyby v opakovaných procesech.','Firmy s opakovanou administrativou.','Analýza procesu, návrh, implementace, zaškolení.','Vývoj rozsáhlého vlastního softwaru.',20000,'fixed',24,'Sběr požadavků → návrh → implementace → test → školení.','Běžící automatizace + dokumentace.','Ušetřené hodiny každý měsíc.')
  on conflict (code) do nothing;

  select id into s_bp from services where code='bp';
  select id into s_web from services where code='web';
  select id into s_mkt from services where code='mkt';
  select id into s_ucto from services where code='ucto';
  select id into s_pravo from services where code='pravo';
  select id into s_auto from services where code='auto';

  -- ── typy projektů ────────────────────────────────────────────────────────
  insert into project_types (code,name,service_id,sort_order) values
   ('bp','Business plán',s_bp,10),
   ('web','Web',s_web,20),
   ('mkt','Marketing',s_mkt,30),
   ('ucto','Účetnictví',s_ucto,40),
   ('pravo','Právní služby',s_pravo,50),
   ('auto','Automatizace / AI',s_auto,60),
   ('krize','Krizový management',null,70),
   ('procesy','Procesy',null,80),
   ('partner','Partnerství',null,90),
   ('jine','Ostatní',null,100)
  on conflict (code) do nothing;

  select id into t_web from project_types where code='web';
  select id into t_bp  from project_types where code='bp';
  select id into t_mkt from project_types where code='mkt';

  -- ── projektové šablony ───────────────────────────────────────────────────
  insert into project_templates (project_type_id,name,description,default_hours)
  values (t_web,'Web — standardní průběh','Od zadání po předání webu.',40)
  returning id into tpl_web;

  insert into template_items (template_id,kind,title,phase_code,est_hours,role_hint,offset_days,seq) values
   (tpl_web,'task','Získat zadání od klienta','intake',2,'PM',0,10),
   (tpl_web,'task','Analyzovat současný web a konkurenci','analysis',3,'Marketing',3,20),
   (tpl_web,'milestone','Schválený wireframe','solution',null,null,10,30),
   (tpl_web,'task','Vytvořit wireframe','solution',5,'Marketing',7,40),
   (tpl_web,'task','Připravit texty','prep',6,'PM',14,50),
   (tpl_web,'milestone','Schválené texty a design','prep',null,null,21,60),
   (tpl_web,'task','Vytvořit design','delivery',8,'Design partner',21,70),
   (tpl_web,'task','Implementace','delivery',10,'IT',28,80),
   (tpl_web,'task','Interní QA','qa',3,'PM',33,90),
   (tpl_web,'milestone','Spuštění webu','handover',null,null,38,100),
   (tpl_web,'task','Předání a zaškolení klienta','handover',2,'PM',38,110),
   (tpl_web,'task','Vyhodnocení po 30 dnech','review',1,'PM',68,120),
   (tpl_web,'input','Podklady od klienta: logo, fotky, texty','intake',null,null,0,130),
   (tpl_web,'document','Brief pro web','intake',null,null,0,140);

  insert into project_templates (project_type_id,name,description,default_hours)
  values (t_bp,'Business plán — standardní průběh','Od intake po prezentaci plánu.',20)
  returning id into tpl_bp;

  insert into template_items (template_id,kind,title,phase_code,est_hours,role_hint,offset_days,seq) values
   (tpl_bp,'task','Intake schůzka a sběr podkladů','intake',2,'PM',0,10),
   (tpl_bp,'task','Analýza trhu a konkurence','analysis',4,'PM',5,20),
   (tpl_bp,'task','Definice business modelu','solution',3,'PM',10,30),
   (tpl_bp,'milestone','Odsouhlasený business model','solution',null,null,12,40),
   (tpl_bp,'task','Finanční model a cashflow','solution',6,'Finance',15,50),
   (tpl_bp,'task','Rizika a mitigace','solution',2,'PM',18,60),
   (tpl_bp,'task','Draft business plánu','delivery',4,'PM',21,70),
   (tpl_bp,'task','Zpětná vazba klienta','qa',1,'PM',25,80),
   (tpl_bp,'milestone','Finální business plán','handover',null,null,30,90),
   (tpl_bp,'task','Prezentace klientovi','handover',2,'PM',30,100);

  -- ── partneři ─────────────────────────────────────────────────────────────
  insert into partners (name,category_code,specialization,email,commission_pct,payout_mode,capacity_projects,owner_id,status,notes)
  values ('Ing. Jana Krejčí','accounting','Účetnictví, daně','krejci@example.cz',15,'invoice',2,u_petr,'active','Rychlá, spolehlivá.')
  returning id into pa1;
  insert into partners (name,category_code,specialization,email,commission_pct,payout_mode,capacity_projects,owner_id,status,notes)
  values ('Mgr. Filip Dvořák','legal','Právo, smlouvy','dvorak@example.cz',10,'invoice',3,u_petr,'active','Korporátní právo, obchodní podmínky.')
  returning id into pa2;
  insert into partners (name,category_code,specialization,email,commission_pct,payout_mode,capacity_projects,owner_id,status,notes)
  values ('Marketingové duo (Filip + Viktor)','marketing','Výkonnostní marketing, kampaně','marketing@example.cz',15,'via_us',2,u_petr,'testing','Kvalita spolupráce A. Zatím jedna společná zakázka.')
  returning id into pa3;

  -- ── klienti (ukázková data pro testování dashboardu) ─────────────────────
  insert into clients (name,reg_no,industry_code,package_code,source_code,acquired_on,owner_id,relationship_status,notes)
  values ('ABC Digital s.r.o.','08812345','other','s3','referral',current_date-64,u_petr,'active','Rodinná firma, chce růst přes e-shop.')
  returning id into c1;
  insert into clients (name,reg_no,industry_code,package_code,source_code,acquired_on,owner_id,relationship_status,notes)
  values ('AutoServis Malý','17223344','other','s2','web',current_date-31,u_petr,'active','Servis v Brně, řeší nábor a kapacitu.')
  returning id into c2;
  insert into clients (name,reg_no,industry_code,package_code,source_code,acquired_on,owner_id,relationship_status,notes)
  values ('FitStudio Lita','21334455','other','s1','social',current_date-12,coalesce(u_martin,u_petr),'active','Slabá online prezentace, silné reference.')
  returning id into c3;

  insert into contacts (client_id,full_name,role_title,email,phone,is_primary) values
   (c1,'Jana Nováková','Jednatel / majitel','jana@example.cz','+420 723 111 222',true),
   (c1,'Petr Novák','Provoz','provoz@example.cz','+420 723 111 333',false),
   (c2,'Tomáš Malý','Jednatel / majitel','tomas@example.cz','+420 605 333 444',true),
   (c3,'Lucie Tichá','Jednatel / majitel','lucie@example.cz','+420 776 555 666',true);

  -- ── projekty v různých stavech (kvůli testu dashboardu a zdraví) ─────────
  insert into projects (code,name,client_id,project_type_id,template_id,expected_result,status_code,phase_code,priority_code,
                        manager_id,next_action,next_action_on,started_on,due_on,price,pricing_model,hourly_rate,planned_hours,
                        invoiced_amount,invoice_status_code,last_activity_at)
  values ('2026-001','Nový web s objednávkami',c1,t_web,tpl_web,'Funkční web s online objednávkou a měřením.','running','delivery','high',
          u_petr,'Projít texty s klientkou a odsouhlasit finální verzi',current_date+2,current_date-40,current_date+18,68000,'fixed',1200,48,
          34000,'partial',now()-interval '1 day')
  returning id into p1;

  insert into projects (code,name,client_id,project_type_id,expected_result,status_code,phase_code,priority_code,
                        manager_id,started_on,due_on,price,pricing_model,hourly_rate,planned_hours,invoice_status_code,last_activity_at)
  values ('2026-002','Marketing rozvozu — spuštění',c1,t_mkt,'Spustit kampaně, cíl 120 objednávek/měsíc do 90 dnů.','prep','offer','normal',
          coalesce(u_martin,u_petr),current_date-10,current_date+32,15000,'retainer',1200,12,'none',now()-interval '3 days')
  returning id into p2;   -- záměrně bez dalšího kroku → oranžová

  insert into projects (code,name,client_id,project_type_id,template_id,expected_result,status_code,phase_code,priority_code,
                        manager_id,next_action,next_action_on,started_on,due_on,price,pricing_model,hourly_rate,planned_hours,
                        invoiced_amount,invoice_status_code,last_activity_at)
  values ('2026-003','Business plán rozšíření servisu',c2,t_bp,tpl_bp,'Rozhodnutí o druhé provozovně podložené čísly.','waiting_client','analysis','high',
          u_petr,'Urgovat mzdové podklady telefonicky',current_date-1,current_date-24,current_date+10,32000,'fixed',1300,24,
          16000,'partial',now()-interval '9 days')
  returning id into p3;   -- čeká na klienta 9 dní + další krok po termínu → červená

  insert into projects (code,name,client_id,project_type_id,expected_result,status_code,phase_code,priority_code,
                        manager_id,next_action,next_action_on,started_on,due_on,price,pricing_model,planned_hours,invoice_status_code,last_activity_at)
  values ('2026-004','Web a rezervace FitStudia',c3,t_web,'Web s online rezervací lekcí.','prep','intake','normal',
          u_petr,'Provést intake schůzku a sepsat zadání',current_date+3,current_date-5,current_date+45,52000,'fixed',40,'none',now()-interval '5 days')
  returning id into p4;

  insert into project_services (project_id,service_id) values (p1,s_web),(p2,s_mkt),(p3,s_bp),(p4,s_web),(p4,s_auto);

  if u_martin is not null then
    insert into project_members (project_id,user_id,role_hint) values (p1,u_martin,'Marketing'),(p2,u_martin,'Marketing');
  end if;

  insert into project_partners (project_id,partner_id,order_value,commission_pct,commission_status,note)
  values (p1,pa3,12000,15,'pending','Bannery a kampaň k launchi'),
         (p3,pa1,null,15,'pending','Konzultace daňových dopadů');

  -- ── milníky ──────────────────────────────────────────────────────────────
  insert into milestones (project_id,title,due_on,is_done,done_on,seq) values
   (p1,'Schválený wireframe',current_date-14,true,current_date-14,10),
   (p1,'Schválené texty a design',current_date+3,false,null,20),
   (p1,'Spuštění webu',current_date+18,false,null,30),
   (p3,'Odsouhlasený business model',current_date-3,false,null,10)  -- po termínu → přispěje do zdraví
  ;

  select id into m1 from milestones where project_id=p1 and title='Schválené texty a design';

  -- ── úkoly včetně závislosti ──────────────────────────────────────────────
  insert into tasks (project_id,milestone_id,title,assignee_id,status_code,priority_code,due_on,est_hours,from_template)
  values (p1,m1,'Schválit texty s klientem',u_petr,'doing','high',current_date+2,1,true)
  returning id into tk1;

  insert into tasks (project_id,title,assignee_id,status_code,priority_code,due_on,est_hours,from_template,waiting_for)
  values (p1,'Implementace košíku a plateb',coalesce(u_martin,u_petr),'blocked','high',current_date+9,10,true,'čeká na schválení textů')
  returning id into tk2;

  insert into task_dependencies (task_id,depends_on_id) values (tk2,tk1);

  insert into tasks (project_id,title,assignee_id,status_code,priority_code,due_on,est_hours,from_template) values
   (p2,'Rozpočet a KPI kampaní',coalesce(u_martin,u_petr),'planned','normal',current_date+4,3,true),
   (p3,'Urgovat mzdové podklady',u_petr,'waiting','high',current_date-1,0.5,false),
   (p3,'Finanční model — návratnost',u_petr,'planned','high',current_date+6,6,true),
   (p4,'Intake schůzka — zadání webu',u_petr,'planned','normal',current_date+3,2,true);

  insert into tasks (kind,title,assignee_id,status_code,priority_code,due_on,est_hours) values
   ('internal','Dodělat cenotvorbu balíčků S1–S4',u_petr,'doing','high',current_date+5,4),
   ('sales','Zavolat lead z networkingu',coalesce(u_martin,u_petr),'planned','normal',current_date+1,0.5);

  -- ── čas ──────────────────────────────────────────────────────────────────
  insert into time_entries (user_id,project_id,entry_date,hours,note,billable) values
   (coalesce(u_martin,u_petr),p1,current_date-15,6,'Design homepage',true),
   (coalesce(u_martin,u_petr),p1,current_date-8,5,'Design podstránek',true),
   (u_petr,p1,current_date-3,2,'Texty s klientkou',true),
   (u_petr,p3,current_date-14,5,'Analýza trhu',true),
   (u_petr,p3,current_date-10,4,'Struktura finančního modelu',true);

  -- ── leady (fáze podle skutečné pipeline) ─────────────────────────────────
  insert into leads (title,company,contact_name,email,stage_code,source_code,estimated_value,owner_id,next_action,next_action_on,notes) values
   ('Kavárna Dolce','Dolce coffee s.r.o.','Marek Šindelář','marek@example.cz','first_contact','networking',50000,coalesce(u_martin,u_petr),'První schůzka',current_date+4,'Dvě kavárny, nulový online prodej.'),
   ('Truhlářství Beran','Truhlářství Beran','Josef Beran','info@example.cz','diagnostics','referral',20000,u_petr,'Poslat shrnutí analýzy',current_date-1,'Doporučení od klienta.'),
   ('Jazyková škola Mluvit','Mluvit s.r.o.','Eva Horká','eva@example.cz','lead','web',30000,u_petr,null,null,'Poptávka z webu — bez dalšího kroku, objeví se v Rizicích.'),
   ('E-shop KrmivoPro','KrmivoPro s.r.o.','David Vlk','david@example.cz','offer_sent','social',45000,coalesce(u_martin,u_petr),'Follow-up nabídky',current_date+2,'Nabídka odeslána.');

  -- ── schůzky ──────────────────────────────────────────────────────────────
  insert into meetings (title,client_id,project_id,kind,starts_at,duration_min,agenda,owner_id) values
   ('Schválení textů webu',c1,p1,'client',(current_date+2)::timestamptz + interval '10 hours',60,'Projít texty stránku po stránce.',u_petr),
   ('Týdenní porada',null,null,'internal',(current_date+1)::timestamptz + interval '8 hours 30 minutes',45,'Priority týdne, kapacita, obchod.',u_petr),
   ('Intake FitStudio',c3,p4,'client',(current_date+3)::timestamptz + interval '14 hours',90,'Zadání webu, rezervační systém.',u_petr);

  -- ── faktury ──────────────────────────────────────────────────────────────
  insert into invoices (number,project_id,client_id,amount,issued_on,due_on,paid_on,status) values
   ('2026-021',p1,c1,34000,current_date-30,current_date-16,current_date-18,'paid'),
   ('2026-027',p3,c2,16000,current_date-2,current_date+12,null,'issued');

  -- ── smlouvy ──────────────────────────────────────────────────────────────
  insert into contracts (party_type,client_id,contract_type,status,signed_on) values
   ('client',c1,'GDPR – zpracování osobních údajů','signed',current_date-60),
   ('client',c1,'Podmínky spolupráce','signed',current_date-60);
  insert into contracts (party_type,partner_id,contract_type,status) values
   ('partner',pa3,'Partnerská smlouva o provizi','sent');

  -- ── knowledge base ───────────────────────────────────────────────────────
  insert into kb_articles (title,category,body,author_id,service_id) values
   ('Jak vést intake','Procesy',E'1. Nech klienta mluvit.\n2. Ptej se na čísla: obrat, marže, zdroje zakázek.\n3. Zjisti, jak vypadá úspěch za 12 měsíců.\n4. Do 48 hodin pošli shrnutí a další krok.',u_petr,null),
   ('Jak připravit nabídku','Obchod',E'1. Situace klienta jeho slovy.\n2. Co doporučujeme a proč.\n3. Rozsah: obsahuje / neobsahuje.\n4. Cena a podmínky.\n5. Harmonogram.\n6. Další krok s termínem.\n\nPravidlo: nabídka odchází do 5 pracovních dnů od analýzy.',u_petr,null),
   ('Jak řídit projekt','Procesy',E'1. Každý projekt má PM, deadline a rozpočet hodin.\n2. Každý projekt má vždy definovaný další krok.\n3. Fáze se posouvá jen při splnění podmínek předchozí.\n4. Čekání na klienta se urguje po 5 dnech.\n5. Čas se píše průběžně.',u_petr,null),
   ('Affiliate a provize partnerům','Obchod',E'1. Provize se eviduje na projektu u konkrétního partnera.\n2. Nárok vzniká po uhrazení klientem.\n3. Výplatní cyklus 1× měsíčně.\n4. Partner ručí za kvalitu výstupu.',u_petr,null);

  raise notice 'Seed hotov. Uživatelé: petr=% martin=%', u_petr, u_martin;
end $$;
