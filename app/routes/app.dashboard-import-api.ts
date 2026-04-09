import { data } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { getCurrentPlan, FREE_LIMITS } from "../services/plan.server";
import {
  mapImportedRows,
  type HeaderMap,
} from "../services/dashboard/import/mapper.server";
import { parseImportFile } from "../services/dashboard/import/parser.server";
import { validateImportedProducts } from "../services/dashboard/import/validator.server";
import {
  executeImportedProducts,
  previewImportedProducts,
} from "../services/dashboard/import/executor.server";

function parseManualHeaderMap(value: FormDataEntryValue | null): HeaderMap {
  if (typeof value !== "string" || !value.trim()) return {};

  try {
    const parsed = JSON.parse(value);
    return typeof parsed === "object" && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function parsePositiveInt(value: FormDataEntryValue | null, fallback: number) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  if (n < 0) return fallback;
  return Math.floor(n);
}

export async function action({ request }: ActionFunctionArgs) {
  try {
    const { admin } = await authenticate.admin(request);
    const plan = await getCurrentPlan(admin);
    const formData = await request.formData();

    const file = formData.get("file");
    const mode = String(formData.get("mode") || "preview");
    const manualHeaderMap = parseManualHeaderMap(formData.get("manualHeaderMap"));

    const batchStart = parsePositiveInt(formData.get("batchStart"), 0);
    const batchSize = parsePositiveInt(formData.get("batchSize"), 100);

    if (!(file instanceof File)) {
      return data({ ok: false, message: "No file uploaded." }, { status: 400 });
    }

    const parsed = await parseImportFile(file);
    if (!parsed.ok) {
      return data({ ok: false, message: parsed.message }, { status: 400 });
    }

    const mapped = await mapImportedRows(parsed.rows, { manualHeaderMap });
    if (!mapped.ok) {
      return data({ ok: false, message: mapped.message }, { status: 400 });
    }

    const validated = validateImportedProducts(mapped.rows);
    if (!validated.ok) {
      return data(
        {
          ok: false,
          message: "Validation failed.",
          errors: validated.errors,
          preview: mapped.rows.slice(0, 20),
          headers: mapped.headers,
          headerMap: mapped.headerMap,
          autoHeaderMap: mapped.autoHeaderMap,
          deterministicMap: mapped.deterministicMap,
          aiMap: mapped.aiMap,
          totalRows: mapped.rows.length,
          mode: "preview",
        },
        { status: 400 },
      );
    }

    const totalRows = validated.rows.length;

    if (!plan.hasPaidPlan && totalRows > FREE_LIMITS.importRows) {
      return data(
        {
          ok: false,
          code: "PLAN_LIMIT",
          message: `Free plan allows importing up to ${FREE_LIMITS.importRows} rows. Upgrade to import unlimited products.`,
          upgradeUrl: "/app/upgrade",
          totalRows,
          mode: "preview",
          headers: mapped.headers,
          headerMap: mapped.headerMap,
          autoHeaderMap: mapped.autoHeaderMap,
          deterministicMap: mapped.deterministicMap,
          aiMap: mapped.aiMap,
        },
        { status: 402 },
      );
    }

    if (mode === "preview") {
      const PREVIEW_LIMIT = Math.min(100, FREE_LIMITS.importRows);
      const previewSourceRows = validated.rows.slice(0, PREVIEW_LIMIT);
      const previewData = await previewImportedProducts(admin, previewSourceRows);

      return data({
        ok: true,
        mode: "preview",
        message:
          totalRows > PREVIEW_LIMIT
            ? `Preview ready. Showing first ${PREVIEW_LIMIT} of ${totalRows} row(s).`
            : `Preview ready. ${totalRows} row(s) parsed.`,
        preview: previewData.rows,
        summary: previewData.summary,
        headers: mapped.headers,
        headerMap: mapped.headerMap,
        autoHeaderMap: mapped.autoHeaderMap,
        deterministicMap: mapped.deterministicMap,
        aiMap: mapped.aiMap,
        totalRows,
        previewRowsShown: previewSourceRows.length,
        recommendedBatchSize: 100,
        plan: plan.plan,
        hasPaidPlan: plan.hasPaidPlan,
      });
    }

    if (mode !== "import") {
      return data(
        { ok: false, message: `Unsupported mode "${mode}".` },
        { status: 400 },
      );
    }

    if (batchStart >= totalRows) {
      return data({
        ok: true,
        mode: "import",
        message: "Import already complete.",
        totalRows,
        batchStart,
        batchSize,
        processedInBatch: 0,
        completedRows: totalRows,
        remainingRows: 0,
        nextBatchStart: totalRows,
        done: true,
        summary: {
          created: 0,
          updated: 0,
          unchanged: 0,
        },
        results: [],
      });
    }

    const safeBatchSize = !plan.hasPaidPlan
      ? Math.min(batchSize, FREE_LIMITS.importRows)
      : batchSize;

    const importRows = validated.rows.slice(batchStart, batchStart + safeBatchSize);
    const executed = await executeImportedProducts(admin, importRows);

    const completedRows = Math.min(batchStart + importRows.length, totalRows);
    const remainingRows = Math.max(0, totalRows - completedRows);
    const nextBatchStart = completedRows;
    const done = completedRows >= totalRows;

    return data({
      ok: true,
      mode: "import",
      message: done
        ? `Import finished. Processed ${completedRows} of ${totalRows} row(s).`
        : `Imported batch ${batchStart + 1}–${completedRows} of ${totalRows}.`,
      totalRows,
      batchStart,
      batchSize: safeBatchSize,
      processedInBatch: importRows.length,
      completedRows,
      remainingRows,
      nextBatchStart,
      done,
      summary: executed.summary,
      results: executed.results,
    });
  } catch (error) {
    console.error("dashboard-import-api error:", error);

    return data(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Import API failed.",
      },
      { status: 500 },
    );
  }
}