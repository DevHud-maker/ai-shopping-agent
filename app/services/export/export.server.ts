import * as XLSX from "xlsx";
import JSZip from "jszip";

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

export type ScheduleUnit = "days" | "weeks" | "months";

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
  repeatUnit: ScheduleUnit;
  runUntil: "until_cancelled" | "times";
  runTimes: number;
  customFileName: string;
  fileNameTimeSource: "started_at" | "completed_at";
  skipEmptyResults: boolean;
  uploadTo: "none" | "server";
  serverUrl: string;
  sorting: "shopify_order" | "title_asc" | "title_desc" | "created_desc";
};

type ExportFile = {
  buffer: Buffer;
  fileName: string;
  contentType: string;
};

type EntityRows = Record<string, Array<Record<string, any>>>;

function escapeCsv(value: unknown) {
  const str = value == null ? "" : String(value);
  if (/[",\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function rowsToCsv(rows: Array<Record<string, any>>, columns: string[]) {
  const header = columns.map(escapeCsv).join(",");
  const lines = rows.map((row) =>
    columns.map((col) => escapeCsv(row[col])).join(","),
  );
  return [header, ...lines].join("\n");
}

function applyColumns(
  rows: Array<Record<string, any>>,
  columns: string[],
): Array<Record<string, any>> {
  return rows.map((row) => {
    const next: Record<string, any> = {};
    for (const column of columns) {
      next[column] = row[column] ?? "";
    }
    return next;
  });
}

function formatTimeStamp(now = new Date()) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
}

function renderFileName(template: string) {
  const now = new Date();
  const replacements: Record<string, string> = {
    "%Y": String(now.getFullYear()),
    "%m": String(now.getMonth() + 1).padStart(2, "0"),
    "%d": String(now.getDate()).padStart(2, "0"),
    "%H": String(now.getHours()).padStart(2, "0"),
    "%M": String(now.getMinutes()).padStart(2, "0"),
    "%S": String(now.getSeconds()).padStart(2, "0"),
  };

  let out = template || `Export_${formatTimeStamp(now)}`;
  for (const [k, v] of Object.entries(replacements)) {
    out = out.replaceAll(k, v);
  }
  return out;
}

function numericIdFromGid(gid?: string) {
  if (!gid) return "";
  return gid.split("/").pop() || gid;
}

async function gql(admin: any, query: string, variables?: Record<string, any>) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  return json.data;
}

function productSearch(filter?: string) {
  return filter || "";
}

