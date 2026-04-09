import { useMemo, useState } from "react";

type CanonicalField =
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

const CANONICAL_FIELDS: CanonicalField[] = [
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

type PreviewRow = {
  key: string;
  matchType: "sku" | "handle" | "title" | "new";
  action: "create" | "update" | "unchanged";
  productId?: string;

  title: string;
  handle?: string;
  vendor?: string;
  productType?: string;
  tags?: string[];
  status?: "ACTIVE" | "DRAFT" | "ARCHIVED";
  bodyHtml?: string;

  sku?: string;
  price?: string;
  compareAtPrice?: string;
  barcode?: string;
  option1?: string;
  option2?: string;
  option3?: string;

  tracked?: boolean;
  inventoryPolicy?: "CONTINUE" | "DENY";
  requiresShipping?: boolean;
  taxable?: boolean;
  taxCode?: string;
  cost?: string;
  harmonizedSystemCode?: string;
  countryCodeOfOrigin?: string;
  provinceCodeOfOrigin?: string;

  weight?: number;
  weightUnit?: "KILOGRAMS" | "GRAMS" | "POUNDS" | "OUNCES";

  stock?: number;
  stockOnHand?: number;
  locationName?: string;
  locationId?: string;

  imageSrc?: string;

  changes: Record<string, { before: string; after: string }>;
};

type ImportResponse = {
  ok: boolean;
  mode?: "preview" | "import";
  message: string;
  preview?: PreviewRow[];
  errors?: string[];
  bulk?: boolean;
  headers?: string[];
  headerMap?: Partial<Record<CanonicalField, string>>;
  autoHeaderMap?: Partial<Record<CanonicalField, string>>;
  deterministicMap?: Record<string, string>;
  aiMap?: Record<string, string>;
  totalRows?: number;
  previewRowsShown?: number;
  recommendedBatchSize?: number;
  batchStart?: number;
  batchSize?: number;
  processedInBatch?: number;
  completedRows?: number;
  remainingRows?: number;
  nextBatchStart?: number;
  done?: boolean;
  code?: "PLAN_LIMIT" | "PLAN_REQUIRED";
  upgradeUrl?: string;
  plan?: string;
  hasPaidPlan?: boolean;
  summary?: {
    create?: number;
    update?: number;
    unchanged?: number;
    created?: number;
    updated?: number;
  };
  results?: Array<{
    title: string;
    action: "created" | "updated" | "unchanged";
    sku?: string;
  }>;
};

const cardStyle: React.CSSProperties = {
  background: "linear-gradient(180deg, #ffffff 0%, #fafafa 100%)",
  border: "1px solid #ececec",
  borderRadius: 18,
  boxShadow: "0 10px 30px rgba(0,0,0,0.06)",
  padding: 20,
};

const badgeStyles: Record<string, React.CSSProperties> = {
  create: { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" },
  update: { background: "#ffedd5", color: "#c2410c", border: "1px solid #fdba74" },
  unchanged: { background: "#f3f4f6", color: "#4b5563", border: "1px solid #d1d5db" },
  created: { background: "#dcfce7", color: "#166534", border: "1px solid #86efac" },
  updated: { background: "#ffedd5", color: "#c2410c", border: "1px solid #fdba74" },
  info: { background: "#dbeafe", color: "#1d4ed8", border: "1px solid #93c5fd" },
  warning: { background: "#fef3c7", color: "#92400e", border: "1px solid #fcd34d" },
};

function Badge({ children, tone }: { children: React.ReactNode; tone: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "6px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 700,
        ...badgeStyles[tone],
      }}
    >
      {children}
    </span>
  );
}

function prettyValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.join(", ");
  return String(value);
}

