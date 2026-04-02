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

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function tryParseJson(text: string): unknown {
  const trimmed = text.trim();

  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) return null;

    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function isAllowedResource(value: unknown): value is DashboardPlan["resource"] {
  return (
    value === "products" ||
    value === "orders" ||
    value === "customers" ||
    value === "gift_cards"
  );
}

function isAllowedOperation(value: unknown): value is DashboardPlan["operation"] {
  return (
    value === "list" ||
    value === "count" ||
    value === "detail" ||
    value === "delete" ||
    value === "archive" ||
    value === "tag_add" ||
    value === "tag_remove"
  );
}

function validateDashboardPlan(input: unknown): input is DashboardPlan {
  if (!isObject(input)) return false;
  if (!isAllowedResource(input.resource)) return false;
  if (!isAllowedOperation(input.operation)) return false;

  if (input.filters !== undefined && !isObject(input.filters)) return false;
  if (input.params !== undefined && !isObject(input.params)) return false;

  if (input.limit !== undefined && typeof input.limit !== "number") return false;
  if (
    input.requiresConfirmation !== undefined &&
    typeof input.requiresConfirmation !== "boolean"
  ) {
    return false;
  }

  return true;
}

const DASHBOARD_SYSTEM_PROMPT = `
You convert merchant requests into STRICT JSON.

Return JSON only.
Do not wrap in markdown.
Do not return code.
Do not return GraphQL.

Allowed resources:
- products
- orders
- customers
- gift_cards

Allowed operations:
- list
- count
- detail
- delete
- archive
- tag_add
- tag_remove

Allowed filters:
- text
- titleContains
- titlePrefix
- tag
- status
- vendor
- productType
- dateRange: today | yesterday | last_7_days | this_month
- minTotalUsd
- maxTotalUsd
- financialStatus
- fulfillmentStatus
- customerEmail
- customerName
- giftCardStatus

Allowed params:
- tag
- tags

Rules:
- delete, archive, tag_add, tag_remove must set requiresConfirmation=true
- "latest gift cards" => resource gift_cards, operation list
- "show all customers" => resource customers, operation list
- "show customer X" => resource customers, operation detail
- "what did customer X order" => resource customers, operation detail
- "latest orders today" => resource orders, operation list, dateRange today
- "summary of orders" => resource orders, operation list
- "products with name ski" => resource products, operation list, titleContains ski
- If ambiguous, choose the safest non-destructive interpretation
`;

export async function buildDashboardPlan(query: string) {
  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text: `${DASHBOARD_SYSTEM_PROMPT}\n\nMerchant request: ${query}`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0,
          },
        }),
      },
    );

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
    const parsed = tryParseJson(text);

    if (!validateDashboardPlan(parsed)) {
      return {
        ok: false as const,
        message: "AI returned an invalid dashboard plan.",
      };
    }

    return {
      ok: true as const,
      data: parsed,
    };
  } catch (error) {
    return {
      ok: false as const,
      message:
        error instanceof Error ? error.message : "Failed to build dashboard plan.",
    };
  }
}