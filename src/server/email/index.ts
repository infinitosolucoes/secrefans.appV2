import "server-only";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import { createServiceSupabase } from "@/server/auth/supabase";

const C = {
  bg: "#0b0508",
  card: "#170a10",
  border: "#3a1526",
  text: "#f5eef1",
  muted: "#b7a3ac",
  pink: "#ff0a78",
};
const esc = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/** E-mail de notificação com a identidade da Secretfans (mesmo visual dos e-mails de login). */
export function renderNotificationEmail(n: {
  title: string;
  body: string;
  url: string;
  cta: string;
}) {
  const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(n.title)}</title></head>
<body style="margin:0;padding:0;background:${C.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:Montserrat,Helvetica,Arial,sans-serif">
<tr><td align="center" style="padding:0 0 24px"><img src="${site}/brand/logo-cadeado-horizontal.png" alt="Secretfans" width="160" style="display:block;width:160px;height:auto;border:0"></td></tr>
<tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:20px;padding:28px">
<p style="margin:0 0 10px;color:${C.text};font-size:20px;line-height:28px;font-weight:700">${esc(n.title)}</p>
${n.body ? `<p style="margin:0 0 22px;color:${C.muted};font-size:15px;line-height:23px">${esc(n.body)}</p>` : ""}
<a href="${n.url}" style="display:inline-block;background:${C.pink};color:#fff;font-weight:700;font-size:15px;text-decoration:none;padding:12px 28px;border-radius:999px">${esc(n.cta)}</a>
</td></tr>
<tr><td align="center" style="padding:20px 8px 0;color:${C.muted};font-size:12px;line-height:18px">
Você recebe este aviso porque tem conta na Secretfans (+18).<br>
<a href="${site}/notificacoes" style="color:${C.muted}">Escolher quais e-mails receber</a></td></tr>
</table></td></tr></table></body></html>`;
  const text = `${n.title}\n\n${n.body}\n\n${n.cta}: ${n.url}\n\nPreferências: ${site}/notificacoes`;
  return { html, text };
}

/** Envia pelo Resend. Sem RESEND_API_KEY (ambiente local), não envia e devolve false. */
export async function sendEmail(input: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const env = serverEnv();
  if (!env.RESEND_API_KEY) return false;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: env.EMAIL_FROM,
      to: [input.to],
      subject: input.subject,
      html: input.html,
      text: input.text,
    }),
    signal: AbortSignal.timeout(10_000),
  });
  return res.ok;
}

const CTA: Record<string, string> = {
  sale: "Ver extrato",
  tip: "Ver extrato",
  new_subscriber: "Ver vendas",
  renewal: "Ver extrato",
  payment_failed: "Assinar de novo",
  message: "Abrir conversa",
};

/**
 * Envia os e-mails pendentes da fila (notifications.email_status = 'pending').
 * Cada linha é "reservada" (pending → sending) antes do envio, então dois processos em paralelo
 * nunca mandam o mesmo e-mail. Chamado após webhooks, mensagens e pela rotina diária.
 */
export async function dispatchPendingEmails(limit = 20): Promise<{ sent: number; failed: number }> {
  const env = serverEnv();
  const result = { sent: 0, failed: 0 };
  if (!env.RESEND_API_KEY) return result;
  const db = createServiceSupabase();
  const site = publicEnv().NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  const { data: pending } = await db
    .from("notifications")
    .select("id")
    .eq("email_status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  for (const { id } of pending ?? []) {
    const { data: n } = await db
      .from("notifications")
      .update({ email_status: "sending" })
      .eq("id", id)
      .eq("email_status", "pending")
      .select("id, user_id, kind, title, body, link")
      .maybeSingle();
    if (!n) continue; // outro processo já pegou
    let status: "sent" | "failed" | "skipped" = "failed";
    try {
      const { data: u } = await db.auth.admin.getUserById(n.user_id);
      const to = u.user?.email;
      if (!to) status = "skipped";
      else {
        const { html, text } = renderNotificationEmail({
          title: n.title,
          body: n.body,
          url: `${site}${n.link}`,
          cta: CTA[n.kind] ?? "Abrir a Secretfans",
        });
        status = (await sendEmail({ to, subject: n.title, html, text })) ? "sent" : "failed";
      }
    } catch {
      status = "failed";
    }
    await db
      .from("notifications")
      .update({ email_status: status, emailed_at: new Date().toISOString() })
      .eq("id", n.id);
    if (status === "sent") result.sent++;
    else if (status === "failed") result.failed++;
  }
  return result;
}
