# Audit — PARŤÁK CRM v1.1

Auditováno: `PARTAK_CRM_v1_1.html` · 214 431 B · 2 376 řádků · jeden soubor (HTML + CSS + JS)
Datum auditu: 17. 8. 2026

---

## 1. Celkové hodnocení

Na single-file prototyp je to **nadstandardně dobrá práce**. Datové tvary jsou konzistentní, kód je členěný do 27 sekcí, je tam migrace dat, chybové stavy renderu, empty states, číselníky, šablony checklistů, provize partnerů, portál klienta a knowledge base. Jako **prototyp UX a business logiky má hodnotu**, kterou nemá smysl zahodit.

Zároveň má architekturu, která **neumožňuje být firemním systémem**. Tři důvody, každý sám o sobě blokující:

| # | Problém | Důsledek |
|---|---|---|
| 1 | Data v `localStorage` prohlížeče (`KEY='partak-crm-v1'`) | Petr a Martin **nemají stejná data**. Každý prohlížeč = jiná firma. Vyčištění cache = ztráta dat. |
| 2 | Žádná autentizace — role se **přepíná selectem** (`prepniUzivatele`) | Kdokoliv se prohlásí adminem. Oprávnění (`smimAdmin`, `viditelneProjekty`) jsou jen UI filtr. |
| 3 | Klientský portál běží ve stejném souboru a čte stejná data | Kdyby klient dostal odkaz na aplikaci, má v prohlížeči **kompletní data všech klientů, ceny, marže, provize partnerů**. |

**Verdikt:** v1.1 je výborný funkční návrh, ale je to prototyp. Produkční verze musí mít server, databázi a autentizaci. Doporučení: v1.1 nechat žít jako interní nástroj na jednom stroji (a jako referenci UX), produkci postavit na Supabase (viz `02-system-design.md`) a UI přenášet po modulech.

---

## 2. Co v1.1 umí (a v produkci se to musí zachovat)

- **Projekt jako hlavní objekt**, klient jako kontext, služby jako vrstvy projektu (`p.sluzby[]`) — správné rozhodnutí, drží se i v novém modelu
- 10fázový workflow stepper (`FAZE`), stavy, priority — konfigurovatelné číselníky
- 10 typů projektů s **checklisty**, ze kterých se generují úkoly
- Obchodní pipeline s kanbanem, konverze lead → klient
- Čas na projektu, rozpočet hodin, kapacita týdenní
- Partneři s **provizí v %** a evidencí hodnoty předané zakázky (`p.partneri[{partnerId,hodnota}]`) — přesně kopíruje affiliate model z dokumentů
- Faktury, smlouvy se šablonami (GDPR, NDA, Podmínky, Provize) a stavy podpisu
- Knowledge base: metodiky, šablony, karty služeb
- Motor upozornění (`upozorneni()`) — 11 typů výjimek
- Reporting denní / týdenní / měsíční
- Admin: uživatelé, typy + checklisty, číselníky, záloha/import/reset
- Empty states a error state v renderu — kvalitní UX detail

---

## 3. Chybí vůči zadání (master prompt)

