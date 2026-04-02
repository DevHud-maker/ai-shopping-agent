import { data } from "react-router";
import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { parseImportFile } from "../services/dashboard/import/parser.server";
import { mapImportedRows } from "../services/dashboard/import/mapper.server";
import { validateImportedProducts } from "../services/dashboard/import/validator.server";
import { executeImportedProducts } from "../services/dashboard/import/executor.server";

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const formData = await request.formData();
  const file = formData.get("file");

  if (!(file instanceof File)) {
    return data({ ok: false, message: "No file uploaded." }, { status: 400 });
  }

  const parsed = await parseImportFile(file);
  if (!parsed.ok) {
    return data({ ok: false, message: parsed.message }, { status: 400 });
  }

  const mapped = await mapImportedRows(parsed.rows);
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
        preview: mapped.rows.slice(0, 10),
        headerMap: mapped.headerMap,
      },
      { status: 400 },
    );
  }

  const executed = await executeImportedProducts(admin, validated.rows);

  return data({
    ok: true,
    message: executed.message,
    preview: validated.rows.slice(0, 10),
    headerMap: mapped.headerMap,
    bulk: executed.bulk,
    bulkOperationId: executed.bulk ? executed.bulkOperationId ?? null : null,
  });
}