type DashboardPlan = {
  resource: "products" | "orders" | "customers" | "gift_cards";
  operation:
    | "list"
    | "count"
    | "detail"
    | "delete"
    | "archive"
    | "tag_add"
    | "tag_remove";
  filters?: {
    text?: string;
    titleContains?: string;
    titlePrefix?: string;
    tag?: string | string[];
    status?: string;
    vendor?: string;
    productType?: string;
    dateRange?: "today" | "yesterday" | "last_7_days" | "this_month";
    minTotalUsd?: number;
    maxTotalUsd?: number;
    financialStatus?: string;
    fulfillmentStatus?: string;
    customerEmail?: string;
    customerName?: string;
    giftCardStatus?: string;
  };
  params?: {
    tag?: string;
    tags?: string[];
  };
  limit?: number;
  requiresConfirmation?: boolean;
};

function escapeValue(v: string) {
  return v.replace(/"/g, '\\"');
}

function toArray(value?: string | string[]) {
  if (!value) return [];
  return Array.isArray(value) ? value : [value];
}

function numericIdFromGid(gid: string) {
  return gid.split("/").pop() || gid;
}

function shopDomainToAdminStoreHandle(shop: string) {
  return shop.replace(".myshopify.com", "");
}

function buildProductAdminEditUrl(shop: string, productGid: string) {
  const id = numericIdFromGid(productGid);
  const storeHandle = shopDomainToAdminStoreHandle(shop);
  return `https://admin.shopify.com/store/${storeHandle}/products/${id}`;
}

function buildProductSearch(filters: DashboardPlan["filters"] = {}) {
  const parts: string[] = [];

  if (filters.text) parts.push(filters.text);
  if (filters.titleContains) parts.push(`title:${escapeValue(filters.titleContains)}`);
  if (filters.titlePrefix) parts.push(`title:${escapeValue(filters.titlePrefix)}*`);
  if (filters.vendor) parts.push(`vendor:${escapeValue(filters.vendor)}`);
  if (filters.productType) parts.push(`product_type:${escapeValue(filters.productType)}`);
  if (filters.status) parts.push(`status:${filters.status.toLowerCase()}`);

  for (const tag of toArray(filters.tag)) {
    parts.push(`tag:${escapeValue(tag)}`);
  }

  return parts.join(" AND ");
}

function buildOrderSearch(filters: DashboardPlan["filters"] = {}) {
  const parts: string[] = [];

  if (filters.text) parts.push(filters.text);
  if (filters.dateRange === "today") parts.push("created_at:>=today");
  if (filters.dateRange === "yesterday") parts.push("created_at:yesterday");
  if (filters.dateRange === "last_7_days") parts.push("created_at:>=-7d");
  if (filters.dateRange === "this_month") parts.push("created_at:>=start_of_month");

  if (typeof filters.minTotalUsd === "number") {
    parts.push(`current_total_price:>=${filters.minTotalUsd}`);
  }
  if (typeof filters.maxTotalUsd === "number") {
    parts.push(`current_total_price:<=${filters.maxTotalUsd}`);
  }

  if (filters.financialStatus) {
    parts.push(`financial_status:${filters.financialStatus.toLowerCase()}`);
  }
  if (filters.fulfillmentStatus) {
    parts.push(`fulfillment_status:${filters.fulfillmentStatus.toLowerCase()}`);
  }
  if (filters.customerEmail) {
    parts.push(`email:${escapeValue(filters.customerEmail)}`);
  }

  for (const tag of toArray(filters.tag)) {
    parts.push(`tag:${escapeValue(tag)}`);
  }

  return parts.join(" AND ");
}

function buildCustomerSearch(filters: DashboardPlan["filters"] = {}) {
  const parts: string[] = [];

  if (filters.text) parts.push(filters.text);
  if (filters.customerEmail) parts.push(`email:${escapeValue(filters.customerEmail)}`);
  if (filters.customerName) parts.push(filters.customerName);

  for (const tag of toArray(filters.tag)) {
    parts.push(`tag:${escapeValue(tag)}`);
  }

  return parts.join(" AND ");
}

function buildGiftCardSearch(filters: DashboardPlan["filters"] = {}) {
  const parts: string[] = [];

  if (filters.text) parts.push(filters.text);
  if (filters.giftCardStatus) {
    parts.push(`status:${filters.giftCardStatus.toLowerCase()}`);
  }

  return parts.join(" AND ");
}

async function gql(admin: any, query: string, variables?: Record<string, any>) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  return json.data;
}

