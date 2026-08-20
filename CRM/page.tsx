import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ciselnik, mapaKodu } from "@/lib/codes";
import { Avatar, Card, Empty, Pill, Pole, Progres, Table, Td, ZdraviPill, btn, vstup } from "@/components/ui";
import { PRIORITA, STAV_UKOLU, cislo, datum, datumCas, dniDo, dnesISO, kc } from "@/lib/format";
import {
  pridejMilnik,
  pridejUkol,
  prepniMilnik,
  ulozDalsiKrok,
  zapisCas,
  zmenFazi,
  zmenStav,
  zmenStavUkolu,
} from "../actions";

const ZALOZKY = [
  { klic: "prehled", label: "Přehled" },
  { klic: "ukoly", label: "Úkoly" },
  { klic: "milniky", label: "Milníky" },
  { klic: "cas", label: "Čas" },
  { klic: "aktivita", label: "Aktivita" },
];

export default async function ProjektDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab = "prehled" } = await searchParams;
  const supabase = await createClient();

  const { data: p } = await supabase
    .from("projects")
    .select(
      `*, client:clients ( id, name, package_code ),
       manager:profiles!projects_manager_id_fkey ( id, full_name, color )`
    )
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!p) notFound();

  const [stavy, faze, priority, stavyUkolu, fazeSeznam, stavySeznam] = await Promise.all([
    mapaKodu("project_status"),
    mapaKodu("project_phase"),
    mapaKodu("priority"),
    mapaKodu("task_status"),
    ciselnik("project_phase"),
    ciselnik("project_status"),
  ]);

  const [{ data: zdravi }, { data: hodiny }, { data: tym }] = await Promise.all([
    supabase.from("v_project_health").select("health, score, reasons").eq("id", id).maybeSingle(),
    supabase.from("v_project_hours").select("actual_hours, hours_pct").eq("project_id", id).maybeSingle(),
    supabase.from("profiles").select("id, full_name").eq("account_type", "internal").eq("status", "active").order("full_name"),
  ]);

  const krokPozde = p.next_action_on && (dniDo(p.next_action_on) ?? 0) < 0;
  const dniDoTerminu = dniDo(p.due_on);

  return (
    <>
      <Link href="/projekty" className="mb-4 inline-block text-[12.5px] text-ink-3 hover:text-ink-1">
        ← Projekty
      </Link>

      {/* hlavička */}
      <Card className="mb-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-[240px] flex-1">
            <h1 className="font-display text-[21px] font-medium">{p.name}</h1>
            <p className="mt-0.5 text-[13px] text-ink-3">
              {p.client ? (
                <Link href={`/klienti/${p.client.id}`} className="hover:text-gold-deep">
                  {p.client.name}
                </Link>
              ) : (
                "—"
              )}
              {" · PM "}
              {p.manager?.full_name ?? "nepřiřazen"}
            </p>
            <div className="mt-2.5 flex flex-wrap gap-1.5">
              <ZdraviPill health={zdravi?.health} score={zdravi?.score} reasons={zdravi?.reasons} />
              <Pill tridy={PRIORITA[p.priority_code]}>{priority[p.priority_code]}</Pill>
              <Pill>{stavy[p.status_code]}</Pill>
              {p.due_on && (
                <Pill tridy={dniDoTerminu !== null && dniDoTerminu < 0 ? "bg-bad-bg text-bad" : "bg-paper text-ink-3"}>
                  Termín {datum(p.due_on)}
                </Pill>
              )}
            </div>
          </div>

          <form action={zmenStav} className="flex items-center gap-2">
            <input type="hidden" name="id" value={p.id} />
            <select name="status_code" defaultValue={p.status_code} className={`${vstup} w-48`}>
              {stavySeznam.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.label}
                </option>
              ))}
            </select>
            <button className={btn.obrys}>Uložit stav</button>
          </form>
        </div>

        {/* workflow */}
        <div className="mt-4 border-t border-line pt-3">
          <p className="mb-2 text-[10.5px] uppercase tracking-wide text-ink-3">Fáze projektu</p>
          <div className="flex flex-wrap gap-1.5">
            {fazeSeznam.map((f, i) => {
              const aktualni = f.code === p.phase_code;
              const poradiAkt = fazeSeznam.findIndex((x) => x.code === p.phase_code);
              const hotova = i < poradiAkt;
              return (
                <form action={zmenFazi} key={f.code}>
                  <input type="hidden" name="id" value={p.id} />
                  <input type="hidden" name="phase_code" value={f.code} />
                  <button
                    className={`rounded border px-2.5 py-1 text-[11.5px] ${
                      aktualni
                        ? "border-gold-deep bg-gold-soft text-gold-deep"
                        : hotova
                        ? "border-line bg-paper text-ink-3 line-through"
                        : "border-line-2 bg-white text-ink-2 hover:border-gold-deep"
                    }`}
                  >
                    {f.label}
                  </button>
                </form>
              );
            })}
          </div>
        </div>
      </Card>

      {/* další krok — management by exception */}
      <div
        className={`mb-4 rounded border border-line bg-white p-4 ${
          zdravi?.health === "red" ? "border-l-[3px] border-l-bad" : zdravi?.health === "orange" ? "border-l-[3px] border-l-warn" : "border-l-[3px] border-l-ok"
        }`}
      >
        <form action={ulozDalsiKrok} className="flex flex-wrap items-end gap-3">
          <input type="hidden" name="id" value={p.id} />
          <div className="min-w-[260px] flex-1">
            <Pole label="Další krok" hint="Projekt bez dalšího kroku je v Rizicích označen jako problém.">
              <input
                name="next_action"
                defaultValue={p.next_action ?? ""}
                placeholder="Např. Zavolat klientce a odsouhlasit texty"
                className={`${vstup} ${!p.next_action || krokPozde ? "border-bad" : ""}`}
              />
            </Pole>
          </div>
          <div className="w-44">
            <Pole label="Do kdy">
              <input type="date" name="next_action_on" defaultValue={p.next_action_on ?? ""} className={vstup} />
            </Pole>
          </div>
          <button className={btn.primar}>Uložit</button>
        </form>
        {zdravi?.reasons?.length ? (
          <p className="mt-2 text-[11.5px] text-ink-3">Zdraví: {zdravi.reasons.join(" · ")}</p>
        ) : null}
      </div>

      {/* záložky */}
      <div className="mb-4 flex gap-1 border-b border-line">
        {ZALOZKY.map((z) => (
          <Link
            key={z.klic}
            href={`/projekty/${p.id}?tab=${z.klic}`}
            className={`-mb-px border-b-2 px-3 py-2 text-[13px] ${
              tab === z.klic ? "border-gold-deep font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-1"
            }`}
          >
            {z.label}
          </Link>
        ))}
      </div>

      {tab === "prehled" && <Prehled p={p} hodiny={hodiny} />}
      {tab === "ukoly" && <Ukoly projektId={p.id} stavyUkolu={stavyUkolu} priority={priority} tym={tym ?? []} />}
      {tab === "milniky" && <Milniky projektId={p.id} />}
      {tab === "cas" && <Cas projektId={p.id} hodiny={hodiny} planovano={p.planned_hours} />}
      {tab === "aktivita" && <Aktivita projektId={p.id} />}
    </>
  );
}

