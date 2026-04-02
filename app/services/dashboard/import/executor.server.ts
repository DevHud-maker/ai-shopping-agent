import type { ImportedProductRow } from "./mapper.server";

type ExistingVariant = {
  id: string;
  sku?: string | null;
  price?: string | null;
  compareAtPrice?: string | null;
  barcode?: string | null;
  inventoryItemId?: string | null;
};

type ExistingProduct = {
  id: string;
  title: string;
  handle: string;
  vendor: string;
  productType: string;
  tags: string[];
  status: "ACTIVE" | "DRAFT" | "ARCHIVED";
  descriptionHtml?: string | null;
  variants: ExistingVariant[];
};

export type ProductPreviewRow = {
  key: string;
  matchType: "sku" | "handle" | "title" | "new";
  action: "create" | "update" | "unchanged";
  productId?: string;

  title: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  bodyHtml?: string;

  sku?: string;
  price?: string;
  compareAtPrice?: string;
  barcode?: string;
  option1?: string;
  option2?: string;
  option3?: string;

  tracked?: boolean;
  inventoryPolicy?: "CONTINUE" | "DENY";
  requiresShipping?: boolean;
  taxable?: boolean;
  taxCode?: string;
  cost?: string;
  harmonizedSystemCode?: string;
  countryCodeOfOrigin?: string;
  provinceCodeOfOrigin?: string;

  weight?: number;
  weightUnit?: "KILOGRAMS" | "GRAMS" | "POUNDS" | "OUNCES";

  stock?: number;
  stockOnHand?: number;
  locationName?: string;
  locationId?: string;

  imageSrc?: string;

  changes: Record<
    string,
    {
      before: string;
      after: string;
    }
  >;
};

function normalizeText(value: unknown) {
  return String(value ?? "").trim();
}

function normalizeNullable(value: unknown) {
  const s = normalizeText(value);
  return s || "";
}

function normalizeTags(value?: string[]) {
  return [...new Set((value ?? []).map((x) => x.trim()).filter(Boolean))].sort();
}

function sameTags(a?: string[], b?: string[]) {
  return JSON.stringify(normalizeTags(a)) === JSON.stringify(normalizeTags(b));
}

function tagsToString(tags?: string[]) {
  return normalizeTags(tags).join(", ");
}

async function gql(admin: any, query: string, variables?: Record<string, any>) {
  const res = await admin.graphql(query, { variables });
  const json = await res.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  return json.data;
}

function buildProductCreateInput(row: ImportedProductRow) {
  const product: Record<string, any> = {
    title: row.title,
    handle: row.handle,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    status: row.status ?? "DRAFT",
    descriptionHtml: row.bodyHtml,
  };

  if (row.seoTitle || row.seoDescription) {
    product.seo = {
      title: row.seoTitle,
      description: row.seoDescription,
    };
  }

  if (row.templateSuffix) {
    product.templateSuffix = row.templateSuffix;
  }

  if (row.giftCard !== undefined) {
    product.giftCard = row.giftCard;
  }

  return product;
}

async function getPrimaryLocationId(admin: any) {
  const data = await gql(
    admin,
    `#graphql
    query Locations {
      locations(first: 1, sortKey: NAME) {
        edges {
          node {
            id
            name
          }
        }
      }
    }`,
  );

  return data.locations.edges?.[0]?.node?.id || null;
}

async function findExistingProduct(
  admin: any,
  row: ImportedProductRow,
): Promise<
  | {
      matchType: "sku" | "handle" | "title";
      product: ExistingProduct;
    }
  | null
