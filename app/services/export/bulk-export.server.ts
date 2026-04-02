import fs from "node:fs/promises";
import path from "node:path";
import * as XLSX from "xlsx";
import JSZip from "jszip";
import {
  createExportJob,
  getExportJob,
  updateExportJob,
  type ExportJobRecord,
} from "./job-store.server";

export type ExportFormat =
  | "excel"
  | "csv"
  | "google_shopping_feed"
  | "json";

export type EntityKey =
  | "products"
  | "smart_collections"
  | "custom_collections"
  | "customers"
  | "companies"
  | "discounts"
  | "draft_orders"
  | "orders"
  | "payouts"
  | "pages"
  | "redirects"
  | "files"
  | "menus"
  | "metaobjects"
  | "shop";

export type ExportConfig = {
  presetName: string;
  format: ExportFormat;
  selectedEntities: EntityKey[];
  selectedColumns: Record<string, string[]>;
  filters: Record<string, string>;
  scheduleOnDate: string;
  scheduleOnTime: string;
  timezone: string;
  repeatEvery: number;
  repeatUnit: "days" | "weeks" | "months";
  runUntil: "until_cancelled" | "times";
  runTimes: number;
  customFileName: string;
  fileNameTimeSource: "started_at" | "completed_at";
  skipEmptyResults: boolean;
  uploadTo: "none" | "server";
  serverUrl: string;
  sorting: "shopify_order" | "title_asc" | "title_desc" | "created_desc";
};

type BuildFileResult = {
  fileName: string;
  contentType: string;
  buffer: Buffer;
};

const FINAL_DIR = path.join(process.cwd(), "app-data", "export-results");

function fileSafe(name: string) {
  return name.replace(/[^\w.-]+/g, "_");
}

function renderFileName(template: string) {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const values: Record<string, string> = {
    "%Y": String(now.getFullYear()),
    "%m": pad(now.getMonth() + 1),
    "%d": pad(now.getDate()),
    "%H": pad(now.getHours()),
    "%M": pad(now.getMinutes()),
    "%S": pad(now.getSeconds()),
  };

  let out = template || "Export_%Y-%m-%d_%H%M%S";
  for (const [k, v] of Object.entries(values)) {
    out = out.replaceAll(k, v);
  }
  return fileSafe(out);
}

function gqlEscape(query: string) {
  return query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

async function gql(admin: any, query: string, variables?: Record<string, any>) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  return json.data;
}

function buildBulkQuery(entity: EntityKey, filter?: string) {
  const q = filter || "";

  switch (entity) {
    case "products":
      return `
      {
        products(query: "${gqlEscape(q)}") {
          edges {
            node {
              id
              handle
              title
              descriptionHtml
              vendor
              productType
              tags
              createdAt
              updatedAt
              status
              publishedAt
              templateSuffix
              totalInventory
              onlineStoreUrl
              category {
                id
                name
              }
              collections(first: 50) {
                edges {
                  node {
                    id
                    title
                    ruleSet {
                      appliedDisjunctively
                    }
                  }
                }
              }
              media(first: 50) {
                edges {
                  node {
                    __typename
                    ... on MediaImage {
                      alt
                      image {
                        url
                        width
                        height
                      }
                    }
                  }
                }
              }
              variants(first: 250) {
                edges {
                  node {
                    id
                    position
                    sku
                    barcode
                    taxable
                    price
                    compareAtPrice
                    inventoryPolicy
                    inventoryQuantity
                    selectedOptions {
                      name
                      value
                    }
                    inventoryItem {
                      id
                      tracked
                      unitCost {
                        amount
                      }
                      countryCodeOfOrigin
                      provinceCodeOfOrigin
                      harmonizedSystemCode
                    }
                  }
                }
              }
            }
          }
        }
      }`;

    case "orders":
      return `
      {
        orders(query: "${gqlEscape(q)}") {
          edges {
            node {
              id
              name
              displayFinancialStatus
              displayFulfillmentStatus
              createdAt
            }
          }
        }
      }`;

    case "pages":
      return `
      {
        pages(query: "${gqlEscape(q)}") {
          edges {
            node {
              id
              handle
              title
              publishedAt
            }
          }
        }
      }`;

    case "redirects":
      return `
      {
        urlRedirects(query: "${gqlEscape(q)}") {
          edges {
            node {
              id
              path
              target
            }
          }
        }
      }`;

    case "files":
      return `
      {
        files(query: "${gqlEscape(q)}") {
          edges {
            node {
              id
              alt
              createdAt
            }
          }
        }
      }`;

    case "metaobjects":
      return `
      {
        metaobjects(query: "${gqlEscape(q)}") {
          edges {
            node {
              id
              type
              handle
              updatedAt
            }
          }
        }
      }`;

    default:
      throw new Error(
        `Entity "${entity}" is not enabled yet in the bulk exporter.`,
      );
  }
}

