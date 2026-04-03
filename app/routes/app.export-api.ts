import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentPlan, FREE_LIMITS } from "../services/plan.server";
import {
  buildExportFile,
  type ExportConfig,
} from "../services/export/export.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const config = (await request.json()) as ExportConfig;
  const plan = await getCurrentPlan(admin);

  if (!plan.hasPaidPlan) {
    const premiumFormat = config.format === "google_shopping_feed";
    const serverUpload = config.uploadTo === "server";

    if (premiumFormat || serverUpload) {
      return new Response(
        JSON.stringify({
          ok: false,
          code: "PLAN_REQUIRED",
          message: "This export option is available on the Pro plan.",
          upgradeUrl: "/app/upgrade",
        }),
        {
          status: 402,
          headers: { "Content-Type": "application/json" },
        },
      );
    }
  }

  try {
    const file = await buildExportFile(admin, session.shop, config, {
      rowLimit: plan.hasPaidPlan ? null : FREE_LIMITS.exportRows,
    });

    return new Response(file.buffer, {
      status: 200,
      headers: {
        "Content-Type": file.contentType,
        "Content-Disposition": `attachment; filename="${file.fileName}"`,
      },
    });
  } catch (error) {
    return new Response(
      error instanceof Error ? error.message : "Export failed.",
      { status: 400 },
    );
  }
}