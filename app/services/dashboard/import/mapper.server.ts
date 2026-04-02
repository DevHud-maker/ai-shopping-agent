type RawRow = Record<string, any>;

export type ImportedProductRow = {
  // product-level
  title: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  bodyHtml?: string;

  // seo
  seoTitle?: string;
  seoDescription?: string;

  // product publishing / merchandising
  templateSuffix?: string;
  giftCard?: boolean;

  // variant-level
  sku?: string;
  price?: string;
  compareAtPrice?: string;
  barcode?: string;
  option1?: string;
  option2?: string;
  option3?: string;

  // inventory item / shipping / tax
  tracked?: boolean;
  inventoryPolicy?: "CONTINUE" | "DENY";
  requiresShipping?: boolean;
  taxable?: boolean;
  taxCode?: string;
  cost?: string;
  harmonizedSystemCode?: string;
  countryCodeOfOrigin?: string;
  provinceCodeOfOrigin?: string;

  // measurements
  weight?: number;
  weightUnit?: "KILOGRAMS" | "GRAMS" | "POUNDS" | "OUNCES";

  // stock
  stock?: number;
  stockOnHand?: number;
  locationName?: string;
  locationId?: string;

  // media
  imageSrc?: string;

  // debug / raw
  raw?: RawRow;
};

export type CanonicalField =
  | "title"
  | "handle"
  | "vendor"
  | "productType"
  | "tags"
  | "status"
  | "bodyHtml"
  | "seoTitle"
  | "seoDescription"
  | "templateSuffix"
  | "giftCard"
  | "sku"
  | "price"
  | "compareAtPrice"
  | "barcode"
  | "option1"
  | "option2"
  | "option3"
  | "tracked"
  | "inventoryPolicy"
  | "requiresShipping"
  | "taxable"
  | "taxCode"
  | "cost"
  | "harmonizedSystemCode"
  | "countryCodeOfOrigin"
  | "provinceCodeOfOrigin"
  | "weight"
  | "weightUnit"
  | "stock"
  | "stockOnHand"
  | "locationName"
  | "locationId"
  | "imageSrc";

export const CANONICAL_FIELDS: CanonicalField[] = [
  "title",
  "handle",
  "vendor",
  "productType",
  "tags",
  "status",
  "bodyHtml",
  "seoTitle",
  "seoDescription",
  "templateSuffix",
  "giftCard",
  "sku",
  "price",
  "compareAtPrice",
  "barcode",
  "option1",
  "option2",
  "option3",
  "tracked",
  "inventoryPolicy",
  "requiresShipping",
  "taxable",
  "taxCode",
  "cost",
  "harmonizedSystemCode",
  "countryCodeOfOrigin",
  "provinceCodeOfOrigin",
  "weight",
  "weightUnit",
  "stock",
  "stockOnHand",
  "locationName",
  "locationId",
  "imageSrc",
];