| Oblast | Zadání | Stav v v1.1 | Priorita |
|---|---|---|---|
| Kontaktní osoby | samostatná entita, N na klienta | jen 3 textová pole na klientovi | **P1** → doplněno ve v1.2 |
| Milníky | samostatná entita | **chybí úplně** | **P1** → doplněno ve v1.2 |
| Stavy úkolů | 7 stavů | jen `hotovo: true/false` | **P1** → částečně (v1.2 datově, UI v produkci) |
| Závislosti úkolů | Task A → Task B + dopad | **chybí** | **P1** → v produkci |
| Health status projektu | automatický, zelená/oranžová/červená | **chybí** (jen ad-hoc alerty) | **P1** → doplněno ve v1.2 |
| „Další krok“ na projektu | povinné pole, projekt bez něj = problém | jen u leadů | **P1** → doplněno ve v1.2 |
| Notifikace | označit jako přečtené, snooze | alerty se počítají živě, nelze odbavit | **P2** → snooze ve v1.2, plné v produkci |
| Activity / audit log | kdo, co, kdy, z čeho na co | jen `p.historie[]` textově, ručně | **P1** → v1.2 částečně, v produkci DB triggery |
| Globální hledání | přes všechny entity | **chybí** | **P1** → doplněno ve v1.2 |
| Command palette | Ctrl/Cmd + K | **chybí** | **P2** → doplněno ve v1.2 |
| Timer | start/stop | jen ruční zápis času | **P2** → doplněno ve v1.2 |
| Saved views | uložené pohledy | **chybí** | **P3** → základ ve v1.2 |
| RBAC backendově | oprávnění na serveru | pouze frontend | **P0** → jen produkce (RLS) |
| Interní vs. klientská poznámka | rozlišení viditelnosti | **chybí** | **P2** → v modelu produkce |
| Katalog služeb ↔ projekt | relace | služby jsou v KB jako text, projekt na ně neodkazuje | **P2** |
| Automation engine (WHEN/IF/THEN) | datová příprava | **chybí** | **P3** → tabulky připraveny |
| AI vrstva (read/propose/execute) | architektura + audit | **chybí** | **P3** → tabulka `ai_actions` |
| Náklady, marže | příprava | jen cena a fakturováno | **P2** → `project_costs`, `v_project_finance` |
| i18n | příprava | texty zadrátované v kódu | **P3** |
| Pagination / server filtering | výkon | vše se renderuje najednou | **P2** (do ~1 000 záznamů neřeší) |

---

## 4. Technické nálezy (konkrétně)

### 4.1 Blokující
1. **Úložiště 5 MB.** `stavUloziste()` varuje na 75 %, ale řešení není. Při ~2 000 projektů + časy + audit dojde místo a aplikace přestane ukládat. Data jsou jen v prohlížeči.
2. **Autentizace neexistuje.** `D.ja` je jen index v poli, `prepniUzivatele()` mění identitu bez ověření.
3. **Portál klienta.** `portalPrihlasit()` porovnává e-mail a kód proti `D.portalUcty` v témže JS. Kódy (`PEK-4821`) jsou v plaintextu. Doporučení: **portál z interní aplikace úplně odstranit** a nasadit ho až jako samostatnou aplikaci proti databázi s RLS.
4. **Žádná záloha mimo zařízení.** Export je ruční (`exportData()`). Když si někdo omylem promaže data prohlížeče, je konec. Do produkce: automatické zálohy Supabase.

### 4.2 Důležité
5. **Reset token.** `RESET_TOKEN='v1-start-2026-08'` — při jeho změně se data přepíšou seedem a původní jdou do zálohy. Funkční, ale nebezpečná mechanika při updatu; v produkci nahradit verzovanými migracemi.
6. **`innerHTML` s daty uživatele.** `esc()` escapuje `& < > "`, ale ne `'`. Většina míst je v atributech s dvojitými uvozovkami, takže to drží — ale v `onclick="...'+id+'..."` se stavějí JS stringy z dat. Při jménu projektu s apostrofem se rozbije onclick (v produkci to řeší React/eventy, ne string HTML).
7. **Kapacita počítá jen úkoly s termínem do 7 dní** (`naplanovano`) — kdo nemá termíny, tváří se jako volný.
8. **`hodinyProjektu` sčítá vše bez ohledu na fakturovatelnost** — čas na `cas[]` nemá příznak `fakturovatelne`, zadání ho vyžaduje.
9. **Pipeline nesouhlasí s realitou.** Kód: `lead / kontakt / analyza / nabidka`. Notion PPP: `Lead / Diagnostika / Nabídka odeslána / Klient (aktivní) / Uzavřeno (vyhráno) / Ztraceno`. → sjednoceno ve v1.2 a v `code_values`.
10. **Přístupnost.** Žádné `aria-*`, modaly nedrží focus, ovládání jen myší. U interního nástroje snesitelné, u dlouhodobého produktu ne.

### 4.3 Drobnosti
11. `uid()` používá `Math.random()` — kolize teoreticky možné; v produkci UUID v DB.
12. Fonty se tahají z Google Fonts → aplikace nefunguje plnohodnotně offline a posílá požadavek třetí straně (GDPR detail).
13. Číselníky jdou přejmenovat, ale historická data si drží starý string (žádná ID) → přejmenování stavu rozbije filtry.
14. Reporting počítá „fakturovanou hodnotu“ z `faktury[]`, zatímco projekt má vlastní `fakturovano` — dva zdroje pravdy.

