import { GoogleGenAI } from "@google/genai";
import { authenticate } from "../shopify.server";

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function getProductText(product) {
  return normalize(`
    ${product.title}
    ${product.handle}
    ${product.description}
    ${(product.tags || []).join(" ")}
    ${product.productType || ""}
    ${product.vendor || ""}
  `);
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function matchesText(product, value) {
  if (!value) return true;
  return getProductText(product).includes(normalize(value));
}

function matchesPrice(product, maxPrice) {
  if (maxPrice === null || maxPrice === undefined) return true;
  return toNumber(product.price) <= Number(maxPrice);
}

function basicScore(product, filters) {
  let score = 0;
  const text = getProductText(product);

  if (filters.activity && text.includes(normalize(filters.activity))) score += 5;
  if (filters.productType && text.includes(normalize(filters.productType))) score += 5;
  if (filters.color && text.includes(normalize(filters.color))) score += 4;
  if (filters.recipient && text.includes(normalize(filters.recipient))) score += 1;
  if (filters.gender && text.includes(normalize(filters.gender))) score += 1;
  if (filters.intent === "gift") score += 1;

  if (
    filters.maxPrice !== null &&
    filters.maxPrice !== undefined &&
    toNumber(product.price) <= Number(filters.maxPrice)
  ) {
    score += 3;
  }

  const inventory = toNumber(product.totalInventory);
  if (inventory > 0) score += 2;
  if (inventory > 5) score += 1;

  return score;
}

function cleanFilters(filters) {
  return {
    intent: filters?.intent || null,
    activity: filters?.activity || null,
    color: filters?.color || null,
    maxPrice:
      filters?.maxPrice === null || filters?.maxPrice === undefined
        ? null
        : Number(filters.maxPrice),
    recipient: filters?.recipient || null,
    productType: filters?.productType || null,
    gender: filters?.gender || null,
    stage: filters?.stage || "browse",
    objection: filters?.objection || null,
  };
}

function mergeFilterObjects(previousFilters, newFilters) {
  const prev = cleanFilters(previousFilters || {});
  const next = cleanFilters(newFilters || {});

  return {
    intent: next.intent || prev.intent || null,
    activity: next.activity || prev.activity || null,
    color: next.color || prev.color || null,
    maxPrice:
      next.maxPrice !== null && next.maxPrice !== undefined
        ? next.maxPrice
        : prev.maxPrice !== null && prev.maxPrice !== undefined
          ? prev.maxPrice
          : null,
    recipient: next.recipient || prev.recipient || null,
    productType: next.productType || prev.productType || null,
    gender: next.gender || prev.gender || null,
    stage: next.stage || prev.stage || "browse",
    objection: next.objection || prev.objection || null,
  };
}

function extractPreviousFiltersFromMessages(messages) {
  let previous = {
    intent: null,
    activity: null,
    color: null,
    maxPrice: null,
    recipient: null,
    productType: null,
    gender: null,
    stage: "browse",
    objection: null,
  };

  for (const message of messages) {
    if (message.role === "assistant" && message.filters) {
      previous = mergeFilterObjects(previous, message.filters);
    }
  }

  return previous;
}

function fallbackReply(filters) {
  if (filters.color && filters.maxPrice !== null) {
    return "I couldn’t find a strong in-stock match with that color and budget. Try a different color or a slightly higher budget.";
  }

  if (filters.productType) {
    return "I couldn’t find a strong in-stock match for that product type. Try broadening the request a bit.";
  }

  return "I couldn’t find a strong match in this store yet. Try adding details like product type, color, activity, or budget.";
}

function buildSimpleReply(products, filters) {
  if (!products.length) return fallbackReply(filters);

  if (products.length === 1) {
    return `I found 1 solid option for you: ${products[0].title}.`;
  }

  return `I found ${products.length} strong options for you. The first picks are the closest matches based on your request.`;
}

export const action = async ({ request }) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing in environment variables." },
        { status: 500 },
      );
    }

    const { admin, session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
      return Response.json(
        { error: "Could not identify shop from app proxy request." },
        { status: 400 },
      );
    }

    const body = await request.json().catch(() => ({}));
    const query = String(body?.query || "").trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];

    if (!query) {
      return Response.json(
        { error: "Query is required." },
        { status: 400 },
      );
    }

    const previousFilters = extractPreviousFiltersFromMessages(messages);

    const recentConversation = messages
      .slice(-10)
      .map((message) => ({
        role: message.role || "user",
        text: message.text || "",
      }))
      .filter((message) => message.text);

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const shopifyResponse = await admin.graphql(`
      #graphql
      query GetProducts {
        products(first: 80) {
          edges {
            node {
              id
              title
              handle
              description
              tags
              totalInventory
              productType
              vendor
              images(first: 1) {
                edges {
                  node {
                    url
                  }
                }
              }
              variants(first: 1) {
                edges {
                  node {
                    id
                    price
                    compareAtPrice
                  }
                }
              }
            }
          }
        }
      }
    `);

    const shopifyJson = await shopifyResponse.json();

    if (!shopifyJson?.data?.products?.edges) {
      return Response.json(
        {
          error: "Shopify products query failed.",
          details: JSON.stringify(shopifyJson),
        },
        { status: 500 },
      );
    }

    const products = shopifyJson.data.products.edges.map((edge) => {
      const p = edge.node;
      const variant = p.variants?.edges?.[0]?.node || null;
      const rawVariantId = variant?.id || "";
      const numericVariantId = rawVariantId.split("/").pop();

      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        description: p.description || "",
        tags: Array.isArray(p.tags) ? p.tags : [],
        totalInventory: p.totalInventory ?? 0,
        productType: p.productType || "",
        vendor: p.vendor || "",
        image: p.images?.edges?.[0]?.node?.url || "",
        price: variant?.price || "",
        compareAtPrice: variant?.compareAtPrice || "",
        variantId: numericVariantId || "",
      };
    });

    const intentResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an ecommerce shopping assistant.