async function previewProducts(admin: any, shop: string, plan: DashboardPlan) {
  const queryString = buildProductSearch(plan.filters);

  const data = await gql(
    admin,
    `#graphql
    query ProductsPreview($first: Int!, $query: String!) {
      products(first: $first, query: $query, sortKey: TITLE) {
        edges {
          node {
            id
            title
            status
            vendor
            productType
            tags
          }
        }
      }
    }`,
    { first: Math.min(plan.limit ?? 20, 100), query: queryString },
  );

  const rows = data.products.edges.map((e: any) => ({
    id: e.node.id,
    title: e.node.title,
    status: e.node.status,
    vendor: e.node.vendor,
    productType: e.node.productType,
    tags: e.node.tags.join(", "),
    adminEditUrl: buildProductAdminEditUrl(shop, e.node.id),
  }));

  return { rows, count: rows.length };
}

async function previewOrders(admin: any, plan: DashboardPlan) {
  const queryString = buildOrderSearch(plan.filters);

  const data = await gql(
    admin,
    `#graphql
    query OrdersPreview($first: Int!, $query: String!) {
      orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            displayFinancialStatus
            displayFulfillmentStatus
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
          }
        }
      }
    }`,
    { first: Math.min(plan.limit ?? 20, 100), query: queryString },
  );

  const rows = data.orders.edges.map((e: any) => ({
    id: e.node.id,
    order: e.node.name,
    total: `${e.node.currentTotalPriceSet.shopMoney.amount} ${e.node.currentTotalPriceSet.shopMoney.currencyCode}`,
    financialStatus: e.node.displayFinancialStatus,
    fulfillmentStatus: e.node.displayFulfillmentStatus,
    createdAt: e.node.createdAt,
  }));

  return { rows, count: rows.length };
}

async function previewCustomers(admin: any, plan: DashboardPlan) {
  const queryString = buildCustomerSearch(plan.filters);

  const data = await gql(
    admin,
    `#graphql
    query CustomersPreview($first: Int!, $query: String!) {
      customers(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            displayName
            email
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            tags
          }
        }
      }
    }`,
    { first: Math.min(plan.limit ?? 20, 100), query: queryString },
  );

  const rows = data.customers.edges.map((e: any) => ({
    id: e.node.id,
    name: e.node.displayName,
    email: e.node.email || "",
    orders: e.node.numberOfOrders,
    spent: `${e.node.amountSpent.amount} ${e.node.amountSpent.currencyCode}`,
    tags: e.node.tags.join(", "),
  }));

  return { rows, count: rows.length };
}