const FIELD_ALIASES: Record<CanonicalField, string[]> = {
  title: [
    "title",
    "name",
    "product name",
    "product title",
    "beschreibung",
    "bezeichnung",
    "artikelbezeichnung",
    "description",
    "produktname",
    "kurzbezeichnung",
  ],
  handle: ["handle", "slug", "url handle", "seo handle"],
  vendor: ["vendor", "brand", "hersteller", "marke", "lieferant"],
  productType: [
    "product type",
    "type",
    "category",
    "artikelgruppe",
    "warengruppe",
    "produktgruppe",
    "producttype",
  ],
  tags: ["tags", "tag", "stichworte", "keywords", "schlagworte"],
  status: ["status", "product status"],
  bodyHtml: [
    "body",
    "body html",
    "description html",
    "langbeschreibung",
    "langtext",
    "beschreibung lang",
    "beschreibung 2",
  ],
  sku: [
    "sku",
    "referenz",
    "artikelnummer",
    "artnr",
    "item no",
    "item number",
    "product code",
    "code",
    "reference",
  ],
  price: [
    "price",
    "preis",
    "vk",
    "vk brutto",
    "verkaufspreis",
    "verkaufspreis brutto",
    "sale price",
    "unit price",
    "brutto",
  ],
  compareAtPrice: ["compare at price", "compare price", "uvp", "listenpreis", "streichpreis"],
  barcode: ["barcode", "ean", "gtin", "upc"],
  weight: ["weight", "gewicht"],
  weightUnit: ["weight unit", "gewichteinheit"],
  taxable: ["taxable", "tax", "mwst", "mwst.", "vat", "steuer", "tax rate"],
  taxCode: ["tax code", "steuercode"],
  option1: [
    "option1",
    "variant",
    "size",
    "farbe",
    "color",
    "colour",
    "größe",
    "gross",
    "format",
    "einheit",
    "verpackungseinheit",
  ],
    seoTitle: [
    "seo title",
    "meta title",
    "metatitel",
    "seitentitel",
  ],
  seoDescription: [
    "seo description",
    "meta description",
    "metabeschreibung",
    "meta beschreibung",
  ],
  templateSuffix: [
    "template",
    "template suffix",
    "vorlage",
    "template suffix",
  ],
  giftCard: [
    "gift card",
    "gutschein",
  ],
  option2: [
    "option2",
    "size",
    "größe",
    "second option",
  ],
  option3: [
    "option3",
    "third option",
    "third attribute",
  ],
  tracked: [
    "tracked",
    "inventory tracked",
    "bestand verfolgen",
    "lagerbestand verfolgen",
  ],
  inventoryPolicy: [
    "inventory policy",
    "backorder",
    "continue selling",
    "verkauf trotz nullbestand",
  ],
  requiresShipping: [
    "requires shipping",
    "shipping required",
    "versand erforderlich",
  ],
  cost: [
    "cost",
    "ek",
    "einstandspreis",
    "cost price",
    "purchase price",
  ],
  harmonizedSystemCode: [
    "hs code",
    "harmonized system code",
    "zolltarifnummer",
    "taric",
  ],
  countryCodeOfOrigin: [
    "country of origin",
    "origin country",
    "ursprungsland",
    "herkunftsland",
  ],
  provinceCodeOfOrigin: [
    "province of origin",
    "origin province",
    "ursprungsprovinz",
  ],
  stock: [
    "stock",
    "inventory",
    "bestand",
    "lagerbestand",
    "available",
    "available quantity",
    "qty",
    "quantity",
    "menge",
  ],
  stockOnHand: [
    "on hand",
    "stock on hand",
    "physical stock",
    "physischer bestand",
  ],
  locationName: [
    "location",
    "location name",
    "lager",
    "standort",
  ],
  locationId: [
    "location id",
    "lager id",
    "standort id",
  ],
  imageSrc: [
    "image",
    "image src",
    "image url",
    "bild",
    "bild url",
  ],
};

export type HeaderMap = Partial<Record<CanonicalField, string>>;

function normalizeKey(value: string) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function cleanString(value: unknown) {
  const s = String(value ?? "").trim();
  return s || undefined;
}

function parseTags(value: unknown): string[] | undefined {
  const s = cleanString(value);
  if (!s) return undefined;

  const tags = s
    .split(/[;,|]/)
    .map((x) => x.trim())
    .filter(Boolean);

  return tags.length ? Array.from(new Set(tags)) : undefined;
}

