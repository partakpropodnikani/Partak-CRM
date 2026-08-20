import Link from "next/link";
import { ZDRAVI, iniciely } from "@/lib/format";

/* ── Karta ─────────────────────────────────────────────────────────────── */
export function Card({
  title,
  akce,
  children,
  className = "",
}: {
  title?: string;
  akce?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-white border border-line rounded ${className}`}>
      {(title || akce) && (
        <header className="flex items-center gap-3 px-4 py-3 border-b border-line">
          {title && <h2 className="font-display text-[15px] font-medium text-ink-1">{title}</h2>}
          <div className="ml-auto flex gap-2">{akce}</div>
        </header>
      )}
      <div className="p-4">{children}</div>
    </section>
  );
}

/* ── Štítky ────────────────────────────────────────────────────────────── */
export function Pill({ children, tridy = "bg-paper text-ink-3", title }: { children: React.ReactNode; tridy?: string; title?: string }) {
  return (
    <span title={title} className={`inline-flex items-center rounded px-2 py-[3px] text-[11px] font-medium leading-none whitespace-nowrap ${tridy}`}>
      {children}
    </span>
  );
}

export function ZdraviPill({ health, score, reasons }: { health?: string | null; score?: number | null; reasons?: string[] | null }) {
  if (!health) return <Pill>—</Pill>;
  const z = ZDRAVI[health] ?? ZDRAVI.green;
  return (
    <Pill tridy={z.tridy} title={reasons?.length ? reasons.join(" · ") : "bez zjištěných rizik"}>
      {z.label}
      {score ? ` · ${score}` : ""}
    </Pill>
  );
}

/* ── Avatar ────────────────────────────────────────────────────────────── */
export function Avatar({ jmeno, barva }: { jmeno?: string | null; barva?: string | null }) {
  return (
    <span
      title={jmeno ?? undefined}
      className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold text-white"
      style={{ background: barva || "#8C8579" }}
    >
      {iniciely(jmeno)}
    </span>
  );
}

/* ── Tabulka ───────────────────────────────────────────────────────────── */
export function Table({ hlavicka, children }: { hlavicka: React.ReactNode[]; children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[13px]">
        <thead>
          <tr className="border-b border-line text-left">
            {hlavicka.map((h, i) => (
              <th key={i} className="pb-2 pr-3 text-[11px] font-semibold uppercase tracking-wide text-ink-3">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  );
}

export function Td({ children, className = "" }: { children?: React.ReactNode; className?: string }) {
  return <td className={`py-2.5 pr-3 align-top border-b border-line/60 ${className}`}>{children}</td>;
}

/* ── Prázdný stav ──────────────────────────────────────────────────────── */
export function Empty({ nadpis, popis, cta }: { nadpis: string; popis: string; cta?: React.ReactNode }) {
  return (
    <div className="py-10 text-center">
      <p className="font-display text-[17px] text-ink-2">{nadpis}</p>
      <p className="mx-auto mt-1 max-w-lg text-[13px] text-ink-3">{popis}</p>
      {cta && <div className="mt-4">{cta}</div>}
    </div>
  );
}

/* ── Tlačítka ──────────────────────────────────────────────────────────── */
const zaklad =
  "inline-flex items-center justify-center gap-1.5 rounded px-3 py-1.5 text-[13px] font-medium transition-colors disabled:opacity-50";

export const btn = {
  primar: `${zaklad} bg-ink text-white hover:bg-ink-1`,
  obrys: `${zaklad} border border-line-2 bg-white text-ink-1 hover:border-gold-deep`,
  maly: "px-2 py-1 text-[12px]",
};

export function LinkBtn({ href, children, varianta = "obrys" }: { href: string; children: React.ReactNode; varianta?: "primar" | "obrys" }) {
  return (
    <Link href={href} className={varianta === "primar" ? btn.primar : btn.obrys}>
      {children}
    </Link>
  );
}

/* ── Formulářové prvky ─────────────────────────────────────────────────── */
export function Pole({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11.5px] font-semibold text-ink-2">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-ink-3">{hint}</span>}
    </label>
  );
}

export const vstup =
  "w-full rounded border border-line-2 bg-white px-3 py-2 text-[13.5px] outline-none focus:border-gold-deep focus:ring-2 focus:ring-gold/25";

/* ── Progres ───────────────────────────────────────────────────────────── */
export function Progres({ pct, barva = "bg-gold-deep" }: { pct: number; barva?: string }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded bg-line">
      <div className={`h-full ${barva}`} style={{ width: `${Math.max(0, Math.min(100, pct))}%` }} />
    </div>
  );
}

/* ── Chybová hláška z server action ────────────────────────────────────── */
export function Chyba({ text }: { text?: string }) {
  if (!text) return null;
  return <p className="mb-3 rounded border-l-2 border-bad bg-bad-bg px-3 py-2 text-[12.5px] text-bad">{text}</p>;
}
