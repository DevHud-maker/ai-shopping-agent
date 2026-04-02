import { isSupported } from "./capabilities";

export type DashboardPlan = {
  resource: "products" | "orders" | "customers" | "collections";
  operation:
    | "list"
    | "count"
    | "delete"
    | "archive"
    | "tag_add"
    | "tag_remove"
    | "add_products"
    | "remove_products";
  filters?: {
    text?: string;
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
    collectionTitle?: string;
  };
  params?: {
    tag?: string;
    tags?: string[];
    collectionId?: string;
    productIds?: string[];
  };
  limit?: number;
  requiresConfirmation?: boolean;
};

const schema = {
  type: "object",
  properties: {
    resource: { type: "string", enum: ["products", "orders", "customers", "collections"] },
    operation: {
      type: "string",
      enum: ["list", "count", "delete", "archive", "tag_add", "tag_remove", "add_products", "remove_products"],
    },
    filters: {
      type: "object",
      properties: {
        text: { type: "string" },
        titlePrefix: { type: "string" },
        tag: {
          oneOf: [
            { type: "string" },
            { type: "array", items: { type: "string" } },
          ],
        },
        status: { type: "string" },
        vendor: { type: "string" },
        productType: { type: "string" },
        dateRange: { type: "string", enum: ["today", "yesterday", "last_7_days", "this_month"] },
        minTotalUsd: { type: "number" },
        maxTotalUsd: { type: "number" },
        financialStatus: { type: "string" },
        fulfillmentStatus: { type: "string" },
        customerEmail: { type: "string" },
        collectionTitle: { type: "string" },
      },
      additionalProperties: false,
    },
    params: {
      type: "object",
      properties: {
        tag: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
        collectionId: { type: "string" },
        productIds: { type: "array", items: { type: "string" } },
      },
      additionalProperties: false,
    },
    limit: { type: "number" },
    requiresConfirmation: { type: "boolean" },
  },
  required: ["resource", "operation"],
  additionalProperties: false,
};

export async function buildDashboardPlan(query: string) {
  const body = {
    contents: [
      {
        parts: [
          {
            text:
              `Convert the merchant request into JSON only.\n` +
              `Use only supported resource/operation pairs.\n` +
              `Delete/archive/remove_products require requiresConfirmation=true.\n` +
              `If ambiguous, choose the safest non-destructive interpretation.\n` +
              `Merchant request: ${query}`,
          },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: "application/json",
      responseSchema: schema,
      temperature: 0,
    },
  };

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    },
  );

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";

  let parsed: DashboardPlan;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false as const, message: "Planner returned invalid JSON." };
  }

  if (!parsed?.resource || !parsed?.operation || !isSupported(parsed.resource, parsed.operation)) {
    return { ok: false as const, message: "Unsupported dashboard operation." };
  }

  return { ok: true as const, data: parsed };
}