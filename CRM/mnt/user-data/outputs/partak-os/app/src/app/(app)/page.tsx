import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapaKodu } from "@/lib/codes";
import { Card, Empty, Pill, Table, Td, ZdraviPill } from "@/components/ui";
import { PRIORITA, STAV_UKOLU, cislo, datum, dniDo } from "@/lib/format";

export default async function Dnes() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null; // middleware přesměruje na /login

  const [stavyUkolu, priority] = await Promise.all([mapaKodu("task_status"), mapaKodu("priority")]);

  const [{ data: zdravi }, { data: mojeUkoly }, { data: kapacita }] = await Promise.all([
    supabase.from("v_project_health").select("id, name, health, score, reasons, next_action, next_action_on"),
    supabase
      .from("tasks")
      .select("id, title, status_code, priority_code, due_on, project:projects ( id, name )")
      .eq("assignee_id", user.id)
      .not("status_code", "in", "(done,cancelled)")
      .is("deleted_at", null)
      .order("due_on", { nullsFirst: false })
      .limit(20),
    supabase.from("v_capacity_week").select("*"),
  ]);

  const cervene = zdravi?.filter((z: any) => z.health === "red") ?? [];
  const oranzove = zdravi?.filter((z: any) => z.health === "orange") ?? [];
  const poTerminu = mojeUkoly?.filter((u: any) => (dniDo(u.due_on) ?? 99) < 0) ?? [];
  const dnes = mojeUkoly?.filter((u: any) => dniDo(u.due_on) === 0) ?? [];
  const pretizeni = kapacita?.filter((k: any) => Number(k.planned_hours_7d) > Number(k.weekly_capacity_hours || 0)) ?? [];

  return (
    <>
      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-wide text-ink-3">Řízení</p>
        <h1 className="text-[22px] font-medium">Dnes</h1>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-4">
        <Kpi href="/rizika" popisek="Projekty v riziku" hodnota={cervene.length} poznamka="vyžadují rozhodnutí" varianta={cervene.length ? "bad" : undefined} />
        <Kpi href="/rizika" popisek="Pozor" hodnota={oranzove.length} poznamka="sledovat tento týden" varianta={oranzove.length ? "warn" : undefined} />
        <Kpi href="/" popisek="Moje úkoly po termínu" hodnota={poTerminu.length} poznamka="dohnat dnes" varianta={poTerminu.length ? "bad" : undefined} />
        <Kpi href="/" popisek="Moje úkoly dnes" hodnota={dnes.length} poznamka="naplánováno na dnešek" />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr] md:items-start">
        <Card title="Moje práce">
          {!mojeUkoly?.length ? (
            <Empty nadpis="Nemáš otevřené úkoly" popis="Prázdný seznam úkolů znamená prostor posunout projekty nebo obchod." />
          ) : (
            <Table hlavicka={["Úkol", "Projekt", "Termín", "Stav"]}>
              {mojeUkoly.map((u: any) => {
                const dni = dniDo(u.due_on);
                return (
                  <tr key={u.id}>
                    <Td>
                      <span className="font-medium">{u.title}</span>
                      <div className="mt-1"><Pill tridy={PRIORITA[u.priority_code]}>{priority[u.priority_code]}</Pill></div>
                    </Td>
                    <Td>
                      {u.project ? (
                        <Link href={`/projekty/${u.project.id}`} className="text-ink-2 hover:text-gold-deep">{u.project.name}</Link>
                      ) : (
                        <span className="text-ink-3">interní</span>
                      )}
                    </Td>
                    <Td className={dni !== null && dni < 0 ? "text-bad" : ""}>
                      <span className="font-mono text-[12.5px]">{datum(u.due_on)}</span>
                    </Td>
                    <Td><Pill tridy={STAV_UKOLU[u.status_code]}>{stavyUkolu[u.status_code]}</Pill></Td>
                  </tr>
                );
              })}
            </Table>
          )}
        </Card>

        <div className="space-y-4">
          <Card title="Co potřebuje pozornost">
            {!cervene.length && !oranzove.length ? (
              <p className="text-[13px] text-ink-3">Žádný projekt není v riziku. Tak to má vypadat.</p>
            ) : (
              <ul className="space-y-2.5">
                {[...cervene, ...oranzove].slice(0, 6).map((z: any) => (
                  <li key={z.id} className="border-b border-line/60 pb-2.5">
                    <div className="flex items-start gap-2">
                      <ZdraviPill health={z.health} score={z.score} reasons={z.reasons} />
                      <Link href={`/projekty/${z.id}`} className="flex-1 text-[13px] font-medium hover:text-gold-deep">{z.name}</Link>
                    </div>
                    <p className="mt-1 text-[11.5px] text-ink-3">{z.reasons?.join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {pretizeni.length > 0 && (
            <Card title="Přetížená kapacita">
              <ul className="space-y-2 text-[13px]">
                {pretizeni.map((k: any) => (
                  <li key={k.user_id} className="flex justify-between border-b border-line/60 pb-2">
                    <span>{k.full_name}</span>
                    <span className="font-mono text-bad">
                      {cislo(k.planned_hours_7d)} / {cislo(k.weekly_capacity_hours, 0)} h
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}

function Kpi({
  href, popisek, hodnota, poznamka, varianta,
}: { href: string; popisek: string; hodnota: number; poznamka: string; varianta?: "bad" | "warn" }) {
  const barva = varianta === "bad" ? "text-bad" : varianta === "warn" ? "text-warn" : "text-ink";
  return (
    <Link href={href} className="rounded border border-line bg-white px-4 py-3 transition-colors hover:border-gold-deep">
      <p className="text-[10.5px] uppercase tracking-wide text-ink-3">{popisek}</p>
      <p className={`mt-1 font-display text-[24px] ${barva}`}>{hodnota}</p>
      <p className="text-[11px] text-ink-3">{poznamka}</p>
    </Link>
  );
}
