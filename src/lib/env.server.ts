import "server-only";
import { z } from "zod";

const serverSchema = z.object({ SUPABASE_SERVICE_ROLE_KEY: z.string().min(20) });

export function serverEnv() {
  return serverSchema.parse({ SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY });
}
