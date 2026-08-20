"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export async function vytvorLead(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nazev = String(formData.get("title") || "").trim();
  if (!nazev) return;

  await supabase.from("leads").insert({
    title: nazev,
    company: String(formData.get("company") || "").trim() || null,
    contact_name: String(formData.get("contact_name") || "").trim() || null,
    email: String(formData.get("email") || "").trim() || null,
    phone: String(formData.get("phone") || "").trim() || null,
    stage_code: String(formData.get("stage_code") || "lead"),
    source_code: String(formData.get("source_code") || "") || null,
    estimated_value: formData.get("estimated_value") ? Number(formData.get("estimated_value")) : null,
    owner_id: String(formData.get("owner_id") || "") || user?.id || null,
    next_action: String(formData.get("next_action") || "").trim() || null,
    next_action_on: String(formData.get("next_action_on") || "") || null,
    notes: String(formData.get("notes") || "").trim() || null,
    created_by: user?.id ?? null,
  });

  revalidatePath("/obchod");
  revalidatePath("/rizika");
}

export async function posunFazi(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const faze = String(formData.get("stage_code"));

  const zmeny: Record<string, unknown> = { stage_code: faze };
  if (faze === "lost") zmeny.lost_reason = String(formData.get("lost_reason") || "") || null;

  await supabase.from("leads").update(zmeny).eq("id", id);
  revalidatePath("/obchod");
  revalidatePath(`/obchod/${id}`);
}

export async function ulozKrokLeadu(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  await supabase
    .from("leads")
    .update({
      next_action: String(formData.get("next_action") || "").trim() || null,
      next_action_on: String(formData.get("next_action_on") || "") || null,
    })
    .eq("id", id);
  revalidatePath("/obchod");
  revalidatePath("/rizika");
}

/** Konverze lead → klient (+ volitelně první projekt ze šablony). */
export async function konvertujLead(formData: FormData) {
  const supabase = await createClient();
  const id = String(formData.get("id"));
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: lead } = await supabase.from("leads").select("*").eq("id", id).single();
  if (!lead) redirect("/obchod");

  const { data: klient, error: chybaKlient } = await supabase
    .from("clients")
    .insert({
      name: String(formData.get("client_name") || lead.company || lead.title).trim(),
      reg_no: String(formData.get("reg_no") || "").trim() || null,
      package_code: String(formData.get("package_code") || "") || null,
      source_code: lead.source_code,
      owner_id: lead.owner_id ?? user?.id ?? null,
      relationship_status: "active",
      acquired_on: new Date().toISOString().slice(0, 10),
      notes: lead.notes,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (chybaKlient || !klient)
    redirect(`/obchod/${id}?chyba=` + encodeURIComponent(chybaKlient?.message ?? "Klienta se nepodařilo založit."));

  if (lead.contact_name || lead.email) {
    await supabase.from("contacts").insert({
      client_id: klient.id,
      full_name: lead.contact_name || "Hlavní kontakt",
      email: lead.email,
      phone: lead.phone,
      is_primary: true,
    });
  }

  await supabase
    .from("leads")
    .update({ stage_code: "won", converted_client_id: klient.id, converted_at: new Date().toISOString() })
    .eq("id", id);

  // onboarding úkol, ať klient nezapadne hned po podpisu
  await supabase.from("tasks").insert({
    title: `Onboarding klienta: ${String(formData.get("client_name") || lead.title)}`,
    kind: "admin",
    assignee_id: lead.owner_id ?? user?.id ?? null,
    due_on: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10),
    status_code: "planned",
    priority_code: "high",
    created_by: user?.id ?? null,
  });

  revalidatePath("/obchod");
  revalidatePath("/klienti");

  if (formData.get("zalozit_projekt") === "on") redirect(`/projekty/novy?klient=${klient.id}`);
  redirect(`/klienti/${klient.id}`);
}
