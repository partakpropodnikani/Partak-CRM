"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function vytvorKlienta(formData: FormData) {
  const supabase = await createClient();
  const nazev = String(formData.get("name") || "").trim();
  if (!nazev) redirect("/klienti/novy?chyba=" + encodeURIComponent("Název klienta je povinný."));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data, error } = await supabase
    .from("clients")
    .insert({
      name: nazev,
      legal_name: String(formData.get("legal_name") || "").trim() || null,
      reg_no: String(formData.get("reg_no") || "").trim() || null,
      industry_code: String(formData.get("industry_code") || "") || null,
      package_code: String(formData.get("package_code") || "") || null,
      source_code: String(formData.get("source_code") || "") || null,
      website: String(formData.get("website") || "").trim() || null,
      annual_revenue: formData.get("annual_revenue") ? Number(formData.get("annual_revenue")) : null,
      owner_id: String(formData.get("owner_id") || "") || user?.id || null,
      relationship_status: String(formData.get("relationship_status") || "active"),
      acquired_on: String(formData.get("acquired_on") || "") || null,
      notes: String(formData.get("notes") || "").trim() || null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) redirect("/klienti/novy?chyba=" + encodeURIComponent(error?.message ?? "Klienta se nepodařilo založit."));

  const kontakt = String(formData.get("kontakt_jmeno") || "").trim();
  if (kontakt) {
    await supabase.from("contacts").insert({
      client_id: data.id,
      full_name: kontakt,
      role_title: String(formData.get("kontakt_role") || "").trim() || null,
      email: String(formData.get("kontakt_email") || "").trim() || null,
      phone: String(formData.get("kontakt_telefon") || "").trim() || null,
      is_primary: true,
    });
  }

  revalidatePath("/klienti");
  redirect(`/klienti/${data.id}`);
}

export async function pridejKontakt(formData: FormData) {
  const supabase = await createClient();
  const klient = String(formData.get("client_id"));
  const hlavni = formData.get("is_primary") === "on";

  if (hlavni) {
    await supabase.from("contacts").update({ is_primary: false }).eq("client_id", klient).is("deleted_at", null);
  }

  await supabase.from("contacts").insert({
    client_id: klient,
    full_name: String(formData.get("full_name") || "").trim(),
    role_title: String(formData.get("role_title") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    notes: String(formData.get("notes") || "").trim() || null,
    is_primary: hlavni,
  });

  revalidatePath(`/klienti/${klient}`);
}

export async function smazKontakt(formData: FormData) {
  const supabase = await createClient();
  const klient = String(formData.get("client_id"));
  await supabase
    .from("contacts")
    .update({ deleted_at: new Date().toISOString(), is_primary: false })
    .eq("id", String(formData.get("id")));
  revalidatePath(`/klienti/${klient}`);
}

export async function ulozPoznamkuKlienta(formData: FormData) {
  const supabase = await createClient();
  const klient = String(formData.get("client_id"));
  await supabase.from("clients").update({ notes: String(formData.get("notes") || "").trim() || null }).eq("id", klient);
  revalidatePath(`/klienti/${klient}`);
}