async function exportProducts(admin: any, shop: string, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportProducts($first: Int!, $query: String!) {
      products(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
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
            tracksInventory
            category {
              id
              name
            }
            collections(first: 20) {
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
            media(first: 10) {
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
            variants(first: 50) {
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
    }`,
    { first: 250, query: productSearch(filter) },
  );

  const rows: Array<Record<string, any>> = [];

  for (const edge of data.products.edges) {
    const p = edge.node;
    const collections = (p.collections?.edges || []).map((x: any) => x.node);
    const customCollections = collections
      .filter((c: any) => !c.ruleSet)
      .map((c: any) => c.title)
      .join(", ");
    const smartCollections = collections
      .filter((c: any) => !!c.ruleSet)
      .map((c: any) => c.title)
      .join(", ");

    const media = (p.media?.edges || []).map((x: any) => x.node);
    const variants = (p.variants?.edges || []).map((x: any) => x.node);
    const rowsBase =
      variants.length > 0 ? variants : [null];

    rowsBase.forEach((variant: any, idx: number) => {
      const image = media[idx] || media[0] || null;
      const options = variant?.selectedOptions || [];
      const opt = (nameIndex: number) => options[nameIndex] || null;

      rows.push({
        ID: p.id,
        Handle: p.handle,
        Command: "",
        Title: p.title,
        "Body HTML": p.descriptionHtml,
        Vendor: p.vendor,
        Type: p.productType,
        Tags: (p.tags || []).join(", "),
        "Tags Command": "",
        "Created At": p.createdAt,
        "Updated At": p.updatedAt,
        Status: p.status,
        Published: p.publishedAt ? "TRUE" : "FALSE",
        "Published At": p.publishedAt || "",
        "Published Scope": "",
        "Template Suffix": p.templateSuffix || "",
        "Gift Card": "FALSE",
        URL: p.onlineStoreUrl || "",
        "Total Inventory Qty": p.totalInventory ?? "",
        "Row #": idx + 1,
        "Top Row": idx === 0 ? "TRUE" : "FALSE",
        Category: p.category?.name || "",
        "Category: ID": p.category?.id || "",
        "Category: Name": p.category?.name || "",
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
  }

  return rows;
}

async function exportSmartCollections(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportCollections($first: Int!, $query: String!) {
      collections(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            updatedAt
            ruleSet {
              appliedDisjunctively
            }
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.collections.edges
    .map((e: any) => e.node)
    .filter((c: any) => !!c.ruleSet)
    .map((c: any) => ({
      ID: c.id,
      Title: c.title,
      Handle: c.handle,
      "Updated At": c.updatedAt,
    }));
}

async function exportCustomCollections(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportCollections($first: Int!, $query: String!) {
      collections(first: $first, query: $query) {
        edges {
          node {
            id
            title
            handle
            updatedAt
            ruleSet {
              appliedDisjunctively
            }
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.collections.edges
    .map((e: any) => e.node)
    .filter((c: any) => !c.ruleSet)
    .map((c: any) => ({
      ID: c.id,
      Title: c.title,
      Handle: c.handle,
      "Updated At": c.updatedAt,
    }));
}

async function exportCustomers(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportCustomers($first: Int!, $query: String!) {
      customers(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            firstName
            lastName
            email
            tags
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.customers.edges.map((e: any) => ({
    ID: e.node.id,
    "First Name": e.node.firstName || "",
    "Last Name": e.node.lastName || "",
    Email: e.node.email || "",
    Tags: (e.node.tags || []).join(", "),
  }));
}

async function exportCompanies(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportCompanies($first: Int!, $query: String!) {
      companies(first: $first, query: $query) {
        edges {
          node {
            id
            name
            externalId
            createdAt
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.companies.edges.map((e: any) => ({
    ID: e.node.id,
    Name: e.node.name,
    "External ID": e.node.externalId || "",
    "Created At": e.node.createdAt,
  }));
}

async function exportDiscounts(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportDiscounts($first: Int!, $query: String!) {
      codeDiscountNodes(first: $first, query: $query) {
        edges {
          node {
            id
            codeDiscount {
              ... on DiscountCodeBasic {
                title
                startsAt
                endsAt
                status
              }
            }
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.codeDiscountNodes.edges.map((e: any) => ({
    ID: e.node.id,
    Title: e.node.codeDiscount?.title || "",
    Status: e.node.codeDiscount?.status || "",
    "Starts At": e.node.codeDiscount?.startsAt || "",
    "Ends At": e.node.codeDiscount?.endsAt || "",
  }));
}

async function exportDraftOrders(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportDraftOrders($first: Int!, $query: String!) {
      draftOrders(first: $first, query: $query) {
        edges {
          node {
            id
            name
            status
            createdAt
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.draftOrders.edges.map((e: any) => ({
    ID: e.node.id,
    Name: e.node.name,
    Status: e.node.status,
    "Created At": e.node.createdAt,
  }));
}

async function exportOrders(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportOrders($first: Int!, $query: String!) {
      orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
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
    }`,
    { first: 250, query: filter || "" },
  );

  return data.orders.edges.map((e: any) => ({
    ID: e.node.id,
    Name: e.node.name,
    "Financial Status": e.node.displayFinancialStatus,
    "Fulfillment Status": e.node.displayFulfillmentStatus,
    "Created At": e.node.createdAt,
  }));
}

async function exportPayouts(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportPayouts($first: Int!) {
      shopifyPaymentsAccount {
        payouts(first: $first) {
          edges {
            node {
              id
              status
              issuedAt
              net {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  const payouts = data.shopifyPaymentsAccount?.payouts?.edges || [];
  return payouts.map((e: any) => ({
    ID: e.node.id,
    Status: e.node.status,
    "Issued At": e.node.issuedAt,
    Amount: `${e.node.net?.amount || ""} ${e.node.net?.currencyCode || ""}`.trim(),
  }));
}

async function exportPages(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportPages($first: Int!, $query: String!) {
      pages(first: $first, query: $query) {
        edges {
          node {
            id
            handle
            title
            publishedAt
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.pages.edges.map((e: any) => ({
    ID: e.node.id,
    Handle: e.node.handle,
    Title: e.node.title,
    "Published At": e.node.publishedAt || "",
  }));
}

async function exportRedirects(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportRedirects($first: Int!, $query: String!) {
      urlRedirects(first: $first, query: $query) {
        edges {
          node {
            id
            path
            target
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.urlRedirects.edges.map((e: any) => ({
    ID: e.node.id,
    Path: e.node.path,
    Target: e.node.target,
  }));
}

async function exportFiles(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportFiles($first: Int!, $query: String!) {
      files(first: $first, query: $query) {
        edges {
          node {
            id
            alt
            createdAt
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.files.edges.map((e: any) => ({
    ID: e.node.id,
    Alt: e.node.alt || "",
    "Created At": e.node.createdAt,
  }));
}

async function exportMenus(admin: any, filter?: string) {
  const data = await gql(
    admin,
    `#graphql
    query ExportMenus($first: Int!) {
      menus(first: $first) {
        edges {
          node {
            id
            handle
            title
          }
        }
      }
    }`,
    { first: 250, query: filter || "" },
  );

  return data.menus.edges.map((e: any) => ({
    ID: e.node.id,
    Handle: e.node.handle,
    Title: e.node.title,
  }));
}

async function exportMetaobjects(admin: any, filter?: string) {
  const typeMatch = (filter || "").match(/(?:^|\s)type:([^\s]+)/i);
  const metaobjectType = typeMatch?.[1];

  if (!metaobjectType) {
    throw new Error(
      'Metaobjects export requires a filter with a type, for example: type:custom_badge',
    );
  }

  const cleanedQuery = (filter || "")
    .replace(/(?:^|\s)type:([^\s]+)/i, " ")
    .trim();

  const data = await gql(
    admin,
    `#graphql
    query ExportMetaobjects($first: Int!, $type: String!, $query: String!) {
      metaobjects(first: $first, type: $type, query: $query) {
        edges {
          node {
            id
            type
            handle
            updatedAt
          }
        }
      }
    }`,
    {
      first: 250,
      type: metaobjectType,
      query: cleanedQuery,
    },
  );

  return data.metaobjects.edges.map((e: any) => ({
    ID: e.node.id,
    Type: e.node.type,
    Handle: e.node.handle,
    "Updated At": e.node.updatedAt,
  }));
}

async function exportShop(admin: any) {
  const data = await gql(
    admin,
    `#graphql
    query ExportShop {
      shop {
        name
        email
        primaryDomain {
          url
        }
        currencyCode
      }
    }`,
  );

  return [
    {
      Name: data.shop.name,
      Email: data.shop.email,
      Domain: data.shop.primaryDomain?.url || "",
      Currency: data.shop.currencyCode,
    },
  ];
}

async function fetchEntityRows(
  admin: any,
  shop: string,
  entity: EntityKey,
  filter?: string,
): Promise<Array<Record<string, any>>> {
  switch (entity) {
    case "products":
      return exportProducts(admin, shop, filter);
    case "smart_collections":
      return exportSmartCollections(admin, filter);
    case "custom_collections":
      return exportCustomCollections(admin, filter);
    case "customers":
      return exportCustomers(admin, filter);
    case "companies":
      return exportCompanies(admin, filter);
    case "discounts":
      return exportDiscounts(admin, filter);
    case "draft_orders":
      return exportDraftOrders(admin, filter);
    case "orders":
      return exportOrders(admin, filter);
    case "payouts":
      return exportPayouts(admin, filter);
    case "pages":
      return exportPages(admin, filter);
    case "redirects":
      return exportRedirects(admin, filter);
    case "files":
      return exportFiles(admin, filter);
    case "menus":
      return exportMenus(admin, filter);
    case "metaobjects":
      return exportMetaobjects(admin, filter);
    case "shop":
      return exportShop(admin);
    default:
      return [];
  }
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

export async function buildExportFile(
  admin: any,
  shop: string,
  config: ExportConfig,
  options?: { rowLimit?: number | null },
): Promise<ExportFile> {
  if (!config.selectedEntities?.length) {
    throw new Error("No entities selected.");
  }

  const entityRows: EntityRows = {};

  for (const entity of config.selectedEntities) {
const rows = await fetchEntityRows(
  admin,
  shop,
  entity,
  config.filters?.[entity] || "",
);

const limitedRows =
  options?.rowLimit != null ? rows.slice(0, options.rowLimit) : rows;

    const selectedColumns = config.selectedColumns?.[entity] || [];
    const normalized =
      selectedColumns.length > 0 ? applyColumns(rows, selectedColumns) : rows;

    if (!config.skipEmptyResults || normalized.length > 0) {
      entityRows[entity] = normalized;
    }
  }

  if (Object.keys(entityRows).length === 0) {
    throw new Error("No data found for the selected export.");
  }

  const baseName = renderFileName(config.customFileName || "Export_%Y-%m-%d_%H%M%S");

  if (config.format === "json") {
    return {
      buffer: Buffer.from(JSON.stringify(entityRows, null, 2), "utf8"),
      fileName: `${baseName}.json`,
      contentType: "application/json",
    };
  }

  if (config.format === "excel") {
    const wb = XLSX.utils.book_new();

    for (const [entity, rows] of Object.entries(entityRows)) {
      const ws = XLSX.utils.json_to_sheet(rows);
      XLSX.utils.book_append_sheet(wb, ws, entity.slice(0, 31));
    }

    const out = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;

    return {
      buffer: out,
      fileName: `${baseName}.xlsx`,
      contentType:
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    };
  }

  if (config.format === "csv") {
    const zip = new JSZip();

    for (const [entity, rows] of Object.entries(entityRows)) {
      const columns =
        config.selectedColumns?.[entity] ||
        (rows[0] ? Object.keys(rows[0]) : []);
      const csv = rowsToCsv(rows, columns);
      zip.file(`${entity}.csv`, csv);
    }

    const out = await zip.generateAsync({ type: "nodebuffer" });

    return {
      buffer: out,
      fileName: `${baseName}.zip`,
      contentType: "application/zip",
    };
  }

  if (config.format === "google_shopping_feed") {
    const zip = new JSZip();

    const productRows = entityRows.products || [];
    const feedRows = buildGoogleShoppingRows(productRows);
    const feedColumns = feedRows[0] ? Object.keys(feedRows[0]) : [];
    zip.file(
      "google-shopping-products.csv",
      rowsToCsv(feedRows, feedColumns),
    );

    for (const [entity, rows] of Object.entries(entityRows)) {
      const columns =
        config.selectedColumns?.[entity] ||
        (rows[0] ? Object.keys(rows[0]) : []);
      zip.file(`${entity}.csv`, rowsToCsv(rows, columns));
    }

    const out = await zip.generateAsync({ type: "nodebuffer" });

    return {
      buffer: out,
      fileName: `${baseName}.zip`,
      contentType: "application/zip",
    };
  }

  throw new Error("Unsupported export format.");
}