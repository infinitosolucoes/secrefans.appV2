import { NextResponse } from "next/server";
import { getSessionUser } from "@/server/auth/session";
import { currentMonth, getStatement, monthRange, toCsv } from "@/features/commerce/statement";

/** Exporta o extrato do mês do criador logado (RLS: só os próprios pedidos). */
export async function GET(request: Request) {
  const user = await getSessionUser();
  if (!user || !user.roles.includes("creator"))
    return NextResponse.json({ ok: false }, { status: 401 });
  const month = new URL(request.url).searchParams.get("mes") ?? currentMonth();
  if (!monthRange(month)) return NextResponse.json({ ok: false }, { status: 400 });
  const csv = toCsv(await getStatement(user.id, month));
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="extrato-secretfans-${month}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
