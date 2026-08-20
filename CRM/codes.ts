import { createClient } from "@/lib/supabase/server";

export type CodeValue = {
  code: string;
  label: string;
  sort_order: number;
  is_active: boolean;
  is_terminal: boolean;
};

/** Načte číselník z databáze. Číselníky jsou tabulky, ne enumy —
 *  admin je mění bez zásahu do kódu. */
export async function ciselnik(listKey: string): Promise<CodeValue[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("code_values")
    .select("code,label,sort_order,is_active,is_terminal")
    .eq("list_key", listKey)
    .eq("is_active", true)
    .order("sort_order");
  return data ?? [];
}

export async function mapaKodu(listKey: string): Promise<Record<string, string>> {
  const hodnoty = await ciselnik(listKey);
  return Object.fromEntries(hodnoty.map((h) => [h.code, h.label] as [string, string]));
}