---

## 5. Rozdíly proti reálnému fungování agentury (z kontextu Notionu a zápisů)

Co v CRM chybí, přestože to firma reálně dělá:

1. **Fáze „Diagnostika“** — reálná pipeline ji má, CRM ne. → doplněno.
2. **Balíčky S1–S4 / hodinovka** — v Notionu je „Balíček / forma“ u klienta, v CRM není. → doplněno (`client_package`).
3. **Fakturoid** — rozhodnutí ze zápisu 4. 2. 2026. CRM nemá kam uložit odkaz na fakturu. → `invoices.external_id`, `external_url`.
4. **Affiliate výplaty** — dokument popisuje výplatní cyklus (1× měsíčně, stav výplaty, datum). CRM eviduje provizi, ale ne stav výplaty. → `project_partners.commission_status`, `paid_on`.
5. **Fixní odměna za doporučení** (1 000–2 000 Kč) vedle procent — CRM zná jen %. → `commission_fixed`, `payout_mode`.
6. **Partner jako zdroj leadu** — reálně tak leady vznikají (Filip + Viktor), v číselníku zdrojů to chybělo. → `lead_source: partner`.
7. **Schůzky s partnery** — Notion je má (8. 3. 2026 marketing), CRM zná jen typ Klientská/Interní/Obchodní. → `meetings.kind = partner` + `partner_id`.
8. **Přepisy schůzek** (Fireflies/Otter/Notion AI) — reálně používané, není kam dát odkaz. → `meetings.transcript_url`.
9. **Google Drive na projektu** — Notion databáze má sloupec Google Drive, CRM ne. → `projects.drive_url`.
10. **Vlastní projekty firmy** (PPP web, socky, marketing, brand) — dnes jsou to úkoly bez projektu. Doporučení: **interní klient „Parťák pro podnikání“** a vést vlastní rozvoj jako projekty; jinak polovina práce firmy v systému není vidět.
11. **Přejmenování firmy na Startigo** (rozhodnuto 4. 2. 2026) — branding v aplikaci je zadrátovaný na 6 místech. → v produkci jedna konstanta / konfigurace.

---

## 6. Co bylo v rámci auditu opraveno (v1.2)

Do prototypu byly přidány chybějící části, které **nevyžadují server** — chirurgicky, bez přepisu funkčního kódu (13 zásahů v `index.html` + samostatný `v12-addon.js`):

| Přidáno | Kde |
|---|---|
| Zdraví projektu (deterministické skóre + důvody) | `zdravi()`, karta projektu, detail, nová stránka Rizika |
| Další krok u projektu + upozornění, když chybí | pás v detailu projektu, `formDalsiKrok()` |
| Milníky (nová záložka projektu, CRUD, po termínu) | `TAB12`, `formMilnik()` |
| Kontaktní osoby klienta (N kontaktů, hlavní kontakt) | `kartaKontakty()`, `formKontakt()` |
| Stránka **Rizika** — management by exception | `vRizika()` |
| Audit log změn (stav, fáze, další krok, milníky, kontakty) | `zapisAudit()`, `vAudit()`, stránka Audit (jen admin) |
| Globální hledání + Command palette (Ctrl/Cmd + K) | `paletaOtevri()` |
| Timer se zápisem času | `timerStart/Stop`, plovoucí widget |
| Odkládání upozornění (snooze 7 dní) | `odloz()` |
| Uložené pohledy | `ulozPohled()` (dostupné z palety) |
| Pipeline sjednocená s Notionem + balíčky S1–S4 | `migruj12()` |

Data se migrují automaticky při prvním otevření, stará data zůstávají (`migruj12()` doplňuje jen chybějící pole).

---

## 7. Co se ve prototypu vědomě NEŘEŠÍ

Tyto věci nemá smysl řešit v prohlížeči, protože by vznikla iluze funkce:

- reálná oprávnění (RLS v databázi)
- sdílení dat mezi lidmi (server)
- klientský portál (samostatná aplikace)
- e-mailové a push notifikace
- AI vrstva nad daty
- integrace Google Drive / Calendar / Fakturoid
- automation engine

→ viz `02-system-design.md` a `03-mvp-roadmap.md`.
