import { GoogleGenAI } from "@google/genai";
import { authenticate } from "../shopify.server";

function normalize(text) {
  return String(text || "").toLowerCase().trim();
}

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
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

function matchesText(product, value) {
  if (!value) return true;
  return getProductText(product).includes(normalize(value));
}

function matchesPrice(product, maxPrice) {
  if (maxPrice === null || maxPrice === undefined) return true;
  return toNumber(product.price) <= Number(maxPrice);
}

function scoreProduct(product, filters) {
  let score = 0;
  const text = getProductText(product);
  const inventory = toNumber(product.totalInventory);
  const price = toNumber(product.price);
  const compareAtPrice = toNumber(product.compareAtPrice);

  if (filters.activity && text.includes(normalize(filters.activity))) score += 5;
  if (filters.productType && text.includes(normalize(filters.productType))) score += 5;
  if (filters.color && text.includes(normalize(filters.color))) score += 3;
  if (filters.gender && text.includes(normalize(filters.gender))) score += 1;
  if (filters.recipient && text.includes(normalize(filters.recipient))) score += 1;
  if (filters.intent === "gift") score += 1;

  if (filters.maxPrice !== null && filters.maxPrice !== undefined && price <= Number(filters.maxPrice)) {
    score += 3;
  }

  if (inventory > 0) score += 2;
  if (inventory > 5) score += 1;
  if (compareAtPrice > price && price > 0) score += 1;

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

function buildFollowUp(filters) {
  if (filters.activity && !filters.productType) {
    return `Are you looking for ${filters.activity} gloves, goggles, a jacket, a helmet, or something else?`;
  }

  if (filters.productType && filters.maxPrice === null) {
    return `Do you want the best value option, or do you have a budget in mind?`;
  }

  return "What matters most here: budget, product type, or color?";
}

function buildNoMatchReply(filters) {
  if (filters.maxPrice !== null && filters.productType) {
    return `I couldn’t find a strong in-stock ${filters.productType} match in that budget. I can show you the closest cheaper alternatives or broaden the search.`;
  }

  if (filters.activity && !filters.productType) {
    return `I couldn’t find a strong in-stock match just from "${filters.activity}". Tell me the product type and I’ll narrow it down fast.`;
  }

  return "I couldn’t find a strong in-stock match yet. Try adding a product type, budget, or color.";
}

function classifyBundle(product, allProducts) {
  const currentType = normalize(product.productType);
  const titleText = getProductText(product);

  const desiredTypes = [];

  if (titleText.includes("ski") || titleText.includes("snow")) {
    if (!currentType.includes("gog")) desiredTypes.push("goggles");
    if (!currentType.includes("helmet")) desiredTypes.push("helmet");
    if (!currentType.includes("glove")) desiredTypes.push("gloves");
  }

  const matches = allProducts
    .filter((p) => toNumber(p.totalInventory) > 0)
    .filter((p) => p.id !== product.id)
    .filter((p) => desiredTypes.some((type) => getProductText(p).includes(type)))
    .slice(0, 2);

  return matches;
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
        products(first: 100) {
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
You are a high-converting ecommerce sales assistant.

Update shopping filters from the latest shopper message plus prior context.

Previous known filters:
${JSON.stringify(previousFilters, null, 2)}

Recent conversation:
${JSON.stringify(recentConversation, null, 2)}

Latest shopper request:
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
- Preserve earlier valid filters unless shopper clearly changes them
- "intent" can be gift, shopping, or null
- "activity" can be ski, snowboard, hiking, running, etc.
- "productType" can be gloves, goggles, jacket, helmet, poles, snowboard, etc.
- "stage" can be browse, choose, hesitate, cart, buy
- "objection" can be price, shipping, returns, quality, size, or null
- If enough info exists to show useful results, set needsMoreInfo to false
- If broad, ask one short useful question
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

    const candidates = products
      .filter((product) => matchesText(product, filters.activity))
      .filter((product) => matchesText(product, filters.color))
      .filter((product) => matchesText(product, filters.productType))
      .filter((product) => matchesPrice(product, filters.maxPrice))
      .filter((product) => toNumber(product.totalInventory) > 0)
      .map((product) => ({
        ...product,
        score: scoreProduct(product, filters),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (!candidates.length) {
      return Response.json({
        filters,
        products: [],
        reply: buildNoMatchReply(filters),
        needsMoreInfo: false,
        cta: "Try a broader search",
        salesMeta: {
          stage: filters.stage,
          objection: filters.objection,
        },
      });
    }

    const best = candidates[0];
    const better = candidates[1] || null;
    const premium = candidates[2] || null;
    const bundleSuggestions = classifyBundle(best, products);

    const recommendationResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are a high-converting ecommerce sales chatbot.

Shopper query:
"${query}"

Shopper filters:
${JSON.stringify(filters, null, 2)}

Top candidates:
${JSON.stringify(candidates.slice(0, 6), null, 2)}

Bundle suggestions:
${JSON.stringify(bundleSuggestions, null, 2)}

Return only JSON in this exact shape:
{
  "topProductIds": [string],
  "reply": string,
  "cta": string or null
}

Rules:
- Pick up to 4 products
- Sound helpful, specific, and sales-oriented, but not pushy
- If broad, present picks as good / better / premium when possible
- If price objection exists, highlight best value
- If gift intent exists, sound like a gift recommender
- Mention a next step in the reply when useful
- CTA should be short and action-oriented
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

    const parsedRecommendation = JSON.parse(recommendationResult.text);
    const topIds = Array.isArray(parsedRecommendation.topProductIds)
      ? parsedRecommendation.topProductIds
      : [];

    let finalProducts = candidates.filter((product) => topIds.includes(product.id));
    if (!finalProducts.length) {
      finalProducts = candidates.slice(0, 4);
    }

    let reply = parsedRecommendation.reply;
    if (!reply) {
      const names = finalProducts.slice(0, 3).map((p) => p.title).join(", ");
      reply = `I found some strong matches for you: ${names}. I can narrow them further by budget, color, or product type.`;
    }

    let cta = parsedRecommendation.cta || null;
    if (!cta) {
      if (filters.stage === "hesitate" || filters.objection === "price") {
        cta = "See best-value picks";
      } else if (parsedIntent.needsMoreInfo) {
        cta = buildFollowUp(filters);
      } else {
        cta = "Add your favorite to cart";
      }
    }

    const responseProducts = [...finalProducts];

    for (const extra of bundleSuggestions) {
      if (responseProducts.length >= 4) break;
      if (!responseProducts.find((p) => p.id === extra.id)) {
        responseProducts.push({
          ...extra,
          isUpsell: true,
        });
      }
    }

    return Response.json({
      filters,
      products: responseProducts.slice(0, 4),
      reply,
      needsMoreInfo: false,
      cta,
      salesMeta: {
        stage: filters.stage,
        objection: filters.objection,
        goodBetterBest: {
          good: best?.id || null,
          better: better?.id || null,
          premium: premium?.id || null,
        },
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