import { GoogleGenAI } from "@google/genai";
import { authenticate } from "../shopify.server";

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function productText(product) {
  return normalize(`
    ${product.title}
    ${product.handle}
    ${product.description}
    ${(product.tags || []).join(" ")}
    ${product.productType || ""}
    ${product.vendor || ""}
  `);
}

function money(value) {
  const n = Number(value || 0);
  return Number.isFinite(n) ? n : 0;
}

function matchesField(product, value) {
  if (!value) return true;
  return productText(product).includes(normalize(value));
}

function matchesBudget(product, maxPrice) {
  if (maxPrice === null || maxPrice === undefined) return true;
  return money(product.price) <= Number(maxPrice);
}

function scoreProduct(product, filters) {
  let score = 0;
  const text = productText(product);

  if (filters.activity && text.includes(normalize(filters.activity))) score += 5;
  if (filters.productType && text.includes(normalize(filters.productType))) score += 5;
  if (filters.color && text.includes(normalize(filters.color))) score += 3;
  if (filters.gender && text.includes(normalize(filters.gender))) score += 1;
  if (filters.recipient && text.includes(normalize(filters.recipient))) score += 1;
  if (filters.intent === "gift") score += 1;

  if (
    filters.maxPrice !== null &&
    filters.maxPrice !== undefined &&
    money(product.price) <= Number(filters.maxPrice)
  ) {
    score += 3;
  }

  if (Number(product.totalInventory || 0) > 0) score += 2;
  if (Number(product.totalInventory || 0) > 10) score += 1;

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

function mergeFilters(previousFilters, newFilters) {
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

function extractPreviousFilters(messages) {
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
      previous = mergeFilters(previous, message.filters);
    }
  }

  return previous;
}

function pickFallbackProducts(products) {
  return [...products]
    .filter((p) => Number(p.totalInventory || 0) > 0)
    .sort((a, b) => money(a.price) - money(b.price))
    .slice(0, 4);
}

export const action = async ({ request }) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing in .env" },
        { status: 500 },
      );
    }

    const { admin, session } = await authenticate.public.appProxy(request);

    if (!session?.shop) {
      return Response.json(
        { error: "Could not identify shop from app proxy request" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const query = String(body?.query || "").trim();
    const messages = Array.isArray(body?.messages) ? body.messages : [];
    const cartItems = Array.isArray(body?.cartItems) ? body.cartItems : [];

    if (!query) {
      return Response.json(
        { error: "Query is required." },
        { status: 400 },
      );
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const previousFilters = extractPreviousFilters(messages);

    const recentConversation = messages
      .slice(-10)
      .map((m) => ({
        role: m.role || "user",
        text: m.text || "",
      }))
      .filter((m) => m.text);

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
          error: "Shopify products query failed",
          details: JSON.stringify(shopifyJson),
        },
        { status: 500 },
      );
    }

    const products = shopifyJson.data.products.edges.map(({ node: p }) => {
      const rawVariantId = p.variants?.edges?.[0]?.node?.id || "";
      const numericVariantId = rawVariantId.split("/").pop();
      const variant = p.variants?.edges?.[0]?.node || null;

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
You are a high-converting ecommerce sales assistant.

Your job:
1) understand the shopper
2) detect whether they are browsing, choosing, hesitating, or objecting
3) update filters using previous context
4) ask at most one short follow-up only if needed

Previous filters:
${JSON.stringify(previousFilters, null, 2)}

Recent conversation:
${JSON.stringify(recentConversation, null, 2)}

Cart items:
${JSON.stringify(cartItems, null, 2)}

Latest shopper message:
"${query}"

Return JSON only in this exact shape:
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
- preserve useful earlier filters unless shopper changes them
- "stage" must be one of: "browse", "choose", "hesitate", "cart", "buy"
- "objection" can be: "price", "size", "shipping", "returns", "quality", or null
- if enough info exists to recommend products, set needsMoreInfo to false
- ask one short sales-oriented follow-up only when needed
- return JSON only
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
    const filters = mergeFilters(previousFilters, parsedIntent.filters);

    if (parsedIntent.needsMoreInfo) {
      return Response.json({
        filters,
        products: [],
        reply:
          parsedIntent.followUpQuestion ||
          "What matters most here: budget, warmth, or a specific product type?",
        needsMoreInfo: true,
        salesMeta: {
          mode: "qualify",
        },
      });
    }

    const candidates = products
      .filter((product) => matchesField(product, filters.activity))
      .filter((product) => matchesField(product, filters.color))
      .filter((product) => matchesField(product, filters.productType))
      .filter((product) => matchesBudget(product, filters.maxPrice))
      .map((product) => ({
        ...product,
        score: scoreProduct(product, filters),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    const recommendationPool = candidates.length ? candidates : pickFallbackProducts(products);

    const salesResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are a top-performing ecommerce sales chatbot.

Shopper filters:
${JSON.stringify(filters, null, 2)}

Cart items:
${JSON.stringify(cartItems, null, 2)}

Candidate products:
${JSON.stringify(recommendationPool, null, 2)}

Return JSON only in this exact shape:
{
  "topProductIds": [string],
  "reply": string,
  "cta": string or null
}

Rules:
- choose up to 4 products
- reply should be concise, persuasive, and helpful
- do not sound pushy
- if shopper has price objection, mention best-value options
- if shopper seems ready, encourage add-to-cart
- if products are broad, present a simple best / better / premium framing
- CTA should be short, e.g. "Add one to cart", "Compare these", "See budget picks"
- return JSON only
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

    const parsedSales = JSON.parse(salesResult.text);
    const topIds = Array.isArray(parsedSales.topProductIds)
      ? parsedSales.topProductIds
      : [];

    let finalProducts = recommendationPool.filter((p) => topIds.includes(p.id));
    if (!finalProducts.length) {
      finalProducts = recommendationPool.slice(0, 4);
    }

    return Response.json({
      filters,
      products: finalProducts,
      reply: parsedSales.reply || "I found a few strong options for you.",
      cta: parsedSales.cta || null,
      needsMoreInfo: false,
      salesMeta: {
        mode: "recommend",
        objection: filters.objection,
        stage: filters.stage,
      },
    });
  } catch (error) {
    console.error("Proxy recommend error:", error);

    return Response.json(
      {
        error: error?.message || "Unknown server error",
        details: String(error),
      },
      { status: 500 },
    );
  }
};