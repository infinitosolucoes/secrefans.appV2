const TZ = "America/Sao_Paulo";

export const formatDateTime = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", {
        dateStyle: "short",
        timeStyle: "short",
        timeZone: TZ,
      }).format(new Date(iso))
    : "—";

export const formatDate = (iso: string | null | undefined) =>
  iso
    ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: TZ }).format(new Date(iso))
    : "—";

/** Datas civis (YYYY-MM-DD) sem conversão de fuso. */
export const formatCivilDate = (d: string | null | undefined) => {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
};