/* ══ Přehled ════════════════════════════════════════════════════════════ */
function Prehled({ p, hodiny }: { p: any; hodiny: any }) {
  const pct = Number(hodiny?.hours_pct ?? 0);
  return (
    <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
      <Card title="Očekávaný výsledek">
        <p className="whitespace-pre-wrap text-[14px]">
          {p.expected_result || (
            <span className="text-ink-3">
              Nevyplněno. Bez definovaného výsledku nejde projekt na konci vyhodnotit — a klient neví, co dostane.
            </span>
          )}
        </p>
      </Card>

      <Card title="Čísla projektu">
        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
          <dt className="text-ink-3">Cena</dt>
          <dd className="font-mono">{kc(p.price)}</dd>
          <dt className="text-ink-3">Způsob</dt>
          <dd>{{ fixed: "Fixní", hourly: "Hodinově", retainer: "Paušál", custom: "Individuální" }[p.pricing_model as string] ?? "—"}</dd>
          <dt className="text-ink-3">Hodinová sazba</dt>
          <dd className="font-mono">{kc(p.hourly_rate)}</dd>
          <dt className="text-ink-3">Hodiny</dt>
          <dd className="font-mono">
            {cislo(hodiny?.actual_hours ?? 0)} / {cislo(p.planned_hours, 0)} h
          </dd>
          <dt className="text-ink-3">Fakturováno</dt>
          <dd className="font-mono">{kc(p.invoiced_amount)}</dd>
          <dt className="text-ink-3">Zahájeno</dt>
          <dd>{datum(p.started_on)}</dd>
          <dt className="text-ink-3">Poslední aktivita</dt>
          <dd>{datumCas(p.last_activity_at)}</dd>
        </dl>
        {p.planned_hours ? (
          <div className="mt-3">
            <Progres pct={pct} barva={pct > 100 ? "bg-bad" : "bg-gold-deep"} />
            <p className="mt-1 text-[11.5px] text-ink-3">{cislo(pct, 0)} % rozpočtu hodin</p>
          </div>
        ) : null}
      </Card>
    </div>
  );
}

