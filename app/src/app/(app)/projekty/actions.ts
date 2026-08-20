"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

type SupabaseKlient = Awaited<ReturnType<typeof createClient>>;

/** Vrací null při úspěchu, jinak text chyby. */
async function zapis(
  fn: (s: SupabaseKlient) => PromiseLike<{ error: { message: string } | null }>
) {
  const supabase = await createClient();
  const { error } = await fn(supabase);
  return error?.message ?? null;
}

/* ── Projekt ───────────────────────────────────────────────────────────── */

export async function zmenStav(formData: FormData) {
  const id = String(formData.get("id"));
  const stav = String(formData.get("status_code"));
  const doplnky: Record<string, unknown> = { status_code: stav };
  if (stav === "done") doplnky.completed_on = new Date().toISOString().slice(0, 10);

  await zapis((s) => s.from("projects").update(doplnky).eq("id", id));
  revalidatePath(`/projekty/${id}`);
  revalidatePath("/projekty");
}

export async function zmenFazi(formData: FormData) {
  const id = String(formData.get("id"));
  await zapis((s) => s.from("projects").update({ phase_code: String(formData.get("phase_code")) }).eq("id", id));
  revalidatePath(`/projekty/${id}`);
}

export async function ulozDalsiKrok(formData: FormData) {
  const id = String(formData.get("id"));
  await zapis((s) =>
    s
      .from("projects")
      .update({
        next_action: String(formData.get("next_action") || "").trim() || null,
        next_action_on: String(formData.get("next_action_on") || "") || null,
      })
      .eq("id", id)
  );
  revalidatePath(`/projekty/${id}`);
  revalidatePath("/projekty");
  revalidatePath("/rizika");
}

export async function vytvorProjekt(formData: FormData) {
  const supabase = await createClient();
  const nazev = String(formData.get("name") || "").trim();
  const klient = String(formData.get("client_id") || "");
  if (!nazev || !klient) redirect("/projekty/novy?chyba=" + encodeURIComponent("Název a klient jsou povinné."));

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const sablona = String(formData.get("template_id") || "");
  const zahajeni = String(formData.get("started_on") || "") || new Date().toISOString().slice(0, 10);

  const { data, error } = await supabase
    .from("projects")
    .insert({
      name: nazev,
      client_id: klient,
      project_type_id: String(formData.get("project_type_id") || "") || null,
      template_id: sablona || null,
      expected_result: String(formData.get("expected_result") || "").trim() || null,
      status_code: "prep",
      phase_code: "intake",
      priority_code: String(formData.get("priority_code") || "normal"),
      manager_id: String(formData.get("manager_id") || "") || user?.id || null,
      next_action: String(formData.get("next_action") || "").trim() || null,
      next_action_on: String(formData.get("next_action_on") || "") || null,
      started_on: zahajeni,
      due_on: String(formData.get("due_on") || "") || null,
      price: formData.get("price") ? Number(formData.get("price")) : null,
      pricing_model: String(formData.get("pricing_model") || "fixed"),
      hourly_rate: formData.get("hourly_rate") ? Number(formData.get("hourly_rate")) : null,
      planned_hours: formData.get("planned_hours") ? Number(formData.get("planned_hours")) : null,
      created_by: user?.id ?? null,
    })
    .select("id")
    .single();

  if (error || !data) redirect("/projekty/novy?chyba=" + encodeURIComponent(error?.message ?? "Projekt se nepodařilo založit."));

  // instancovat šablonu: úkoly a milníky s termíny podle offsetu od zahájení
  if (sablona) {
    const { data: polozky } = await supabase
      .from("template_items")
      .select("kind, title, description, phase_code, est_hours, offset_days, seq")
      .eq("template_id", sablona)
      .order("seq");

    const posun = (dni: number | null) => {
      if (dni == null) return null;
      const d = new Date(zahajeni);
      d.setDate(d.getDate() + dni);
      return d.toISOString().slice(0, 10);
    };

    const milniky = (polozky ?? [])
      .filter((p) => p.kind === "milestone")
      .map((p) => ({ project_id: data.id, title: p.title, due_on: posun(p.offset_days), seq: p.seq }));

    const ukoly = (polozky ?? [])
      .filter((p) => p.kind === "task")
      .map((p) => ({
        project_id: data.id,
        title: p.title,
        description: p.description,
        due_on: posun(p.offset_days),
        est_hours: p.est_hours,
        status_code: "planned",
        from_template: true,
        assignee_id: user?.id ?? null,
      }));

    if (milniky.length) await supabase.from("milestones").insert(milniky);
    if (ukoly.length) await supabase.from("tasks").insert(ukoly);
  }

  revalidatePath("/projekty");
  redirect(`/projekty/${data.id}`);
}

/* ── Milníky ───────────────────────────────────────────────────────────── */

export async function pridejMilnik(formData: FormData) {
  const projekt = String(formData.get("project_id"));
  await zapis((s) =>
    s.from("milestones").insert({
      project_id: projekt,
      title: String(formData.get("title") || "").trim(),
      due_on: String(formData.get("due_on") || "") || null,
      description: String(formData.get("description") || "").trim() || null,
    })
  );
  revalidatePath(`/projekty/${projekt}`);
}

export async function prepniMilnik(formData: FormData) {
  const id = String(formData.get("id"));
  const projekt = String(formData.get("project_id"));
  const hotovo = String(formData.get("is_done")) === "true";
  await zapis((s) =>
    s
      .from("milestones")
      .update({ is_done: !hotovo, done_on: !hotovo ? new Date().toISOString().slice(0, 10) : null })
      .eq("id", id)
  );
  revalidatePath(`/projekty/${projekt}`);
}

/* ── Úkoly ─────────────────────────────────────────────────────────────── */

export async function pridejUkol(formData: FormData) {
  const supabase = await createClient();
  const projekt = String(formData.get("project_id"));
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase.from("tasks").insert({
    project_id: projekt,
    title: String(formData.get("title") || "").trim(),
    assignee_id: String(formData.get("assignee_id") || "") || user?.id || null,
    due_on: String(formData.get("due_on") || "") || null,
    est_hours: formData.get("est_hours") ? Number(formData.get("est_hours")) : null,
    priority_code: String(formData.get("priority_code") || "normal"),
    status_code: "planned",
    created_by: user?.id ?? null,
  });
  revalidatePath(`/projekty/${projekt}`);
}

export async function zmenStavUkolu(formData: FormData) {
  const id = String(formData.get("id"));
  const projekt = String(formData.get("project_id"));
  const stav = String(formData.get("status_code"));
  await zapis((s) =>
    s
      .from("tasks")
      .update({ status_code: stav, done_at: stav === "done" ? new Date().toISOString() : null })
      .eq("id", id)
  );
  revalidatePath(`/projekty/${projekt}`);
  revalidatePath("/");
}

/* ── Čas ───────────────────────────────────────────────────────────────── */

export async function zapisCas(formData: FormData) {
  const supabase = await createClient();
  const projekt = String(formData.get("project_id"));
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const hodiny = Number(formData.get("hours"));
  if (!hodiny || hodiny <= 0) return;

  await supabase.from("time_entries").insert({
    project_id: projekt,
    user_id: user?.id,
    entry_date: String(formData.get("entry_date") || new Date().toISOString().slice(0, 10)),
    hours: hodiny,
    note: String(formData.get("note") || "").trim() || null,
    billable: formData.get("billable") === "on",
  });
  revalidatePath(`/projekty/${projekt}`);
}
