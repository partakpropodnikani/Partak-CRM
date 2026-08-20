"use client";

import { FormEvent, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { btn, vstup } from "@/components/ui";

export default function ResetHesla() {
  const [heslo, setHeslo] = useState("");
  const [heslo2, setHeslo2] = useState("");
  const [chyba, setChyba] = useState("");
  const [ukladam, setUkladam] = useState(false);

  async function ulozit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setChyba("");

    if (heslo.length < 8) {
      setChyba("Nové heslo musí mít alespoň 8 znaků.");
      return;
    }
    if (heslo !== heslo2) {
      setChyba("Zadaná hesla se neshodují.");
      return;
    }

    setUkladam(true);
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password: heslo });

    if (error) {
      setChyba("Heslo se nepodařilo změnit. Pošlete si nový recovery odkaz a zkuste to znovu.");
      setUkladam(false);
      return;
    }

    await supabase.auth.signOut();
    window.location.replace("/login?zmena_hesla=1");
  }

  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <p className="font-display text-[22px] font-medium tracking-[0.14em] text-ink">PARŤÁK</p>
          <div className="mx-auto my-2 h-px w-10 bg-gold" />
          <p className="text-[12px] text-ink-3">nastavení nového hesla</p>
        </div>

        <div className="rounded border border-line bg-white p-5">
          {chyba ? <p className="mb-3 text-sm text-red-700">{chyba}</p> : null}
          <form onSubmit={ulozit} className="space-y-3">
            <label className="block text-sm">
              <span className="mb-1 block">Nové heslo</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={vstup}
                value={heslo}
                onChange={(e) => setHeslo(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block">Nové heslo znovu</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                className={vstup}
                value={heslo2}
                onChange={(e) => setHeslo2(e.target.value)}
              />
            </label>
            <button type="submit" disabled={ukladam} className={`${btn.primar} w-full`}>
              {ukladam ? "Ukládám…" : "Nastavit nové heslo"}
            </button>
          </form>
        </div>
      </div>
    </main>
  );
}
