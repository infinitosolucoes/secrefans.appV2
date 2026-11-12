"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase-browser";

/** Atualiza a página quando chega notificação nova (a RLS limita ao próprio usuário). */
export function NotificationsRealtime() {
  const router = useRouter();
  useEffect(() => {
    const supabase = browserSupabase();
    const channel = supabase
      .channel("notificacoes")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications" }, () =>
        router.refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [router]);
  return null;
}
