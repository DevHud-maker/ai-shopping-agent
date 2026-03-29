import { GoogleGenAI } from "@google/genai";
import { authenticate } from "../shopify.server";

function normalize(text) {
  return (text || "").toLowerCase().trim();
}

function productMatchesActivity(product, activity) {
  if (!activity) return true;

  const text = normalize(`
    ${product.title}
    ${product.handle}
    ${product.description}
    ${(product.tags || []).join(" ")}
  `);

  return text.includes(normalize(activity));
}

function productMatchesColor(product, color) {
  if (!color) return true;

  const text = normalize(`
    ${product.title}
    ${product.handle}
    ${product.description}
    ${(product.tags || []).join(" ")}
  `);

  return text.includes(normalize(color));
}

function productMatchesPrice(product, maxPrice) {
  if (!maxPrice) return true;

  const price = Number(product.price || 0);
  return price <= maxPrice;
}

function scoreProduct(product, filters) {
  let score = 0;

  const text = normalize(`
    ${product.title}
    ${product.handle}
    ${product.description}
    ${(product.tags || []).join(" ")}
  `);

  if (filters.activity && text.includes(normalize(filters.activity))) {
    score += 3;
  }

  if (filters.color && text.includes(normalize(filters.color))) {
    score += 3;
  }

  if (filters.intent === "gift") {
    score += 1;
  }

  if (filters.maxPrice && Number(product.price || 0) <= filters.maxPrice) {
    score += 2;
  }

  return score;
}

export const action = async ({ request }) => {
  try {
    if (!process.env.GEMINI_API_KEY) {
      return Response.json(
        { error: "GEMINI_API_KEY is missing in .env" },
        { status: 500 }
      );
    }

    const ai = new GoogleGenAI({
      apiKey: process.env.GEMINI_API_KEY,
    });

    const { admin } = await authenticate.admin(request);
    const body = await request.json();
    const query = body.query || "";

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

    const products = shopifyJson.data.products.edges.map((edge) => {
        const p = edge.node;
      
        // 👇 ADD THIS PART
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
      
          // 👇 ADD THIS LINE
          variantId: numericVariantId || "",
        };
      });

    const aiResult = await ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: `
Extract shopping filters from this user request.

User request:
"${query}"

Return only JSON in this exact shape:
{
  "activity": string or null,
  "color": string or null,
  "maxPrice": number or null,
  "intent": string or null
}

Rules:
- "activity" means sport/category like ski, snowboard, running, hiking
- "color" means requested color
- "maxPrice" means maximum budget number only
- "intent" can be "gift" if user wants a gift
- Return JSON only
`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "object",
          properties: {
            activity: { type: "string", nullable: true },
            color: { type: "string", nullable: true },
            maxPrice: { type: "number", nullable: true },
            intent: { type: "string", nullable: true },
          },
          required: ["activity", "color", "maxPrice", "intent"],
        },
      },
    });

    const filters = JSON.parse(aiResult.text);

    const filteredProducts = products
      .filter((product) => productMatchesActivity(product, filters.activity))
      .filter((product) => productMatchesColor(product, filters.color))
      .filter((product) => productMatchesPrice(product, filters.maxPrice))
      .map((product) => ({
        ...product,
        score: scoreProduct(product, filters),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return Response.json({
      filters,
      products: filteredProducts,
    });
  } catch (error) {
    console.error("Recommend error:", error);

    return Response.json(
      {
        error: error?.message || "Unknown server error",
        details: String(error),
      },
      { status: 500 }
    );
  }
};