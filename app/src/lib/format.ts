export const kc = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("cs-CZ", { style: "currency", currency: "CZK", maximumFractionDigits: 0 }).format(n);

export const cislo = (n: number | null | undefined, des = 1) =>
  n == null ? "—" : new Intl.NumberFormat("cs-CZ", { maximumFractionDigits: des }).format(n);

export const datum = (d: string | null | undefined) =>
  !d ? "—" : new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", year: "numeric" }).format(new Date(d));

export const datumCas = (d: string | null | undefined) =>
  !d ? "—" : new Intl.DateTimeFormat("cs-CZ", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" }).format(new Date(d));

/** kladné = zbývá dní, záporné = po termínu */
export function dniDo(d: string | null | undefined): number | null {
  if (!d) return null;
  const dnes = new Date();
  dnes.setHours(0, 0, 0, 0);
  const cil = new Date(d);
  cil.setHours(0, 0, 0, 0);
  return Math.round((cil.getTime() - dnes.getTime()) / 86400000);
}

export const dnesISO = () => new Date().toISOString().slice(0, 10);

export const ZDRAVI: Record<string, { label: string; tridy: string }> = {
  green:  { label: "Zdravý",   tridy: "bg-ok-bg text-ok" },
  orange: { label: "Pozor",    tridy: "bg-warn-bg text-warn" },
  red:    { label: "V riziku", tridy: "bg-bad-bg text-bad" },
};

export const PRIORITA: Record<string, string> = {
  low: "bg-paper text-ink-3",
  normal: "bg-info-bg text-info",
  high: "bg-warn-bg text-warn",
  critical: "bg-bad-bg text-bad",
};

export const STAV_UKOLU: Record<string, string> = {
  planned: "bg-paper text-ink-3",
  ready: "bg-info-bg text-info",
  doing: "bg-gold-soft text-gold-deep",
  waiting: "bg-warn-bg text-warn",
  blocked: "bg-bad-bg text-bad",
  done: "bg-ok-bg text-ok",
  cancelled: "bg-paper text-ink-3",
};

export function iniciely(jmeno: string | null | undefined) {
  return (jmeno || "?").split(" ").map((c) => c[0]).join("").slice(0, 2).toUpperCase();
}
