"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { browserSupabase } from "@/lib/supabase-browser";
import { markReadAction } from "./actions";

/**
 * Escuta o Supabase Realtime (a RLS do banco filtra o que cada um recebe) e re-renderiza a página
 * no servidor, que reassina as URLs de mídia. Na conversa aberta, também marca como lida.
 */
export function RealtimeRefresher({ conversationId }: { conversationId?: string }) {
  const router = useRouter();
  useEffect(() => {
    const supabase = browserSupabase();
    if (conversationId) void markReadAction(conversationId);
    const channel = supabase
      .channel(conversationId ? `conversa-${conversationId}` : "inbox")
      .on(
        "postgres_changes",
        conversationId
          ? {
              event: "*",
              schema: "public",
              table: "messages",
              filter: `conversation_id=eq.${conversationId}`,
            }
          : { event: "*", schema: "public", table: "conversations" },
        () => {
          if (conversationId) void markReadAction(conversationId);
          router.refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [conversationId, router]);
  return null;
}
