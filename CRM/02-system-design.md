# System design — Parťák OS

Fáze B zadání. Datový model a oprávnění jsou navržené **před UI** (§72 zadání).

---

## 1. Doporučená architektura

| Vrstva | Volba | Proč právě tato |
|---|---|---|
| Databáze | **Supabase (PostgreSQL)** | Relační model, RLS = oprávnění v databázi, auth, storage, realtime a zálohy v jednom. Tým už Supabase zná (projekt Betimperium) → nulová učící křivka. |
| Auth | **Supabase Auth** (e-mail + magic link, později Google) | Sdílení dat mezi Petrem a Martinem řeší okamžitě. Klientský portál později stejný systém, jiná role. |
| API | **PostgREST (auto) + Edge Functions** | 90 % operací je CRUD → generované API. Edge Functions jen tam, kde je potřeba serverová logika (AI, integrace, webhooky Fakturoidu). |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind + shadcn/ui** | Typované schéma z DB (`supabase gen types`), komponentový systém, dobrý deploy. Vercel/Netlify zdarma pro tuto velikost. |
| Hosting | **Vercel** (frontend) + Supabase (data) | Deploy z GitHubu při každém pushi, preview prostředí pro každý PR. |
| Storage | **Google Drive jako primární** + Supabase Storage pro drobnosti | Firma v Drive už pracuje; CRM nemá být file storage (§22 zadání). Dokumenty jsou v CRM **odkazy + metadata**. |
| AI | **Claude API přes Edge Function** s uživatelským JWT | AI čte data přes stejnou RLS jako UI → nikdy nevidí víc než uživatel. |
| Automatizace | interní `automations` tabulka + volitelně Make.com přes webhooky | Firma Make.com už používá; nebudeme stavět Zapier. |

**Odmítnuté varianty a proč:**
- *Zůstat na localStorage* — nesdílí data, není bezpečné.
- *Notion jako systém* — nemá health score, závislosti úkolů, kapacitu, kontrolu oprávnění a rozbije se na reportingu. Notion má smysl jako wiki, ne jako operační systém.
- *Airtable / Monday* — měsíční náklady rostou s počtem záznamů a nedostaneš vlastní AI vrstvu ani klientský portál.
- *Lovable* — dobré na weby klientů, ne na dlouhodobě rozvíjený interní produkt s migracemi a testy.

---

## 2. Hlavní entity a vztahy

```
                       ┌─────────────┐
                       │  profiles   │ (auth.users 1:1)
                       └──┬───┬──────┘
              user_roles  │   │  project_members / assignee / owner
                          │   │
┌──────────┐   1:N   ┌────┴───┴────┐   1:N   ┌────────────┐
│ clients  ├────────►│  projects   ├────────►│   tasks    │
└────┬─────┘         └──┬───┬───┬──┘         └──┬───┬─────┘
     │ 1:N              │   │   │               │   │
     ▼                  │   │   │               │   └─ task_dependencies (task ↔ task)
┌──────────┐            │   │   └─ milestones ◄─┘
│ contacts │            │   │
└──────────┘            │   ├─ project_services ──► services ──► project_types ──► project_templates ──► template_items
                        │   ├─ project_partners ──► partners ──► partner_ratings
                        │   ├─ time_entries, notes, documents, meetings, invoices, project_costs
                        │   └─ activity_log (auto)
┌──────────┐            │
│  leads   ├── convert ─┘   (lead → client + první projekt ze šablony)
└──────────┘
```

Klíčová pravidla modelu:
- **Klient projektu je jediný zdroj pravdy.** Úkol nemá `client_id`, dostane ho přes projekt (žádná duplicita).
- **Služby jsou N:M na projekt** (`project_services`) — jeden projekt může kombinovat web + automatizaci, jak to firma reálně dělá.
- **Číselníky jsou tabulky** (`code_values`), ne enumy → admin mění stavy bez migrace, historická data drží kód, ne label.
- **Soft delete** (`deleted_at`) u business entit, hard delete jen u vazebních tabulek.
- **Provize partnera žije na projektu** (`project_partners`), ne na partnerovi — protože se liší podle zakázky, a tak to popisuje affiliate dokument.
- **`visibility`** u `notes` a `documents` (internal/shareable) — připraveno pro klientskou zónu, aniž bychom ji dnes stavěli.

Kompletní DDL: `supabase/migrations/0001_core.sql` (36 tabulek, indexy, triggery).

---

## 3. Odvozená data počítá databáze

| View / funkce | K čemu |
|---|---|
| `v_project_health` | zelená / oranžová / červená + **seznam důvodů**, podle konfigurovatelné tabulky `health_rules` |
| `v_project_hours` | skutečné vs. plánované hodiny, % vytížení rozpočtu |
| `v_project_tasks` | otevřené / po termínu / blokované úkoly |
| `v_blocked_tasks` | dopad závislostí — kdo koho blokuje |
| `v_capacity_week` | kapacita, naplánováno, volno na 7 dní |
| `v_project_finance` | cena − náklady − provize = odhad marže |
| `v_report_weekly`, `v_report_monthly` | reporting z reálných dat, nulové ruční přepisování |
| `search_all(q)` | globální hledání bez diakritiky přes 7 entit |

**Health score je deterministický** (§29 zadání): AI ho může později komentovat, ale nikdy nepočítat.

---

## 4. Oprávnění (RBAC v databázi)

| Role | rank | Vidí | Mění |
|---|---|---|---|
| `owner` | 100 | vše včetně auditu a administrace | vše |
| `management` | 80 | vše kromě administrace | projekty, klienty, finance, partnery |
| `pm` | 60 | své projekty + jejich klienty, partnery (čtení) | své projekty a jejich úkoly, zakládá klienty |
| `member` | 40 | projekty, kde je členem nebo má úkol | své úkoly, svůj čas |
| `partner` | 20 | pouze konkrétně sdílené projekty a dokumenty | nic (zatím jen čtení) |