function slugify(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

function parseBoolean(value: unknown): boolean | undefined {
  const s = cleanString(value);
  if (!s) return undefined;

  const v = normalizeKey(s);

  if (["true", "yes", "ja", "y", "1"].includes(v)) return true;
  if (["false", "no", "nein", "n", "0"].includes(v)) return false;

  return undefined;
}

function parseInteger(value: unknown): number | undefined {
  const s = cleanString(value);
  if (!s) return undefined;

  const normalized = s.replace(",", ".").replace(/[^0-9.-]/g, "");
  const n = Number(normalized);

  if (Number.isNaN(n)) return undefined;
  return Math.round(n);
}

function parseInventoryPolicy(value: unknown): "CONTINUE" | "DENY" | undefined {
  const s = normalizeKey(String(value ?? ""));
  if (!s) return undefined;

  if (["continue", "allow", "backorder", "weiterverkaufen"].includes(s)) {
    return "CONTINUE";
  }

  if (["deny", "stop", "deny oversell", "nicht weiterverkaufen"].includes(s)) {
    return "DENY";
  }

  return undefined;
}

function parsePrice(value: unknown): string | undefined {
  const s = cleanString(value);
  if (!s) return undefined;

  const normalized = s
    .replace(/\s/g, "")
    .replace(/chf|eur|usd|gbp/gi, "")
    .replace(/[^0-9,.-]/g, "");

  if (!normalized) return undefined;

  const hasComma = normalized.includes(",");
  const hasDot = normalized.includes(".");

  let numeric = normalized;

  if (hasComma && hasDot) {
    numeric = normalized.replace(/\./g, "").replace(",", ".");
  } else if (hasComma) {
    numeric = normalized.replace(",", ".");
  }

  const n = Number(numeric);
  if (Number.isNaN(n)) return undefined;

  return n.toFixed(2);
}

function parseWeight(value: unknown): number | undefined {
  const s = cleanString(value);
  if (!s) return undefined;

  const normalized = s.replace(",", ".").replace(/[^0-9.-]/g, "");
  const n = Number(normalized);

  return Number.isNaN(n) ? undefined : n;
}

function parseTaxable(value: unknown): boolean | undefined {
  const s = cleanString(value);
  if (!s) return undefined;

  const v = normalizeKey(s);

  if (["true", "yes", "ja", "y", "1"].includes(v)) return true;
  if (["false", "no", "nein", "n", "0"].includes(v)) return false;

  const n = Number(s.replace(",", "."));
  if (!Number.isNaN(n)) return n > 0;

  return undefined;
}

function parseStatus(value: unknown): ImportedProductRow["status"] | undefined {
  const s = normalizeKey(String(value ?? ""));
  if (!s) return undefined;

  if (["active", "aktiv", "published"].includes(s)) return "ACTIVE";
  if (["archived", "archiviert"].includes(s)) return "ARCHIVED";
  if (["draft", "entwurf", "inaktiv"].includes(s)) return "DRAFT";

  return undefined;
}

function parseWeightUnit(value: unknown): ImportedProductRow["weightUnit"] | undefined {
  const s = normalizeKey(String(value ?? ""));
  if (!s) return undefined;

  if (["kg", "kilogram", "kilograms", "kilogramm", "kilogramme"].includes(s)) return "KILOGRAMS";
  if (["g", "gram", "grams", "gramm"].includes(s)) return "GRAMS";
  if (["lb", "lbs", "pound", "pounds"].includes(s)) return "POUNDS";
  if (["oz", "ounce", "ounces"].includes(s)) return "OUNCES";

  return undefined;
}

function buildDeterministicHeaderMap(headers: string[]) {
  const normalizedHeaders = headers.map((h) => ({
    original: h,
    normalized: normalizeKey(h),
  }));

  const result: HeaderMap = {};
  const usedHeaders = new Set<string>();

  for (const [field, aliases] of Object.entries(FIELD_ALIASES) as Array<[CanonicalField, string[]]>) {
    for (const alias of aliases) {
      const aliasNormalized = normalizeKey(alias);
      const hit = normalizedHeaders.find(
        (h) => h.normalized === aliasNormalized && !usedHeaders.has(h.original),
      );

      if (hit) {
        result[field] = hit.original;
        usedHeaders.add(hit.original);
        break;
      }
    }
  }

  return result;
}

async function inferUnknownHeadersWithAI(
  headers: string[],
  deterministicMap: HeaderMap,
  sampleRows: RawRow[],
) {
  const unmatchedHeaders = headers.filter(
    (header) => !Object.values(deterministicMap).includes(header),
  );

  if (!unmatchedHeaders.length || !process.env.GEMINI_API_KEY) {
    return {} as HeaderMap;
  }

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: unmatchedHeaders.reduce<Record<string, any>>((acc, header) => {
      acc[header] = {
        type: "string",
        enum: [...CANONICAL_FIELDS, "ignore"],
      };
      return acc;
    }, {}),
  };

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                {
                  text:
                    `Map spreadsheet headers to Shopify import fields.\n` +
                    `Return JSON only.\n` +
                    `Allowed targets: ${CANONICAL_FIELDS.join(", ")}, ignore.\n\n` +
                    `Already matched fields:\n${JSON.stringify(deterministicMap, null, 2)}\n\n` +
                    `Unknown headers:\n${JSON.stringify(unmatchedHeaders, null, 2)}\n\n` +
                    `Sample rows:\n${JSON.stringify(sampleRows.slice(0, 5), null, 2)}`,
                },
              ],
            },
          ],
          generationConfig: {
            responseMimeType: "application/json",
            responseSchema: schema,
            temperature: 0,
          },
        }),
      },
    );

    const json = await response.json();
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text ?? "{}";
    const parsed = JSON.parse(text) as Record<string, CanonicalField | "ignore">;

    const aiMap: HeaderMap = {};
    const alreadyAssigned = new Set(Object.keys(deterministicMap));

    for (const header of unmatchedHeaders) {
      const target = parsed[header];
      if (!target || target === "ignore") continue;
      if (!CANONICAL_FIELDS.includes(target)) continue;
      if (alreadyAssigned.has(target)) continue;

      aiMap[target] = header;
      alreadyAssigned.add(target);
    }

    return aiMap;
  } catch {
    return {} as HeaderMap;
  }
}

