import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapaKodu } from "@/lib/codes";
import { Card, Empty, LinkBtn, Pill, Table, Td, ZdraviPill, Avatar, Progres } from "@/components/ui";
import { PRIORITA, cislo, datum, dniDo, kc } from "@/lib/format";

type Zdravi = { id: string; health: string; score: number; reasons: string[] | null };

export default async function Projekty({
  searchParams,
}: {
  searchParams: Promise<{ stav?: string; q?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [stavy, faze, priority] = await Promise.all([
    mapaKodu("project_status"),
    mapaKodu("project_phase"),
    mapaKodu("priority"),
  ]);

  let dotaz = supabase
    .from("projects")
    .select(
      `id, name, status_code, phase_code, priority_code, due_on, next_action, next_action_on,
       planned_hours, price,
       client:clients ( id, name ),
       manager:profiles!projects_manager_id_fkey ( id, full_name, color )`
    )
    .is("deleted_at", null)
    .order("due_on", { ascending: true, nullsFirst: false })
    .limit(100);

  if (sp.q) dotaz = dotaz.ilike("name", `%${sp.q}%`);
  if (sp.stav === "aktivni" || !sp.stav) dotaz = dotaz.not("status_code", "in", "(done,cancelled,archived)");
  else if (sp.stav !== "vse") dotaz = dotaz.eq("status_code", sp.stav);

  const [{ data: projekty, error }, { data: zdraviData }, { data: hodiny }] = await Promise.all([
    dotaz,
    supabase.from("v_project_health").select("id, health, score, reasons"),
    supabase.from("v_project_hours").select("project_id, actual_hours, planned_hours, hours_pct"),
  ]);

  const zdravi = new Map<string, Zdravi>();
  ((zdraviData as Zdravi[] | null) ?? []).forEach((z) => zdravi.set(z.id, z));

  const hod = new Map<string, { actual_hours: number; hours_pct: number | null }>();
  ((hodiny as any[] | null) ?? []).forEach((h) => hod.set(h.project_id, h));

  const filtry = [
    { klic: "aktivni", label: "Aktivní" },
    { klic: "running", label: "Realizace" },
    { klic: "waiting_client", label: "Čeká na klienta" },
    { klic: "prep", label: "Příprava" },
    { klic: "done", label: "Dokončené" },
    { klic: "vse", label: "Vše" },
  ];

  return (
    <>
      <header className="mb-5 flex flex-wrap items-center gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-3">Realizace</p>
          <h1 className="text-[22px] font-medium">Projekty</h1>
        </div>
        <div className="ml-auto">
          <LinkBtn href="/projekty/novy" varianta="primar">+ Nový projekt</LinkBtn>
        </div>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        {filtry.map((f) => {
          const aktivni = (sp.stav ?? "aktivni") === f.klic;
          return (
            <Link
              key={f.klic}
              href={`/projekty?stav=${f.klic}${sp.q ? `&q=${encodeURIComponent(sp.q)}` : ""}`}
              className={`rounded border px-2.5 py-1 text-[12px] ${
                aktivni ? "border-ink bg-ink text-white" : "border-line-2 bg-white text-ink-2 hover:border-gold-deep"
              }`}
            >
              {f.label}
            </Link>
          );
        })}
        <form className="ml-auto" action="/projekty">
          <input type="hidden" name="stav" value={sp.stav ?? "aktivni"} />
          <input
            name="q"
            defaultValue={sp.q ?? ""}
            placeholder="Hledat projekt…"
            className="w-56 rounded border border-line-2 bg-white px-3 py-1.5 text-[13px] outline-none focus:border-gold-deep"
          />
        </form>
      </div>

      <Card>
        {error && <p className="text-[13px] text-bad">Data se nepodařilo načíst: {error.message}</p>}

        {!error && (!projekty || projekty.length === 0) ? (
          <Empty
            nadpis="Žádný projekt v tomto filtru"
            popis="Projekt je hlavní objekt systému — všechna práce, čas i fakturace visí na něm. Klient je jeho kontext."
            cta={<LinkBtn href="/projekty/novy" varianta="primar">Vytvořit první projekt</LinkBtn>}
          />
        ) : (
          <Table hlavicka={["Projekt", "Klient", "Stav", "Zdraví", "Další krok", "Termín", "Hodiny", "PM"]}>
            {projekty?.map((p: any) => {
              const z = zdravi.get(p.id);
              const h = hod.get(p.id);
              const dni = dniDo(p.due_on);
              const krokPozde = p.next_action_on && (dniDo(p.next_action_on) ?? 0) < 0;
              return (
                <tr key={p.id} className="hover:bg-paper-2">
                  <Td>
                    <Link href={`/projekty/${p.id}`} className="font-medium hover:text-gold-deep">
                      {p.name}
                    </Link>
                    <div className="mt-1 flex gap-1.5">
                      <Pill tridy={PRIORITA[p.priority_code] ?? PRIORITA.normal}>{priority[p.priority_code] ?? p.priority_code}</Pill>
                      <Pill>{faze[p.phase_code] ?? p.phase_code}</Pill>
                    </div>
                  </Td>
                  <Td>
                    {p.client ? (
                      <Link href={`/klienti/${p.client.id}`} className="text-ink-2 hover:text-gold-deep">
                        {p.client.name}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </Td>
                  <Td>{stavy[p.status_code] ?? p.status_code}</Td>
                  <Td>
                    <ZdraviPill health={z?.health} score={z?.score} reasons={z?.reasons} />
                    {z?.reasons?.length ? (
                      <div className="mt-1 max-w-[190px] text-[11px] text-ink-3">{z.reasons.join(" · ")}</div>
                    ) : null}
                  </Td>
                  <Td className={krokPozde || !p.next_action ? "text-bad" : "text-ink-2"}>
                    <div className="max-w-[210px] text-[12.5px]">{p.next_action || "chybí"}</div>
                    {p.next_action_on && <div className="text-[11px] text-ink-3">{datum(p.next_action_on)}</div>}
                  </Td>
                  <Td className={dni !== null && dni < 0 ? "text-bad" : ""}>
                    <span className="font-mono text-[12.5px]">{datum(p.due_on)}</span>
                  </Td>
                  <Td>
                    <div className="w-24">
                      <div className="mb-1 font-mono text-[12px]">
                        {cislo(h?.actual_hours ?? 0)}
                        {p.planned_hours ? ` / ${cislo(p.planned_hours, 0)}` : ""} h
                      </div>
                      {p.planned_hours ? (
                        <Progres
                          pct={Number(h?.hours_pct ?? 0)}
                          barva={Number(h?.hours_pct ?? 0) > 100 ? "bg-bad" : "bg-gold-deep"}
                        />
                      ) : null}
                      <div className="mt-1 text-[11px] text-ink-3">{kc(p.price)}</div>
                    </div>
                  </Td>
                  <Td>
                    <Avatar jmeno={p.manager?.full_name} barva={p.manager?.color} />
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
