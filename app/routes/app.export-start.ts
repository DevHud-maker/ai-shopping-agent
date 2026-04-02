import { data } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  startExportJob,
  type ExportConfig,
} from "../services/export/bulk-export.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const config = (await request.json()) as ExportConfig;

  try {
    const job = await startExportJob(admin, session.shop, config);
    return data({
      ok: true,
      jobId: job.id,
      status: job.status,
      message: job.message,
    });
  } catch (error) {
    return data(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Failed to start export.",
      },
      { status: 400 },
    );
  }
}