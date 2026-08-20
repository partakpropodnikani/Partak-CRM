import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapaKodu } from "@/lib/codes";
import { Card, Empty, Pill, Table, Td, ZdraviPill, btn, vstup } from "@/components/ui";
import { datum, dniDo } from "@/lib/format";
import { ulozDalsiKrok } from "../projekty/actions";

export default async function Rizika() {
  const supabase = await createClient();
  const stavy = await mapaKodu("project_status");

  const [{ data: zdravi }, { data: projekty }, { data: leady }] = await Promise.all([
    supabase.from("v_project_health").select("*").order("score", { ascending: false }),
    supabase.from("projects").select("id, name, status_code, client:clients ( id, name )").is("deleted_at", null),
    supabase
      .from("leads")
      .select("id, title, company, stage_code, next_action, next_action_on, estimated_value")
      .is("deleted_at", null)
      .is("converted_client_id", null)
      .or(`next_action.is.null,next_action_on.lt.${new Date().toISOString().slice(0, 10)}`),
  ]);

  const proj = new Map<string, any>();
  ((projekty as any[] | null) ?? []).forEach((p) => proj.set(p.id, p));
  const cervene = zdravi?.filter((z: any) => z.health === "red") ?? [];
  const oranzove = zdravi?.filter((z: any) => z.health === "orange") ?? [];

  return (
    <>
      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-wide text-ink-3">Řízení</p>
        <h1 className="text-[22px] font-medium">Rizika a zdraví projektů</h1>
        <p className="mt-1 text-[13px] text-ink-3">
          Systém nezobrazuje všechno — zvýrazňuje výjimky. Pravidla jsou v tabulce <code className="font-mono">health_rules</code> a dají se změnit bez zásahu do aplikace.
        </p>
      </header>

      <Card title={`Projekty vyžadující pozornost (${cervene.length + oranzove.length})`} className="mb-4">
        {!zdravi?.length ? (
          <Empty nadpis="Žádné běžící projekty" popis="Až budou projekty běžet, uvidíš tady jen ty, které potřebují zásah." />
        ) : (
          <Table hlavicka={["Projekt", "Klient", "Stav", "Zdraví", "Proč", "Další krok"]}>
            {zdravi.map((z: any) => {
              const p: any = proj.get(z.id);
              const pozde = z.next_action_on && (dniDo(z.next_action_on) ?? 0) < 0;
              return (
                <tr key={z.id} className={z.health === "red" ? "bg-bad-bg/30" : ""}>
                  <Td>
                    <Link href={`/projekty/${z.id}`} className="font-medium hover:text-gold-deep">{z.name}</Link>
                  </Td>
                  <Td>
                    {p?.client ? (
                      <Link href={`/klienti/${p.client.id}`} className="text-ink-2 hover:text-gold-deep">{p.client.name}</Link>
                    ) : "—"}
                  </Td>
                  <Td>{stavy[z.status_code] ?? z.status_code}</Td>
                  <Td><ZdraviPill health={z.health} score={z.score} reasons={z.reasons} /></Td>
                  <Td className="max-w-[240px] text-[12px] text-ink-3">{z.reasons?.join(" · ") || "—"}</Td>
                  <Td>
                    <form action={ulozDalsiKrok} className="flex items-center gap-1.5">
                      <input type="hidden" name="id" value={z.id} />
                      <input
                        name="next_action"
                        defaultValue={z.next_action ?? ""}
                        placeholder="doplnit další krok"
                        className={`${vstup} w-48 py-1 text-[12.5px] ${!z.next_action || pozde ? "border-bad" : ""}`}
                      />
                      <input type="date" name="next_action_on" defaultValue={z.next_action_on ?? ""} className={`${vstup} w-32 py-1 text-[12px]`} />
                      <button className={`${btn.obrys} ${btn.maly}`}>Uložit</button>
                    </form>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title={`Obchod — příležitosti bez dalšího kroku (${leady?.length ?? 0})`}>
        {!leady?.length ? (
          <p className="text-[13px] text-ink-3">Všechny leady mají naplánovaný další krok. Přesně tak to má být.</p>
        ) : (
          <Table hlavicka={["Lead", "Firma", "Fáze", "Poslední krok"]}>
            {leady.map((l: any) => (
              <tr key={l.id}>
                <Td className="font-medium">{l.title}</Td>
                <Td className="text-ink-2">{l.company ?? "—"}</Td>
                <Td><Pill>{l.stage_code}</Pill></Td>
                <Td className="text-bad text-[12.5px]">
                  {l.next_action ? `${l.next_action} · ${datum(l.next_action_on)}` : "nedefinováno"}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </>
  );
}
