import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  publicEnv: () => ({ NEXT_PUBLIC_SITE_URL: "https://secretfans-hml.vercel.app/" }),
}));
const serverEnv = vi.fn(() => ({
  RESEND_API_KEY: undefined as string | undefined,
  EMAIL_FROM: "Secretfans <nao-responda@secretfans.app.br>",
}));
vi.mock("@/lib/env.server", () => ({ serverEnv: () => serverEnv() }));
vi.mock("@/server/auth/supabase", () => ({ createServiceSupabase: vi.fn() }));

const { dispatchPendingEmails, renderNotificationEmail, sendEmail } =
  await import("@/server/email");

describe("e-mails de notificação", () => {
  it("escapa o conteúdo e monta o link e as preferências", () => {
    const { html, text } = renderNotificationEmail({
      title: 'Fã <script>alert("x")</script> te enviou um mimo',
      body: "Líquido: R$ 448,01",
      url: "https://secretfans-hml.vercel.app/estudio/extrato",
      cta: "Ver extrato",
    });
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain('href="https://secretfans-hml.vercel.app/estudio/extrato"');
    expect(html).toContain("https://secretfans-hml.vercel.app/notificacoes");
    expect(text).toContain("Ver extrato: https://secretfans-hml.vercel.app/estudio/extrato");
  });

  it("sem RESEND_API_KEY não envia nem consome a fila", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    expect(await sendEmail({ to: "a@b.c", subject: "x", html: "x", text: "x" })).toBe(false);
    expect(await dispatchPendingEmails()).toEqual({ sent: 0, failed: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("com a chave, envia pelo Resend com remetente e destinatário", async () => {
    serverEnv.mockReturnValue({
      RESEND_API_KEY: "re_teste_123456",
      EMAIL_FROM: "Secretfans <n@s.app>",
    });
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("{}", { status: 200 }));
    expect(
      await sendEmail({ to: "fa@exemplo.com", subject: "Oi", html: "<p>oi</p>", text: "oi" }),
    ).toBe(true);
    const [url, init] = fetchSpy.mock.calls[0]!;
    expect(url).toBe("https://api.resend.com/emails");
    expect(JSON.parse(String(init!.body))).toEqual({
      from: "Secretfans <n@s.app>",
      to: ["fa@exemplo.com"],
      subject: "Oi",
      html: "<p>oi</p>",
      text: "oi",
    });
  });
});
