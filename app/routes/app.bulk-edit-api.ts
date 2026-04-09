import { data, type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

type EntityType = "products" | "variants" | "customers";

type ListBody = {
  mode: "list";
  entity: EntityType;
  search?: string;
};

type ApplyBody = {
  mode: "apply";
  entity: EntityType;
  ids: string[];
  changes: Record<string, any>;
};

type CsvApplyBody = {
  mode: "csv-apply";
  entity: EntityType;
  rows: Array<Record<string, any>>;
};

type Body = ListBody | ApplyBody | CsvApplyBody;

const MAX_PAGES = 20;
const PAGE_SIZE = 100;

async function gql(admin: any, query: string, variables?: Record<string, any>) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  return json.data;
}

function toBool(value: unknown) {
  if (typeof value === "boolean") return value;
  const s = String(value ?? "").trim().toLowerCase();
  return s === "true" || s === "1" || s === "yes";
}

function toNumberOrNull(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function splitTags(value: unknown) {
  return String(value ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);
}

function normalizeIds(ids: unknown): string[] {
  return Array.isArray(ids)
    ? ids.map((x) => String(x ?? "").trim()).filter(Boolean)
    : [];
}

async function getAllProducts(admin: any, search: string) {
  const rows: any[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let page = 0;

  while (hasNextPage && page < MAX_PAGES) {
    const result = await gql(
      admin,
      `#graphql
      query BulkEditProducts($first: Int!, $after: String, $query: String!) {
        products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT, reverse: true) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              handle
              status
              vendor
              productType
              tags
              totalInventory
              updatedAt
              featuredImage {
                url
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    sku
                    price
                    compareAtPrice
                    barcode
                    taxable
                    inventoryPolicy
                    inventoryItem {
                      id
                      tracked
                      requiresShipping
                      inventoryLevels(first: 10) {
                        edges {
                          node {
                            location {
                              id
                              name
                            }
                            quantities(names: ["available", "on_hand"]) {
                              name
                              quantity
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      {
        first: PAGE_SIZE,
        after: cursor,
        query: search || "",
      },
    );

    const conn = result.products;
    for (const edge of conn.edges) {
      const p = edge.node;
      const firstVariant = p.variants?.edges?.[0]?.node;
      const levels = firstVariant?.inventoryItem?.inventoryLevels?.edges || [];

      let available = 0;
      let onHand = 0;
      let locationId = "";
      let locationName = "";

      for (const lvl of levels) {
        if (!locationId && lvl.node?.location?.id) locationId = lvl.node.location.id;
        if (!locationName && lvl.node?.location?.name) locationName = lvl.node.location.name;

        for (const q of lvl.node?.quantities || []) {
          if (q?.name === "available") available += Number(q.quantity || 0);
          if (q?.name === "on_hand") onHand += Number(q.quantity || 0);
        }
      }

      rows.push({
        id: p.id,
        title: p.title,
        handle: p.handle,
        status: p.status,
        vendor: p.vendor || "",
        productType: p.productType || "",
        tags: Array.isArray(p.tags) ? p.tags : [],
        totalInventory: p.totalInventory ?? 0,
        updatedAt: p.updatedAt,
        image: p.featuredImage?.url || "",
        firstVariantId: firstVariant?.id || "",
        inventoryItemId: firstVariant?.inventoryItem?.id || "",
        locationId,
        locationName,
        sku: firstVariant?.sku || "",
        price: firstVariant?.price || "",
        compareAtPrice: firstVariant?.compareAtPrice || "",
        barcode: firstVariant?.barcode || "",
        taxable: Boolean(firstVariant?.taxable),
        inventoryPolicy: firstVariant?.inventoryPolicy || "",
        tracked: Boolean(firstVariant?.inventoryItem?.tracked),
        requiresShipping: Boolean(firstVariant?.inventoryItem?.requiresShipping),
        available,
        onHand,
      });
    }

    hasNextPage = Boolean(conn.pageInfo?.hasNextPage);
    cursor = conn.pageInfo?.endCursor || null;
    page += 1;
  }

  return rows;
}

async function getAllVariants(admin: any, search: string) {
  const rows: any[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let page = 0;

  while (hasNextPage && page < MAX_PAGES) {
    const result = await gql(
      admin,
      `#graphql
      query BulkEditVariants($first: Int!, $after: String, $query: String!) {
        productVariants(first: $first, after: $after, query: $query) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              title
              sku
              price
              compareAtPrice
              barcode
              taxable
              inventoryPolicy
              product {
                id
                title
                handle
                status
                featuredImage {
                  url
                }
              }
              inventoryItem {
                id
                tracked
                requiresShipping
                inventoryLevels(first: 20) {
                  edges {
                    node {
                      location {
                        id
                        name
                      }
                      quantities(names: ["available", "on_hand"]) {
                        name
                        quantity
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }`,
      {
        first: PAGE_SIZE,
        after: cursor,
        query: search || "",
      },
    );

    const conn = result.productVariants;
    for (const edge of conn.edges) {
      const v = edge.node;
      const levels = v.inventoryItem?.inventoryLevels?.edges || [];

      let available = 0;
      let onHand = 0;
      const locations: string[] = [];
      let firstLocationId = "";
      let firstLocationName = "";

      for (const lvl of levels) {
        const loc = lvl.node?.location;
        if (loc?.name) locations.push(loc.name);
        if (!firstLocationId && loc?.id) firstLocationId = loc.id;
        if (!firstLocationName && loc?.name) firstLocationName = loc.name;

        for (const q of lvl.node?.quantities || []) {
          if (q?.name === "available") available += Number(q.quantity || 0);
          if (q?.name === "on_hand") onHand += Number(q.quantity || 0);
        }
      }

      rows.push({
        id: v.id,
        title: v.title,
        sku: v.sku || "",
        price: v.price || "",
        compareAtPrice: v.compareAtPrice || "",
        barcode: v.barcode || "",
        taxable: Boolean(v.taxable),
        inventoryPolicy: v.inventoryPolicy || "",
        tracked: Boolean(v.inventoryItem?.tracked),
        requiresShipping: Boolean(v.inventoryItem?.requiresShipping),
        productId: v.product?.id || "",
        productTitle: v.product?.title || "",
        productHandle: v.product?.handle || "",
        productStatus: v.product?.status || "",
        image: v.product?.featuredImage?.url || "",
        inventoryItemId: v.inventoryItem?.id || "",
        locationId: firstLocationId,
        locationName: firstLocationName,
        available,
        onHand,
        locations: locations.join(", "),
      });
    }

    hasNextPage = Boolean(conn.pageInfo?.hasNextPage);
    cursor = conn.pageInfo?.endCursor || null;
    page += 1;
  }

  return rows;
}

async function getAllCustomers(admin: any, search: string) {
  const rows: any[] = [];
  let cursor: string | null = null;
  let hasNextPage = true;
  let page = 0;

  while (hasNextPage && page < MAX_PAGES) {
    const result = await gql(
      admin,
      `#graphql
      query BulkEditCustomers($first: Int!, $after: String, $query: String!) {
        customers(first: $first, after: $after, query: $query, reverse: true) {
          pageInfo {
            hasNextPage
            endCursor
          }
          edges {
            node {
              id
              firstName
              lastName
              email
              phone
              state
              tags
              numberOfOrders
              createdAt
            }
          }
        }
      }`,
      {
        first: PAGE_SIZE,
        after: cursor,
        query: search || "",
      },
    );

    const conn = result.customers;
    for (const edge of conn.edges) {
      const c = edge.node;
      rows.push({
        id: c.id,
        title: [c.firstName, c.lastName].filter(Boolean).join(" ") || "Unnamed customer",
        firstName: c.firstName || "",
        lastName: c.lastName || "",
        email: c.email || "",
        phone: c.phone || "",
        state: c.state || "",
        tags: Array.isArray(c.tags) ? c.tags : [],
        numberOfOrders: c.numberOfOrders ?? 0,
        createdAt: c.createdAt,
      });
    }

    hasNextPage = Boolean(conn.pageInfo?.hasNextPage);
    cursor = conn.pageInfo?.endCursor || null;
    page += 1;
  }

  return rows;
}

async function tagsAdd(admin: any, id: string, tags: string[]) {
  if (!tags.length) return;

  const result = await gql(
    admin,
    `#graphql
    mutation TagsAdd($id: ID!, $tags: [String!]!) {
      tagsAdd(id: $id, tags: $tags) {
        node { id }
        userErrors { field message }
      }
    }`,
    { id, tags },
  );

  if (result.tagsAdd.userErrors?.length) {
    throw new Error(result.tagsAdd.userErrors.map((e: any) => e.message).join("; "));
  }
}

async function tagsRemove(admin: any, id: string, tags: string[]) {
  if (!tags.length) return;

  const result = await gql(
    admin,
    `#graphql
    mutation TagsRemove($id: ID!, $tags: [String!]!) {
      tagsRemove(id: $id, tags: $tags) {
        node { id }
        userErrors { field message }
      }
    }`,
    { id, tags },
  );

  if (result.tagsRemove.userErrors?.length) {
    throw new Error(result.tagsRemove.userErrors.map((e: any) => e.message).join("; "));
  }
}

async function getProductVariantTargets(admin: any, ids: string[]) {
  const result = await gql(
    admin,
    `#graphql
    query ProductTargets($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on Product {
          id
          tags
          variants(first: 1) {
            edges {
              node {
                id
                inventoryItem {
                  id
                  inventoryLevels(first: 10) {
                    edges {
                      node {
                        location {
                          id
                          name
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { ids },
  );

  return (result.nodes || []).filter(Boolean);
}

async function updateVariantFieldsForProduct(
  admin: any,
  productId: string,
  variantId: string,
  changes: Record<string, any>,
) {
  const variantInput: Record<string, any> = { id: variantId };
  let hasVariantFields = false;

  if ("price" in changes) {
    variantInput.price = String(changes.price ?? "");
    hasVariantFields = true;
  }

  if ("compareAtPrice" in changes) {
    variantInput.compareAtPrice =
      changes.compareAtPrice === "" || changes.compareAtPrice == null
        ? null
        : String(changes.compareAtPrice);
    hasVariantFields = true;
  }

  if ("sku" in changes) {
    variantInput.sku = String(changes.sku ?? "");
    hasVariantFields = true;
  }

  if ("barcode" in changes) {
    variantInput.barcode = String(changes.barcode ?? "");
    hasVariantFields = true;
  }

  if ("taxable" in changes) {
    variantInput.taxable = toBool(changes.taxable);
    hasVariantFields = true;
  }

  if ("inventoryPolicy" in changes) {
    variantInput.inventoryPolicy = String(changes.inventoryPolicy ?? "");
    hasVariantFields = true;
  }

  if (!hasVariantFields) return;

  const result = await gql(
    admin,
    `#graphql
    mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
      productVariantsBulkUpdate(productId: $productId, variants: $variants) {
        product { id }
        productVariants { id }
        userErrors { field message }
      }
    }`,
    {
      productId,
      variants: [variantInput],
    },
  );

  if (result.productVariantsBulkUpdate.userErrors?.length) {
    throw new Error(
      result.productVariantsBulkUpdate.userErrors.map((e: any) => e.message).join("; "),
    );
  }
}

async function updateInventoryItemMeta(
  admin: any,
  inventoryItemId: string,
  changes: Record<string, any>,
) {
  const input: Record<string, any> = { id: inventoryItemId };
  let hasMeta = false;

  if ("tracked" in changes) {
    input.tracked = toBool(changes.tracked);
    hasMeta = true;
  }

  if ("requiresShipping" in changes) {
    input.requiresShipping = toBool(changes.requiresShipping);
    hasMeta = true;
  }

  if (!hasMeta) return;

  const result = await gql(
    admin,
    `#graphql
    mutation InventoryItemUpdate($input: InventoryItemInput!) {
      inventoryItemUpdate(input: $input) {
        inventoryItem { id }
        userErrors { field message }
      }
    }`,
    { input },
  );

  if (result.inventoryItemUpdate.userErrors?.length) {
    throw new Error(result.inventoryItemUpdate.userErrors.map((e: any) => e.message).join("; "));
  }
}

async function updateInventoryAvailable(
  admin: any,
  inventoryItemId: string,
  locationId: string,
  quantityValue: unknown,
) {
  const qty = toNumberOrNull(quantityValue);
  if (qty == null || !locationId) return;

  const result = await gql(
    admin,
    `#graphql
    mutation InventorySetQuantities($input: InventorySetQuantitiesInput!) {
      inventorySetQuantities(input: $input) {
        inventoryAdjustmentGroup {
          createdAt
        }
        userErrors {
          field
          message
        }
      }
    }`,
    {
      input: {
        name: "available",
        reason: "correction",
        ignoreCompareQuantity: true,
        quantities: [
          {
            inventoryItemId,
            locationId,
            quantity: qty,
          },
        ],
      },
    },
  );

  if (result.inventorySetQuantities.userErrors?.length) {
    throw new Error(result.inventorySetQuantities.userErrors.map((e: any) => e.message).join("; "));
  }
}

async function updateProduct(admin: any, id: string, changes: Record<string, any>) {
  const productInput: Record<string, any> = { id };
  let hasProductFields = false;

  if ("title" in changes) {
    productInput.title = String(changes.title ?? "");
    hasProductFields = true;
  }

  if ("vendor" in changes) {
    productInput.vendor = String(changes.vendor ?? "");
    hasProductFields = true;
  }

  if ("productType" in changes) {
    productInput.productType = String(changes.productType ?? "");
    hasProductFields = true;
  }

  if ("status" in changes) {
    productInput.status = String(changes.status ?? "").toUpperCase();
    hasProductFields = true;
  }

  if ("tags" in changes) {
    productInput.tags = splitTags(changes.tags);
    hasProductFields = true;
  }

  if (hasProductFields) {
    const result = await gql(
      admin,
      `#graphql
      mutation ProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id }
          userErrors { field message }
        }
      }`,
      { product: productInput },
    );

    if (result.productUpdate.userErrors?.length) {
      throw new Error(result.productUpdate.userErrors.map((e: any) => e.message).join("; "));
    }
  }

  if ("addTags" in changes) {
    await tagsAdd(admin, id, splitTags(changes.addTags));
  }

  if ("removeTags" in changes) {
    await tagsRemove(admin, id, splitTags(changes.removeTags));
  }

  const nodes = await getProductVariantTargets(admin, [id]);
  const node = nodes[0];
  const firstVariant = node?.variants?.edges?.[0]?.node;
  const inventoryItemId = firstVariant?.inventoryItem?.id || "";
  const locationId =
    changes.locationId ||
    firstVariant?.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.location?.id ||
    "";

  if (firstVariant?.id) {
    await updateVariantFieldsForProduct(admin, id, firstVariant.id, changes);
  }

  if (inventoryItemId) {
    await updateInventoryItemMeta(admin, inventoryItemId, changes);

    if ("available" in changes || "totalInventory" in changes) {
      await updateInventoryAvailable(
        admin,
        inventoryItemId,
        String(locationId || ""),
        "available" in changes ? changes.available : changes.totalInventory,
      );
    }
  }
}

async function getVariantParents(admin: any, ids: string[]) {
  const result = await gql(
    admin,
    `#graphql
    query VariantParents($ids: [ID!]!) {
      nodes(ids: $ids) {
        ... on ProductVariant {
          id
          product { id }
          inventoryItem {
            id
            inventoryLevels(first: 10) {
              edges {
                node {
                  location {
                    id
                  }
                }
              }
            }
          }
        }
      }
    }`,
    { ids },
  );

  return (result.nodes || []).filter(Boolean);
}

async function updateVariantBulk(admin: any, ids: string[], changes: Record<string, any>) {
  const nodes = await getVariantParents(admin, ids);

  for (const node of nodes) {
    if (!node?.product?.id || !node?.id) continue;

    const variantInput: Record<string, any> = { id: node.id };
    let hasVariantFields = false;

    if ("price" in changes) {
      variantInput.price = String(changes.price ?? "");
      hasVariantFields = true;
    }

    if ("compareAtPrice" in changes) {
      variantInput.compareAtPrice =
        changes.compareAtPrice === "" || changes.compareAtPrice == null
          ? null
          : String(changes.compareAtPrice);
      hasVariantFields = true;
    }

    if ("sku" in changes) {
      variantInput.sku = String(changes.sku ?? "");
      hasVariantFields = true;
    }

    if ("barcode" in changes) {
      variantInput.barcode = String(changes.barcode ?? "");
      hasVariantFields = true;
    }

    if ("taxable" in changes) {
      variantInput.taxable = toBool(changes.taxable);
      hasVariantFields = true;
    }

    if ("inventoryPolicy" in changes) {
      variantInput.inventoryPolicy = String(changes.inventoryPolicy ?? "");
      hasVariantFields = true;
    }

    if (hasVariantFields) {
      const result = await gql(
        admin,
        `#graphql
        mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
          productVariantsBulkUpdate(productId: $productId, variants: $variants) {
            product { id }
            productVariants { id }
            userErrors { field message }
          }
        }`,
        {
          productId: node.product.id,
          variants: [variantInput],
        },
      );

      if (result.productVariantsBulkUpdate.userErrors?.length) {
        throw new Error(
          result.productVariantsBulkUpdate.userErrors.map((e: any) => e.message).join("; "),
        );
      }
    }

    if (node.inventoryItem?.id) {
      await updateInventoryItemMeta(admin, node.inventoryItem.id, changes);

      if ("available" in changes || "totalInventory" in changes) {
        const locationId =
          changes.locationId ||
          node.inventoryItem?.inventoryLevels?.edges?.[0]?.node?.location?.id ||
          "";

        await updateInventoryAvailable(
          admin,
          node.inventoryItem.id,
          String(locationId || ""),
          "available" in changes ? changes.available : changes.totalInventory,
        );
      }
    }
  }
}

async function updateCustomer(admin: any, id: string, changes: Record<string, any>) {
  if ("addTags" in changes) {
    await tagsAdd(admin, id, splitTags(changes.addTags));
  }

  if ("removeTags" in changes) {
    await tagsRemove(admin, id, splitTags(changes.removeTags));
  }

  if ("tags" in changes) {
    const tags = splitTags(changes.tags);

    const result = await gql(
      admin,
      `#graphql
      mutation CustomerUpdate($input: CustomerInput!) {
        customerUpdate(input: $input) {
          customer { id }
          userErrors { field message }
        }
      }`,
      {
        input: {
          id,
          tags,
        },
      },
    );

    if (result.customerUpdate.userErrors?.length) {
      throw new Error(result.customerUpdate.userErrors.map((e: any) => e.message).join("; "));
    }
  }
}

async function applyEntityChanges(
  admin: any,
  entity: EntityType,
  ids: string[],
  changes: Record<string, any>,
) {
  if (entity === "products") {
    for (const id of ids) {
      await updateProduct(admin, id, changes);
    }
    return;
  }

  if (entity === "variants") {
    await updateVariantBulk(admin, ids, changes);
    return;
  }

  for (const id of ids) {
    await updateCustomer(admin, id, changes);
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const body = (await request.json()) as Body;

  try {
    if (body.mode === "list") {
      const search = body.search || "";

      const rows =
        body.entity === "products"
          ? await getAllProducts(admin, search)
          : body.entity === "variants"
            ? await getAllVariants(admin, search)
            : await getAllCustomers(admin, search);

      return data({
        ok: true,
        rows,
        count: rows.length,
      });
    }

    if (body.mode === "apply") {
      const ids = normalizeIds(body.ids);
      if (!ids.length) {
        return data({ ok: false, message: "No rows selected." }, { status: 400 });
      }

      await applyEntityChanges(admin, body.entity, ids, body.changes || {});
      return data({
        ok: true,
        message: `Updated ${ids.length} ${body.entity}.`,
      });
    }

    if (body.mode === "csv-apply") {
      const rows = Array.isArray(body.rows) ? body.rows : [];
      if (!rows.length) {
        return data({ ok: false, message: "CSV rows are empty." }, { status: 400 });
      }

      let count = 0;
      for (const row of rows) {
        const id = String(row.id || "").trim();
        if (!id) continue;

        const changes = { ...row };
        delete changes.id;
        delete changes.entity;

        await applyEntityChanges(admin, body.entity, [id], changes);
        count += 1;
      }

      return data({
        ok: true,
        message: `CSV applied to ${count} ${body.entity}.`,
      });
    }

    return data({ ok: false, message: "Unsupported mode." }, { status: 400 });
  } catch (error) {
    return data(
      {
        ok: false,
        message: error instanceof Error ? error.message : "Bulk edit failed.",
      },
      { status: 400 },
    );
  }
}