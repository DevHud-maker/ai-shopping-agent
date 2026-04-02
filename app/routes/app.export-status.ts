import { data } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  getExportJob,
  listExportJobs,
  updateExportJob,
} from "../services/export/job-store.server";
import { refreshExportJob } from "../services/export/bulk-export.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  try {
    if (id) {
      const existing = await getExportJob(id);

      if (!existing) {
        return data(
          {
            ok: false,
            message: "Export job not found.",
          },
          { status: 404 },
        );
      }

      try {
        const refreshed = await refreshExportJob(admin, id);
        return data(refreshed);
      } catch (error) {
        const updated = await updateExportJob(id, (job) => ({
          ...job,
          message:
            error instanceof Error
              ? `Refresh failed: ${error.message}`
              : "Refresh failed.",
        }));

        return data(updated || existing);
      }
    }

    const jobs = await listExportJobs(session.shop);
    return data(jobs);
  } catch (error) {
    return data(
      {
        ok: false,
        message:
          error instanceof Error
            ? error.message
            : "Failed to load export status.",
      },
      { status: 400 },
    );
  }
}