function mergeHeaderMaps(base: HeaderMap, overrides?: HeaderMap) {
  if (!overrides) return base;

  const merged: HeaderMap = { ...base };

  for (const field of CANONICAL_FIELDS) {
    const override = overrides[field];
    if (override === "") {
      delete merged[field];
      continue;
    }
    if (override) {
      merged[field] = override;
    }
  }

  return merged;
}

function pick(row: RawRow, key?: string) {
  if (!key) return undefined;
  return row[key];
}

function mapOneRow(row: RawRow, headerMap: HeaderMap): ImportedProductRow | null {
  const title =
    cleanString(pick(row, headerMap.title)) ||
    cleanString(pick(row, headerMap.bodyHtml));

  if (!title) return null;

  const explicitHandle = cleanString(pick(row, headerMap.handle));
  const handle = explicitHandle || slugify(title);

  return {
    title,
    handle,
    vendor: cleanString(pick(row, headerMap.vendor)),
    productType: cleanString(pick(row, headerMap.productType)),
    tags: parseTags(pick(row, headerMap.tags)),
    status: parseStatus(pick(row, headerMap.status)) ?? "DRAFT",
    bodyHtml: cleanString(pick(row, headerMap.bodyHtml)),

    seoTitle: cleanString(pick(row, headerMap.seoTitle)),
    seoDescription: cleanString(pick(row, headerMap.seoDescription)),
    templateSuffix: cleanString(pick(row, headerMap.templateSuffix)),
    giftCard: parseBoolean(pick(row, headerMap.giftCard)),

    sku: cleanString(pick(row, headerMap.sku)),
    price: parsePrice(pick(row, headerMap.price)),
    compareAtPrice: parsePrice(pick(row, headerMap.compareAtPrice)),
    barcode: cleanString(pick(row, headerMap.barcode)),
    option1: cleanString(pick(row, headerMap.option1)),
    option2: cleanString(pick(row, headerMap.option2)),
    option3: cleanString(pick(row, headerMap.option3)),

    tracked: parseBoolean(pick(row, headerMap.tracked)),
    inventoryPolicy: parseInventoryPolicy(pick(row, headerMap.inventoryPolicy)),
    requiresShipping: parseBoolean(pick(row, headerMap.requiresShipping)),
    taxable: parseTaxable(pick(row, headerMap.taxable)),
    taxCode: cleanString(pick(row, headerMap.taxCode)),
    cost: parsePrice(pick(row, headerMap.cost)),
    harmonizedSystemCode: cleanString(pick(row, headerMap.harmonizedSystemCode)),
    countryCodeOfOrigin: cleanString(pick(row, headerMap.countryCodeOfOrigin)),
    provinceCodeOfOrigin: cleanString(pick(row, headerMap.provinceCodeOfOrigin)),

    weight: parseWeight(pick(row, headerMap.weight)),
    weightUnit: parseWeightUnit(pick(row, headerMap.weightUnit)) ?? "KILOGRAMS",

    stock: parseInteger(pick(row, headerMap.stock)),
    stockOnHand: parseInteger(pick(row, headerMap.stockOnHand)),
    locationName: cleanString(pick(row, headerMap.locationName)),
    locationId: cleanString(pick(row, headerMap.locationId)),

    imageSrc: cleanString(pick(row, headerMap.imageSrc)),
    raw: row,
  };
}

export async function mapImportedRows(
  rows: RawRow[],
  opts?: {
    manualHeaderMap?: HeaderMap;
  },
) {
  if (!rows.length) {
    return {
      ok: false as const,
      message: "The file is empty.",
    };
  }

  const headers = Object.keys(rows[0] || {});
  const deterministicMap = buildDeterministicHeaderMap(headers);
  const aiMap = await inferUnknownHeadersWithAI(headers, deterministicMap, rows);

  const autoHeaderMap: HeaderMap = {
    ...deterministicMap,
    ...aiMap,
  };

  const headerMap = mergeHeaderMaps(autoHeaderMap, opts?.manualHeaderMap);

  const mappedRows = rows
    .map((row) => mapOneRow(row, headerMap))
    .filter(Boolean) as ImportedProductRow[];

  if (!mappedRows.length) {
    return {
      ok: false as const,
      message:
        "Could not map rows. Make sure the file contains a title-like column such as Title, Beschreibung, Bezeichnung, Product Name, or Kurzbezeichnung.",
    };
  }

  return {
    ok: true as const,
    rows: mappedRows,
    headers,
    headerMap,
    autoHeaderMap,
    deterministicMap,
    aiMap,
  };
}