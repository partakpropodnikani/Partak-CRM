import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Chyba, Pole, btn, vstup } from "@/components/ui";

export default async function Login({ searchParams }: { searchParams: Promise<{ chyba?: string; dal?: string }> }) {
  const sp = await searchParams;

  async function prihlasit(formData: FormData) {
    "use server";
    const supabase = await createClient();
    const email = String(formData.get("email") ?? "").trim();
    const heslo = String(formData.get("heslo") ?? "");
    const dal = String(formData.get("dal") ?? "/");

    const { error } = await supabase.auth.signInWithPassword({ email, password: heslo });
    if (error) redirect(`/login?chyba=${encodeURIComponent("Přihlášení se nezdařilo. Zkontroluj e-mail a heslo.")}`);
    redirect(dal || "/");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-[22px] font-medium tracking-[0.14em] text-ink">PARŤÁK</p>
          <div className="mx-auto my-2 h-px w-10 bg-gold" />
          <p className="text-[12px] text-ink-3">operační systém firmy</p>
        </div>

        <div className="rounded border border-line bg-white p-5">
          <Chyba text={sp.chyba} />
          <form action={prihlasit} className="space-y-3">
            <input type="hidden" name="dal" value={sp.dal ?? "/"} />
            <Pole label="Firemní e-mail">
              <input name="email" type="email" required autoComplete="email" className={vstup} />
            </Pole>
            <Pole label="Heslo">
              <input name="heslo" type="password" required autoComplete="current-password" className={vstup} />
            </Pole>
            <button type="submit" className={`${btn.primar} w-full`}>Přihlásit se</button>
          </form>
          <p className="mt-4 text-[11.5px] text-ink-3">
            Účty zakládá správce systému. Externí partneři a klienti se registrují pouze na pozvánku.
          </p>
        </div>
      </div>
    </main>
  );
}
