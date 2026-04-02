import fs from "node:fs/promises";
import path from "node:path";
import { buildExportFile, type ExportConfig } from "./export.server";
import { startExportJob } from "./bulk-export.server";
import {
  computeFollowingRun,
  listDueScheduledExports,
  updateScheduledExport,
  type ScheduledExportRecord,
} from "./schedule-store.server";

const SCHEDULE_RESULTS_DIR = path.join(
  process.cwd(),
  "app-data",
  "export-schedule-results",
);

type AdminResolver = (shop: string) => Promise<any>;

function isBulkProductsOnly(config: ExportConfig) {
  return config.selectedEntities.length === 1 && config.selectedEntities[0] === "products";
}

export async function runDueScheduledExports(getAdminForShop: AdminResolver) {
  const due = await listDueScheduledExports();
  const results: Array<{ id: string; status: string; message: string }> = [];

  for (const schedule of due) {
    try {
      await updateScheduledExport(schedule.id, (s) => ({
        ...s,
        lastStatus: "running",
        lastMessage: "Scheduled export started.",
      }));

      const admin = await getAdminForShop(schedule.shop);

      if (isBulkProductsOnly(schedule.config)) {
        const job = await startExportJob(admin, schedule.shop, schedule.config);

        await finalizeRun(schedule, {
          status: "completed",
          message: `Scheduled bulk export started. Job: ${job?.id || "unknown"}.`,
          bulkJobId: job?.id || null,
        });

        results.push({
          id: schedule.id,
          status: "started_bulk_job",
          message: `Started bulk job ${job?.id || ""}`.trim(),
        });

        continue;
      }

      const file = await buildExportFile(admin, schedule.shop, schedule.config);

      await fs.mkdir(SCHEDULE_RESULTS_DIR, { recursive: true });
      const finalPath = path.join(
        SCHEDULE_RESULTS_DIR,
        `${schedule.id}__${Date.now()}__${file.fileName}`,
      );
      await fs.writeFile(finalPath, file.buffer);

      await finalizeRun(schedule, {
        status: "completed",
        message: "Scheduled export completed.",
        filePath: finalPath,
        fileName: file.fileName,
        contentType: file.contentType,
      });

      results.push({
        id: schedule.id,
        status: "completed",
        message: file.fileName,
      });
    } catch (error) {
      await finalizeRun(schedule, {
        status: "failed",
        message: error instanceof Error ? error.message : "Scheduled export failed.",
      });

      results.push({
        id: schedule.id,
        status: "failed",
        message: error instanceof Error ? error.message : "Scheduled export failed.",
      });
    }
  }

  return results;
}

async function finalizeRun(
  schedule: ScheduledExportRecord,
  input: {
    status: "completed" | "failed";
    message: string;
    filePath?: string | null;
    fileName?: string | null;
    contentType?: string | null;
    bulkJobId?: string | null;
  },
) {
  await updateScheduledExport(schedule.id, (s) => {
    const nextRunCount = s.runCount + 1;

    let nextRemaining = s.remainingRuns;
    let enabled = s.enabled;
    let nextRunAt = s.nextRunAt;

    if (nextRemaining != null) {
      nextRemaining = Math.max(0, nextRemaining - 1);
      if (nextRemaining === 0) {
        enabled = false;
        nextRunAt = null;
      }
    }

    if (enabled) {
      nextRunAt = computeFollowingRun({
        ...s,
        runCount: nextRunCount,
        remainingRuns: nextRemaining,
      });
    }

    return {
      ...s,
      lastRunAt: new Date().toISOString(),
      runCount: nextRunCount,
      remainingRuns: nextRemaining,
      enabled,
      nextRunAt,
      lastStatus: input.status,
      lastMessage: input.message,
      lastResultFilePath: input.filePath ?? s.lastResultFilePath ?? null,
      lastResultFileName: input.fileName ?? s.lastResultFileName ?? null,
      lastResultContentType: input.contentType ?? s.lastResultContentType ?? null,
      lastBulkJobId: input.bulkJobId ?? s.lastBulkJobId ?? null,
    };
  });
}