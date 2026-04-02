import * as XLSX from "xlsx";

export async function parseImportFile(file: File) {
  const name = file.name.toLowerCase();
  const buf = Buffer.from(await file.arrayBuffer());

  try {
    if (name.endsWith(".csv") || name.endsWith(".xlsx") || name.endsWith(".xls")) {
      const wb = XLSX.read(buf, { type: "buffer" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { defval: "" });

      return { ok: true as const, rows };
    }

    return { ok: false as const, message: "Only CSV, XLSX and XLS are supported." };
  } catch (e) {
    return {
      ok: false as const,
      message: e instanceof Error ? e.message : "Failed to parse file.",
    };
  }
}