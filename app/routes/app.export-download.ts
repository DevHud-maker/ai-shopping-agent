import fs from "node:fs/promises";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getExportJob } from "../services/export/job-store.server";

export async function loader({ request }: LoaderFunctionArgs) {
  await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (!id) {
    return new Response("Missing job id.", { status: 400 });
  }

  const job = await getExportJob(id);
  if (!job) {
    return new Response("Export job not found.", { status: 404 });
  }

  if (job.status !== "completed" || !job.finalFilePath) {
    return new Response("Export file not ready yet.", { status: 400 });
  }

  const buffer = await fs.readFile(job.finalFilePath);

  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": job.finalContentType || "application/octet-stream",
      "Content-Disposition": `attachment; filename="${job.finalFileName || "export"}"`,
    },
  });
}