function PreviewCell({
  field,
  value,
  changes,
}: {
  field: string;
  value: unknown;
  changes: PreviewRow["changes"];
}) {
  const change = changes[field];

  return (
    <td
      title={change ? `Before: ${change.before || "—"}` : ""}
      style={{
        padding: "12px 14px",
        borderBottom: "1px solid #f1f1f1",
        verticalAlign: "top",
        background: change ? "#fff7ed" : "#fff",
      }}
    >
      <div style={{ fontWeight: change ? 700 : 500 }}>
        {prettyValue(value) || <span style={{ color: "#9ca3af" }}>—</span>}
      </div>
      {change ? (
        <div style={{ marginTop: 6, fontSize: 12, color: "#c2410c" }}>changed</div>
      ) : null}
    </td>
  );
}

export default function DashboardImportPage() {
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResponse | null>(null);
  const [manualHeaderMap, setManualHeaderMap] = useState<Partial<Record<CanonicalField, string>>>({});
  const [progress, setProgress] = useState<{
    totalRows: number;
    completedRows: number;
    percentage: number;
    running: boolean;
    batchMessage?: string;
  } | null>(null);
  const [liveImportResults, setLiveImportResults] = useState<
    Array<{ title: string; action: "created" | "updated" | "unchanged"; sku?: string }>
  >([]);

  async function parseJsonResponse(res: Response) {
    const text = await res.text();

    try {
      return JSON.parse(text);
    } catch {
      throw new Error(
        `Server returned non-JSON response (status ${res.status}). Response starts with: ${text.slice(0, 180)}`,
      );
    }
  }

  function redirectToUpgrade(upgradeUrl?: string) {
    const url = upgradeUrl || "/app/upgrade";
    window.location.href = url;
  }

async function sendPreview() {
  if (!file) return;

  setLoading(true);

  try {
    const form = new FormData();
    form.append("file", file);
    form.append("mode", "preview");
    form.append("manualHeaderMap", JSON.stringify(manualHeaderMap));

    const res = await fetch("/app/dashboard-import-api", {
      method: "POST",
      body: form,
      credentials: "same-origin",
    });

    const data: ImportResponse = await parseJsonResponse(res);

    if (!res.ok || !data.ok) {
      if ((data?.code === "PLAN_LIMIT" || data?.code === "PLAN_REQUIRED") && data?.upgradeUrl) {
        redirectToUpgrade(data.upgradeUrl);
        return;
      }

      setResult(data);
      return;
    }

    setResult(data);

    if (data?.headerMap) {
      setManualHeaderMap(data.headerMap);
    }
  } catch (e) {
    setResult({
      ok: false,
      message: e instanceof Error ? e.message : "Preview failed",
    });
  } finally {
    setLoading(false);
  }
}

async function runChunkedImport() {
  if (!file || !result?.totalRows) return;

  setImporting(true);
  setLiveImportResults([]);

  const totalRows = result.totalRows;
  const batchSize = result.recommendedBatchSize || 50;
  let batchStart = 0;
  const aggregatedResults: Array<{
    title: string;
    action: "created" | "updated" | "unchanged";
    sku?: string;
  }> = [];

  setProgress({
    totalRows,
    completedRows: 0,
    percentage: 0,
    running: true,
    batchMessage: "Starting import...",
  });

  let finalMessage = `Import finished. Processed ${totalRows} row(s).`;

  try {
    while (batchStart < totalRows) {
      const form = new FormData();
      form.append("file", file);
      form.append("mode", "import");
      form.append("manualHeaderMap", JSON.stringify(manualHeaderMap));
      form.append("batchStart", String(batchStart));
      form.append("batchSize", String(batchSize));

      const res = await fetch("/app/dashboard-import-api", {
        method: "POST",
        body: form,
        credentials: "same-origin",
      });

      const data: ImportResponse = await parseJsonResponse(res);

      if (!res.ok || !data.ok) {
        if ((data?.code === "PLAN_LIMIT" || data?.code === "PLAN_REQUIRED") && data?.upgradeUrl) {
          redirectToUpgrade(data.upgradeUrl);
          return;
        }

        throw new Error(data.message || "Import failed.");
      }

      if (data.results?.length) {
        aggregatedResults.push(...data.results);
        setLiveImportResults([...aggregatedResults]);
      }

      const completedRows = data.completedRows ?? Math.min(batchStart + batchSize, totalRows);
      const percentage = totalRows > 0 ? Math.round((completedRows / totalRows) * 100) : 0;

      setProgress({
        totalRows,
        completedRows,
        percentage,
        running: !data.done,
        batchMessage: data.message,
      });

      finalMessage = data.message || finalMessage;

      if (data.done) {
        break;
      }

      batchStart = data.nextBatchStart ?? completedRows;
    }

    setResult((prev) => ({
      ...(prev ?? { ok: true, message: finalMessage }),
      ok: true,
      mode: "import",
      message: finalMessage,
      totalRows,
      results: aggregatedResults,
    }));

    setProgress((prev) =>
      prev
        ? {
            ...prev,
            completedRows: totalRows,
            percentage: 100,
            running: false,
            batchMessage: finalMessage,
          }
        : null,
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Import failed";

    setResult((prev) => ({
      ...(prev ?? { ok: false, message }),
      ok: false,
      message,
      mode: "import",
    }));

    setProgress((prev) =>
      prev
        ? {
            ...prev,
            running: false,
            batchMessage: message,
          }
        : null,
    );
  } finally {
    setImporting(false);
  }
}

  function updateFieldMapping(field: CanonicalField, sourceColumn: string) {
    setManualHeaderMap((prev) => ({
      ...prev,
      [field]: sourceColumn,
    }));
  }

  const previewRows = result?.preview ?? [];

  const summary = useMemo(() => {
    if (!result?.summary) return null;
    return {
      create: result.summary.create ?? result.summary.created ?? 0,
      update: result.summary.update ?? result.summary.updated ?? 0,
      unchanged: result.summary.unchanged ?? 0,
    };
  }, [result?.summary]);

  const displayedImportResults =
    result?.mode === "import" && liveImportResults.length ? liveImportResults : result?.results ?? [];

  return (
    <div
      style={{
        padding: 28,
        maxWidth: 1500,
        margin: "0 auto",
        background:
          "radial-gradient(circle at top left, rgba(255,237,213,0.4), transparent 25%), radial-gradient(circle at top right, rgba(219,234,254,0.45), transparent 30%), #f8fafc",
        minHeight: "100vh",
      }}
    >
      <div style={{ ...cardStyle, marginBottom: 20 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 24,
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h1 style={{ margin: 0, fontSize: 32, color: "#111827" }}>Product Import</h1>
            <p style={{ margin: "10px 0 0", color: "#4b5563", fontSize: 15 }}>
              Upload, review mapping, preview changes, then import in safe batches with live progress.
            </p>
          </div>

          <div
            style={{
              padding: "10px 14px",
              borderRadius: 14,
              background: "#111827",
              color: "#fff",
              fontWeight: 700,
            }}
          >
            Smart Import
          </div>
        </div>

        <div
          style={{
            marginTop: 16,
            padding: "12px 14px",
            borderRadius: 12,
            background: "#fef3c7",
            border: "1px solid #fcd34d",
            color: "#92400e",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          Free plan: import up to 100 products. Upgrade to unlock unlimited imports.
        </div>

        <div style={{ marginTop: 20 }}>
          <input
            type="file"
            accept=".csv,.xls,.xlsx"
            onChange={(e) => {
              setFile(e.target.files?.[0] ?? null);
              setResult(null);
              setManualHeaderMap({});
              setProgress(null);
              setLiveImportResults([]);
            }}
            style={{
              padding: 12,
              borderRadius: 12,
              border: "1px solid #d1d5db",
              background: "#fff",
              width: "100%",
              maxWidth: 520,
            }}
          />
        </div>

        <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button
            onClick={sendPreview}
            disabled={!file || loading || importing}
            style={{
              ...buttonDark,
              opacity: !file || loading || importing ? 0.6 : 1,
              cursor: !file || loading || importing ? "not-allowed" : "pointer",
            }}
          >
            {loading ? "Preparing preview..." : "Preview"}
          </button>

          <button
            onClick={runChunkedImport}
            disabled={!file || importing || loading || result?.mode !== "preview"}
            style={{
              ...buttonOrange,
              opacity: !file || importing || loading || result?.mode !== "preview" ? 0.6 : 1,
              cursor:
                !file || importing || loading || result?.mode !== "preview"
                  ? "not-allowed"
                  : "pointer",
            }}
          >
            {importing ? "Importing..." : "Confirm import"}
          </button>
        </div>
      </div>

      {progress ? (
        <div style={{ ...cardStyle, marginBottom: 20 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 16,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 12,
            }}
          >
            <h2 style={{ margin: 0, fontSize: 22 }}>Import progress</h2>
            <Badge tone="info">
              {progress.completedRows} / {progress.totalRows}
            </Badge>
          </div>

          <div
            style={{
              height: 18,
              borderRadius: 999,
              background: "#e5e7eb",
              overflow: "hidden",
              border: "1px solid #d1d5db",
            }}
          >
            <div
              style={{
                width: `${progress.percentage}%`,
                height: "100%",
                background: "linear-gradient(90deg, #fb923c 0%, #ea580c 100%)",
                transition: "width 0.35s ease",
              }}
            />
          </div>

          <div
            style={{
              marginTop: 10,
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              flexWrap: "wrap",
              color: "#374151",
              fontSize: 14,
            }}
          >
            <div>{progress.batchMessage || ""}</div>
            <div style={{ fontWeight: 800 }}>{progress.percentage}%</div>
          </div>
        </div>
      ) : null}

      {result ? (
        <>
          <div style={{ ...cardStyle, marginBottom: 20 }}>
            <div
              style={{
                padding: 14,
                borderRadius: 14,
                background: result.ok ? "#ecfdf5" : "#fef2f2",
                border: `1px solid ${result.ok ? "#86efac" : "#fca5a5"}`,
                color: result.ok ? "#166534" : "#991b1b",
                fontWeight: 700,
              }}
            >
              {result.message}
            </div>

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginTop: 16 }}>
              {typeof result.totalRows === "number" ? (
                <Badge tone="unchanged">Rows: {result.totalRows}</Badge>
              ) : null}

              {typeof result.previewRowsShown === "number" ? (
                <Badge tone="info">Preview shown: {result.previewRowsShown}</Badge>
              ) : null}

              {summary ? (
                <>
                  <Badge tone="create">Create: {summary.create}</Badge>
                  <Badge tone="update">Update: {summary.update}</Badge>
                  <Badge tone="unchanged">Unchanged: {summary.unchanged}</Badge>
                </>
              ) : null}

              {typeof result.recommendedBatchSize === "number" ? (
                <Badge tone="info">Batch size: {result.recommendedBatchSize}</Badge>
              ) : null}

              {result.code === "PLAN_LIMIT" ? (
                <Badge tone="warning">Upgrade required</Badge>
              ) : null}
            </div>

            {result.code === "PLAN_LIMIT" && result.upgradeUrl ? (
              <div style={{ marginTop: 16 }}>
                <button
                  onClick={() => redirectToUpgrade(result.upgradeUrl)}
                  style={{
                    ...buttonOrange,
                    cursor: "pointer",
                  }}
                >
                  Upgrade to continue
                </button>
              </div>
            ) : null}

            {result.errors?.length ? (
              <div style={{ marginTop: 18 }}>
                <h3 style={{ marginBottom: 10 }}>Validation errors</h3>
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {result.errors.map((x, i) => (
                    <li key={i} style={{ marginBottom: 6 }}>
                      {x}
                    </li>
                  ))}
                </ul>
              </div>
            ) : null}
          </div>

          {result.headers?.length ? (
            <div style={{ ...cardStyle, marginBottom: 20 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h2 style={{ margin: 0, fontSize: 22 }}>Adjust field matching</h2>
                  <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
                    Change any source column before import, then click Preview again.
                  </p>
                </div>

                <button
                  onClick={() => setManualHeaderMap(result.autoHeaderMap ?? {})}
                  style={{
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #d1d5db",
                    background: "#fff",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  Reset to auto-detected
                </button>
              </div>

              <div style={{ overflowX: "auto", marginTop: 16 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Shopify field</th>
                      <th style={thStyle}>Source column</th>
                    </tr>
                  </thead>
                  <tbody>
                    {CANONICAL_FIELDS.map((field) => (
                      <tr key={field}>
                        <td style={tdStyleStrong}>{field}</td>
                        <td style={tdStyle}>
                          <select
                            value={manualHeaderMap[field] ?? ""}
                            onChange={(e) => updateFieldMapping(field, e.target.value)}
                            style={{
                              width: "100%",
                              maxWidth: 360,
                              padding: "10px 12px",
                              borderRadius: 10,
                              border: "1px solid #d1d5db",
                              background: "#fff",
                            }}
                          >
                            <option value="">-- not mapped --</option>
                            {result.headers.map((header) => (
                              <option key={header} value={header}>
                                {header}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div style={{ marginTop: 16, display: "flex", gap: 12, flexWrap: "wrap" }}>
                <button
                  onClick={sendPreview}
                  disabled={!file || loading || importing}
                  style={{
                    ...buttonDark,
                    opacity: !file || loading || importing ? 0.6 : 1,
                    cursor: !file || loading || importing ? "not-allowed" : "pointer",
                  }}
                >
                  {loading ? "Refreshing preview..." : "Apply mapping and refresh preview"}
                </button>
              </div>
            </div>
          ) : null}

          {result.mode === "preview" && previewRows.length ? (
            <div style={cardStyle}>
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Preview products</h2>
              <p style={{ margin: "6px 0 14px", color: "#6b7280" }}>
                Orange cells are changed. Hover a changed cell to see the previous value.
              </p>

              <div style={{ overflowX: "auto", borderRadius: 14, border: "1px solid #ececec" }}>
                <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0 }}>
                  <thead>
                    <tr style={{ background: "#f8fafc" }}>
                      <th style={thStyle}>Action</th>
                      <th style={thStyle}>Match</th>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>SKU</th>
                      <th style={thStyle}>Price</th>
                      <th style={thStyle}>Compare price</th>
                      <th style={thStyle}>Vendor</th>
                      <th style={thStyle}>Type</th>
                      <th style={thStyle}>Status</th>
                      <th style={thStyle}>Handle</th>
                      <th style={thStyle}>Barcode</th>
                      <th style={thStyle}>Tags</th>
                      <th style={thStyle}>Tracked</th>
                      <th style={thStyle}>Inventory policy</th>
                      <th style={thStyle}>Requires shipping</th>
                      <th style={thStyle}>Taxable</th>
                      <th style={thStyle}>Cost</th>
                      <th style={thStyle}>Weight</th>
                      <th style={thStyle}>Weight unit</th>
                      <th style={thStyle}>Stock</th>
                      <th style={thStyle}>On hand</th>
                      <th style={thStyle}>Location</th>
                      <th style={thStyle}>Location ID</th>
                      <th style={thStyle}>Origin country</th>
                      <th style={thStyle}>Origin province</th>
                      <th style={thStyle}>HS code</th>
                      <th style={thStyle}>Image</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((row) => (
                      <tr key={row.key}>
                        <td style={tdStyle}>
                          {row.action === "create" ? (
                            <Badge tone="create">Create</Badge>
                          ) : row.action === "update" ? (
                            <Badge tone="update">Update</Badge>
                          ) : (
                            <Badge tone="unchanged">Unchanged</Badge>
                          )}
                        </td>

                        <td style={tdStyle}>{row.matchType === "new" ? "new" : row.matchType}</td>

                        <PreviewCell field="title" value={row.title} changes={row.changes} />
                        <PreviewCell field="sku" value={row.sku} changes={row.changes} />
                        <PreviewCell field="price" value={row.price} changes={row.changes} />
                        <PreviewCell field="compareAtPrice" value={row.compareAtPrice} changes={row.changes} />
                        <PreviewCell field="vendor" value={row.vendor} changes={row.changes} />
                        <PreviewCell field="productType" value={row.productType} changes={row.changes} />
                        <PreviewCell field="status" value={row.status} changes={row.changes} />
                        <PreviewCell field="handle" value={row.handle} changes={row.changes} />
                        <PreviewCell field="barcode" value={row.barcode} changes={row.changes} />
                        <PreviewCell field="tags" value={row.tags} changes={row.changes} />
                        <PreviewCell field="tracked" value={row.tracked} changes={row.changes} />
                        <PreviewCell field="inventoryPolicy" value={row.inventoryPolicy} changes={row.changes} />
                        <PreviewCell field="requiresShipping" value={row.requiresShipping} changes={row.changes} />
                        <PreviewCell field="taxable" value={row.taxable} changes={row.changes} />
                        <PreviewCell field="cost" value={row.cost} changes={row.changes} />
                        <PreviewCell field="weight" value={row.weight} changes={row.changes} />
                        <PreviewCell field="weightUnit" value={row.weightUnit} changes={row.changes} />
                        <PreviewCell field="stock" value={row.stock} changes={row.changes} />
                        <PreviewCell field="stockOnHand" value={row.stockOnHand} changes={row.changes} />
                        <PreviewCell field="locationName" value={row.locationName} changes={row.changes} />
                        <PreviewCell field="locationId" value={row.locationId} changes={row.changes} />
                        <PreviewCell field="countryCodeOfOrigin" value={row.countryCodeOfOrigin} changes={row.changes} />
                        <PreviewCell field="provinceCodeOfOrigin" value={row.provinceCodeOfOrigin} changes={row.changes} />
                        <PreviewCell field="harmonizedSystemCode" value={row.harmonizedSystemCode} changes={row.changes} />
                        <PreviewCell field="imageSrc" value={row.imageSrc} changes={row.changes} />
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}

          {displayedImportResults.length ? (
            <div style={{ ...cardStyle, marginTop: 20 }}>
              <h2 style={{ marginTop: 0, fontSize: 22 }}>Import results</h2>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Title</th>
                      <th style={thStyle}>SKU</th>
                      <th style={thStyle}>Result</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedImportResults.map((row, i) => (
                      <tr key={`${row.title}-${row.sku ?? i}`}>
                        <td style={tdStyleStrong}>{row.title}</td>
                        <td style={tdStyle}>{row.sku || "—"}</td>
                        <td style={tdStyle}>
                          {row.action === "created" ? (
                            <Badge tone="created">Created</Badge>
                          ) : row.action === "updated" ? (
                            <Badge tone="updated">Updated</Badge>
                          ) : (
                            <Badge tone="unchanged">Unchanged</Badge>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}

const thStyle: React.CSSProperties = {
  textAlign: "left",
  padding: "14px 14px",
  borderBottom: "1px solid #e5e7eb",
  color: "#374151",
  fontSize: 13,
  fontWeight: 800,
  whiteSpace: "nowrap",
  background: "#f8fafc",
};

const tdStyle: React.CSSProperties = {
  padding: "12px 14px",
  borderBottom: "1px solid #f1f1f1",
  verticalAlign: "top",
  color: "#111827",
  background: "#fff",
};

const tdStyleStrong: React.CSSProperties = {
  ...tdStyle,
  fontWeight: 700,
};

const buttonDark: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid #111827",
  background: "#111827",
  color: "#fff",
  fontWeight: 700,
};

const buttonOrange: React.CSSProperties = {
  padding: "12px 18px",
  borderRadius: 12,
  border: "1px solid #ea580c",
  background: "linear-gradient(180deg, #fb923c 0%, #ea580c 100%)",
  color: "#fff",
  fontWeight: 700,
};