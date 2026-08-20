"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function zmenStavUkoluGlobal(formData: FormData) {
  const supabase = await createClient();
  const stav = String(formData.get("status_code"));
  await supabase
    .from("tasks")
    .update({ status_code: stav, done_at: stav === "done" ? new Date().toISOString() : null })
    .eq("id", String(formData.get("id")));
  revalidatePath("/ukoly");
  revalidatePath("/");
}

export async function pridejInterniUkol(formData: FormData) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const nazev = String(formData.get("title") || "").trim();
  if (!nazev) return;

  await supabase.from("tasks").insert({
    title: nazev,
    kind: String(formData.get("kind") || "internal"),
    assignee_id: String(formData.get("assignee_id") || "") || user?.id || null,
    due_on: String(formData.get("due_on") || "") || null,
    status_code: "planned",
    priority_code: "normal",
    created_by: user?.id ?? null,
  });

  revalidatePath("/ukoly");
  revalidatePath("/");
}
