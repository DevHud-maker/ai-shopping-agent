import { data } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentPlan } from "../services/plan.server";
import {
  startExportJob,
  type ExportConfig,
} from "../services/export/bulk-export.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const config = (await request.json()) as ExportConfig;
  const plan = await getCurrentPlan(admin);

  if (!plan.hasPaidPlan) {
    return data(
      {
        ok: false,
        code: "PLAN_REQUIRED",
        message: "Bulk export jobs are available on the Pro plan.",
        upgradeUrl: "/app/upgrade",
      },
      { status: 402 },
    );
  }

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