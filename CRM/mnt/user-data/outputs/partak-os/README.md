# Parťák OS — operační systém firmy

Interní systém pro řízení projektů, klientů a práce společnosti **Parťák pro podnikání**.
Hlavní objekt systému je **projekt**, klient je jeho kontext.

Repozitář obsahuje dvě vrstvy:

| Vrstva | Co to je | Stav |
|---|---|---|
| `app/` | **produkční frontend** (Next.js + Supabase) — moduly Projekty, Klienti, Rizika, Dnes | v provozu proti databázi |
| `prototype/` | **v1.2** — jednosouborová aplikace, běží v prohlížeči, data v prohlížeči | dosluhující, po nasazení `app/` k archivaci |
| `supabase/` | produkční datový model (PostgreSQL + RLS + views) | připraveno k nasazení, čeká na frontend |
| `docs/` | audit v1.1, system design, MVP a roadmapa | ke čtení před dalším krokem |

---

## 1. Rychlý start — prototyp v1.2

```bash
git clone https://github.com/<uzivatel>/partak-os.git
cd partak-os/prototype
python3 -m http.server 8080      # nebo jakýkoliv statický server
# otevři http://localhost:8080
```

### Nasazení na GitHub Pages
1. Repozitář na GitHubu → **Settings → Pages**
2. Source: **GitHub Actions**
3. Workflow `.github/workflows/pages.yml` je v repozitáři — po pushi do `main` se `prototype/` nasadí automaticky
4. Aplikace pojede na `https://<uzivatel>.github.io/partak-os/`

> **Důležité:** prototyp ukládá data do prohlížeče. Každý člověk = jiná data. Nikdy do něj nedávejte
> nic, co nesmíte ztratit, dokud neběží Supabase verze. V Admin → Data zálohujte JSON alespoň týdně.
> **Klientům odkaz nedávejte** — v prohlížeči jsou všechna data včetně cen a provizí.

Co je nového ve v1.2 proti v1.1: zdraví projektů, další krok, milníky, kontaktní osoby,
stránka Rizika, audit změn, globální hledání, Ctrl/Cmd + K, timer, snooze upozornění,
sjednocená pipeline s Notionem. Detaily v `docs/01-audit-crm-v1.1.md`.

---

## 2. Nasazení databáze (produkční verze)

```bash
# 1. Založ projekt na supabase.com — region Frankfurt (EU)
# 2. Nainstaluj CLI
npm install -g supabase
supabase link --project-ref <project-ref>

# 3. Spusť migrace
supabase db push

# 4. Vytvoř uživatele v Authentication → Users (petr@…, martin@…)
# 5. Uprav e-maily v supabase/seed.sql a spusť ho v SQL editoru
```

Struktura migrací:

| Soubor | Obsah |
|---|---|
| `0001_core.sql` | 36 tabulek, číselníky, indexy, triggery `updated_at`, automatický activity log |
| `0002_rls.sql` | RLS politiky = oprávnění vynucená databází (owner / management / pm / member / partner) |
| `0003_views.sql` | health score projektu, kapacita, finance, reporting, globální hledání |
| `0004_portal_partners.sql` | klientský portál a partneři na pozvánku, bezpečné views pro externí účty |
| `0005_fixes.sql` | opravy zdraví projektu zjištěné při ověření nasazení |
| `seed.sql` | katalog služeb, 2 projektové šablony, ukázková data v různých stavech |

Migrace jde spustit i **bez CLI** — zkopírovat obsah souborů do SQL editoru v Supabase
a spustit v pořadí 0001 → 0002 → 0003 → 0004 → seed.

Ověření po nasazení:
```sql
select name, health, score, reasons from v_project_health order by score desc;
select * from v_report_weekly;
select table_name from information_schema.tables where table_schema='public' order by 1;
```

> **Nikdy nikam neposílejte `service_role` klíč ani heslo k databázi** — ani do chatu, ani do
> frontendu. Ve frontendu se používá výhradně `anon` klíč, protože nad ním platí RLS.

---

## 3. Struktura repozitáře

```
.
├── app/                    # Next.js frontend (Projekty, Klienti, Rizika, Dnes)
├── prototype/
│   ├── index.html          # v1.2 (v1.1 + 13 chirurgických zásahů)
│   └── v12-addon.js        # rozšíření: zdraví, milníky, kontakty, paleta, timer, audit
├── supabase/
│   ├── migrations/         # 0001_core, 0002_rls, 0003_views
│   └── seed.sql
├── docs/
│   ├── 01-audit-crm-v1.1.md
│   ├── 02-system-design.md
│   ├── 03-mvp-roadmap.md
│   └── 04-rozhodnuti-a-dopady.md
└── .github/workflows/pages.yml
```

---

## 4. Pravidla dalšího rozvoje

1. **Datový model před UI.** Nová funkce začíná otázkou, jak vypadá v databázi.
2. **Migrace, ne přepisy.** Funkční části se nepřepisují bez důvodu.
3. **Change impact před větší změnou:** dotčené moduly, dopad na DB, potřeba migrace, breaking change, riziko.
4. **Oprávnění v databázi.** Skrytí tlačítka není oprávnění.
5. **Health score a čísla počítá databáze.** AI je komentuje, nepočítá.
6. **Před každou funkcí:** jaký business problém řeší, šetří čas, snižuje riziko chyby? Pokud ne, není to priorita.

## 5. Jazyk a formáty

UI česky, kód anglicky. Měna CZK, formát čísel a datumů český, časová zóna Europe/Prague
(`timestamptz` v databázi, převod v prezentační vrstvě).
