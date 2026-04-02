import { data } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { unauthenticated } from "../shopify.server";
import { runDueScheduledExports } from "../services/export/scheduler.server";

export async function action({ request }: ActionFunctionArgs) {
  const url = new URL(request.url);
  const secret =
    request.headers.get("x-export-cron-secret") || url.searchParams.get("secret");

  if (!process.env.EXPORT_CRON_SECRET || secret !== process.env.EXPORT_CRON_SECRET) {
    return data({ ok: false, message: "Unauthorized." }, { status: 401 });
  }

  const results = await runDueScheduledExports(async (shop: string) => {
    const ctx = await unauthenticated.admin(shop);
    return ctx.admin;
  });

  return data({
    ok: true,
    ranAt: new Date().toISOString(),
    count: results.length,
    results,
  });
}