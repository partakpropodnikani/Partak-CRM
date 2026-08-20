# Rozhodnutí a jejich dopad na architekturu

Zapsáno: 17. 8. 2026. Toto je závazný vstup pro implementaci. Když se rozhodnutí změní, mění se i model — proto je vedeme písemně.

---

## Přehled rozhodnutí

| # | Otázka | Rozhodnutí | Dopad na systém |
|---|---|---|---|
| 1 | Název | **Parťák pro podnikání** zůstává | Branding zůstává; „Startigo“ vedeme jako možnou budoucí značku, ne jako změnu teď |
| 2 | Klientský portál | **Ano** | Zásadní. Vyžaduje externí identity, `visibility` u dokumentů a poznámek, samostatné views (migrace 0004) |
| 3 | Uživatelé do 12 měsíců | tým ~5, partneři 5–10, **klienti 100+** | RBAC musí být plnohodnotný hned. 100+ klientů = portál je masový, ne výjimka |
| 4 | Fakturace | **neintegrovat**, zatím jen přehled | `invoices` zůstává jednoduchá, `external_url` vyplňujeme ručně. Integrace až později |
| 5 | Google Workspace | máme, **bez struktury** | Navrhuji strukturu Drive níže; CRM na ni odkazuje, nespravuje ji |
| 6 | Interní nákladová sazba | **pro přehled** | `profiles.internal_cost_rate` zůstává, marže je orientační, ne účetní |
| 7 | Hodinová sazba | **per projekt** | `projects.hourly_rate` je zdroj pravdy; sazba u člověka se nepoužívá |
| 8 | Vlastní rozvoj jako projekty | *dotaz* → vysvětleno níže | Doporučeno ano, čeká na potvrzení |
| 9 | Externí partneři | **registrace na pozvánku** | Tabulka `invitations`, spotřebuje se při registraci, role `partner` |
| 10 | AI rozpočet | **není** | AI se odkládá. Model zůstává připravený (`ai_actions`), nic se nestaví |

---

## Poznámka k „jednomu ekosystému“ (reakce na bod 4)

Souhlas s cílem — a proto je Fakturoid nakonec ta správná integrace, ne opačná.
Rozdíl je v pořadí: **nejdřív musí být v systému práce, projekty a klienti**, protože z nich faktura
vzniká. Když se začne fakturací, vznikne účetní nástroj, který nikdo nepoužívá k řízení práce.

Praktický postup do jednoho ekosystému:
1. Teď: faktura je v CRM **záznam s odkazem** (číslo, částka, splatnost, stav, URL do Fakturoidu). Ručně, 20 sekund na fakturu.
2. Po MVP 1: **jednosměrné napojení** — z projektu se vygeneruje podklad, Fakturoid vystaví.
3. Později: **webhook** z Fakturoidu → CRM samo označí zaplaceno a spustí provizi partnerovi.

Model to už teď umožňuje (`invoices.external_id`, `external_url`, `paid_on`), takže se nic nepřepisuje — jen se zapne.

---

## Odpověď na otázku 8: co znamená „vlastní rozvoj jako projekty“

Dnes máte v Notionu úkoly typu *Nastavit socky*, *Upravit PPP web*, *Marketing — nutné sehnat lidi*.
Visí bez kontextu: nemají termín, majitele, cíl, ani vazbu na nic dalšího. V zápisech se stejné položky
opakují od října do února se stavem „Aktivní“ — což je přesně ten stav, kterému má systém bránit.

Návrh: **založit klienta „Parťák pro podnikání (interní)“** a vlastní rozvoj vést jako běžné projekty:

| Projekt | Očekávaný výsledek | Typ |
|---|---|---|
| Web PPP — přepracování | Web s referencemi, videem a stránkou „jak to funguje“, měřený | Web |
| Sociální sítě a obsah | Pravidelný výstup, definovaný proces tvorby | Marketing |
| Brand a maskot | Dokončená identita včetně ilustrací a fotografií | Ostatní |
| Akvizice partnerů | Síť 5–10 prověřených partnerů se smlouvou | Partnerství |
| Obchodní proces | Popsaný a používaný proces od leadu po nabídku | Procesy |
| Založení s.r.o. a smluvní základ | Firma založená, smlouvy hotové | Právní |

Co tím získáte:
- vlastní práce se počítá do **kapacity** — dnes vypadáte volní, i když nejste
- interní projekty mají **health score**, takže „stojí to tři měsíce“ je vidět hned
- máte **jeden seznam práce**, ne dva (klientský a firemní)
- funguje to jako **cvičná zakázka** — systém si osaháte na sobě, než ho pustíte na klienty