async function startShopifyBulk(admin: any, bulkQuery: string) {
  const data = await gql(
    admin,
    `#graphql
    mutation StartBulk($query: String!) {
      bulkOperationRunQuery(query: $query) {
        bulkOperation {
          id
          status
          type
        }
        userErrors {
          field
          message
        }
      }
    }`,
    { query: bulkQuery },
  );

  const payload = data.bulkOperationRunQuery;
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
  }

  return payload.bulkOperation;
}

async function getBulkOperation(admin: any) {
  const data = await gql(
    admin,
    `#graphql
    query CurrentBulkOperation {
      currentBulkOperation(type: QUERY) {
        id
        status
        type
        objectCount
        fileSize
        url
        partialDataUrl
        errorCode
        createdAt
        completedAt
      }
    }`,
  );

  return data.currentBulkOperation;
}



async function downloadText(url: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed downloading bulk result: ${res.status}`);
  }
  return await res.text();
}

function pickColumns(
  rows: Array<Record<string, any>>,
  columns: string[],
): Array<Record<string, any>> {
  if (!columns.length) return rows;
  return rows.map((row) => {
    const out: Record<string, any> = {};
    for (const c of columns) out[c] = row[c] ?? "";
    return out;
  });
}

function csvEscape(v: unknown) {
  const s = v == null ? "" : String(v);
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function rowsToCsv(rows: Array<Record<string, any>>, columns: string[]) {
  const header = columns.map(csvEscape).join(",");
  const body = rows.map((row) => columns.map((c) => csvEscape(row[c])).join(","));
  return [header, ...body].join("\n");
}

function parseJsonlForEntity(entity: EntityKey, text: string) {
  const lines = text.split("\n").filter(Boolean);
  const rows: Array<Record<string, any>> = [];

  for (const line of lines) {
    const obj = JSON.parse(line);

    if (entity === "products" && obj.id?.startsWith("gid://shopify/Product/")) {
      const collections = (obj.collections?.edges || []).map((x: any) => x.node);
      const customCollections = collections
        .filter((c: any) => !c.ruleSet)
        .map((c: any) => c.title)
        .join(", ");
      const smartCollections = collections
        .filter((c: any) => !!c.ruleSet)
        .map((c: any) => c.title)
        .join(", ");

      const media = (obj.media?.edges || []).map((x: any) => x.node);
      const variants = (obj.variants?.edges || []).map((x: any) => x.node);
      const rowsBase = variants.length > 0 ? variants : [null];

      rowsBase.forEach((variant: any, idx: number) => {
        const image = media[idx] || media[0] || null;
        const options = variant?.selectedOptions || [];
        const opt = (nameIndex: number) => options[nameIndex] || null;

        rows.push({
          ID: obj.id,
          Handle: obj.handle || "",
          Command: "",
          Title: obj.title || "",
          "Body HTML": obj.descriptionHtml || "",
          Vendor: obj.vendor || "",
          Type: obj.productType || "",
          Tags: Array.isArray(obj.tags) ? obj.tags.join(", ") : "",
          "Tags Command": "",
          "Created At": obj.createdAt || "",
          "Updated At": obj.updatedAt || "",
          Status: obj.status || "",
          Published: obj.publishedAt ? "TRUE" : "FALSE",
          "Published At": obj.publishedAt || "",
          "Published Scope": "",
          "Template Suffix": obj.templateSuffix || "",
          "Gift Card": "FALSE",
          URL: obj.onlineStoreUrl || "",
          "Total Inventory Qty": obj.totalInventory ?? "",
          "Row #": idx + 1,
          "Top Row": idx === 0 ? "TRUE" : "FALSE",
          Category: obj.category?.name || "",
          "Category: ID": obj.category?.id || "",
          "Category: Name": obj.category?.name || "",
          "Custom Collections": customCollections,
          "Smart Collections": smartCollections,
          "Image Type": image?.__typename || "",
          "Image Src": image?.image?.url || "",
          "Image Command": "",
          "Image Position": image ? idx + 1 : "",
          "Image Width": image?.image?.width || "",
          "Image Height": image?.image?.height || "",
          "Image Alt Text": image?.alt || "",
          "Variant Inventory Item ID": variant?.inventoryItem?.id || "",
          "Variant ID": variant?.id || "",
          "Variant Command": "",
          "Option1 Name": opt(0)?.name || "",
          "Option1 Value": opt(0)?.value || "",
          "Option2 Name": opt(1)?.name || "",
          "Option2 Value": opt(1)?.value || "",
          "Option3 Name": opt(2)?.name || "",
          "Option3 Value": opt(2)?.value || "",
          "Variant Position": variant?.position || "",
          "Variant SKU": variant?.sku || "",
          "Variant Barcode": variant?.barcode || "",
          "Variant Image": image?.image?.url || "",
          "Variant Weight": "",
          "Variant Weight Unit": "",
          "Variant Price": variant?.price || "",
          "Variant Compare At Price": variant?.compareAtPrice || "",
          "Variant Taxable": variant?.taxable ? "TRUE" : "FALSE",
          "Variant Tax Code": "",
          "Variant Inventory Tracker": variant?.inventoryItem?.tracked ? "shopify" : "",
          "Variant Inventory Policy": variant?.inventoryPolicy || "",
          "Variant Fulfillment Service": "manual",
          "Variant Requires Shipping": "TRUE",
          "Variant Shipping Profile": "",
          "Variant Inventory Qty": variant?.inventoryQuantity ?? "",
          "Variant Inventory Adjust": "",
          "Variant Cost": variant?.inventoryItem?.unitCost?.amount || "",
          "Variant HS Code": variant?.inventoryItem?.harmonizedSystemCode || "",
          "Variant Country of Origin": variant?.inventoryItem?.countryCodeOfOrigin || "",
          "Variant Province of Origin": variant?.inventoryItem?.provinceCodeOfOrigin || "",
          "Inventory Available: ...": "",
          "Inventory Available Adjust: ...": "",
          "Inventory On Hand: ...": "",
          "Inventory On Hand Adjust: ...": "",
          "Inventory Committed: ...": "",
          "Inventory Reserved: ...": "",
          "Inventory Damaged: ...": "",
          "Inventory Damaged Adjust: ...": "",
          "Inventory Safety Stock: ...": "",
          "Inventory Safety Stock Adjust: ...": "",
          "Inventory Quality Control: ...": "",
          "Inventory Quality Control Adjust: ...": "",
          "Inventory Incoming: ...": "",
          "Included / ...": "",
          "Price / ...": "",
          "Compare At Price / ...": "",
          "Metafield: ...": "",
          "Variant Metafield: ...": "",
        });
      });

      continue;
    }

    if (entity === "orders" && obj.id?.startsWith("gid://shopify/Order/")) {
      rows.push({
        ID: obj.id,
        Name: obj.name,
        "Financial Status": obj.displayFinancialStatus,
        "Fulfillment Status": obj.displayFulfillmentStatus,
        "Created At": obj.createdAt,
      });
      continue;
    }

    if (entity === "pages" && obj.id?.startsWith("gid://shopify/OnlineStorePage/")) {
      rows.push({
        ID: obj.id,
        Handle: obj.handle,
        Title: obj.title,
        "Published At": obj.publishedAt || "",
      });
      continue;
    }

    if (entity === "redirects" && obj.id?.startsWith("gid://shopify/UrlRedirect/")) {
      rows.push({
        ID: obj.id,
        Path: obj.path,
        Target: obj.target,
      });
      continue;
    }

    if (entity === "files" && obj.id?.startsWith("gid://shopify/")) {
      if ("alt" in obj && "createdAt" in obj) {
        rows.push({
          ID: obj.id,
          Alt: obj.alt || "",
          "Created At": obj.createdAt,
        });
      }
      continue;
    }

    if (entity === "metaobjects" && obj.id?.startsWith("gid://shopify/Metaobject/")) {
      rows.push({
        ID: obj.id,
        Type: obj.type,
        Handle: obj.handle,
        "Updated At": obj.updatedAt,
      });
      continue;
    }
  }

  return rows;
}

function buildGoogleShoppingRows(productRows: Array<Record<string, any>>) {
  return productRows.map((row) => ({
    id: row["Handle"] || row["ID"] || "",
    title: row["Title"] || "",
    description: row["Body HTML"] || "",
    link: row["URL"] || "",
    image_link: row["Image Src"] || "",
    availability:
      Number(row["Variant Inventory Qty"] || 0) > 0 ? "in stock" : "out of stock",
    price: row["Variant Price"] ? `${row["Variant Price"]} USD` : "",
    brand: row["Vendor"] || "",
    condition: "new",
    google_product_category: row["Category: Name"] || "",
    product_type: row["Type"] || "",
    mpn: row["Variant SKU"] || "",
    gtin: row["Variant Barcode"] || "",
  }));
}

async function buildFinalFile(
  config: ExportConfig,
  entityRows: Record<string, Array<Record<string, any>>>,
): Promise<BuildFileResult> {
  const baseName = renderFileName(config.customFileName || "Export_%Y-%m-%d_%H%M%S");

  if (config.format === "json") {
    return {
      fileName: `${baseName}.json`,
      contentType: "application/json",
      buffer: Buffer.from(JSON.stringify(entityRows, null, 2), "utf8"),
    };
  }

  if (config.format === "excel") {
    const wb = XLSX.utils.book_new();
    for (const [entity, rows] of Object.entries(entityRows)) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, entity.slice(0, 31));
    }
    const buffer = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
    return {
      fileName: `${baseName}.xlsx`,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      buffer,
    };
  }

  if (config.format === "csv") {
    const zip = new JSZip();
    for (const [entity, rows] of Object.entries(entityRows)) {
      const cols = config.selectedColumns?.[entity] || (rows[0] ? Object.keys(rows[0]) : []);
      zip.file(`${entity}.csv`, rowsToCsv(rows, cols));
    }
    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return {
      fileName: `${baseName}.zip`,
      contentType: "application/zip",
      buffer,
    };
  }

  if (config.format === "google_shopping_feed") {
    const zip = new JSZip();
    const productRows = entityRows.products || [];
    const feedRows = buildGoogleShoppingRows(productRows);
    const feedCols = feedRows[0] ? Object.keys(feedRows[0]) : [];
    zip.file("google-shopping-products.csv", rowsToCsv(feedRows, feedCols));

    for (const [entity, rows] of Object.entries(entityRows)) {
      const cols = config.selectedColumns?.[entity] || (rows[0] ? Object.keys(rows[0]) : []);
      zip.file(`${entity}.csv`, rowsToCsv(rows, cols));
    }

    const buffer = await zip.generateAsync({ type: "nodebuffer" });
    return {
      fileName: `${baseName}.zip`,
      contentType: "application/zip",
      buffer,
    };
  }

  throw new Error("Unsupported export format.");
}

export async function startExportJob(
  admin: any,
  shop: string,
  config: ExportConfig,
) {
  if (!config.selectedEntities?.length) {
    throw new Error("Select at least one entity.");
  }

  if (config.selectedEntities.length !== 1) {
    throw new Error(
      "Bulk export currently supports one entity per job. For very large exports, start with Products only.",
    );
  }

  const entity = config.selectedEntities[0];

  if (entity !== "products") {
    throw new Error(
      'Bulk export is currently enabled only for "Products" in this scalable flow.',
    );
  }

  const id = `exp_${Date.now()}`;
  const entities: ExportJobRecord["entities"] = {
    [entity]: { status: "queued" },
  };

  const job = await createExportJob({
    id,
    shop,
    status: "queued",
    config,
    entities,
    message: "Export job created.",
    finalFilePath: null,
    finalFileName: null,
    finalContentType: null,
  });

  const bulkQuery = buildBulkQuery(entity, config.filters?.[entity] || "");
  const bulk = await startShopifyBulk(admin, bulkQuery);

  await updateExportJob(job.id, (j) => ({
    ...j,
    status: "running",
    message: `Started bulk export for ${entity}.`,
    entities: {
      ...j.entities,
      [entity]: {
        ...j.entities[entity],
        status: "running",
        bulkOperationId: bulk.id,
      },
    },
  }));

  return await getExportJob(job.id);
}

export async function refreshExportJob(admin: any, id: string) {
  const job = await getExportJob(id);
  if (!job) {
    throw new Error("Export job not found.");
  }

  for (const [entity, state] of Object.entries(job.entities)) {
    if (!state.bulkOperationId) continue;
    if (state.status === "completed" || state.status === "failed") continue;

    const op = await getBulkOperation(admin);
	if (!op) {
  await updateExportJob(id, (j) => ({
    ...j,
    message: "No current bulk operation found yet.",
  }));
  continue;
}

if (state.bulkOperationId && op.id && state.bulkOperationId !== op.id) {
  await updateExportJob(id, (j) => ({
    ...j,
    message: "A different bulk operation is currently active for this shop.",
  }));
  continue;
}

    const nextStatus =
      op.status === "COMPLETED"
        ? "completed"
        : op.status === "FAILED" || op.status === "CANCELED"
          ? "failed"
          : "running";

    await updateExportJob(id, (j) => ({
      ...j,
      status:
        nextStatus === "failed"
          ? "failed"
          : nextStatus === "completed"
            ? "transforming"
            : "running",
      message:
        nextStatus === "failed"
          ? `Bulk export failed for ${entity}.`
          : nextStatus === "completed"
            ? `Bulk export completed for ${entity}. Transforming file.`
            : `Bulk export still running for ${entity}.`,
      entities: {
        ...j.entities,
        [entity]: {
          ...j.entities[entity],
          status: nextStatus,
          url: op.url || null,
          partialDataUrl: op.partialDataUrl || null,
          errorCode: op.errorCode || null,
          objectCount: op.objectCount || null,
        },
      },
    }));
  }

  const refreshed = await getExportJob(id);
  if (!refreshed) {
    throw new Error("Export job not found after refresh.");
  }

  const entityStates = Object.values(refreshed.entities);
  const completed = entityStates.every((e) => e.status === "completed");
  const failed = entityStates.some((e) => e.status === "failed");

  if (failed) {
    await updateExportJob(id, (j) => ({
      ...j,
      status: "failed",
      message: "The Shopify bulk operation failed.",
    }));
    return await getExportJob(id);
  }

  if (!completed) {
    return refreshed;
  }

  if (refreshed.finalFilePath) {
    return refreshed;
  }

  await updateExportJob(id, (j) => ({
    ...j,
    status: "transforming",
    message: "Downloading bulk JSONL and building final export file.",
  }));

  const entityRows: Record<string, Array<Record<string, any>>> = {};

  for (const [entity, state] of Object.entries(refreshed.entities)) {
    if (!state.url) continue;

    const text = await downloadText(state.url);
    const rows = parseJsonlForEntity(entity as EntityKey, text);
    const cols = refreshed.config.selectedColumns?.[entity] || [];
    const selected = cols.length ? pickColumns(rows, cols) : rows;

    if (!refreshed.config.skipEmptyResults || selected.length > 0) {
      entityRows[entity] = selected;
    }
  }

  if (!Object.keys(entityRows).length) {
    await updateExportJob(id, (j) => ({
      ...j,
      status: "failed",
      message: "No rows produced from bulk export.",
    }));
    return await getExportJob(id);
  }

  const finalFile = await buildFinalFile(refreshed.config, entityRows);

  await fs.mkdir(FINAL_DIR, { recursive: true });
  const finalPath = path.join(FINAL_DIR, `${id}__${finalFile.fileName}`);
  await fs.writeFile(finalPath, finalFile.buffer);

  await updateExportJob(id, (j) => ({
    ...j,
    status: "completed",
    message: "Export completed.",
    finalFilePath: finalPath,
    finalFileName: finalFile.fileName,
    finalContentType: finalFile.contentType,
  }));

  return await getExportJob(id);
}