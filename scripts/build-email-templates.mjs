// Gera os modelos de e-mail do Supabase Auth (pt-BR) a partir de um layout único.
// Uso: node scripts/build-email-templates.mjs  →  supabase/templates/*.html
// Variáveis do Supabase ({{ .ConfirmationURL }}, {{ .Token }} etc.) ficam como estão.
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const OUT = join(process.cwd(), "supabase", "templates");

const C = {
  bg: "#0b0508",
  card: "#170a10",
  border: "#3a1526",
  text: "#f5eef1",
  muted: "#b7a3ac",
  pink: "#ff0a78",
  pinkDeep: "#c2004f",
};

function layout({ preheader, title, intro, cta, ctaUrl, code, outro }) {
  const button = cta
    ? `<tr><td align="center" style="padding:8px 0 24px">
         <a href="${ctaUrl}" target="_blank"
            style="display:inline-block;background:${C.pink};background-image:linear-gradient(135deg,${C.pink},${C.pinkDeep});color:#ffffff;font-weight:700;font-size:16px;text-decoration:none;padding:14px 32px;border-radius:999px">${cta}</a>
       </td></tr>
       <tr><td style="padding:0 0 20px;color:${C.muted};font-size:13px;line-height:20px">
         Se o botão não funcionar, copie e cole este link no navegador:<br>
         <a href="${ctaUrl}" style="color:${C.pink};word-break:break-all">${ctaUrl}</a>
       </td></tr>`
    : "";
  const codeBlock = code
    ? `<tr><td align="center" style="padding:8px 0 24px">
         <div style="display:inline-block;background:${C.bg};border:1px solid ${C.border};border-radius:12px;padding:16px 28px;font-size:30px;letter-spacing:8px;font-weight:700;color:${C.text};font-family:'Courier New',monospace">${code}</div>
       </td></tr>`
    : "";
  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="dark light">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:${C.bg}">
<span style="display:none;max-height:0;overflow:hidden;opacity:0">${preheader}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.bg}">
  <tr><td align="center" style="padding:32px 16px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:520px;font-family:Montserrat,Helvetica,Arial,sans-serif">
      <tr><td align="center" style="padding:0 0 24px">
        <img src="{{ .SiteURL }}/brand/logo-cadeado-horizontal.png" alt="Secretfans" width="180" style="display:block;width:180px;height:auto;border:0">
      </td></tr>
      <tr><td style="background:${C.card};border:1px solid ${C.border};border-radius:20px;padding:32px 28px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
          <tr><td style="padding:0 0 12px;color:${C.text};font-size:22px;line-height:30px;font-weight:700">${title}</td></tr>
          <tr><td style="padding:0 0 24px;color:${C.text};font-size:15px;line-height:24px">${intro}</td></tr>
          ${button}${codeBlock}
          <tr><td style="color:${C.muted};font-size:13px;line-height:20px">${outro}</td></tr>
        </table>
      </td></tr>
      <tr><td align="center" style="padding:24px 8px 0;color:${C.muted};font-size:12px;line-height:18px">
        Secretfans · conteúdo exclusivo para maiores de 18 anos.<br>
        Este é um e-mail automático; não responda.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>
`;
}

const IGNORE = "Se você não fez esse pedido, ignore este e-mail. Sua conta continua segura.";

export const TEMPLATES = {
  confirmation: {
    subject: "Confirme seu e-mail na Secretfans",
    html: layout({
      preheader: "Falta só um passo para ativar sua conta.",
      title: "Confirme seu e-mail",
      intro: "Que bom ter você na Secretfans! Para ativar sua conta, confirme que este e-mail é seu.",
      cta: "Confirmar e-mail",
      ctaUrl: "{{ .ConfirmationURL }}",
      outro: `Se você não criou uma conta na Secretfans, ignore este e-mail.`,
    }),
  },
  recovery: {
    subject: "Redefina sua senha da Secretfans",
    html: layout({
      preheader: "Recebemos um pedido para redefinir sua senha.",
      title: "Redefinir senha",
      intro: "Recebemos um pedido para redefinir a senha da sua conta. O link vale por 1 hora.",
      cta: "Criar nova senha",
      ctaUrl: "{{ .ConfirmationURL }}",
      outro: IGNORE,
    }),
  },
  magic_link: {
    subject: "Seu link de acesso à Secretfans",
    html: layout({
      preheader: "Use este link para entrar na sua conta.",
      title: "Entrar na Secretfans",
      intro: "Clique no botão abaixo para entrar na sua conta. O link vale por 1 hora e só pode ser usado uma vez.",
      cta: "Entrar agora",
      ctaUrl: "{{ .ConfirmationURL }}",
      outro: IGNORE,
    }),
  },
  email_change: {
    subject: "Confirme a troca de e-mail na Secretfans",
    html: layout({
      preheader: "Confirme o novo endereço da sua conta.",
      title: "Confirme seu novo e-mail",
      intro:
        'Recebemos um pedido para trocar o e-mail da sua conta de <strong>{{ .Email }}</strong> para <strong>{{ .NewEmail }}</strong>.',
      cta: "Confirmar troca",
      ctaUrl: "{{ .ConfirmationURL }}",
      outro: "Se você não pediu essa troca, ignore este e-mail e altere sua senha por segurança.",
    }),
  },
  invite: {
    subject: "Você foi convidado(a) para a Secretfans",
    html: layout({
      preheader: "Aceite o convite para criar sua conta.",
      title: "Você recebeu um convite",
      intro: "Você foi convidado(a) para participar da Secretfans. Aceite o convite para criar sua conta.",
      cta: "Aceitar convite",
      ctaUrl: "{{ .ConfirmationURL }}",
      outro: "Se você não esperava este convite, ignore este e-mail.",
    }),
  },
  reauthentication: {
    subject: "Seu código de verificação da Secretfans",
    html: layout({
      preheader: "Use este código para confirmar a operação.",
      title: "Código de verificação",
      intro: "Use o código abaixo para confirmar a alteração de segurança na sua conta.",
      code: "{{ .Token }}",
      outro: "O código expira em poucos minutos. " + IGNORE,
    }),
  },
};

mkdirSync(OUT, { recursive: true });
for (const [name, t] of Object.entries(TEMPLATES)) {
  writeFileSync(join(OUT, `${name}.html`), t.html, "utf8");
  console.log(`supabase/templates/${name}.html  ·  ${t.subject}`);
}