/* ══ Úkoly ══════════════════════════════════════════════════════════════ */
async function Ukoly({
  projektId,
  stavyUkolu,
  priority,
  tym,
}: {
  projektId: string;
  stavyUkolu: Record<string, string>;
  priority: Record<string, string>;
  tym: { id: string; full_name: string }[];
}) {
  const supabase = await createClient();
  const { data: ukoly } = await supabase
    .from("tasks")
    .select("id, title, status_code, priority_code, due_on, est_hours, waiting_for, assignee:profiles!tasks_assignee_id_fkey ( full_name, color )")
    .eq("project_id", projektId)
    .is("deleted_at", null)
    .order("status_code")
    .order("due_on", { nullsFirst: false });

  return (
    <div className="space-y-4">
      <Card title="Úkoly">
        {!ukoly?.length ? (
          <Empty
            nadpis="Projekt zatím nemá úkoly"
            popis="Úkoly se obvykle vytvoří ze šablony při založení projektu. Můžeš je přidat i ručně níže."
          />
        ) : (
          <Table hlavicka={["Úkol", "Řešitel", "Termín", "Odhad", "Stav", ""]}>
            {ukoly.map((u: any) => {
              const dni = dniDo(u.due_on);
              return (
                <tr key={u.id}>
                  <Td>
                    <span className={u.status_code === "done" ? "line-through opacity-60" : "font-medium"}>{u.title}</span>
                    <div className="mt-1 flex gap-1.5">
                      <Pill tridy={PRIORITA[u.priority_code]}>{priority[u.priority_code]}</Pill>
                      {u.waiting_for && <Pill tridy="bg-warn-bg text-warn">čeká: {u.waiting_for}</Pill>}
                    </div>
                  </Td>
                  <Td>
                    <Avatar jmeno={u.assignee?.full_name} barva={u.assignee?.color} />
                  </Td>
                  <Td className={dni !== null && dni < 0 && u.status_code !== "done" ? "text-bad" : ""}>
                    <span className="font-mono text-[12.5px]">{datum(u.due_on)}</span>
                  </Td>
                  <Td className="font-mono text-[12.5px]">{u.est_hours ? `${cislo(u.est_hours)} h` : "—"}</Td>
                  <Td>
                    <Pill tridy={STAV_UKOLU[u.status_code]}>{stavyUkolu[u.status_code]}</Pill>
                  </Td>
                  <Td>
                    <form action={zmenStavUkolu} className="flex gap-1">
                      <input type="hidden" name="id" value={u.id} />
                      <input type="hidden" name="project_id" value={projektId} />
                      <select name="status_code" defaultValue={u.status_code} className="rounded border border-line-2 px-1.5 py-1 text-[12px]">
                        {Object.entries(stavyUkolu).map(([k, v]) => (
                          <option key={k} value={k}>
                            {v}
                          </option>
                        ))}
                      </select>
                      <button className={`${btn.obrys} ${btn.maly}`}>Změnit</button>
                    </form>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="Přidat úkol">
        <form action={pridejUkol} className="grid gap-3 md:grid-cols-[2fr_1fr_1fr_0.7fr_auto]">
          <input type="hidden" name="project_id" value={projektId} />
          <Pole label="Název">
            <input name="title" required className={vstup} placeholder="Co je potřeba udělat" />
          </Pole>
          <Pole label="Řešitel">
            <select name="assignee_id" className={vstup}>
              <option value="">— já —</option>
              {tym.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </Pole>
          <Pole label="Termín">
            <input type="date" name="due_on" className={vstup} />
          </Pole>
          <Pole label="Odhad h">
            <input name="est_hours" type="number" step="0.5" min="0" className={vstup} />
          </Pole>
          <div className="flex items-end">
            <button className={btn.primar}>Přidat</button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ══ Milníky ════════════════════════════════════════════════════════════ */
async function Milniky({ projektId }: { projektId: string }) {
  const supabase = await createClient();
  const { data: milniky } = await supabase
    .from("milestones")
    .select("id, title, description, due_on, is_done, done_on")
    .eq("project_id", projektId)
    .order("due_on", { nullsFirst: false });

  return (
    <div className="space-y-4">
      <Card title="Milníky">
        {!milniky?.length ? (
          <Empty
            nadpis="Projekt nemá milníky"
            popis="Milník je bod, po kterém se dá říct „tato část je hotová a odsouhlasená“. Bez milníků se zpoždění pozná až na konci."
          />
        ) : (
          <Table hlavicka={["Milník", "Termín", "Stav", ""]}>
            {milniky.map((m) => {
              const dni = dniDo(m.due_on);
              const pozde = !m.is_done && dni !== null && dni < 0;
              return (
                <tr key={m.id}>
                  <Td>
                    <span className={m.is_done ? "line-through opacity-60" : "font-medium"}>{m.title}</span>
                    {m.description && <div className="text-[12px] text-ink-3">{m.description}</div>}
                  </Td>
                  <Td className={pozde ? "text-bad" : ""}>
                    <span className="font-mono text-[12.5px]">{datum(m.due_on)}</span>
                  </Td>
                  <Td>
                    {m.is_done ? (
                      <Pill tridy="bg-ok-bg text-ok">Splněno {datum(m.done_on)}</Pill>
                    ) : pozde ? (
                      <Pill tridy="bg-bad-bg text-bad">Po termínu</Pill>
                    ) : (
                      <Pill tridy="bg-info-bg text-info">Otevřený</Pill>
                    )}
                  </Td>
                  <Td>
                    <form action={prepniMilnik}>
                      <input type="hidden" name="id" value={m.id} />
                      <input type="hidden" name="project_id" value={projektId} />
                      <input type="hidden" name="is_done" value={String(m.is_done)} />
                      <button className={`${btn.obrys} ${btn.maly}`}>{m.is_done ? "Otevřít" : "Splněno"}</button>
                    </form>
                  </Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>

      <Card title="Přidat milník">
        <form action={pridejMilnik} className="grid gap-3 md:grid-cols-[2fr_1fr_2fr_auto]">
          <input type="hidden" name="project_id" value={projektId} />
          <Pole label="Název">
            <input name="title" required className={vstup} placeholder="Např. Schválené texty webu" />
          </Pole>
          <Pole label="Termín">
            <input type="date" name="due_on" className={vstup} />
          </Pole>
          <Pole label="Podmínka splnění">
            <input name="description" className={vstup} placeholder="Co musí být hotové" />
          </Pole>
          <div className="flex items-end">
            <button className={btn.primar}>Přidat</button>
          </div>
        </form>
      </Card>
    </div>
  );
}

/* ══ Čas ════════════════════════════════════════════════════════════════ */
async function Cas({ projektId, hodiny, planovano }: { projektId: string; hodiny: any; planovano: number | null }) {
  const supabase = await createClient();
  const { data: zaznamy } = await supabase
    .from("time_entries")
    .select("id, entry_date, hours, note, billable, user:profiles!time_entries_user_id_fkey ( full_name, color )")
    .eq("project_id", projektId)
    .order("entry_date", { ascending: false })
    .limit(50);

  return (
    <div className="space-y-4">
      <Card title="Zapsat čas">
        <form action={zapisCas} className="grid gap-3 md:grid-cols-[1fr_0.7fr_2fr_auto_auto]">
          <input type="hidden" name="project_id" value={projektId} />
          <Pole label="Datum">
            <input type="date" name="entry_date" defaultValue={dnesISO()} className={vstup} />
          </Pole>
          <Pole label="Hodin">
            <input name="hours" type="number" step="0.25" min="0.25" required className={vstup} />
          </Pole>
          <Pole label="Co jsi dělal">
            <input name="note" className={vstup} placeholder="Např. Design podstránek" />
          </Pole>
          <label className="flex items-end gap-2 pb-2 text-[12.5px]">
            <input type="checkbox" name="billable" defaultChecked /> fakturovatelné
          </label>
          <div className="flex items-end">
            <button className={btn.primar}>Zapsat</button>
          </div>
        </form>
      </Card>

      <Card title={`Zapsaný čas — celkem ${cislo(hodiny?.actual_hours ?? 0)} h${planovano ? ` z ${cislo(planovano, 0)} h` : ""}`}>
        {!zaznamy?.length ? (
          <Empty nadpis="Zatím žádný zapsaný čas" popis="Čas se píše průběžně, ne zpětně na konci měsíce — jinak čísla nesedí a projekt vypadá levnější, než byl." />
        ) : (
          <Table hlavicka={["Datum", "Kdo", "Hodin", "Poznámka", ""]}>
            {zaznamy.map((z: any) => (
              <tr key={z.id}>
                <Td className="font-mono text-[12.5px]">{datum(z.entry_date)}</Td>
                <Td>
                  <Avatar jmeno={z.user?.full_name} barva={z.user?.color} />
                </Td>
                <Td className="font-mono">{cislo(z.hours)} h</Td>
                <Td className="text-ink-2">{z.note ?? "—"}</Td>
                <Td>{z.billable ? <Pill tridy="bg-ok-bg text-ok">fakturovatelné</Pill> : <Pill>interní</Pill>}</Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
}

/* ══ Aktivita ═══════════════════════════════════════════════════════════ */
async function Aktivita({ projektId }: { projektId: string }) {
  const supabase = await createClient();
  const { data: log } = await supabase
    .from("activity_log")
    .select("id, occurred_at, action, field, old_value, new_value, actor:profiles!activity_log_actor_id_fkey ( full_name )")
    .eq("entity_type", "project")
    .eq("entity_id", projektId)
    .order("occurred_at", { ascending: false })
    .limit(50);

  const POPIS: Record<string, string> = {
    created: "projekt založen",
    updated: "změna",
    status_changed: "změna stavu",
    deleted: "smazáno",
  };

  return (
    <Card title="Historie změn">
      {!log?.length ? (
        <Empty nadpis="Zatím žádné zaznamenané změny" popis="Audit se zapisuje automaticky v databázi při každé změně stavu, fáze, termínu, PM, dalšího kroku nebo ceny." />
      ) : (
        <ul className="space-y-2.5">
          {log.map((z: any) => (
            <li key={z.id} className="flex gap-3 border-b border-line/60 pb-2.5 text-[13px]">
              <span className="w-32 shrink-0 font-mono text-[12px] text-ink-3">{datumCas(z.occurred_at)}</span>
              <span className="w-32 shrink-0 text-ink-2">{z.actor?.full_name ?? "systém"}</span>
              <span>
                {POPIS[z.action] ?? z.action}
                {z.field ? ` · ${z.field}` : ""}
                {z.old_value || z.new_value ? (
                  <span className="text-ink-3">
                    {" "}
                    {z.old_value || "—"} → <span className="text-ink-1">{z.new_value || "—"}</span>
                  </span>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
