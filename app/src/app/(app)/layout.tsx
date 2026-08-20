import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/ui";

const NAV = [
  {
    sekce: "Řízení",
    polozky: [
      { href: "/", label: "Dnes" },
      { href: "/rizika", label: "Rizika" },
    ],
  },
  {
    sekce: "Obchod",
    polozky: [{ href: "/klienti", label: "Klienti" }],
  },
  {
    sekce: "Realizace",
    polozky: [{ href: "/projekty", label: "Projekty" }],
  },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profil } = await supabase
    .from("profiles")
    .select("full_name, position, color, account_type")
    .eq("id", user.id)
    .single();

  // externí účty do interní aplikace nepatří — portál je samostatná zóna
  if (profil && profil.account_type !== "internal") {
    return (
      <main className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="max-w-md">
          <h1 className="font-display text-xl">Tento účet nemá přístup do interní aplikace</h1>
          <p className="mt-2 text-[13px] text-ink-3">
            Partnerské a klientské účty používají vlastní zónu. Pokud jde o omyl, ozvěte se správci systému.
          </p>
        </div>
      </main>
    );
  }

  async function odhlasit() {
    "use server";
    const supabase = await createClient();
    await supabase.auth.signOut();
    redirect("/login");
  }

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-[214px] shrink-0 flex-col bg-ink px-3 py-5 text-white/80 md:flex">
        <div className="px-2 pb-5">
          <p className="font-display text-[15px] font-medium tracking-[0.16em] text-white">PARŤÁK</p>
          <div className="my-1.5 h-px w-8 bg-gold" />
          <p className="text-[10.5px] opacity-60">pro podnikání</p>
        </div>

        <nav className="flex-1 space-y-4">
          {NAV.map((g) => (
            <div key={g.sekce}>
              <p className="px-2 pb-1.5 text-[10px] uppercase tracking-[0.08em] opacity-45">{g.sekce}</p>
              {g.polozky.map((p) => (
                <Link
                  key={p.href}
                  href={p.href}
                  className="block rounded px-2 py-1.5 text-[13px] hover:bg-white/10 hover:text-white"
                >
                  {p.label}
                </Link>
              ))}
            </div>
          ))}
        </nav>

        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center gap-2 px-1">
            <Avatar jmeno={profil?.full_name} barva={profil?.color} />
            <div className="min-w-0">
              <p className="truncate text-[12.5px] font-semibold text-white">{profil?.full_name ?? "Uživatel"}</p>
              <p className="truncate text-[10px] opacity-55">{profil?.position ?? ""}</p>
            </div>
          </div>
          <form action={odhlasit}>
            <button className="w-full rounded px-2 py-1.5 text-left text-[12px] opacity-70 hover:bg-white/10 hover:opacity-100">
              Odhlásit se
            </button>
          </form>
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex gap-3 border-b border-line bg-white px-4 py-2 md:hidden">
          <Link href="/" className="text-[13px]">Dnes</Link>
          <Link href="/projekty" className="text-[13px]">Projekty</Link>
          <Link href="/klienti" className="text-[13px]">Klienti</Link>
          <Link href="/rizika" className="text-[13px]">Rizika</Link>
        </div>
        <main className="mx-auto w-full max-w-[1180px] flex-1 p-4 md:p-7">{children}</main>
      </div>
    </div>
  );
}
