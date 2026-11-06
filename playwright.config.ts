import { defineConfig, devices } from "@playwright/test";

// E2E_PORT permite rodar contra um dev server em outra porta (ex.: 3000 ocupada).
const PORT = Number(process.env.E2E_PORT ?? 3000);

// Disponibiliza as variáveis locais (inclui a service_role do Supabase LOCAL) para o setup dos testes.
try {
  process.loadEnvFile(".env.local");
} catch {
  // Em CI as variáveis vêm do ambiente.
}

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    // Visitante que já confirmou o aviso +18 (o próprio aviso é testado em age-gate.spec.ts).
    storageState: {
      cookies: [
        {
          name: "sf_maior18",
          value: "1",
          domain: "localhost",
          path: "/",
          expires: -1,
          httpOnly: true,
          secure: false,
          sameSite: "Lax",
        },
      ],
      origins: [],
    },
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /smoke\.spec\.ts/ },
  ],
  webServer: {
    command: process.env.CI ? "npm run start" : "npm run dev",
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
