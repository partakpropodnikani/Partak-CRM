import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ciselnik, mapaKodu } from "@/lib/codes";
import { Card, Chyba, Empty, Pill, Pole, btn, vstup } from "@/components/ui";
import { datum, dniDo, kc } from "@/lib/format";
import { konvertujLead, posunFazi, ulozKrokLeadu } from "../actions";

export default async function LeadDetail({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ chyba?: string }>;
}) {
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await createClient();

  const { data: l } = await supabase
    .from("leads")
    .select("*, owner:profiles!leads_owner_id_fkey ( full_name, color )")
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!l) notFound();

  const [faze, balicky, zdroje] = await Promise.all([ciselnik("lead_stage"), ciselnik("client_package"), mapaKodu("lead_source")]);
  const pozde = l.next_action_on && (dniDo(l.next_action_on) ?? 0) < 0;
  const uzKonvertovan = Boolean(l.converted_client_id);

  return (
    <>
      <Link href="/obchod" className="mb-4 inline-block text-[12.5px] text-ink-3 hover:text-ink-1">← Pipeline</Link>

      <header className="mb-5">
        <h1 className="font-display text-[22px] font-medium">{l.title}</h1>
        <p className="mt-0.5 text-[13px] text-ink-3">
          {l.company ?? "bez firmy"}
          {l.contact_name ? ` · ${l.contact_name}` : ""}
          {l.owner?.full_name ? ` · vlastník ${l.owner.full_name}` : ""}
        </p>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Pill tridy="bg-gold-soft text-gold-deep">{kc(l.estimated_value)}</Pill>
          <Pill>{faze.find((f) => f.code === l.stage_code)?.label ?? l.stage_code}</Pill>
          {l.source_code && <Pill>zdroj: {zdroje[l.source_code]}</Pill>}
        </div>
      </header>

      <Chyba text={sp.chyba} />

      <div className="grid gap-4 md:grid-cols-[1.3fr_1fr] md:items-start">
        <div className="space-y-4">
          <Card title="Posunout ve fázi">
            <div className="flex flex-wrap gap-1.5">
              {faze.map((f) => (
                <form action={posunFazi} key={f.code}>
                  <input type="hidden" name="id" value={l.id} />
                  <input type="hidden" name="stage_code" value={f.code} />
                  <button
                    className={`rounded border px-2.5 py-1 text-[12px] ${
                      f.code === l.stage_code
                        ? "border-gold-deep bg-gold-soft text-gold-deep"
                        : "border-line-2 bg-white text-ink-2 hover:border-gold-deep"
                    }`}
                  >
                    {f.label}
                  </button>
                </form>
              ))}
            </div>
          </Card>

          <Card title="Další krok">
            <form action={ulozKrokLeadu} className="flex flex-wrap items-end gap-3">
              <input type="hidden" name="id" value={l.id} />
              <div className="min-w-[240px] flex-1">
                <Pole label="Co se má stát" hint="Žádný relevantní lead nesmí propadnout bez dalšího kroku.">
                  <input name="next_action" defaultValue={l.next_action ?? ""} className={`${vstup} ${!l.next_action || pozde ? "border-bad" : ""}`} />
                </Pole>
              </div>
              <div className="w-40">
                <Pole label="Do kdy">
                  <input type="date" name="next_action_on" defaultValue={l.next_action_on ?? ""} className={vstup} />
                </Pole>
              </div>
              <button className={btn.primar}>Uložit</button>
            </form>
          </Card>

          <Card title="Konverze na klienta">
            {uzKonvertovan ? (
              <p className="text-[13px]">
                Lead už byl převeden na klienta {datum(l.converted_at)}.{" "}
                <Link href={`/klienti/${l.converted_client_id}`} className="text-gold-deep hover:underline">
                  Otevřít klienta →
                </Link>
              </p>
            ) : (
              <form action={konvertujLead} className="space-y-3">
                <input type="hidden" name="id" value={l.id} />
                <p className="text-[12.5px] text-ink-3">
                  Vytvoří se klient, přenese se kontaktní osoba, lead se označí jako vyhraný a vznikne onboarding úkol
                  s termínem za tři dny. Akci nelze vrátit jedním klikem — zkontroluj údaje.
                </p>
                <div className="grid gap-3 md:grid-cols-3">
                  <Pole label="Název klienta">
                    <input name="client_name" defaultValue={l.company ?? l.title} className={vstup} />
                  </Pole>
                  <Pole label="IČO">
                    <input name="reg_no" className={vstup} />
                  </Pole>
                  <Pole label="Balíček">
                    <select name="package_code" className={vstup}>
                      <option value="">—</option>
                      {balicky.map((b) => (
                        <option key={b.code} value={b.code}>{b.label}</option>
                      ))}
                    </select>
                  </Pole>
                </div>
                <label className="flex items-center gap-2 text-[13px]">
                  <input type="checkbox" name="zalozit_projekt" defaultChecked /> Pokračovat rovnou na založení prvního projektu
                </label>
                <button className={btn.primar}>Převést na klienta</button>
              </form>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Kontakt">
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-3">Osoba</dt><dd>{l.contact_name ?? "—"}</dd>
              <dt className="text-ink-3">E-mail</dt>
              <dd>{l.email ? <a href={`mailto:${l.email}`} className="hover:text-gold-deep">{l.email}</a> : "—"}</dd>
              <dt className="text-ink-3">Telefon</dt><dd className="font-mono">{l.phone ?? "—"}</dd>
              <dt className="text-ink-3">Vytvořeno</dt><dd>{datum(l.created_at)}</dd>
            </dl>
          </Card>

          <Card title="Poznámky">
            {l.notes ? <p className="whitespace-pre-wrap text-[13px]">{l.notes}</p> : <Empty nadpis="Bez poznámek" popis="Kontext příležitosti: co klient řeší, čemu rozumí, kdo rozhoduje." />}
          </Card>
        </div>
      </div>
    </>
  );
}
