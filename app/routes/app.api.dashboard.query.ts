import { data, type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { buildDashboardPlan } from "../services/dashboard/ai.server";
import {
  executeDashboardPlan,
  previewDashboardPlan,
} from "../services/dashboard/shopify-ops.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const body = await request.json();

  const query = String(body?.query || "").trim();
  const confirm = Boolean(body?.confirm);
  const confirmationToken = body?.confirmationToken
    ? String(body.confirmationToken)
    : null;

  if (!query) {
    return data(
      { ok: false, mode: "error", message: "Query is required." },
      { status: 400 },
    );
  }

  const plan = await buildDashboardPlan(query);

  if (!plan.ok) {
    return data(
      { ok: false, mode: "error", message: plan.message },
      { status: 400 },
    );
  }

  if (plan.data.requiresConfirmation && !confirm) {
    const preview = await previewDashboardPlan(admin, plan.data);

    return data({
      ok: true,
      mode: "preview",
      message: "Preview generated. Review before confirming.",
      plan: plan.data,
      rows: preview.rows,
      count: preview.count,
      destructive: true,
      confirmationToken: `confirm:${session.shop}:${Date.now()}`,
    });
  }

  const result = await executeDashboardPlan(admin, plan.data, {
    confirmationToken,
  });

  return data({
    ok: true,
    mode: "executed",
    message: result.message,
    plan: plan.data,
    rows: result.rows,
    count: result.count,
  });
}