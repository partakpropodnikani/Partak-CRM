"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export function AuthRecoveryHandler() {
  const router = useRouter();

  useEffect(() => {
    async function handleAuth() {
      const hash = window.location.hash;

      if (!hash) return;

      const params = new URLSearchParams(hash.substring(1));

      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");

      if (!accessToken || !refreshToken) return;

      const supabase = createClient();

      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      if (error) {
        console.error("Nepodařilo se nastavit session:", error);
        return;
      }

      // Odstraní tokeny z adresního řádku
      window.history.replaceState(
        {},
        document.title,
        window.location.pathname + window.location.search
      );

      if (type === "recovery") {
        router.replace("/reset-hesla");
      } else {
        router.replace("/");
      }

      router.refresh();
    }

    handleAuth();
  }, [router]);

  return null;
}