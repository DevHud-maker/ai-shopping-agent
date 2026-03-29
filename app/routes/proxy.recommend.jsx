
import { GoogleGenAI } from "@google/genai";
import { authenticate } from "../shopify.server";

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function getProductText(product) {
  return normalize(`
    ${product.title}
    ${product.handle}
    ${product.description}
    ${(product.tags || []).join(" ")}
  `);
}

function matchesText(product, value) {
  if (!value) return true;
  return getProductText(product).includes(normalize(value));
}

function matchesPrice(product, maxPrice) {
  if (maxPrice === null || maxPrice === undefined) return true;
  const price = Number(product.price || 0);
  return !Number.isNaN(price) && price <= Number(maxPrice);
}

function basicScore(product, filters) {
  let score = 0;
  const text = getProductText(product);

  if (filters.activity && text.includes(normalize(filters.activity))) score += 4;
  if (filters.color && text.includes(normalize(filters.color))) score += 4;
  if (filters.productType && text.includes(normalize(filters.productType))) score += 5;
  if (filters.recipient && text.includes(normalize(filters.recipient))) score += 1;
  if (filters.intent === "gift") score += 1;

  if (
    filters.maxPrice !== null &&
    filters.maxPrice !== undefined &&
    Number(product.price || 0) <= Number(filters.maxPrice)
  ) {
    score += 3;
  }

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
  };

  for (const message of messages) {
    if (message.role === "assistant" && message.filters) {
      previous = mergeFilterObjects(previous, message.filters);
    }
  }

  return previous;
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

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const body = await request.json();
    const query = body.query || "";
    const messages = Array.isArray(body.messages) ? body.messages : [];

    const recentConversation = messages
      .slice(-10)
      .map((message) => ({
        role: message.role || "user",
        text: message.text || "",
      }))
      .filter((message) => message.text);

    const previousFilters = extractPreviousFiltersFromMessages(messages);

    const shopifyResponse = await admin.graphql(`
      #graphql
      query GetProducts {
        products(first: 50) {
          edges {
            node {
              id
              title
              handle
              description
              tags
              totalInventory
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

    const products = shopifyJson.data.products.edges.map((edge) => {
      const p = edge.node;
      const rawVariantId = p.variants?.edges?.[0]?.node?.id || "";
      const numericVariantId = rawVariantId.split("/").pop();

      return {
        id: p.id,
        title: p.title,
        handle: p.handle,
        description: p.description || "",
        tags: Array.isArray(p.tags) ? p.tags : [],
        totalInventory: p.totalInventory,
        image: p.images?.edges?.[0]?.node?.url || "",
        price: p.variants?.edges?.[0]?.node?.price || "",
        variantId: numericVariantId || "",
      };
    });

    const intentResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an AI shopping assistant.

Your job is to update the shopping filters using the latest message plus prior context.

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
    "gender": string or null
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
- "productType" can be values like gloves, goggles, poles, jacket, helmet
- "gender" can be male, female, unisex, or null
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
              },
              required: [
                "intent",
                "activity",
                "color",
                "maxPrice",
                "recipient",
                "productType",
                "gender",
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
          "Can you share a bit more about what you're looking for?",
        needsMoreInfo: true,
      });
    }

    const candidates = products
      .filter((product) => matchesText(product, filters.activity))
      .filter((product) => matchesText(product, filters.color))
      .filter((product) => matchesText(product, filters.productType))
      .filter((product) => matchesPrice(product, filters.maxPrice))
      .map((product) => ({
        ...product,
        score: basicScore(product, filters),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    if (candidates.length === 0) {
      let noMatchReply =
        "I couldn’t find a strong match in this store based on your request.";

      if (filters.color && filters.maxPrice !== null) {
        noMatchReply += " Try changing the color or increasing the budget a bit.";
      } else if (filters.productType) {
        noMatchReply += " Try a broader product type or remove one filter.";
      } else {
        noMatchReply += " Try adding details like product type, color, or activity.";
      }

      return Response.json({
        filters,
        products: [],
        reply: noMatchReply,
        needsMoreInfo: false,
      });
    }

    const rerankResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
You are an AI shopping assistant.

Shopper filters:
${JSON.stringify(filters, null, 2)}

Candidate products:
${JSON.stringify(candidates, null, 2)}

Return only JSON in this exact shape:
{
  "topProductIds": [string],
  "reply": string
}

Rules:
- Pick up to 4 best products
- Prefer products that best match budget, activity, color, recipient, and product type
- Write a helpful natural-language reply
- If intent is gift, sound like a gift recommender
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
          },
          required: ["topProductIds", "reply"],
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
      reply: reranked.reply || "Here are the best matches I found for you.",
      needsMoreInfo: false,
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