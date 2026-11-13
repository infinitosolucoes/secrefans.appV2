import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Montserrat, Yellowtail } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import "./globals.css";

const montserrat = Montserrat({
  subsets: ["latin"],
  variable: "--font-montserrat",
  display: "swap",
});
const yellowtail = Yellowtail({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-yellowtail",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Secretfans", template: "%s · Secretfans" },
  description: "Conteúdo exclusivo. Conexões reais.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#0b0205", width: "device-width", initialScale: 1 };

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Lê os cabeçalhos para que toda página seja renderizada por requisição: só assim o Next
  // consegue colocar o nonce da CSP nos scripts (páginas estáticas não teriam o nonce).
  await headers();
  return (
    <html lang="pt-BR" className={`${montserrat.variable} ${yellowtail.variable}`}>
      <body className="min-h-dvh">
        <a
          href="#conteudo"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-surface-alt focus:px-4 focus:py-2"
        >
          Pular para o conteúdo
        </a>
        {children}
        <Analytics />
      </body>
    </html>
  );
}
