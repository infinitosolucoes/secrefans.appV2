"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { safeNextPath } from "@/features/identity/schemas";
import { AGE_COOKIE, AGE_COOKIE_MAX_AGE } from "./constants";

export async function confirmAgeAction(formData: FormData) {
  const store = await cookies();
  store.set(AGE_COOKIE, "1", {
    maxAge: AGE_COOKIE_MAX_AGE,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
  });
  redirect(safeNextPath(String(formData.get("next") ?? ""), "/"));
}