async function customerDetail(admin: any, plan: DashboardPlan) {
  const queryString = buildCustomerSearch(plan.filters);

  const customerData = await gql(
    admin,
    `#graphql
    query CustomerDetail($first: Int!, $query: String!) {
      customers(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            displayName
            email
            phone
            numberOfOrders
            amountSpent {
              amount
              currencyCode
            }
            tags
            createdAt
          }
        }
      }
    }`,
    { first: 1, query: queryString },
  );

  const customer = customerData.customers.edges?.[0]?.node;
  if (!customer) {
    return { rows: [], count: 0 };
  }

  const rows: Array<Record<string, any>> = [
    {
      type: "customer",
      id: customer.id,
      name: customer.displayName,
      email: customer.email || "",
      phone: customer.phone || "",
      orders: customer.numberOfOrders,
      spent: `${customer.amountSpent.amount} ${customer.amountSpent.currencyCode}`,
      tags: customer.tags.join(", "),
      createdAt: customer.createdAt,
    },
  ];

  if (customer.email) {
    try {
      const orderData = await gql(
        admin,
        `#graphql
        query CustomerOrders($first: Int!, $query: String!) {
          orders(first: $first, query: $query, sortKey: CREATED_AT, reverse: true) {
            edges {
              node {
                id
                name
                createdAt
                displayFinancialStatus
                displayFulfillmentStatus
                currentTotalPriceSet {
                  shopMoney {
                    amount
                    currencyCode
                  }
                }
              }
            }
          }
        }`,
        {
          first: 10,
          query: `email:${escapeValue(customer.email)}`,
        },
      );

      for (const edge of orderData.orders.edges) {
        rows.push({
          type: "order",
          id: edge.node.id,
          order: edge.node.name,
          total: `${edge.node.currentTotalPriceSet.shopMoney.amount} ${edge.node.currentTotalPriceSet.shopMoney.currencyCode}`,
          financialStatus: edge.node.displayFinancialStatus,
          fulfillmentStatus: edge.node.displayFulfillmentStatus,
          createdAt: edge.node.createdAt,
        });
      }
    } catch (error) {
      rows.push({
        type: "note",
        note:
          error instanceof Error
            ? `Customer found, but order history is unavailable: ${error.message}`
            : "Customer found, but order history is unavailable.",
      });
    }
  }

  return { rows, count: rows.length };
}

async function previewGiftCards(admin: any, plan: DashboardPlan) {
  const queryString = buildGiftCardSearch(plan.filters);

  const data = await gql(
    admin,
    `#graphql
    query GiftCardsPreview($first: Int!, $query: String!) {
      giftCards(first: $first, query: $query, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            lastCharacters
            enabled
            createdAt
            expiresOn
            balance {
              amount
              currencyCode
            }
            customer {
              displayName
            }
          }
        }
      }
    }`,
    { first: Math.min(plan.limit ?? 20, 100), query: queryString },
  );

  const rows = data.giftCards.edges.map((e: any) => ({
    id: e.node.id,
    lastCharacters: e.node.lastCharacters,
    enabled: e.node.enabled ? "Yes" : "No",
    balance: `${e.node.balance.amount} ${e.node.balance.currencyCode}`,
    customer: e.node.customer?.displayName || "",
    createdAt: e.node.createdAt,
    expiresOn: e.node.expiresOn || "",
  }));

  return { rows, count: rows.length };
}

async function mutateTags(
  admin: any,
  mutationName: "tagsAdd" | "tagsRemove",
  ids: string[],
  tags: string[],
) {
  const mutation =
    mutationName === "tagsAdd"
      ? `#graphql
         mutation TagsAdd($id: ID!, $tags: [String!]!) {
           tagsAdd(id: $id, tags: $tags) {
             node { id }
             userErrors { field message }
           }
         }`
      : `#graphql
         mutation TagsRemove($id: ID!, $tags: [String!]!) {
           tagsRemove(id: $id, tags: $tags) {
             node { id }
             userErrors { field message }
           }
         }`;

  for (const id of ids) {
    const data = await gql(admin, mutation, { id, tags });
    const payload = data[mutationName];
    if (payload.userErrors?.length) {
      throw new Error(payload.userErrors.map((e: any) => e.message).join("; "));
    }
  }
}

async function archiveProducts(admin: any, ids: string[]) {
  for (const id of ids) {
    const data = await gql(
      admin,
      `#graphql
      mutation ProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id status }
          userErrors { field message }
        }
      }`,
      { product: { id, status: "ARCHIVED" } },
    );

    if (data.productUpdate.userErrors?.length) {
      throw new Error(
        data.productUpdate.userErrors.map((e: any) => e.message).join("; "),
      );
    }
  }
}

