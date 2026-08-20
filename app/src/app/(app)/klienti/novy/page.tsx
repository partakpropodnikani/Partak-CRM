import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { ciselnik } from "@/lib/codes";
import { Card, Chyba, Pole, btn, vstup } from "@/components/ui";
import { dnesISO } from "@/lib/format";
import { vytvorKlienta } from "../actions";

export default async function NovyKlient({ searchParams }: { searchParams: Promise<{ chyba?: string }> }) {
  const sp = await searchParams;
  const supabase = await createClient();

  const [{ data: tym }, odvetvi, balicky, zdroje, funkce] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("account_type", "internal").eq("status", "active").order("full_name"),
    ciselnik("industry"),
    ciselnik("client_package"),
    ciselnik("lead_source"),
    ciselnik("partner_category"),
  ]);

  return (
    <>
      <Link href="/klienti" className="mb-4 inline-block text-[12.5px] text-ink-3 hover:text-ink-1">← Klienti</Link>
      <h1 className="mb-5 text-[22px] font-medium">Nový klient</h1>

      <Card>
        <Chyba text={sp.chyba} />
        <form action={vytvorKlienta} className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Pole label="Název / jméno *">
              <input name="name" required className={vstup} placeholder="Firma s.r.o. nebo jméno podnikatele" />
            </Pole>
            <Pole label="Oficiální název">
              <input name="legal_name" className={vstup} />
            </Pole>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Pole label="IČO"><input name="reg_no" className={vstup} /></Pole>
            <Pole label="Odvětví">
              <select name="industry_code" className={vstup}>
                <option value="">—</option>
                {odvetvi.map((o) => <option key={o.code} value={o.code}>{o.label}</option>)}
              </select>
            </Pole>
            <Pole label="Balíček">
              <select name="package_code" className={vstup}>
                <option value="">—</option>
                {balicky.map((b) => <option key={b.code} value={b.code}>{b.label}</option>)}
              </select>
            </Pole>
            <Pole label="Zdroj">
              <select name="source_code" className={vstup}>
                <option value="">—</option>
                {zdroje.map((z) => <option key={z.code} value={z.code}>{z.label}</option>)}
              </select>
            </Pole>
          </div>

          <div className="grid gap-4 md:grid-cols-4">
            <Pole label="Web"><input name="website" className={vstup} placeholder="firma.cz" /></Pole>
            <Pole label="Orientační obrat (Kč)"><input name="annual_revenue" type="number" step="100000" min="0" className={vstup} /></Pole>
            <Pole label="Správce">
              <select name="owner_id" className={vstup}>
                <option value="">— já —</option>
                {tym?.map((t) => <option key={t.id} value={t.id}>{t.full_name}</option>)}
              </select>
            </Pole>
            <Pole label="Získán">
              <input type="date" name="acquired_on" defaultValue={dnesISO()} className={vstup} />
            </Pole>
          </div>

          <Pole label="Stav vztahu">
            <select name="relationship_status" defaultValue="active" className={`${vstup} md:w-64`}>
              <option value="prospect">Zájemce</option>
              <option value="active">Aktivní</option>
              <option value="inactive">Neaktivní</option>
              <option value="ended">Ukončený</option>
            </select>
          </Pole>

          <div className="border-t border-line pt-4">
            <p className="mb-3 text-[11px] uppercase tracking-wide text-ink-3">Hlavní kontaktní osoba</p>
            <div className="grid gap-4 md:grid-cols-4">
              <Pole label="Jméno a příjmení"><input name="kontakt_jmeno" className={vstup} /></Pole>
              <Pole label="Role ve firmě">
                <input name="kontakt_role" className={vstup} list="role-navrhy" placeholder="Jednatel / majitel" />
                <datalist id="role-navrhy">
                  {funkce.map((f) => <option key={f.code} value={f.label} />)}
                </datalist>
              </Pole>
              <Pole label="E-mail"><input name="kontakt_email" type="email" className={vstup} /></Pole>
              <Pole label="Telefon"><input name="kontakt_telefon" className={vstup} /></Pole>
            </div>
          </div>

          <Pole label="Poznámka" hint="Kontext vztahu: čím se zabývá, co ho pálí, na co si dát pozor.">
            <textarea name="notes" rows={3} className={vstup} />
          </Pole>

          <div className="flex gap-2 border-t border-line pt-4">
            <button className={btn.primar}>Založit klienta</button>
            <Link href="/klienti" className={btn.obrys}>Zrušit</Link>
          </div>
        </form>
      </Card>
    </>
  );
}
