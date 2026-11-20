import { sql } from "drizzle-orm";
import { assistantMode } from "@/server/ai/assistant";
import { getContext } from "@/server/context";
import { route } from "@/server/http";

/** `GET /api/health` — service, ledger and database in use. */
export const GET = route(async () => {
  try {
    const ctx = await getContext();
    await ctx.db.execute(sql`select 1`);
    return Response.json({
      status: "ok",
      service: "bona",
      ledger: ctx.ledgerMode,
      database: ctx.database,
      evidenceStore: ctx.store.kind,
      assistant: assistantMode(ctx.env),
    });
  } catch (error) {
    console.error("[health] degraded", error);
    return Response.json(
      { status: "degraded", service: "bona", error: "database unavailable" },
      { status: 503 },
    );
  }
});
