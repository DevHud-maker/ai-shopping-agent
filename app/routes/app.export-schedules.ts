import { data } from "react-router";
import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import type { ExportConfig } from "../services/export/export.server";
import {
  computeInitialNextRun,
  createScheduledExport,
  deleteScheduledExport,
  listScheduledExports,
  updateScheduledExport,
} from "../services/export/schedule-store.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const schedules = await listScheduledExports(session.shop);
  return data(schedules);
}

export async function action({ request }: ActionFunctionArgs) {
  const { session } = await authenticate.admin(request);
  const body = await request.json();

  if (body.action === "create") {
    const config = body.config as ExportConfig;

    const nextRunAt = computeInitialNextRun(config);
    if (!nextRunAt) {
      return data(
        {
          ok: false,
          message: "Scheduling requires date, time, and timezone.",
        },
        { status: 400 },
      );
    }

    const schedule = await createScheduledExport({
      id: `sch_${Date.now()}`,
      shop: session.shop,
      enabled: true,
      nextRunAt,
      remainingRuns:
        config.runUntil === "times" ? Math.max(1, Number(config.runTimes || 1)) : null,
      config,
      lastRunAt: null,
      lastResultFilePath: null,
      lastResultFileName: null,
      lastResultContentType: null,
      lastBulkJobId: null,
    });

    return data({ ok: true, schedule });
  }

  if (body.action === "toggle") {
    const updated = await updateScheduledExport(body.id, (s) => ({
      ...s,
      enabled: Boolean(body.enabled),
    }));

    if (!updated) {
      return data(
        { ok: false, message: "Schedule not found." },
        { status: 404 },
      );
    }

    return data({ ok: true, schedule: updated });
  }

  if (body.action === "delete") {
    const ok = await deleteScheduledExport(body.id);
    return data({ ok });
  }

  return data(
    { ok: false, message: "Unknown action." },
    { status: 400 },
  );
}