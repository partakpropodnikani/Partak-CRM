import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { mapaKodu } from "@/lib/codes";
import { Avatar, Card, Empty, LinkBtn, Pill, Pole, Table, Td, ZdraviPill, btn, vstup } from "@/components/ui";
import { datum, datumCas, dniDo, kc } from "@/lib/format";
import { pridejKontakt, smazKontakt, ulozPoznamkuKlienta } from "../actions";

export default async function KlientDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: k } = await supabase
    .from("clients")
    .select(`*, owner:profiles!clients_owner_id_fkey ( full_name, color )`)
    .eq("id", id)
    .is("deleted_at", null)
    .single();

  if (!k) notFound();

  const [balicky, odvetvi, zdroje, stavy] = await Promise.all([
    mapaKodu("client_package"),
    mapaKodu("industry"),
    mapaKodu("lead_source"),
    mapaKodu("project_status"),
  ]);

  const [{ data: kontakty }, { data: projekty }, { data: zdraviData }, { data: schuzky }] = await Promise.all([
    supabase.from("contacts").select("*").eq("client_id", id).is("deleted_at", null).order("is_primary", { ascending: false }),
    supabase
      .from("projects")
      .select("id, name, status_code, due_on, price, next_action, next_action_on")
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("due_on", { nullsFirst: false }),
    supabase.from("v_project_health").select("id, health, score, reasons"),
    supabase
      .from("meetings")
      .select("id, title, starts_at, kind, is_done")
      .eq("client_id", id)
      .is("deleted_at", null)
      .order("starts_at", { ascending: false })
      .limit(5),
  ]);

  const zdravi = new Map<string, any>();
  ((zdraviData as any[] | null) ?? []).forEach((z) => zdravi.set(z.id, z));
  const bezici = projekty?.filter((p) => !["done", "cancelled", "archived"].includes(p.status_code)) ?? [];
  const hodnota = projekty?.reduce((s, p) => s + (Number(p.price) || 0), 0) ?? 0;

  return (
    <>
      <Link href="/klienti" className="mb-4 inline-block text-[12.5px] text-ink-3 hover:text-ink-1">
        ← Klienti
      </Link>

      <header className="mb-5 flex flex-wrap items-start gap-3">
        <div>
          <h1 className="font-display text-[22px] font-medium">{k.name}</h1>
          <p className="mt-0.5 text-[13px] text-ink-3">
            {k.reg_no ? `IČO ${k.reg_no} · ` : ""}
            {odvetvi[k.industry_code] ?? "odvětví neuvedeno"}
            {k.website ? ` · ${k.website}` : ""}
          </p>
        </div>
        <div className="ml-auto flex gap-2">
          <LinkBtn href={`/projekty/novy?klient=${k.id}`} varianta="primar">
            + Nový projekt
          </LinkBtn>
        </div>
      </header>

      <div className="mb-4 grid gap-3 sm:grid-cols-4">
        <Statistika popisek="Běžící projekty" hodnota={String(bezici.length)} poznamka={`z ${projekty?.length ?? 0} celkem`} />
        <Statistika popisek="Hodnota spolupráce" hodnota={kc(hodnota)} poznamka="součet cen projektů" />
        <Statistika popisek="Balíček" hodnota={balicky[k.package_code] ?? "—"} poznamka={zdroje[k.source_code] ? `zdroj: ${zdroje[k.source_code]}` : ""} />
        <Statistika popisek="Získán" hodnota={datum(k.acquired_on)} poznamka={k.owner?.full_name ? `správce ${k.owner.full_name}` : ""} />
      </div>

      <div className="grid gap-4 md:grid-cols-[1.5fr_1fr] md:items-start">
        <div className="space-y-4">
          <Card title="Projekty">
            {!projekty?.length ? (
              <Empty
                nadpis="Klient nemá žádný projekt"
                popis="Veškerá práce se dělá v projektech — i jednorázová konzultace. Jinak se nedá měřit čas ani vyhodnotit přínos."
                cta={<LinkBtn href={`/projekty/novy?klient=${k.id}`} varianta="primar">Založit projekt</LinkBtn>}
              />
            ) : (
              <Table hlavicka={["Projekt", "Stav", "Zdraví", "Další krok", "Termín", "Cena"]}>
                {projekty.map((p: any) => {
                  const z: any = zdravi.get(p.id);
                  const dni = dniDo(p.due_on);
                  return (
                    <tr key={p.id}>
                      <Td>
                        <Link href={`/projekty/${p.id}`} className="font-medium hover:text-gold-deep">
                          {p.name}
                        </Link>
                      </Td>
                      <Td>{stavy[p.status_code] ?? p.status_code}</Td>
                      <Td>{z ? <ZdraviPill health={z.health} score={z.score} reasons={z.reasons} /> : <Pill>uzavřeno</Pill>}</Td>
                      <Td className={!p.next_action ? "text-bad" : "text-ink-2"}>
                        <span className="text-[12.5px]">{p.next_action || "chybí"}</span>
                      </Td>
                      <Td className={dni !== null && dni < 0 ? "text-bad" : ""}>
                        <span className="font-mono text-[12.5px]">{datum(p.due_on)}</span>
                      </Td>
                      <Td className="font-mono text-[12.5px]">{kc(p.price)}</Td>
                    </tr>
                  );
                })}
              </Table>
            )}
          </Card>

          <Card title="Kontaktní osoby">
            {!kontakty?.length ? (
              <Empty nadpis="Žádná kontaktní osoba" popis="U firmy s více lidmi se vyplatí evidovat každého zvlášť — víš pak, komu co psát a kdo rozhoduje." />
            ) : (
              <Table hlavicka={["Jméno", "Role", "E-mail", "Telefon", ""]}>
                {kontakty.map((c: any) => (
                  <tr key={c.id}>
                    <Td>
                      <span className="font-medium">{c.full_name}</span>
                      {c.is_primary && <span className="ml-2"><Pill tridy="bg-gold-soft text-gold-deep">hlavní</Pill></span>}
                      {c.notes && <div className="text-[11.5px] text-ink-3">{c.notes}</div>}
                    </Td>
                    <Td className="text-ink-2">{c.role_title ?? "—"}</Td>
                    <Td>{c.email ? <a href={`mailto:${c.email}`} className="hover:text-gold-deep">{c.email}</a> : "—"}</Td>
                    <Td className="font-mono text-[12.5px]">{c.phone ?? "—"}</Td>
                    <Td>
                      <form action={smazKontakt}>
                        <input type="hidden" name="id" value={c.id} />
                        <input type="hidden" name="client_id" value={k.id} />
                        <button className={`${btn.obrys} ${btn.maly}`}>Smazat</button>
                      </form>
                    </Td>
                  </tr>
                ))}
              </Table>
            )}

            <form action={pridejKontakt} className="mt-4 grid gap-3 border-t border-line pt-4 md:grid-cols-[1.4fr_1fr_1.4fr_1fr_auto_auto]">
              <input type="hidden" name="client_id" value={k.id} />
              <Pole label="Jméno"><input name="full_name" required className={vstup} /></Pole>
              <Pole label="Role"><input name="role_title" className={vstup} /></Pole>
              <Pole label="E-mail"><input name="email" type="email" className={vstup} /></Pole>
              <Pole label="Telefon"><input name="phone" className={vstup} /></Pole>
              <label className="flex items-end gap-1.5 pb-2 text-[12px]">
                <input type="checkbox" name="is_primary" /> hlavní
              </label>
              <div className="flex items-end"><button className={btn.primar}>Přidat</button></div>
            </form>
          </Card>
        </div>

        <div className="space-y-4">
          <Card title="Poznámky k vztahu">
            <form action={ulozPoznamkuKlienta} className="space-y-3">
              <input type="hidden" name="client_id" value={k.id} />
              <textarea name="notes" rows={6} defaultValue={k.notes ?? ""} className={vstup} placeholder="Čím se zabývá, co ho pálí, na co si dát pozor, jak komunikuje." />
              <button className={btn.obrys}>Uložit poznámku</button>
            </form>
          </Card>

          <Card title="Poslední schůzky">
            {!schuzky?.length ? (
              <p className="text-[13px] text-ink-3">Zatím žádná zaznamenaná schůzka.</p>
            ) : (
              <ul className="space-y-2 text-[13px]">
                {schuzky.map((s: any) => (
                  <li key={s.id} className="flex items-start gap-2 border-b border-line/60 pb-2">
                    <span className="w-28 shrink-0 font-mono text-[12px] text-ink-3">{datumCas(s.starts_at)}</span>
                    <span className="flex-1">{s.title}</span>
                    {s.is_done ? <Pill tridy="bg-ok-bg text-ok">proběhla</Pill> : <Pill tridy="bg-info-bg text-info">plánovaná</Pill>}
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card title="Správce vztahu">
            <div className="flex items-center gap-2.5">
              <Avatar jmeno={k.owner?.full_name} barva={k.owner?.color} />
              <span className="text-[13px]">{k.owner?.full_name ?? "nepřiřazen"}</span>
            </div>
          </Card>
        </div>
      </div>
    </>
  );
}

function Statistika({ popisek, hodnota, poznamka }: { popisek: string; hodnota: string; poznamka?: string }) {
  return (
    <div className="rounded border border-line bg-white px-4 py-3">
      <p className="text-[10.5px] uppercase tracking-wide text-ink-3">{popisek}</p>
      <p className="mt-1 font-display text-[19px]">{hodnota}</p>
      {poznamka && <p className="text-[11px] text-ink-3">{poznamka}</p>}
    </div>
  );
}
