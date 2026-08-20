import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapaKodu } from "@/lib/codes";
import { Avatar, Card, Empty, LinkBtn, Pill, Table, Td } from "@/components/ui";
import { datum } from "@/lib/format";

export default async function Klienti({ searchParams }: { searchParams: Promise<{ q?: string; stav?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const [balicky, odvetvi] = await Promise.all([mapaKodu("client_package"), mapaKodu("industry")]);

  let dotaz = supabase
    .from("clients")
    .select(
      `id, name, reg_no, industry_code, package_code, relationship_status, acquired_on,
       owner:profiles!clients_owner_id_fkey ( full_name, color ),
       contacts ( id, full_name, email, is_primary ),
       projects ( id, status_code )`
    )
    .is("deleted_at", null)
    .order("name")
    .limit(200);

  if (sp.q) dotaz = dotaz.ilike("name", `%${sp.q}%`);
  if (sp.stav && sp.stav !== "vse") dotaz = dotaz.eq("relationship_status", sp.stav);

  const { data: klienti, error } = await dotaz;

  const STAVY: Record<string, { label: string; tridy: string }> = {
    prospect: { label: "Zájemce", tridy: "bg-info-bg text-info" },
    active: { label: "Aktivní", tridy: "bg-ok-bg text-ok" },
    inactive: { label: "Neaktivní", tridy: "bg-warn-bg text-warn" },
    ended: { label: "Ukončený", tridy: "bg-paper text-ink-3" },
  };

  const filtry = [
    { klic: "active", label: "Aktivní" },
    { klic: "prospect", label: "Zájemci" },
    { klic: "inactive", label: "Neaktivní" },
    { klic: "vse", label: "Všichni" },
  ];

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-3">Obchod</p>
          <h1 className="text-[22px] font-medium">Klienti</h1>
        </div>
        <div className="ml-auto">
          <LinkBtn href="/klienti/novy" varianta="primar">+ Nový klient</LinkBtn>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filtry.map((f) => {
          const aktivni = (sp.stav ?? "active") === f.klic;
          return (
            <Link
              key={f.klic}
              href={`/klienti?stav=${f.klic}`}
              className={`rounded border px-2.5 py-1 text-[12px] ${
                aktivni ? "border-ink bg-ink text-white" : "border-line-2 bg-white text-ink-2 hover:border-gold-deep"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
        <form className="ml-auto" action="/klienti">
          <input type="hidden" name="stav" value={sp.stav ?? "active"} />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Hledat klienta…"
            className="w-56 rounded border border-line-2 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-gold-deep"
          />
        </form>
      </div>

      <Card>
        {error && <p className="text-[13px] text-bad">Data se nepodařilo načíst: {error.message}</p>}

        {!error && !klienti?.length ? (
          <Empty
            nadpis="Žádný klient v tomto filtru"
            popis="Klient je kontext projektů. Bez klienta nejde projekt založit — proto se zakládá jako první."
            cta={<LinkBtn href="/klienti/novy" varianta="primar">Založit prvního klienta</LinkBtn>}
          />
        ) : (
          <Table hlavicka={["Klient", "Hlavní kontakt", "Balíček", "Odvětví", "Projekty", "Stav", "Získán", "Správce"]}>
            {klienti?.map((k: any) => {
              const hlavni = k.contacts?.find((c: any) => c.is_primary) ?? k.contacts?.[0];
              const aktivni = k.projects?.filter((p: any) => !["done", "cancelled", "archived"].includes(p.status_code)).length ?? 0;
              const st = STAVY[k.relationship_status] ?? STAVY.active;
              return (
                <tr key={k.id} className="hover:bg-paper-2">
                  <Td>
                    <Link href={`/klienti/${k.id}`} className="font-medium hover:text-gold-deep">
                      {k.name}
                    </Link>
                    {k.reg_no && <div className="font-mono text-[11.5px] text-ink-3">IČO {k.reg_no}</div>}
                  </Td>
                  <Td>
                    {hlavni ? (
                      <>
                        <div>{hlavni.full_name}</div>
                        {hlavni.email && <div className="text-[11.5px] text-ink-3">{hlavni.email}</div>}
                      </>
                    ) : (
                      <span className="text-bad text-[12.5px]">chybí kontakt</span>
                    )}
                  </Td>
                  <Td>{k.package_code ? <Pill tridy="bg-gold-soft text-gold-deep">{balicky[k.package_code] ?? k.package_code}</Pill> : "—"}</Td>
                  <Td className="text-ink-2">{odvetvi[k.industry_code] ?? "—"}</Td>
                  <Td>
                    <span className="font-mono">{aktivni}</span>
                    <span className="text-ink-3"> / {k.projects?.length ?? 0}</span>
                  </Td>
                  <Td><Pill tridy={st.tridy}>{st.label}</Pill></Td>
                  <Td className="font-mono text-[12.5px]">{datum(k.acquired_on)}</Td>
                  <Td><Avatar jmeno={k.owner?.full_name} barva={k.owner?.color} /></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