> {
  const searchQueries = [
    row.sku ? { type: "sku" as const, query: `sku:${row.sku}` } : null,
    row.handle ? { type: "handle" as const, query: `handle:${row.handle}` } : null,
    row.title
      ? {
          type: "title" as const,
          query: `title:"${String(row.title).replace(/"/g, '\\"')}"`,
        }
      : null,
  ].filter(Boolean) as Array<{ type: "sku" | "handle" | "title"; query: string }>;

  for (const item of searchQueries) {
    const data = await gql(
      admin,
      `#graphql
      query FindProducts($first: Int!, $query: String!) {
        products(first: $first, query: $query) {
          edges {
            node {
              id
              title
              handle
              vendor
              productType
              tags
              status
              descriptionHtml
              variants(first: 10) {
                edges {
                  node {
                    id
                    sku
                    price
                    barcode
                    compareAtPrice
                    inventoryItem {
                      id
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      {
        first: 5,
        query: item.query,
      },
    );

    const nodes: ExistingProduct[] = data.products.edges.map((e: any) => ({
      id: e.node.id,
      title: e.node.title,
      handle: e.node.handle,
      vendor: e.node.vendor,
      productType: e.node.productType,
      tags: e.node.tags ?? [],
      status: e.node.status,
      descriptionHtml: e.node.descriptionHtml,
      variants: (e.node.variants?.edges ?? []).map((ve: any) => ({
        id: ve.node.id,
        sku: ve.node.sku,
        price: ve.node.price,
        barcode: ve.node.barcode,
        compareAtPrice: ve.node.compareAtPrice,
        inventoryItemId: ve.node.inventoryItem?.id ?? null,
      })),
    }));

    if (!nodes.length) continue;

    if (item.type === "sku" && row.sku) {
      const hit = nodes.find((p) =>
        p.variants.some((v) => normalizeNullable(v.sku) === normalizeNullable(row.sku)),
      );
      if (hit) return { matchType: "sku", product: hit };
    }

    if (item.type === "handle" && row.handle) {
      const hit = nodes.find(
        (p) => normalizeNullable(p.handle) === normalizeNullable(row.handle),
      );
      if (hit) return { matchType: "handle", product: hit };
    }

    if (item.type === "title" && row.title) {
      const hit = nodes.find(
        (p) => normalizeNullable(p.title) === normalizeNullable(row.title),
      );
      if (hit) return { matchType: "title", product: hit };
    }
  }

  return null;
}

function collectChanges(row: ImportedProductRow, existing?: ExistingProduct) {
  const changes: ProductPreviewRow["changes"] = {};
  if (!existing) return changes;

  const variant = existing.variants[0];

  const compare = (field: string, before: unknown, after: unknown) => {
    const b = normalizeNullable(before);
    const a = normalizeNullable(after);
    if (b !== a) {
      changes[field] = { before: b, after: a };
    }
  };

  compare("title", existing.title, row.title);
  compare("handle", existing.handle, row.handle);
  compare("vendor", existing.vendor, row.vendor);
  compare("productType", existing.productType, row.productType);
  compare("status", existing.status, row.status ?? "DRAFT");
  compare("bodyHtml", existing.descriptionHtml, row.bodyHtml);

  compare("sku", variant?.sku, row.sku);
  compare("price", variant?.price, row.price);
  compare("compareAtPrice", variant?.compareAtPrice, row.compareAtPrice);
  compare("barcode", variant?.barcode, row.barcode);

  compare("option1", "", row.option1);
  compare("option2", "", row.option2);
  compare("option3", "", row.option3);

  compare("tracked", "", row.tracked);
  compare("inventoryPolicy", "", row.inventoryPolicy);
  compare("requiresShipping", "", row.requiresShipping);
  compare("taxable", "", row.taxable);
  compare("taxCode", "", row.taxCode);
  compare("cost", "", row.cost);
  compare("harmonizedSystemCode", "", row.harmonizedSystemCode);
  compare("countryCodeOfOrigin", "", row.countryCodeOfOrigin);
  compare("provinceCodeOfOrigin", "", row.provinceCodeOfOrigin);

  compare("weight", "", row.weight);
  compare("weightUnit", "", row.weightUnit);

  compare("stock", "", row.stock);
  compare("stockOnHand", "", row.stockOnHand);
  compare("locationName", "", row.locationName);
  compare("locationId", "", row.locationId);

  compare("imageSrc", "", row.imageSrc);

  const beforeTags = tagsToString(existing.tags);
  const afterTags = tagsToString(row.tags);
  if (beforeTags !== afterTags) {
    changes.tags = { before: beforeTags, after: afterTags };
  }

  return changes;
}

function buildPreviewRow(
  row: ImportedProductRow,
  existingMatch: Awaited<ReturnType<typeof findExistingProduct>>,
): ProductPreviewRow {
  if (!existingMatch) {
    return {
      key: `${row.sku || row.handle || row.title}-new`,
      matchType: "new",
      action: "create",
      title: row.title,
      handle: row.handle,
      vendor: row.vendor,
      productType: row.productType,
      tags: row.tags,
      status: row.status ?? "DRAFT",
      bodyHtml: row.bodyHtml,
      sku: row.sku,
      price: row.price,
      compareAtPrice: row.compareAtPrice,
      barcode: row.barcode,
      option1: row.option1,
      option2: row.option2,
      option3: row.option3,
      tracked: row.tracked,
      inventoryPolicy: row.inventoryPolicy,
      requiresShipping: row.requiresShipping,
      taxable: row.taxable,
      taxCode: row.taxCode,
      cost: row.cost,
      harmonizedSystemCode: row.harmonizedSystemCode,
      countryCodeOfOrigin: row.countryCodeOfOrigin,
      provinceCodeOfOrigin: row.provinceCodeOfOrigin,
      weight: row.weight,
      weightUnit: row.weightUnit,
      stock: row.stock,
      stockOnHand: row.stockOnHand,
      locationName: row.locationName,
      locationId: row.locationId,
      imageSrc: row.imageSrc,
      changes: {},
    };
  }

  const changes = collectChanges(row, existingMatch.product);

  return {
    key: `${existingMatch.product.id}-${row.sku || row.handle || row.title}`,
    matchType: existingMatch.matchType,
    action: Object.keys(changes).length ? "update" : "unchanged",
    productId: existingMatch.product.id,
    title: row.title,
    handle: row.handle,
    vendor: row.vendor,
    productType: row.productType,
    tags: row.tags,
    status: row.status ?? "DRAFT",
    bodyHtml: row.bodyHtml,
    sku: row.sku,
    price: row.price,
    compareAtPrice: row.compareAtPrice,
    barcode: row.barcode,
    option1: row.option1,
    option2: row.option2,
    option3: row.option3,
    tracked: row.tracked,
    inventoryPolicy: row.inventoryPolicy,
    requiresShipping: row.requiresShipping,
    taxable: row.taxable,
    taxCode: row.taxCode,
    cost: row.cost,
    harmonizedSystemCode: row.harmonizedSystemCode,
    countryCodeOfOrigin: row.countryCodeOfOrigin,
    provinceCodeOfOrigin: row.provinceCodeOfOrigin,
    weight: row.weight,
    weightUnit: row.weightUnit,
    stock: row.stock,
    stockOnHand: row.stockOnHand,
    locationName: row.locationName,
    locationId: row.locationId,
    imageSrc: row.imageSrc,
    changes,
  };
}

async function createProduct(admin: any, row: ImportedProductRow) {
  const data = await gql(
    admin,
    `#graphql
    mutation ProductCreate($product: ProductCreateInput!) {
      productCreate(product: $product) {
        product {
          id
          title
          handle
          vendor
          productType
          tags
          status
          descriptionHtml
          variants(first: 10) {
            edges {
              node {
                id
                sku
                price
                barcode
                compareAtPrice
                inventoryItem {
                  id
                }
              }
            }
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      product: buildProductCreateInput(row),
    },
  );

  const payload = data.productCreate;
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
  }

  return payload.product;
}

function buildProductUpdatePatch(row: ImportedProductRow, existing: ExistingProduct) {
  const patch: Record<string, any> = { id: existing.id };

  if (normalizeText(row.title) && normalizeText(row.title) !== normalizeText(existing.title)) {
    patch.title = row.title;
  }

  if (
    normalizeNullable(row.handle) &&
    normalizeNullable(row.handle) !== normalizeNullable(existing.handle)
  ) {
    patch.handle = row.handle;
  }

  if (normalizeNullable(row.vendor) !== normalizeNullable(existing.vendor)) {
    patch.vendor = row.vendor || "";
  }

  if (normalizeNullable(row.productType) !== normalizeNullable(existing.productType)) {
    patch.productType = row.productType || "";
  }

  if (!sameTags(row.tags, existing.tags)) {
    patch.tags = row.tags ?? [];
  }

  if ((row.status ?? "DRAFT") !== existing.status) {
    patch.status = row.status ?? "DRAFT";
  }

  if (normalizeNullable(row.bodyHtml) !== normalizeNullable(existing.descriptionHtml)) {
    patch.descriptionHtml = row.bodyHtml || "";
  }

  if (row.seoTitle || row.seoDescription) {
    patch.seo = {
      title: row.seoTitle,
      description: row.seoDescription,
    };
  }

  if (row.templateSuffix) {
    patch.templateSuffix = row.templateSuffix;
  }

  if (row.giftCard !== undefined) {
    patch.giftCard = row.giftCard;
  }

  return patch;
}

function buildVariantUpdatePatch(
  row: ImportedProductRow,
  existingVariant?: ExistingVariant,
) {
  if (!existingVariant) return null;

  const patch: Record<string, any> = {
    id: existingVariant.id,
  };

  if (row.price && normalizeNullable(row.price) !== normalizeNullable(existingVariant.price)) {
    patch.price = row.price;
  }

  if (
    row.compareAtPrice &&
    normalizeNullable(row.compareAtPrice) !== normalizeNullable(existingVariant.compareAtPrice)
  ) {
    patch.compareAtPrice = row.compareAtPrice;
  }

  if (
    normalizeNullable(row.barcode) &&
    normalizeNullable(row.barcode) !== normalizeNullable(existingVariant.barcode)
  ) {
    patch.barcode = row.barcode;
  }

  const inventoryItem: Record<string, any> = {};

  if (
    normalizeNullable(row.sku) &&
    normalizeNullable(row.sku) !== normalizeNullable(existingVariant.sku)
  ) {
    inventoryItem.sku = row.sku;
  }

  if (row.requiresShipping !== undefined) {
    inventoryItem.requiresShipping = row.requiresShipping;
  }

  if (row.tracked !== undefined) {
    inventoryItem.tracked = row.tracked;
  }

  if (row.cost) {
    inventoryItem.cost = row.cost;
  }

  if (row.countryCodeOfOrigin) {
    inventoryItem.countryCodeOfOrigin = row.countryCodeOfOrigin;
  }

  if (row.provinceCodeOfOrigin) {
    inventoryItem.provinceCodeOfOrigin = row.provinceCodeOfOrigin;
  }

  if (row.harmonizedSystemCode) {
    inventoryItem.harmonizedSystemCode = row.harmonizedSystemCode;
  }

  if (row.weight !== undefined) {
    inventoryItem.measurement = {
      weight: {
        value: row.weight,
        unit: row.weightUnit ?? "KILOGRAMS",
      },
    };
  }

  if (Object.keys(inventoryItem).length) {
    patch.inventoryItem = inventoryItem;
  }

  if (row.taxable !== undefined) {
    patch.taxable = row.taxable;
  }

  if (row.inventoryPolicy) {
    patch.inventoryPolicy = row.inventoryPolicy;
  }

  return Object.keys(patch).length > 1 ? patch : null;
}

async function updateInventoryItemDetails(
  admin: any,
  inventoryItemId: string,
  row: ImportedProductRow,
) {
  const input: Record<string, any> = {};

  if (row.sku) input.sku = row.sku;
  if (row.tracked !== undefined) input.tracked = row.tracked;
  if (row.requiresShipping !== undefined) input.requiresShipping = row.requiresShipping;
  if (row.cost) input.cost = row.cost;
  if (row.countryCodeOfOrigin) input.countryCodeOfOrigin = row.countryCodeOfOrigin;
  if (row.provinceCodeOfOrigin) input.provinceCodeOfOrigin = row.provinceCodeOfOrigin;
  if (row.harmonizedSystemCode) input.harmonizedSystemCode = row.harmonizedSystemCode;

  if (Object.keys(input).length === 0) return;

  const data = await gql(
    admin,
    `#graphql
    mutation InventoryItemUpdate($id: ID!, $input: InventoryItemInput!) {
      inventoryItemUpdate(id: $id, input: $input) {
        inventoryItem {
          id
          sku
          tracked
          requiresShipping
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      id: inventoryItemId,
      input,
    },
  );

  const payload = data.inventoryItemUpdate;
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
  }
}

async function setInventoryQuantity(
  admin: any,
  inventoryItemId: string,
  locationId: string,
  row: ImportedProductRow,
) {
  const quantity = row.stockOnHand !== undefined ? row.stockOnHand : row.stock;
  if (quantity === undefined) return;

  const data = await gql(
    admin,
    `#graphql
    mutation InventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          reason
          changes {
            name
            delta
          }
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      input: {
        name: row.stockOnHand !== undefined ? "on_hand" : "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [
          {
            inventoryItemId,
            locationId,
            quantity,
          },
        ],
      },
    },
  );

  const payload = data.inventorySetQuantities;
  if (payload.userErrors?.length) {
    throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
  }
}

async function syncVariantInventory(
  admin: any,
  inventoryItemId: string | null | undefined,
  row: ImportedProductRow,
) {
  if (!inventoryItemId) return;

  await updateInventoryItemDetails(admin, inventoryItemId, row);

  const locationId = row.locationId || (await getPrimaryLocationId(admin));
  if (locationId) {
    await setInventoryQuantity(admin, inventoryItemId, locationId, row);
  }
}

async function updateProductIfNeeded(admin: any, row: ImportedProductRow, existing: ExistingProduct) {
  const productPatch = buildProductUpdatePatch(row, existing);

  if (Object.keys(productPatch).length > 1) {
    const data = await gql(
      admin,
      `#graphql
      mutation ProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product {
            id
            title
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        product: productPatch,
      },
    );

    const payload = data.productUpdate;
    if (payload.userErrors?.length) {
      throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
    }
  }

  const variant = existing.variants[0];
  const variantPatch = buildVariantUpdatePatch(row, variant);

  if (variantPatch) {
    const data = await gql(
      admin,
      `#graphql
      mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
            price
            barcode
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        productId: existing.id,
        variants: [variantPatch],
      },
    );

    const payload = data.productVariantsBulkUpdate;
    if (payload.userErrors?.length) {
      throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
    }
  }

  await syncVariantInventory(admin, variant?.inventoryItemId, row);

  return {
    changed:
      Object.keys(productPatch).length > 1 ||
      Boolean(variantPatch) ||
      row.stock !== undefined ||
      row.stockOnHand !== undefined ||
      row.cost !== undefined ||
      row.tracked !== undefined ||
      row.requiresShipping !== undefined,
  };
}

