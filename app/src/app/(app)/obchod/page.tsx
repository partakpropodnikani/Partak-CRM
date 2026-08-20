import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ciselnik, mapaKodu } from "@/lib/codes";
import { Card, Empty, Pill, Pole, btn, vstup } from "@/components/ui";
import { datum, dniDo, kc } from "@/lib/format";
import { posunFazi, ulozKrokLeadu, vytvorLead } from "./actions";

export default async function Obchod() {
  const supabase = await createClient();

  const [faze, zdroje] = await Promise.all([ciselnik("lead_stage"), ciselnik("lead_source")]);
  const zdrojeMapa = await mapaKodu("lead_source");

  const [{ data: leady, error }, { data: tym }] = await Promise.all([
    supabase
      .from("leads")
      .select("*, owner:profiles!leads_owner_id_fkey ( full_name, color )")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("profiles").select("id, full_name").eq("account_type", "internal").eq("status", "active").order("full_name"),
  ]);

  // sloupce pipeline: jen fáze před uzavřením
  const sloupce = faze.filter((f) => !["won", "lost", "postponed"].includes(f.code));
  const uzavrene = (leady ?? []).filter((l: any) => ["won", "lost", "postponed"].includes(l.stage_code));
  const otevrene = (leady ?? []).filter((l: any) => !["won", "lost", "postponed"].includes(l.stage_code));
  const potencial = otevrene.reduce((s: number, l: any) => s + (Number(l.estimated_value) || 0), 0);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-3">Obchod</p>
          <h1 className="text-[22px] font-medium">Pipeline</h1>
        </div>
        <p className="ml-auto text-[13px] text-ink-3">
          {otevrene.length} otevřených příležitostí · potenciál <span className="font-mono text-ink-1">{kc(potencial)}</span>
        </p>
      </header>

      {error && <p className="mb-4 text-[13px] text-bad">Data se nepodařilo načíst: {error.message}</p>}

      <div className="mb-5 grid gap-3 md:grid-cols-4">
        {sloupce.map((f) => {
          const vSloupci = otevrene.filter((l: any) => l.stage_code === f.code);
          const hodnota = vSloupci.reduce((s: number, l: any) => s + (Number(l.estimated_value) || 0), 0);
          return (
            <div key={f.code} className="rounded border border-line bg-white">
              <div className="flex items-baseline gap-2 border-b border-line px-3 py-2">
                <h2 className="font-display text-[13.5px] font-medium">{f.label}</h2>
                <span className="ml-auto text-[11px] text-ink-3">
                  {vSloupci.length} · {kc(hodnota)}
                </span>
              </div>
              <div className="space-y-2 p-2.5">
                {!vSloupci.length && <p className="px-1 py-3 text-center text-[12px] text-ink-3">prázdné</p>}
                {vSloupci.map((l: any) => {
                  const bezKroku = !l.next_action;
                  const pozde = l.next_action_on && (dniDo(l.next_action_on) ?? 0) < 0;
                  return (
                    <article
                      key={l.id}
                      className={`rounded border bg-paper-2 p-2.5 ${bezKroku || pozde ? "border-bad/40" : "border-line"}`}
                    >
                      <Link href={`/obchod/${l.id}`} className="text-[13px] font-medium hover:text-gold-deep">
                        {l.title}
                      </Link>
                      {l.company && <p className="text-[11.5px] text-ink-3">{l.company}</p>}
                      <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                        <Pill tridy="bg-gold-soft text-gold-deep">{kc(l.estimated_value)}</Pill>
                        {l.source_code && <Pill>{zdrojeMapa[l.source_code]}</Pill>}
                      </div>
                      <p className={`mt-1.5 text-[11.5px] ${bezKroku || pozde ? "text-bad" : "text-ink-3"}`}>
                        {l.next_action ? `${l.next_action} · ${datum(l.next_action_on)}` : "chybí další krok"}
                      </p>

                      <form action={ulozKrokLeadu} className="mt-2 space-y-1.5">
                        <input type="hidden" name="id" value={l.id} />
                        <input
                          name="next_action"
                          defaultValue={l.next_action ?? ""}
                          placeholder="další krok"
                          className="w-full rounded border border-line-2 px-2 py-1 text-[12px] outline-none focus:border-gold-deep"
                        />
                        <div className="flex gap-1.5">
                          <input
                            type="date"
                            name="next_action_on"
                            defaultValue={l.next_action_on ?? ""}
                            className="flex-1 rounded border border-line-2 px-1.5 py-1 text-[11.5px]"
                          />
                          <button className={`${btn.obrys} ${btn.maly}`}>Uložit</button>
                        </div>
                      </form>

                      <div className="mt-2 flex flex-wrap gap-1">
                        {faze
                          .filter((x) => x.code !== l.stage_code)
                          .slice(0, 5)
                          .map((x) => (
                            <form action={posunFazi} key={x.code}>
                              <input type="hidden" name="id" value={l.id} />
                              <input type="hidden" name="stage_code" value={x.code} />
                              <button className="rounded border border-line-2 bg-white px-1.5 py-0.5 text-[10.5px] text-ink-2 hover:border-gold-deep">
                                → {x.label}
                              </button>
                            </form>
                          ))}
                      </div>
                    </article>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>

      <Card title="Nová příležitost" className="mb-4">
        <form action={vytvorLead} className="grid gap-3 md:grid-cols-4">
          <Pole label="Název *">
            <input name="title" required className={vstup} placeholder="Např. Kavárna Dolce" />
          </Pole>
          <Pole label="Firma">
            <input name="company" className={vstup} />
          </Pole>
          <Pole label="Kontaktní osoba">
            <input name="contact_name" className={vstup} />
          </Pole>
          <Pole label="Telefon">
            <input name="phone" className={vstup} />
          </Pole>
          <Pole label="E-mail">
            <input name="email" type="email" className={vstup} />
          </Pole>
          <Pole label="Fáze">
            <select name="stage_code" defaultValue="lead" className={vstup}>
              {sloupce.map((f) => (
                <option key={f.code} value={f.code}>
                  {f.label}
                </option>
              ))}
            </select>
          </Pole>
          <Pole label="Zdroj">
            <select name="source_code" className={vstup}>
              <option value="">—</option>
              {zdroje.map((z) => (
                <option key={z.code} value={z.code}>
                  {z.label}
                </option>
              ))}
            </select>
          </Pole>
          <Pole label="Odhad hodnoty (Kč)">
            <input name="estimated_value" type="number" step="1000" min="0" className={vstup} />
          </Pole>
          <Pole label="Vlastník">
            <select name="owner_id" className={vstup}>
              <option value="">— já —</option>
              {tym?.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </Pole>
          <Pole label="Další krok" hint="Bez něj se lead objeví v Rizicích.">
            <input name="next_action" className={vstup} placeholder="Např. Zavolat a domluvit schůzku" />
          </Pole>
          <Pole label="Do kdy">
            <input type="date" name="next_action_on" className={vstup} />
          </Pole>
          <div className="flex items-end">
            <button className={btn.primar}>Přidat příležitost</button>
          </div>
        </form>
      </Card>

      <Card title={`Uzavřené (${uzavrene.length})`}>
        {!uzavrene.length ? (
          <Empty nadpis="Zatím žádné uzavřené příležitosti" popis="Vyhrané leady se sem přesunou po konverzi na klienta, prohrané po označení „Ztraceno“." />
        ) : (
          <ul className="space-y-2">
            {uzavrene.map((l: any) => (
              <li key={l.id} className="flex flex-wrap items-center gap-2 border-b border-line/60 pb-2 text-[13px]">
                <Link href={`/obchod/${l.id}`} className="font-medium hover:text-gold-deep">
                  {l.title}
                </Link>
                <span className="text-ink-3">{l.company}</span>
                <Pill tridy={l.stage_code === "won" ? "bg-ok-bg text-ok" : l.stage_code === "lost" ? "bg-bad-bg text-bad" : "bg-warn-bg text-warn"}>
                  {faze.find((f) => f.code === l.stage_code)?.label ?? l.stage_code}
                </Pill>
                <span className="ml-auto font-mono text-[12.5px]">{kc(l.estimated_value)}</span>
                {l.converted_client_id && (
                  <Link href={`/klienti/${l.converted_client_id}`} className="text-[12px] text-ink-3 hover:text-gold-deep">
                    otevřít klienta →
                  </Link>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
