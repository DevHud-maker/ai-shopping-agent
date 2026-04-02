import type { ImportedProductRow } from "./mapper.server";

export function validateImportedProducts(rows: ImportedProductRow[]) {
  const errors: string[] = [];

  rows.forEach((row, idx) => {
    if (!row.title || !row.title.trim()) {
      errors.push(`Row ${idx + 1}: title is required.`);
    }

    if (row.price && Number.isNaN(Number(row.price))) {
      errors.push(`Row ${idx + 1}: invalid price "${row.price}".`);
    }

    if (row.compareAtPrice && Number.isNaN(Number(row.compareAtPrice))) {
      errors.push(`Row ${idx + 1}: invalid compare-at price "${row.compareAtPrice}".`);
    }

    if (row.weight !== undefined && Number.isNaN(Number(row.weight))) {
      errors.push(`Row ${idx + 1}: invalid weight.`);
    }
	if (row.stock !== undefined && Number.isNaN(Number(row.stock))) {
      errors.push(`Row ${idx + 1}: invalid stock.`);
    }

    if (row.stockOnHand !== undefined && Number.isNaN(Number(row.stockOnHand))) {
      errors.push(`Row ${idx + 1}: invalid stock on hand.`);
    }
  });

  if (errors.length) {
    return { ok: false as const, errors };
  }

  return { ok: true as const, rows };
}