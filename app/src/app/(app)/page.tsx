import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { mapaKodu } from "@/lib/codes";
import { Avatar, Card, Empty, Pill, Pole, Table, Td, btn, vstup } from "@/components/ui";
import { PRIORITA, STAV_UKOLU, cislo, datum, dniDo, dnesISO } from "@/lib/format";
import { pridejInterniUkol, zmenStavUkoluGlobal } from "./actions";

export default async function Ukoly({
  searchParams,
}: {
  searchParams: Promise<{ filtr?: string; kdo?: string }>;
}) {
  const sp = await searchParams;
  const filtr = sp.filtr ?? "moje";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const [stavyUkolu, priority] = await Promise.all([mapaKodu("task_status"), mapaKodu("priority")]);

  let dotaz = supabase
    .from("tasks")
    .select(
      `id, title, status_code, priority_code, due_on, est_hours, kind, waiting_for,
       project:projects ( id, name, client:clients ( id, name ) ),
       assignee:profiles!tasks_assignee_id_fkey ( id, full_name, color )`
    )
    .is("deleted_at", null)
    .order("due_on", { nullsFirst: false })
    .limit(200);

  if (filtr === "moje") dotaz = dotaz.eq("assignee_id", user.id).not("status_code", "in", "(done,cancelled)");
  else if (filtr === "poTerminu")
    dotaz = dotaz.lt("due_on", dnesISO()).not("status_code", "in", "(done,cancelled)");
  else if (filtr === "blokovane") dotaz = dotaz.in("status_code", ["blocked", "waiting"]);
  else if (filtr === "hotove") dotaz = dotaz.eq("status_code", "done");
  else dotaz = dotaz.not("status_code", "in", "(done,cancelled)");

  const [{ data: ukoly, error }, { data: tym }] = await Promise.all([
    dotaz,
    supabase.from("profiles").select("id, full_name").eq("account_type", "internal").eq("status", "active").order("full_name"),
  ]);

  const filtry = [
    { klic: "moje", label: "Moje otevřené" },
    { klic: "vse", label: "Všechny otevřené" },
    { klic: "poTerminu", label: "Po termínu" },
    { klic: "blokovane", label: "Blokované a čekající" },
    { klic: "hotove", label: "Hotové" },
  ];

  return (
    <>
      <header className="mb-5">
        <p className="text-[11px] uppercase tracking-wide text-ink-3">Řízení</p>
        <h1 className="text-[22px] font-medium">Úkoly</h1>
      </header>

      <div className="mb-4 flex flex-wrap gap-2">
        {filtry.map((f) => (
          <Link
            key={f.klic}
            href={`/ukoly?filtr=${f.klic}`}
            className={`rounded border px-2.5 py-1 text-[12px] ${
              filtr === f.klic ? "border-ink bg-ink text-white" : "border-line-2 bg-white text-ink-2 hover:border-gold-deep"
            }`}
          >
            {f.label}
          </Link>
        ))}
      </div>

      <Card className="mb-4">
        {error && <p className="text-[13px] text-bad">Data se nepodařilo načíst: {error.message}</p>}

        {!error && !ukoly?.length ? (
          <Empty
            nadpis={filtr === "moje" ? "Nemáš otevřené úkoly" : "Žádné úkoly v tomto filtru"}
            popis="Projektové úkoly vznikají ze šablony při založení projektu nebo ručně v detailu projektu. Interní úkoly můžeš přidat níže."
          />
        ) : (
          <Table hlavicka={["Úkol", "Projekt / klient", "Řešitel", "Termín", "Odhad", "Stav", ""]}>
            {ukoly?.map((u: any) => {
              const dni = dniDo(u.due_on);
              const pozde = dni !== null && dni < 0 && u.status_code !== "done";
              return (
                <tr key={u.id} className={pozde ? "bg-bad-bg/20" : ""}>
                  <Td>
                    <span className={u.status_code === "done" ? "line-through opacity-60" : "font-medium"}>{u.title}</span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      <Pill tridy={PRIORITA[u.priority_code]}>{priority[u.priority_code]}</Pill>
                      {u.kind !== "project" && <Pill>{u.kind === "internal" ? "interní" : u.kind === "sales" ? "obchod" : "administrativa"}</Pill>}
                      {u.waiting_for && <Pill tridy="bg-warn-bg text-warn">čeká: {u.waiting_for}</Pill>}
                    </div>
                  </Td>
                  <Td>
                    {u.project ? (
                      <>
                        <Link href={`/projekty/${u.project.id}`} className="hover:text-gold-deep">
                          {u.project.name}
                        </Link>
                        {u.project.client && <div className="text-[11.5px] text-ink-3">{u.project.client.name}</div>}
                      </>
                    ) : (
                      <span className="text-ink-3">bez projektu</span>
                    )}
                  </Td>
                  <Td>
                    <Avatar jmeno={u.assignee?.full_name} barva={u.assignee?.color} />
                  </Td>
                  <Td className={pozde ? "text-bad" : ""}>
                    <span className="font-mono text-[12.5px]">{datum(u.due_on)}</span>
                  </Td>
                  <Td className="font-mono text-[12.5px]">{u.est_hours ? `${cislo(u.est_hours)} h` : "—"}</Td>
                  <Td>
                    <Pill tridy={STAV_UKOLU[u.status_code]}>{stavyUkolu[u.status_code]}</Pill>
                  </Td>
                  <Td>
                    <form action={zmenStavUkoluGlobal} className="flex gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <select name="status_code" defaultValue={u.status_code} className="rounded border border-line-2 px-1.5 py-1 text-[12px]">
                        {Object.entries(stavyUkolu).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <button className={`${btn.obrys} ${btn.maly}`}>Uložit</button>
                    </form>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="Rychlý interní úkol" >
        <form action={pridejInterniUkol} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
          <Pole label="Co je potřeba udělat">
            <input name="title" required className={vstup} placeholder="Např. Dodělat cenotvorbu balíčků" />
          </Pole>
          <Pole label="Typ">
            <select name="kind" defaultValue="internal" className={vstup}>
              <option value="internal">Interní</option>
              <option value="sales">Obchodní</option>
              <option value="admin">Administrativa</option>
            </select>
          </Pole>
          <Pole label="Řešitel">
            <select name="assignee_id" className={vstup}>
              <option value="">— já —</option>
              {tym?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </Pole>
          <Pole label="Termín">
            <input type="date" name="due_on" className={vstup} />
          </Pole>
          <div className="flex items-end">
            <button className={btn.primar}>Přidat</button>
          </div>
        </form>
      </Card>
    </>
  );
}