async function updateNewlyCreatedDefaultVariant(admin: any, product: any, row: ImportedProductRow) {
  const variantNode = product?.variants?.edges?.[0]?.node;
  const variantId = variantNode?.id;
  if (!variantId) return;

  const patch: Record<string, any> = { id: variantId };

  if (row.price) patch.price = row.price;
  if (row.compareAtPrice) patch.compareAtPrice = row.compareAtPrice;
  if (row.barcode) patch.barcode = row.barcode;
  if (row.taxable !== undefined) patch.taxable = row.taxable;
  if (row.inventoryPolicy) patch.inventoryPolicy = row.inventoryPolicy;

  const inventoryItem: Record<string, any> = {};
  if (row.sku) inventoryItem.sku = row.sku;
  if (row.requiresShipping !== undefined) inventoryItem.requiresShipping = row.requiresShipping;
  if (row.tracked !== undefined) inventoryItem.tracked = row.tracked;
  if (row.cost) inventoryItem.cost = row.cost;
  if (row.countryCodeOfOrigin) inventoryItem.countryCodeOfOrigin = row.countryCodeOfOrigin;
  if (row.provinceCodeOfOrigin) inventoryItem.provinceCodeOfOrigin = row.provinceCodeOfOrigin;
  if (row.harmonizedSystemCode) inventoryItem.harmonizedSystemCode = row.harmonizedSystemCode;

  if (row.weight !== undefined) {
    inventoryItem.measurement = {
      weight: {
        value: row.weight,
        unit: row.weightUnit ?? "KILOGRAMS",
      },
    };
  }

  if (Object.keys(inventoryItem).length) {
    patch.inventoryItem = inventoryItem;
  }

  if (Object.keys(patch).length > 1) {
    const data = await gql(
      admin,
      `#graphql
      mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
        productVariantsBulkUpdate(productId: $productId, variants: $variants) {
          productVariants {
            id
          }
          userErrors {
            field
            message
          }
        }
      }`,
      {
        productId: product.id,
        variants: [patch],
      },
    );

    const payload = data.productVariantsBulkUpdate;
    if (payload.userErrors?.length) {
      throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
    }
  }

  await syncVariantInventory(admin, variantNode?.inventoryItem?.id, row);
}