async function deleteProducts(admin: any, ids: string[]) {
  for (const id of ids) {
    const data = await gql(
      admin,
      `#graphql
      mutation ProductDelete($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }`,
      { input: { id } },
    );

    if (data.productDelete.userErrors?.length) {
      throw new Error(
        data.productDelete.userErrors.map((e: any) => e.message).join("; "),
      );
    }
  }
}

export async function previewDashboardPlan(
  admin: any,
  plan: DashboardPlan,
  opts?: { shop?: string },
) {
  const shop = opts?.shop ?? "";

  switch (plan.resource) {
    case "products":
      return {
        message: "Preview generated.",
        ...(await previewProducts(admin, shop, plan)),
      };

    case "orders":
      return {
        message: "Preview generated.",
        ...(await previewOrders(admin, plan)),
      };

    case "customers":
      if (plan.operation === "detail") {
        return {
          message: "Customer detail generated.",
          ...(await customerDetail(admin, plan)),
        };
      }
      return {
        message: "Preview generated.",
        ...(await previewCustomers(admin, plan)),
      };

    case "gift_cards":
      return {
        message: "Preview generated.",
        ...(await previewGiftCards(admin, plan)),
      };

    default:
      throw new Error("Unsupported resource.");
  }
}

export async function executeDashboardPlan(
  admin: any,
  plan: DashboardPlan,
  opts?: { confirmationToken?: string | null; shop?: string },
) {
  const preview = await previewDashboardPlan(admin, plan, { shop: opts?.shop });

  if (
    plan.operation === "list" ||
    plan.operation === "count" ||
    plan.operation === "detail"
  ) {
    return {
      mode: "executed",
      message:
        plan.operation === "count"
          ? `Count: ${preview.count ?? 0}`
          : preview.message,
      rows: preview.rows,
      count: preview.count,
    };
  }

  if (plan.resource === "products") {
    const ids = (preview.rows ?? []).map((row) => String(row.id));
    const tags = plan.params?.tags ?? (plan.params?.tag ? [plan.params.tag] : []);

    if (plan.operation === "archive") {
      await archiveProducts(admin, ids);
      return {
        mode: "executed",
        message: `Archived ${ids.length} product(s).`,
        rows: preview.rows,
        count: ids.length,
      };
    }

    if (plan.operation === "delete") {
      await deleteProducts(admin, ids);
      return {
        mode: "executed",
        message: `Deleted ${ids.length} product(s).`,
        rows: preview.rows,
        count: ids.length,
      };
    }

    if (plan.operation === "tag_add") {
      await mutateTags(admin, "tagsAdd", ids, tags);
      return {
        mode: "executed",
        message: `Added tag(s) to ${ids.length} product(s).`,
        rows: preview.rows,
        count: ids.length,
      };
    }

    if (plan.operation === "tag_remove") {
      await mutateTags(admin, "tagsRemove", ids, tags);
      return {
        mode: "executed",
        message: `Removed tag(s) from ${ids.length} product(s).`,
        rows: preview.rows,
        count: ids.length,
      };
    }
  }

  if (plan.resource === "customers") {
    const ids = (preview.rows ?? [])
      .filter((row) => row.type !== "order" && row.type !== "note")
      .map((row) => String(row.id));

    const tags = plan.params?.tags ?? (plan.params?.tag ? [plan.params.tag] : []);

    if (plan.operation === "tag_add") {
      await mutateTags(admin, "tagsAdd", ids, tags);
      return {
        mode: "executed",
        message: `Added tag(s) to ${ids.length} customer(s).`,
        rows: preview.rows,
        count: ids.length,
      };
    }

    if (plan.operation === "tag_remove") {
      await mutateTags(admin, "tagsRemove", ids, tags);
      return {
        mode: "executed",
        message: `Removed tag(s) from ${ids.length} customer(s).`,
        rows: preview.rows,
        count: ids.length,
      };
    }
  }

  throw new Error("Unsupported execution path.");
}