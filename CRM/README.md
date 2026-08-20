# Parťák OS — frontend (Next.js)

Moduly v této verzi: **Dnes**, **Rizika**, **Projekty**, **Klienti**.

## Spuštění

```bash
cd app
cp .env.local.example .env.local     # doplň NEXT_PUBLIC_SUPABASE_ANON_KEY
npm install
npm run dev                          # http://localhost:3000
```

Anon klíč najdeš v Supabase → **Project Settings → API → Project API keys → anon public**.
`service_role` klíč do frontendu nepatří — nad anon klíčem platí RLS, nad service_role ne.

## Přihlášení

Účty zakládá správce v Supabase → Authentication → Users (e-mail + heslo).
Registrace zvenčí je vypnutá; externí účty vznikají jen přes tabulku `invitations`.
První založený účet se automaticky stane ownerem systému.

## Co kde je

| Cesta | Obsah |
|---|---|
| `src/app/(app)/page.tsx` | Dnes — moje práce, KPI, co potřebuje pozornost |
| `src/app/(app)/rizika/` | Rizika — zdraví projektů, hromadné doplnění dalšího kroku |
| `src/app/(app)/projekty/` | seznam, detail (přehled, úkoly, milníky, čas, aktivita), založení ze šablony |
| `src/app/(app)/klienti/` | seznam, detail s kontaktními osobami a projekty |
| `src/lib/supabase/` | serverový klient a middleware (session v cookies) |
| `src/lib/codes.ts` | číselníky se čtou z databáze, ne z kódu |
| `src/components/ui.tsx` | karty, štítky, tabulky, prázdné stavy, formulářové prvky |

## Zásady, které v kódu drží

1. **Server components + server actions.** Žádné API routy navíc, žádný stav v prohlížeči.
2. **Anon klíč + RLS.** Frontend nic neskrývá „na oko“ — data, na která uživatel nemá právo, nedostane.
3. **Číselníky z databáze.** Přidání stavu projektu nevyžaduje zásah do kódu.
4. **Health score počítá databáze** (`v_project_health`), aplikace ho jen vykresluje.
5. **Prázdné stavy vysvětlují**, co tam bude a proč — ne jen „žádná data“.

## Typy z databáze (volitelné, doporučené)

```bash
npx supabase gen types typescript --project-id <project-ref> > src/lib/database.types.ts
```
Poté v `src/lib/supabase/server.ts` doplň generikum `createServerClient<Database>(…)`
a odpadnou `any` v dotazech.

## Co ještě chybí (další iterace)

- Obchodní pipeline (leady) s konverzí na klienta
- Partneři a provize
- Timer pro měření času
- Globální hledání + Ctrl/Cmd + K (funkce `search_all` v databázi už existuje)
- Dokumenty s odkazy na Google Drive
- Klientský portál (samostatná zóna nad `v_portal_*` views)