Vynuceno **RLS politikami** (`0002_rls.sql`) přes funkce `can_see_project()`, `can_see_client()`, `can_edit_project()`, `is_manager()`. Frontend tlačítka skrývá jen kosmeticky — bezpečnost je v databázi. Views mají `security_invoker = true`, jinak by RLS obcházely.

Finance a smlouvy: **pouze `management` a výš**. Provize partnerů nevidí ani PM, který na projektu pracuje (`project_partners` čtení = `can_edit_project`, zápis = management).

---

## 5. Hlavní workflows

### 5.1 Lead → klient (s potvrzením)
```
lead(stage=offer_sent) ──► [Konvertovat] ──► potvrzovací dialog
   ├─ vytvoř clients (přenes kontakt do contacts, is_primary)
   ├─ vytvoř první projekt + vyber project_template
   ├─ instancuj template_items → tasks + milestones (offset_days od start data)
   ├─ přiřaď PM
   ├─ vytvoř onboarding checklist (interní úkoly)
   └─ lead.stage=won, converted_client_id, converted_at
```

### 5.2 Projekt → dokončeno
```
[Dokončit projekt] ──► kontrola otevřených úkolů a milníků (varování, ne blok)
   ├─ vyplň result_rating + result_note (povinné)
   ├─ status=done, completed_on=today
   ├─ vytvoř follow-up úkol +14 dní
   ├─ zkontroluj stav fakturace, nabídni „připraveno k fakturaci“
   └─ nabídni archivaci po 90 dnech
```

### 5.3 Denní rutina uživatele
```
Přehled → Moje práce dnes (úkoly, schůzky, follow-upy)
        → Rizika (červené projekty s důvodem a dalším krokem)
        → nic jiného; detail je v modulech
```

---

## 6. AI vrstva — návrh před implementací

**Režimy:** `READ` → `PROPOSE` → `EXECUTE`. Výchozí je READ + PROPOSE. EXECUTE jen po explicitním kliknutí uživatele na konkrétní návrh.

**Jak získává kontext:** Edge Function dostane JWT uživatele → volá databázi jeho jménem → RLS platí → AI fyzicky nemůže dostat data, na která uživatel nemá právo. Service role key se pro AI nikdy nepoužívá.

**Nástroje (function calling), všechny read-only:**
`get_project(id)`, `list_projects(filter)`, `get_client(id)`, `list_tasks(filter)`, `get_health(project_id)`, `list_time(project_id)`, `search(q)`.

**Proti halucinacím:**
1. AI odpovídá **jen z dodaného kontextu**; systémový prompt zakazuje domýšlet.
2. Každé tvrzení musí odkazovat na ID záznamu → UI vykreslí odkaz.
3. Čísla (hodiny, ceny, skóre) se **nikdy** nepočítají v modelu, jen se citují z views.
4. Když kontext nestačí, odpověď je „nemám data“ + nabídka co dohledat.

**Audit:** každý AI request → `ai_actions` (request, context_refs, proposal, decision, executed_at, affected). Bez záznamu se EXECUTE neprovede.

**Plánované funkce:** analýza projektu, shrnutí klienta, generátor projektu ze zadání, zpracování zápisu ze schůzky na úkoly, dotazy přirozeným jazykem. Pořadí v roadmapě.

---

## 7. Integrace (datově připraveno, implementace později)

| Integrace | Kde je hák | Poznámka |
|---|---|---|
| Google Drive | `projects.drive_url`, `documents.url` + `storage='gdrive'` | složka na projekt, pojmenování `KLIENT/PROJEKT` |
| Fakturoid | `invoices.external_id`, `external_url`, webhook na `paid_on` | firma se pro Fakturoid rozhodla 4. 2. 2026 |
| Google Calendar | `meetings.starts_at`, `duration_min` | dvoucestná synchronizace až po MVP 2 |
| Přepisy schůzek | `meetings.transcript_url` | Fireflies/Otter → AI zpracování zápisu |
| Make.com | `automations` + webhook Edge Function | firma Make.com už používá |
| Web PPP (poptávkový formulář) | insert do `leads` (source=web) | okamžitá hodnota: lead nezapadne v e-mailu |

---

## 8. Bezpečnost a GDPR

- Auth přes Supabase (hashovaná hesla, magic link), MFA lze zapnout
- Oprávnění v DB (RLS), nikdy jen ve frontendu
- Žádné API klíče ve frontendu — jen `anon key` s RLS; `service_role` pouze v Edge Functions
- Audit log automaticky triggery, ne aplikací (`activity_log`)
- Soft delete + `anonymize_client(id)` funkce pro právo na výmaz (doplnit v MVP 2)
- Zálohy: Supabase daily backup (Pro plán) + týdenní `pg_dump` do Drive
- Osobní údaje klientů: pouze to, co je potřeba pro plnění (§ minimalizace)
- Zpracovatelská smlouva se Supabase (EU region — volit **Frankfurt**)

---

## 9. Výkon

Cílové objemy (stovky klientů, tisíce projektů, desetitisíce úkolů) jsou pro Postgres triviální, pokud se drží pravidla:
- filtrování a řazení **na serveru** (PostgREST `?select=&order=&limit=`), nikdy „stáhni vše a filtruj v JS“
- stránkování 25–50 řádků
- indexy na `project_id`, `assignee_id`, `status_code`, `due_on`, `last_activity_at` (v migraci jsou)
- health score jako view; při >2 000 projektů převést na materializovaný view s refreshem po minutě
