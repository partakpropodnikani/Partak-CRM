import { createClient } from "@/lib/supabase/server";
import { mapaKodu } from "@/lib/codes";
import { Card, Empty, Pill, Table, Td } from "@/components/ui";
import { datum, kc } from "@/lib/format";

const STAV: Record<string, { label: string; tridy: string }> = {
  proposed: { label: "Navržený", tridy: "bg-info-bg text-info" },
  testing: { label: "Ve zkoušce", tridy: "bg-warn-bg text-warn" },
  active: { label: "Aktivní", tridy: "bg-ok-bg text-ok" },
  paused: { label: "Pozastavený", tridy: "bg-paper text-ink-3" },
  rejected: { label: "Odmítnutý", tridy: "bg-bad-bg text-bad" },
};

const VYPLATA: Record<string, string> = {
  invoice: "fakturuje nám",
  via_us: "přes nás",
  client_discount: "sleva klientovi",
};

export default async function Partneri() {
  const supabase = await createClient();
  const kategorie = await mapaKodu("partner_category");

  const [{ data: partneri, error }, { data: zapojeni }] = await Promise.all([
    supabase.from("partners").select("*").is("deleted_at", null).order("name"),
    supabase
      .from("project_partners")
      .select("partner_id, order_value, commission_amount, commission_status, paid_on, project:projects ( id, name )"),
  ]);

  const podlePartnera = new Map<string, any[]>();
  ((zapojeni as any[] | null) ?? []).forEach((z) => {
    const pole = podlePartnera.get(z.partner_id) ?? [];
    pole.push(z);
    podlePartnera.set(z.partner_id, pole);
  });

  const kCelkem = ((zapojeni as any[] | null) ?? [])
    .filter((z) => z.commission_status !== "paid" && z.commission_status !== "cancelled")
    .reduce((s, z) => s + (Number(z.commission_amount) || 0), 0);

  return (
    <>
      <header className="mb-5 flex flex-wrap items-end gap-3">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-ink-3">Realizace</p>
          <h1 className="text-[22px] font-medium">Partneři</h1>
        </div>
        <p className="ml-auto text-[13px] text-ink-3">
          nevyplacené provize <span className="font-mono text-ink-1">{kc(kCelkem)}</span>
        </p>
      </header>

      {error && <p className="mb-4 text-[13px] text-bad">Data se nepodařilo načíst: {error.message}</p>}

      <Card>
        {!partneri?.length ? (
          <Empty
            nadpis="Zatím žádní partneři"
            popis="Partner je externí specialista, kterému předáváte část zakázky. Eviduje se u něj provize, kvalita spolupráce a projekty, na kterých pracoval."
          />
        ) : (
          <Table hlavicka={["Partner", "Specializace", "Provize", "Výplata", "Zakázky", "Nevyplaceno", "Stav"]}>
            {partneri.map((p: any) => {
              const zap = podlePartnera.get(p.id) ?? [];
              const nevyplaceno = zap
                .filter((z) => !["paid", "cancelled"].includes(z.commission_status))
                .reduce((s, z) => s + (Number(z.commission_amount) || 0), 0);
              const st = STAV[p.status] ?? STAV.active;
              return (
                <tr key={p.id}>
                  <Td>
                    <span className="font-medium">{p.name}</span>
                    <div className="text-[11.5px] text-ink-3">{kategorie[p.category_code] ?? "—"}</div>
                    {p.notes && <div className="mt-0.5 max-w-[240px] text-[11.5px] text-ink-3">{p.notes}</div>}
                  </Td>
                  <Td className="text-ink-2">{p.specialization ?? "—"}</Td>
                  <Td className="font-mono text-[12.5px]">
                    {p.commission_pct ? `${p.commission_pct} %` : ""}
                    {p.commission_fixed ? ` + ${kc(p.commission_fixed)}` : ""}
                    {!p.commission_pct && !p.commission_fixed ? "—" : ""}
                  </Td>
                  <Td className="text-[12.5px]">{VYPLATA[p.payout_mode] ?? "—"}</Td>
                  <Td>
                    {!zap.length ? (
                      <span className="text-ink-3">žádné</span>
                    ) : (
                      <ul className="space-y-0.5 text-[12px]">
                        {zap.map((z, i) => (
                          <li key={i}>
                            {z.project?.name ?? "—"}
                            <span className="text-ink-3"> · {kc(z.order_value)}</span>
                            {z.paid_on && <span className="text-ok"> · vyplaceno {datum(z.paid_on)}</span>}
                          </li>
                        ))}
                      </ul>
                    )}
                  </Td>
                  <Td className={`font-mono text-[12.5px] ${nevyplaceno > 0 ? "text-warn" : ""}`}>{kc(nevyplaceno)}</Td>
                  <Td><Pill tridy={st.tridy}>{st.label}</Pill></Td>
                </tr>
              );
            })}
          </Table>
        )}
      </Card>
    </>
  );
}
