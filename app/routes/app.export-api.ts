import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import {
  buildExportFile,
  type ExportConfig,
} from "../services/export/export.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  const config = (await request.json()) as ExportConfig;

  try {
    const file = await buildExportFile(admin, session.shop, config);

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