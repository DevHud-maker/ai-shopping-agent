import fs from "node:fs/promises";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getScheduledExport } from "../services/export/schedule-store.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response("Missing schedule id.", { status: 400 });
  }

  const schedule = await getScheduledExport(id);
  if (!schedule || schedule.shop !== session.shop) {
    return new Response("Scheduled export not found.", { status: 404 });
  }

  if (!schedule.lastResultFilePath || !schedule.lastResultFileName) {
    return new Response("No scheduled result file available yet.", { status: 400 });
  }

  const buffer = await fs.readFile(schedule.lastResultFilePath);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": schedule.lastResultContentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${schedule.lastResultFileName}"`,
    },
  });
}