export async function previewImportedProducts(admin: any, rows: ImportedProductRow[]) {
  const previewRows: ProductPreviewRow[] = [];

  let createCount = 0;
  let updateCount = 0;
  let unchangedCount = 0;

  for (const row of rows) {
    const existing = await findExistingProduct(admin, row);
    const preview = buildPreviewRow(row, existing);
    previewRows.push(preview);

    if (preview.action === "create") createCount += 1;
    if (preview.action === "update") updateCount += 1;
    if (preview.action === "unchanged") unchangedCount += 1;
  }

  return {
    rows: previewRows,
    summary: {
      create: createCount,
      update: updateCount,
      unchanged: unchangedCount,
    },
  };
}

export async function executeImportedProducts(admin: any, rows: ImportedProductRow[]) {
  let created = 0;
  let updated = 0;
  let unchanged = 0;

  const results: Array<{
    title: string;
    action: "created" | "updated" | "unchanged";
    sku?: string;
  }> = [];

  for (const row of rows) {
    const existingMatch = await findExistingProduct(admin, row);

    if (!existingMatch) {
      const createdProduct = await createProduct(admin, row);
      await updateNewlyCreatedDefaultVariant(admin, createdProduct, row);

      created += 1;
      results.push({
        title: row.title,
        action: "created",
        sku: row.sku,
      });
      continue;
    }

    const outcome = await updateProductIfNeeded(admin, row, existingMatch.product);

    if (outcome.changed) {
      updated += 1;
      results.push({
        title: row.title,
        action: "updated",
        sku: row.sku,
      });
    } else {
      unchanged += 1;
      results.push({
        title: row.title,
        action: "unchanged",
        sku: row.sku,
      });
    }
  }

  return {
    message: `Import finished. Created ${created}, updated ${updated}, unchanged ${unchanged}.`,
    bulk: false,
    summary: {
      created,
      updated,
      unchanged,
    },
    results,
  };
}