Riziko, které je férové zmínit: pokud budete interní projekty ignorovat, budou v Rizicích věčně
červené a otupí vám to pozornost vůči klientským projektům. Pravidlo: interní projekt má stejný
režim jako klientský, nebo se do systému nedává.

---

## Dopad rozhodnutí 2 a 9 — co přibylo v modelu (migrace 0004)

**Jeden účet = jeden profil**, profil má typ `internal` / `partner` / `client`.

| Přibylo | K čemu |
|---|---|
| `profiles.account_type` | rozlišení interní / partner / klient |
| `partner_users`, `client_users` | vazba účtu na partnera nebo klienta |
| `invitations` | registrace jen na pozvánku, s expirací 14 dní; spotřebuje se automaticky při registraci |
| `portal_messages` | komunikace klient ↔ Parťák |
| `v_portal_projects`, `v_portal_milestones` | co vidí klient |
| `v_partner_projects`, `v_partner_tasks` | co vidí partner |
| `portal_request_work()` | „chci další práci“ z portálu → automaticky lead |

### Co kdo uvidí

| | Tým | Partner | Klient |
|---|---|---|---|
| Projekt: název, stav, termín | ano | jen své zakázky | jen své projekty |
| **Cena projektu** | ano (management) | **nikdy** | volitelně (`can_see_finance`) |
| **Marže, náklady, provize ostatních** | jen management | **nikdy** | **nikdy** |
| Vlastní provize partnera | management | **ano** | ne |
| Úkoly | podle projektu | jen přiřazené jemu | ne |
| Milníky | ano | ne | ano (postup prací) |
| Dokumenty | podle projektu | jen své | jen `visibility='client'` |
| Poznámky | interní i sdílené | ne | jen `visibility='shareable'` |
| Interní sazby, kapacita týmu | management | ne | ne |

Klíčové bezpečnostní opatření: externí uživatel **nemá přístup k tabulkám** `projects`, `invoices`,
`project_partners`, `project_costs`. Dostane jen views, které vybírají bezpečné sloupce. I kdyby si
někdo v portálu otevřel konzoli a zavolal API přímo, dostane prázdný výsledek.

**Test, který musí projít před spuštěním portálu:** přihlásit se testovacím klientským účtem a ověřit,
že `select * from projects` vrátí 0 řádků, zatímco `select * from v_portal_projects` vrátí jen jeho projekty.

---

## Struktura Google Drive (rozhodnutí 5)

CRM není file storage — ukládá odkaz a metadata. Aby to fungovalo, musí mít Drive pevný řád:

```
Parťák pro podnikání/
├── 00 Firma/                        ← interní, přístup jen tým
│   ├── Smlouvy a právní/
│   ├── Finance a fakturace/
│   ├── Brand/                       (logo, ilustrace, fotky, manuál)
│   ├── Šablony/                     (nabídka, zápis, brief, intake)
│   └── Procesy a metodiky/
├── 01 Klienti/
│   └── {Klient}/                    ← název přesně jako v CRM
│       ├── 00 Podklady od klienta/
│       ├── 01 Smlouvy/
│       └── {Projekt}/               ← název přesně jako v CRM
│           ├── 01 Zadání a brief/
│           ├── 02 Pracovní/         ← interní, klientovi nesdílet
│           ├── 03 Výstupy/          ← sem jde to, co klient dostane
│           └── 04 Předání/
├── 02 Partneři/
│   └── {Partner}/                   (smlouva, ceník, výstupy)
└── 03 Archiv/
```

Pravidla:
- **Sdílí se složka `03 Výstupy`**, nikdy celý projekt
- Název složky klienta a projektu se **musí shodovat** s CRM — jinak nikdo nic nenajde
- Do CRM se ukládá odkaz na složku projektu (`projects.drive_url`) a na jednotlivé výstupy (`documents.url`)
- Klientské dokumenty mají v CRM `visibility='client'` — jen ty se objeví v portálu
- Vytvoření struktury pro nového klienta patří do onboarding checklistu

Až budete mít Drive API, tuto strukturu vytvoří systém sám při konverzi lead → klient. Do té doby
je to položka v checklistu — a stejně to musí být napsané, jinak si každý vymyslí vlastní.

---

## Co se rozhodnutími odložilo

- **AI vrstva** — model připraven (`ai_actions`), nic se nestaví, dokud nebudou v systému reálná data a rozpočet
- **Automation engine** — tabulky `automations`, `automation_runs` existují, logika ne
- **Plná integrace Fakturoidu** — až po MVP 1
- **Google Drive API** — struktura teď ručně, automatizace později
