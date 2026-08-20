# MVP scope a roadmapa

---

## MVP 1 — CORE (cíl: firma přestane žít v Notionu a Excelu)

### MUST HAVE
1. Auth (e-mail + magic link), 2 uživatelé, role owner/management
2. Klienti + kontaktní osoby
3. Projekty: hlavní objekt, stavy, fáze, PM, deadline, cena, rozpočet hodin, **další krok**
4. Úkoly: 7 stavů, řešitel, termín, odhad, checklist
5. Projektové šablony → generování úkolů a milníků při zakládání projektu
6. Milníky
7. Time tracking: ruční zápis + timer
8. Dashboard „Dnes“ + stránka **Rizika** (health score z databáze)
9. Obchodní pipeline (Lead → První kontakt → Diagnostika → Nabídka → Klient) + konverze
10. Partneři včetně provizí na projektu
11. Dokumenty jako odkazy na Google Drive
12. Activity log (automatický, DB triggery)
13. Globální hledání + Ctrl/Cmd+K
14. Základní reporting (týdenní, měsíční z views)
15. RLS oprávnění

### SHOULD HAVE
- Závislosti úkolů + zobrazení dopadu
- Notifikace v aplikaci s označením přečtení
- Kapacita týmu (view existuje, dodělat UI)
- Uložené pohledy
- Import dat z v1.1 (JSON export → skript do Supabase)

### LATER (MVP 1 to nepotřebuje)
- Faktury (do té doby Fakturoid samostatně, jen odkaz)
- Smlouvy (šablony zůstávají v KB / Drive)
- Knowledge base v CRM (do té doby Notion)
- Mobilní rozhraní nad rámec responzivity

**Definition of done pro každý modul:** funkční CRUD, relace, oprávnění (test s druhým účtem), validace, loading/empty/error stav, responzivní, ověřeno na reálných datech.

---

## Roadmapa (realistická pro dvoučlenný tým s klientskou prací)

| Fáze | Obsah | Odhad práce |
|---|---|---|
| **0. Rozhodnutí** | odpovědi na otevřené otázky, název, e-maily, region Supabase | 1 sezení |
| **1. Základ** | Supabase projekt, migrace 0001–0003, seed, Next.js skeleton, auth, layout, navigace | 2–3 dny |
| **2. Klienti + kontakty + leady** | CRUD, pipeline kanban, konverze lead→klient | 2–3 dny |
| **3. Projekty** | seznam, detail se záložkami, stavy, fáze, další krok, health | 3–4 dny |
| **4. Úkoly + milníky + šablony** | generování ze šablon, závislosti, filtry | 3–4 dny |
| **5. Čas + kapacita** | timer, zápis, sumarizace, přetížení | 1–2 dny |
| **6. Partneři + provize** | evidence, zapojení na projektu, výplaty | 1–2 dny |
| **7. Dashboard + Rizika + reporting** | KPI karty, moje práce, výjimky | 2 dny |
| **8. Migrace dat** | přenos z v1.1 a z Notionu | 1 den |
| **9. QA** | oprávnění na druhém účtu, edge cases, empty states | 1–2 dny |
| **MVP 2** | notifikace (in-app + e-mail), knowledge base, katalog služeb v CRM, faktury + Fakturoid, dokumenty s Drive API | 1–2 týdny |
| **MVP 3** | AI: analýza projektu, shrnutí klienta, generátor projektu, zápisy ze schůzek, dotazy přirozeným jazykem | 1–2 týdny |
| **Future** | automation engine, klientský portál, pokročilé finance a analytika | dle priorit |

Mezitím běží **v1.2 prototyp** jako denní nástroj — nic se nezastaví.

---

## Otevřená rozhodnutí (blokují nebo významně ovlivňují architekturu)

| # | Rozhodnutí | Varianty | Dopad |
|---|---|---|---|
| 1 | **Název a domény** | Parťák pro podnikání / Startigo | Branding v aplikaci, e-maily, doména, později export z CRM |
| 2 | Kdo bude systém používat do 12 měsíců | 2 lidé / +externisté / +klienti | Rozsah RBAC a portálu |
| 3 | Klientský portál — ano/ne a kdy | vůbec / MVP 3 / Future | Zásadní pro model `visibility` a náklady |
| 4 | Fakturace | Fakturoid + odkaz / plná integrace / vlastní | Rozsah modulu Finance |
| 5 | Google Workspace | máte firemní účet? | Drive/Calendar/Gmail integrace stojí na tom |
| 6 | Kde budou dokumenty | Drive / Supabase Storage | Práva k souborům a sdílení s klientem |
| 7 | Sazby a náklady | vedeme interní nákladovou sazbu? | Marže a profitabilita v reportingu |
| 8 | Vlastní rozvoj firmy jako projekty | ano/ne | Doporučuji ano — jinak není vidět polovina práce |
| 9 | Externí partneři v systému | mají účet / neevidujeme přístup | Role `partner` a sdílení projektů |
| 10 | Hodinová sazba per projekt vs. per člověk | | Fakturace a výpočet hodnoty práce |
| 11 | Kdo je „owner“ systému (administrace, audit) | Petr / oba | Oprávnění |
| 12 | AI: rozpočet a model | Claude / OpenAI / žádné AI v MVP | Náklady a rozsah MVP 3 |

---

## Rizika

| Riziko | Dopad | Pravděpodobnost | Mitigace |
|---|---|---|---|
| Systém se postaví, ale nikdo do něj nebude psát | Vysoký — mrtvý nástroj | **Vysoká** | Jedno pravidlo: co není v CRM, neexistuje. Denní rutina 5 minut. Ostatní nástroje pro totéž vypnout. |
| Vývoj se protáhne, protože klientská práce má prioritu | Střední | Vysoká | Modul po modulu, každý použitelný samostatně. Prototyp v1.2 mezitím drží provoz. |
| Přeinženýrování (portál, AI, automatizace dřív než základ) | Vysoký | Střední | Pořadí v roadmapě je závazné. Žádná AI dřív, než jsou v systému reálná data. |
| Ztráta dat prototypu (localStorage) | Vysoký | Střední | Týdenní export JSON do Drive, dokud neběží Supabase. |
| Migrace z Notionu bude bolet | Nízký | Vysoká | Dat je málo (9 klientů, 4 leady) — přenést ručně, čistě. |
| Přejmenování firmy v půlce vývoje | Střední | Střední | Rozhodnout **před** startem; branding jako jedna konfigurace. |
| Náklady na provoz porostou | Nízký | Nízká | Supabase Free → Pro (25 $/měs) až při potřebě záloh; Vercel Hobby zdarma. |
