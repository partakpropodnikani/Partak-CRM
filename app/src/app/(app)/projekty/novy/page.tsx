import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ciselnik } from "@/lib/codes";
import { Card, Chyba, Pole, btn, vstup } from "@/components/ui";
import { dnesISO } from "@/lib/format";
import { vytvorProjekt } from "../actions";

export default async function NovyProjekt({
  searchParams,
}: {
  searchParams: Promise<{ chyba?: string; klient?: string }>;
}) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: klienti }, { data: typy }, { data: sablony }, { data: tym }, priority] = await Promise.all([
    supabase.from("clients").select("id, name").is("deleted_at", null).order("name"),
    supabase.from("project_types").select("id, name").eq("is_active", true).order("sort_order"),
    supabase.from("project_templates").select("id, name, project_type_id").eq("is_active", true).order("name"),
    supabase.from("profiles").select("id, full_name").eq("account_type", "internal").eq("status", "active").order("full_name"),
    ciselnik("priority"),
  ]);

  return (
    <>
      <Link href="/projekty" className="mb-4 inline-block text-[12.5px] text-ink-3 hover:text-ink-1">
        ← Projekty
      </Link>
      <h1 className="mb-5 text-[22px] font-medium">Nový projekt</h1>

      <Card>
        <Chyba text={sp.chyba} />
        <form action={vytvorProjekt} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Pole label="Název projektu *" hint="Konkrétně, ať je poznat na první pohled. Např. „Nový web s objednávkami“.">
              <input name="name" required className={vstup} />
            </Pole>
            <Pole label="Klient *">
              <select name="client_id" required defaultValue={sp.klient ?? ""} className={vstup}>
                <option value="">— vyber klienta —</option>
                {klienti?.map((k) => (
                  <option key={k.id} value={k.id}>
                    {k.name}
                  </option>
                ))}
              </select>
            </Pole>
          </div>

          <Pole label="Očekávaný výsledek" hint="Co konkrétně klient dostane a jak poznáme, že je hotovo.">
            <textarea name="expected_result" rows={3} className={vstup} />
          </Pole>

          <div className="grid gap-4 md:grid-cols-3">
            <Pole label="Typ projektu">
              <select name="project_type_id" className={vstup}>
                <option value="">—</option>
                {typy?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </Pole>
            <Pole label="Šablona" hint="Vygeneruje úkoly a milníky včetně termínů.">
              <select name="template_id" className={vstup}>
                <option value="">bez šablony</option>
                {sablony?.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </Pole>
            <Pole label="Projektový manažer">
              <select name="manager_id" className={vstup}>
                <option value="">— já —</option>
                {tym?.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.full_name}
                  </option>
                ))}
              </select>
            </Pole>
          </div>

          <div className="grid gap-4 md:grid-cols-3">
            <Pole label="Priorita">
              <select name="priority_code" defaultValue="normal" className={vstup}>
                {priority.map((p) => (
                  <option key={p.code} value={p.code}>
                    {p.label}
                  </option>
                ))}
              </select>
            </Pole>
            <Pole label="Zahájení">
              <input type="date" name="started_on" defaultValue={dnesISO()} className={vstup} />
            </Pole>
            <Pole label="Termín dokončení">
              <input type="date" name="due_on" className={vstup} />
            </Pole>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Pole label="Cena (Kč)">
              <input name="price" type="number" step="100" min="0" className={vstup} />
            </Pole>
            <Pole label="Způsob nacenění">
              <select name="pricing_model" defaultValue="fixed" className={vstup}>
                <option value="fixed">Fixní</option>
                <option value="hourly">Hodinově</option>
                <option value="retainer">Paušál</option>
                <option value="custom">Individuální</option>
              </select>
            </Pole>
            <Pole label="Hodinová sazba (Kč)" hint="Sazba se drží na projektu.">
              <input name="hourly_rate" type="number" step="50" min="0" className={vstup} />
            </Pole>
            <Pole label="Plánované hodiny">
              <input name="planned_hours" type="number" step="1" min="0" className={vstup} />
            </Pole>
          </div>

          <div className="grid gap-4 md:grid-cols-[2fr_1fr]">
            <Pole label="Další krok" hint="Bez něj se projekt objeví v Rizicích.">
              <input name="next_action" className={vstup} placeholder="Např. Domluvit intake schůzku" />
            </Pole>
            <Pole label="Do kdy">
              <input type="date" name="next_action_on" className={vstup} />
            </Pole>
          </div>

          <div className="flex gap-2 border-t border-line pt-4">
            <button className={btn.primar}>Založit projekt</button>
            <Link href="/projekty" className={btn.obrys}>
              Zrušit
            </Link>
          </div>
        </form>
      </Card>
    </>
  );
}