Your job is to understand the shopper request and update filters using the latest message plus prior context.

Previous known filters:
${JSON.stringify(previousFilters, null, 2)}

Recent conversation:
${JSON.stringify(recentConversation, null, 2)}

Latest user request:
"${query}"

Return only JSON in this exact shape:
{
  "filters": {
    "intent": string or null,
    "activity": string or null,
    "color": string or null,
    "maxPrice": number or null,
    "recipient": string or null,
    "productType": string or null,
    "gender": string or null,
    "stage": string or null,
    "objection": string or null
  },
  "needsMoreInfo": boolean,
  "followUpQuestion": string or null
}

Rules:
- Preserve previous known filters unless the shopper clearly changes them
- Do NOT erase an earlier valid filter just because the latest message does not mention it
- Only set a field to null if the shopper clearly says they no longer care about it
- "intent" can be values like "gift", "shopping", or null
- "activity" means category/sport like ski, snowboard, hiking, running
- "color" is requested color
- "maxPrice" is maximum budget number only
- "recipient" can be values like dad, mom, boyfriend, friend, child
- "productType" can be values like gloves, goggles, poles, jacket, helmet, snowboard
- "gender" can be male, female, unisex, or null
- "stage" can be browse, choose, hesitate, cart, buy
- "objection" can be price, shipping, returns, quality, size, or null
- If enough information exists to show useful results, set needsMoreInfo to false
- If the request is still too vague, ask one short follow-up question
- Return JSON only
`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            filters: {
              type: "object",
              properties: {
                intent: { type: "string", nullable: true },
                activity: { type: "string", nullable: true },
                color: { type: "string", nullable: true },
                maxPrice: { type: "number", nullable: true },
                recipient: { type: "string", nullable: true },
                productType: { type: "string", nullable: true },
                gender: { type: "string", nullable: true },
                stage: { type: "string", nullable: true },
                objection: { type: "string", nullable: true },
              },
              required: [
                "intent",
                "activity",
                "color",
                "maxPrice",
                "recipient",
                "productType",
                "gender",
                "stage",
                "objection",
              ],
            },
            needsMoreInfo: { type: "boolean" },
            followUpQuestion: { type: "string", nullable: true },
          },
          required: ["filters", "needsMoreInfo", "followUpQuestion"],
        },
      },
    });

    const parsedIntent = JSON.parse(intentResult.text);
    const filters = mergeFilterObjects(previousFilters, parsedIntent.filters);

    if (parsedIntent.needsMoreInfo) {
      return Response.json({
        filters,
        products: [],
        reply:
          parsedIntent.followUpQuestion ||
          "What matters most to you here: budget, product type, or color?",
        needsMoreInfo: true,
        cta: null,
        salesMeta: {
          stage: filters.stage,
          objection: filters.objection,
        },
      });
    }

    const candidates = products
      .filter((product) => matchesText(product, filters.activity))
      .filter((product) => matchesText(product, filters.color))
      .filter((product) => matchesText(product, filters.productType))
      .filter((product) => matchesPrice(product, filters.maxPrice))
      .filter((product) => toNumber(product.totalInventory) > 0)
      .map((product) => ({
        ...product,
        score: basicScore(product, filters),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (candidates.length === 0) {
      return Response.json({
        filters,
        products: [],
        reply: fallbackReply(filters),
        needsMoreInfo: false,
        cta: null,
        salesMeta: {
          stage: filters.stage,
          objection: filters.objection,
        },
      });
    }

    const rerankResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an ecommerce shopping assistant.

Shopper filters:
${JSON.stringify(filters, null, 2)}

Candidate products:
${JSON.stringify(candidates, null, 2)}

Return only JSON in this exact shape:
{
  "topProductIds": [string],
  "reply": string,
  "cta": string or null
}

Rules:
- Pick up to 4 best products
- Prefer products that best match budget, activity, color, recipient, and product type
- Write a short natural-language reply
- If intent is gift, sound like a helpful gift recommender
- If the shopper shows price hesitation, highlight value
- CTA should be short
- Return JSON only
`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            topProductIds: {
              type: "array",
              items: { type: "string" },
            },
            reply: { type: "string" },
            cta: { type: "string", nullable: true },
          },
          required: ["topProductIds", "reply", "cta"],
        },
      },
    });

    const reranked = JSON.parse(rerankResult.text);
    const topIds = Array.isArray(reranked.topProductIds)
      ? reranked.topProductIds
      : [];

    let finalProducts = candidates.filter((product) => topIds.includes(product.id));

    if (finalProducts.length === 0) {
      finalProducts = candidates.slice(0, 4);
    }

    return Response.json({
      filters,
      products: finalProducts,
      reply: reranked.reply || buildSimpleReply(finalProducts, filters),
      needsMoreInfo: false,
      cta: reranked.cta || "Add your favorite to cart",
      salesMeta: {
        stage: filters.stage,
        objection: filters.objection,
      },
    });
  } catch (error) {
    console.error("Proxy recommend error:", error);

    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unknown server error",
        details: String(error),
      },
      { status: 500 },
    );
  }
};