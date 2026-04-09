import { useEffect, useMemo, useState } from "react";

type ExportFormat =
  | "excel"
  | "csv"
  | "google_shopping_feed"
  | "json";

type EntityKey =
  | "products"
  | "smart_collections"
  | "custom_collections"
  | "customers"
  | "companies"
  | "discounts"
  | "draft_orders"
  | "orders"
  | "payouts"
  | "pages"
  | "redirects"
  | "files"
  | "menus"
  | "metaobjects"
  | "shop";

type ScheduleUnit = "days" | "weeks" | "months";

type ScheduledExport = {
  id: string;
  shop: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  lastRunAt?: string | null;
  nextRunAt: string | null;
  runCount: number;
  remainingRuns: number | null;
  lastStatus?: "idle" | "running" | "completed" | "failed" | null;
  lastMessage?: string | null;
  lastResultFileName?: string | null;
  lastBulkJobId?: string | null;
};

type ExportConfig = {
  presetName: string;
  format: ExportFormat;
  selectedEntities: EntityKey[];
  selectedColumns: Record<string, string[]>;
  filters: Record<string, string>;
  scheduleOnDate: string;
  scheduleOnTime: string;
  timezone: string;
  repeatEvery: number;
  repeatUnit: ScheduleUnit;
  runUntil: "until_cancelled" | "times";
  runTimes: number;
  customFileName: string;
  fileNameTimeSource: "started_at" | "completed_at";
  skipEmptyResults: boolean;
  uploadTo: "none" | "server";
  serverUrl: string;
  sorting: "shopify_order" | "title_asc" | "title_desc" | "created_desc";
};

type ExportJob = {
  id: string;
  status: string;
  message?: string;
  createdAt?: string;
  updatedAt?: string;
  finalFileName?: string | null;
  entities?: Record<
    string,
    {
      status?: string;
      bulkOperationId?: string | null;
      objectCount?: string | null;
      errorCode?: string | null;
    }
  >;
};

const ENTITIES: Array<{ key: EntityKey; label: string }> = [
  { key: "products", label: "Products" },
  { key: "smart_collections", label: "Smart Collections" },
  { key: "custom_collections", label: "Custom Collections" },
  { key: "customers", label: "Customers" },
  { key: "companies", label: "Companies" },
  { key: "discounts", label: "Discounts" },
  { key: "draft_orders", label: "Draft Orders" },
  { key: "orders", label: "Orders" },
  { key: "payouts", label: "Payouts" },
  { key: "pages", label: "Pages" },
  { key: "redirects", label: "Redirects" },
  { key: "files", label: "Files" },
  { key: "menus", label: "Menus" },
  { key: "metaobjects", label: "Metaobjects" },
  { key: "shop", label: "Shop" },
];

const PRODUCT_COLUMN_GROUPS = [
  {
    group: "Basic Columns",
    columns: [
      "ID",
      "Handle",
      "Command",
      "Title",
      "Body HTML",
      "Vendor",
      "Type",
      "Tags",
      "Tags Command",
      "Created At",
      "Updated At",
      "Status",
      "Published",
      "Published At",
      "Published Scope",
      "Template Suffix",
      "Gift Card",
      "URL",
      "Total Inventory Qty",
      "Row #",
      "Top Row",
      "Category",
      "Category: ID",
      "Category: Name",
      "Custom Collections",
      "Smart Collections",
    ],
  },
  {
    group: "Media",
    speed: "Slow",
    columns: [
      "Image Type",
      "Image Src",
      "Image Command",
      "Image Position",
      "Image Width",
      "Image Height",
      "Image Alt Text",
    ],
  },
  {
    group: "Inventory / Variants",
    columns: [
      "Variant Inventory Item ID",
      "Variant ID",
      "Variant Command",
      "Option1 Name",
      "Option1 Value",
      "Option2 Name",
      "Option2 Value",
      "Option3 Name",
      "Option3 Value",
      "Variant Position",
      "Variant SKU",
      "Variant Barcode",
      "Variant Image",
      "Variant Weight",
      "Variant Weight Unit",
      "Variant Price",
      "Variant Compare At Price",
      "Variant Taxable",
      "Variant Tax Code",
      "Variant Inventory Tracker",
      "Variant Inventory Policy",
      "Variant Fulfillment Service",
      "Variant Requires Shipping",
      "Variant Shipping Profile",
      "Variant Inventory Qty",
      "Variant Inventory Adjust",
      "Variant Cost",
    ],
  },
  {
    group: "Customs Information",
    speed: "Slow",
    columns: [
      "Variant HS Code",
      "Variant Country of Origin",
      "Variant Province of Origin",
    ],
  },
  {
    group: "Multi-Location Inventory Levels",
    speed: "Slow",
    columns: [
      "Inventory Available: ...",
      "Inventory Available Adjust: ...",
      "Inventory On Hand: ...",
      "Inventory On Hand Adjust: ...",
      "Inventory Committed: ...",
      "Inventory Reserved: ...",
      "Inventory Damaged: ...",
      "Inventory Damaged Adjust: ...",
      "Inventory Safety Stock: ...",
      "Inventory Safety Stock Adjust: ...",
      "Inventory Quality Control: ...",
      "Inventory Quality Control Adjust: ...",
      "Inventory Incoming: ...",
    ],
  },
  {
    group: "Pricing by Catalogs",
    speed: "Very Slow",
    columns: ["Included / ...", "Price / ...", "Compare At Price / ..."],
  },
  {
    group: "Metafields",
    speed: "Slow",
    columns: ["Metafield: ..."],
  },
  {
    group: "Variant Metafields",
    speed: "Very Slow",
    columns: ["Variant Metafield: ..."],
  },
];

const DEFAULT_ENTITY_COLUMNS: Record<EntityKey, string[]> = {
  products: ["ID", "Handle", "Title", "Status", "Vendor"],
  smart_collections: ["ID", "Title", "Handle", "Updated At"],
  custom_collections: ["ID", "Title", "Handle", "Updated At"],
  customers: ["ID", "First Name", "Last Name", "Email", "Tags"],
  companies: ["ID", "Name", "External ID", "Created At"],
  discounts: ["ID", "Title", "Status", "Starts At", "Ends At"],
  draft_orders: ["ID", "Name", "Status", "Created At"],
  orders: ["ID", "Name", "Financial Status", "Fulfillment Status", "Created At"],
  payouts: ["ID", "Status", "Issued At", "Amount"],
  pages: ["ID", "Handle", "Title", "Published At"],
  redirects: ["ID", "Path", "Target"],
  files: ["ID", "Alt", "Created At"],
  menus: ["ID", "Handle", "Title"],
  metaobjects: ["ID", "Type", "Handle", "Updated At"],
  shop: ["Name", "Email", "Domain", "Currency"],
};

function loadLocalPresets(): Array<{ name: string; config: ExportConfig }> {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem("export_presets_v4");
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveLocalPresets(presets: Array<{ name: string; config: ExportConfig }>) {
  if (typeof window === "undefined") return;
  localStorage.setItem("export_presets_v4", JSON.stringify(presets));
}

function pageStyle(): React.CSSProperties {
  return {
    minHeight: "100vh",
    padding: 24,
    background:
      "radial-gradient(circle at top left, #1d2940 0%, #0f172a 38%, #090e1a 100%)",
  };
}

function containerStyle(): React.CSSProperties {
  return {
    maxWidth: 1320,
    margin: "0 auto",
  };
}

function heroStyle(): React.CSSProperties {
  return {
    borderRadius: 28,
    padding: 28,
    marginBottom: 24,
    border: "1px solid rgba(255,255,255,0.10)",
    background:
      "linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(30,41,59,0.94) 45%, rgba(49,46,129,0.90) 100%)",
    boxShadow: "0 30px 80px rgba(0,0,0,0.32)",
    color: "#fff",
  };
}

function cardStyle(): React.CSSProperties {
  return {
    border: "1px solid rgba(226,232,240,0.9)",
    borderRadius: 22,
    padding: 20,
    background:
      "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.98) 100%)",
    marginBottom: 20,
    boxShadow: "0 14px 35px rgba(15,23,42,0.10)",
  };
}

function sectionTitleStyle(): React.CSSProperties {
  return {
    marginTop: 0,
    marginBottom: 16,
    fontSize: 24,
    fontWeight: 800,
    color: "#0f172a",
    letterSpacing: "-0.03em",
  };
}

function subTitleStyle(): React.CSSProperties {
  return {
    marginTop: 0,
    marginBottom: 12,
    fontSize: 17,
    fontWeight: 700,
    color: "#111827",
  };
}

function labelStyle(): React.CSSProperties {
  return {
    display: "block",
    fontWeight: 700,
    marginBottom: 8,
    fontSize: 12,
    color: "#475569",
    letterSpacing: "0.08em",
    textTransform: "uppercase",
  };
}

function inputStyle(): React.CSSProperties {
  return {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #dbe3ee",
    boxSizing: "border-box",
    fontSize: 14,
    background: "#fff",
    color: "#0f172a",
    boxShadow: "inset 0 1px 2px rgba(15,23,42,0.04)",
    outline: "none",
  };
}

function smallButtonStyle(disabled = false): React.CSSProperties {
  return {
    padding: "11px 16px",
    borderRadius: 12,
    border: "1px solid #d5deea",
    background: disabled
      ? "#e5e7eb"
      : "linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)",
    color: disabled ? "#94a3b8" : "#0f172a",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
    boxShadow: disabled ? "none" : "0 8px 20px rgba(15,23,42,0.06)",
  };
}

function primaryButtonStyle(disabled = false): React.CSSProperties {
  return {
    padding: "12px 18px",
    borderRadius: 12,
    border: "1px solid transparent",
    background: disabled
      ? "#94a3b8"
      : "linear-gradient(135deg, #0f172a 0%, #1d4ed8 55%, #7c3aed 100%)",
    color: "#fff",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 800,
    letterSpacing: "0.01em",
    boxShadow: disabled ? "none" : "0 16px 32px rgba(37,99,235,0.28)",
  };
}

function dangerButtonStyle(disabled = false): React.CSSProperties {
  return {
    padding: "11px 16px",
    borderRadius: 12,
    border: "1px solid #fecaca",
    background: disabled
      ? "#fee2e2"
      : "linear-gradient(180deg, #fff1f2 0%, #ffffff 100%)",
    color: disabled ? "#fca5a5" : "#b91c1c",
    cursor: disabled ? "not-allowed" : "pointer",
    fontWeight: 700,
    boxShadow: disabled ? "none" : "0 8px 20px rgba(127,29,29,0.06)",
  };
}

function tileStyle(active: boolean): React.CSSProperties {
  return {
    display: "flex",
    alignItems: "center",
    gap: 10,
    border: active ? "1px solid #c4b5fd" : "1px solid #e5e7eb",
    borderRadius: 14,
    padding: 12,
    background: active
      ? "linear-gradient(180deg, #faf5ff 0%, #f5f3ff 100%)"
      : "#ffffff",
    boxShadow: active ? "0 10px 24px rgba(124,58,237,0.10)" : "none",
  };
}

function softGroupStyle(): React.CSSProperties {
  return {
    border: "1px solid #edf2f7",
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    background: "rgba(255,255,255,0.72)",
  };
}

function badgeStyle(kind: "neutral" | "info" | "success"): React.CSSProperties {
  if (kind === "success") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: 12,
      fontWeight: 700,
      padding: "5px 10px",
      borderRadius: 999,
      color: "#065f46",
      background: "#ecfdf5",
      border: "1px solid #a7f3d0",
    };
  }

  if (kind === "info") {
    return {
      display: "inline-flex",
      alignItems: "center",
      gap: 8,
      fontSize: 12,
      fontWeight: 700,
      padding: "5px 10px",
      borderRadius: 999,
      color: "#3730a3",
      background: "#eef2ff",
      border: "1px solid #c7d2fe",
    };
  }

  return {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    fontSize: 12,
    fontWeight: 700,
    padding: "5px 10px",
    borderRadius: 999,
    color: "#475569",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  };
}

function helperTextStyle(): React.CSSProperties {
  return {
    fontSize: 13,
    color: "#64748b",
  };
}

function checkboxRowStyle(): React.CSSProperties {
  return {
    display: "flex",
    gap: 8,
    alignItems: "center",
    fontSize: 14,
    color: "#1f2937",
  };
}

function messageCardStyle(isError: boolean): React.CSSProperties {
  return {
    ...cardStyle(),
    border: isError ? "1px solid #fecaca" : "1px solid #bfdbfe",
    background: isError
      ? "linear-gradient(180deg, #fff1f2 0%, #ffffff 100%)"
      : "linear-gradient(180deg, #eff6ff 0%, #ffffff 100%)",
    color: isError ? "#991b1b" : "#1e3a8a",
    fontWeight: 700,
  };
}

function formatDateTime(value?: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

export default function ExportPage() {
  const [config, setConfig] = useState<ExportConfig>({
    presetName: "",
    format: "excel",
    selectedEntities: ["products"],
    selectedColumns: { products: DEFAULT_ENTITY_COLUMNS.products },
    filters: {},
    scheduleOnDate: "",
    scheduleOnTime: "00:00",
    timezone: "America/New_York",
    repeatEvery: 1,
    repeatUnit: "days",
    runUntil: "until_cancelled",
    runTimes: 1,
    customFileName: "Export_%Y-%m-%d_%H%M%S",
    fileNameTimeSource: "started_at",
    skipEmptyResults: true,
    uploadTo: "none",
    serverUrl: "",
    sorting: "shopify_order",
  });

  const [savedPresets, setSavedPresets] =
    useState<Array<{ name: string; config: ExportConfig }>>(loadLocalPresets);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [activeJob, setActiveJob] = useState<ExportJob | null>(null);
  const [schedules, setSchedules] = useState<ScheduledExport[]>([]);

  const selectedEntityObjects = useMemo(
    () => ENTITIES.filter((e) => config.selectedEntities.includes(e.key)),
    [config.selectedEntities],
  );

  const isBulkProductsOnly =
    config.selectedEntities.length === 1 && config.selectedEntities[0] === "products";

  const isErrorMessage =
    !!message &&
    /failed|error|denied|missing|not approved|access|unauthorized/i.test(message);

  useEffect(() => {
    if (!activeJob?.id) return;
    if (activeJob.status === "completed" || activeJob.status === "failed") return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(`/app/export-status?id=${encodeURIComponent(activeJob.id)}`);
        const text = await res.text();
        const data = JSON.parse(text);

        if (res.ok) {
          setActiveJob(data);
          if (data?.message) setMessage(data.message);
        }
      } catch {
        // ignore polling errors
      }
    }, 5000);

    return () => clearInterval(timer);
  }, [activeJob?.id, activeJob?.status]);

  useEffect(() => {
    refreshSchedules();
  }, []);

  async function refreshSchedules() {
    try {
      const res = await fetch("/app/export-schedules");
      const text = await res.text();
      const data = JSON.parse(text);
      if (Array.isArray(data)) {
        setSchedules(data);
      } else {
        setSchedules([]);
      }
    } catch {
      setSchedules([]);
    }
  }

  function updateConfig<K extends keyof ExportConfig>(key: K, value: ExportConfig[K]) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function toggleEntity(entity: EntityKey) {
    setConfig((prev) => {
      const exists = prev.selectedEntities.includes(entity);
      const selectedEntities = exists
        ? prev.selectedEntities.filter((x) => x !== entity)
        : [...prev.selectedEntities, entity];

      const selectedColumns = { ...prev.selectedColumns };
      if (!selectedColumns[entity]) {
        selectedColumns[entity] = DEFAULT_ENTITY_COLUMNS[entity] || [];
      }

      return { ...prev, selectedEntities, selectedColumns };
    });
  }

  function toggleColumn(entity: EntityKey, column: string) {
    setConfig((prev) => {
      const current = prev.selectedColumns[entity] || [];
      const exists = current.includes(column);

      return {
        ...prev,
        selectedColumns: {
          ...prev.selectedColumns,
          [entity]: exists
            ? current.filter((c) => c !== column)
            : [...current, column],
        },
      };
    });
  }

  function setEntityFilter(entity: EntityKey, value: string) {
    setConfig((prev) => ({
      ...prev,
      filters: {
        ...prev.filters,
        [entity]: value,
      },
    }));
  }

  function savePreset() {
    const name = config.presetName.trim();
    if (!name) {
      setMessage("Please enter a preset name.");
      return;
    }

    const next = [...savedPresets.filter((p) => p.name !== name), { name, config }];
    setSavedPresets(next);
    saveLocalPresets(next);
    setMessage(`Preset "${name}" saved locally.`);
  }

  function loadPreset(name: string) {
    const preset = savedPresets.find((p) => p.name === name);
    if (!preset) return;
    setConfig(preset.config);
    setMessage(`Preset "${name}" loaded.`);
  }

  function selectAllProductColumns() {
    const all = PRODUCT_COLUMN_GROUPS.flatMap((g) => g.columns);
    setConfig((prev) => ({
      ...prev,
      selectedColumns: { ...prev.selectedColumns, products: all },
    }));
  }

  function clearAllProductColumns() {
    setConfig((prev) => ({
      ...prev,
      selectedColumns: { ...prev.selectedColumns, products: [] },
    }));
  }

  function selectDefaultColumns(entity: EntityKey) {
    setConfig((prev) => ({
      ...prev,
      selectedColumns: {
        ...prev.selectedColumns,
        [entity]: DEFAULT_ENTITY_COLUMNS[entity] || [],
      },
    }));
  }

  function clearEntityColumns(entity: EntityKey) {
    setConfig((prev) => ({
      ...prev,
      selectedColumns: {
        ...prev.selectedColumns,
        [entity]: [],
      },
    }));
  }

  async function downloadBulkFile(jobId: string) {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        `/app/export-download?id=${encodeURIComponent(jobId)}`,
        {
          method: "GET",
          credentials: "same-origin",
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download export file.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const match = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || "export";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage(`Export downloaded: ${filename}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadScheduledFile(scheduleId: string) {
    try {
      setLoading(true);
      setMessage("");

      const response = await fetch(
        `/app/export-schedule-download?id=${encodeURIComponent(scheduleId)}`,
        {
          method: "GET",
          credentials: "same-origin",
        },
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(errorText || "Failed to download scheduled file.");
      }

      const blob = await response.blob();
      const contentDisposition = response.headers.get("Content-Disposition") || "";
      const match = contentDisposition.match(/filename="([^"]+)"/i);
      const filename = match?.[1] || "scheduled-export";

      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);

      setMessage(`Scheduled export downloaded: ${filename}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Download failed.");
    } finally {
      setLoading(false);
    }
  }

  async function downloadDirectFile() {
    const response = await fetch("/app/export-api", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || "Export failed.");
    }

    const blob = await response.blob();
    const contentDisposition = response.headers.get("Content-Disposition") || "";
    const match = contentDisposition.match(/filename="([^"]+)"/i);
    const filename = match?.[1] || "export";

    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);

    setMessage(`Export downloaded: ${filename}`);
  }

  async function startBulkExport() {
    const response = await fetch("/app/export-start", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(config),
    });

    const text = await response.text();
    const data = JSON.parse(text);

    if (!response.ok || !data.ok) {
      throw new Error(data?.message || "Failed to start bulk export.");
    }

    setMessage(data.message || "Bulk export job started.");

    if (data.jobId) {
      const statusRes = await fetch(`/app/export-status?id=${encodeURIComponent(data.jobId)}`);
      const statusText = await statusRes.text();
      const statusData = JSON.parse(statusText);
      if (statusRes.ok) {
        setActiveJob(statusData);
      }
    }
  }

  async function handleExportNow() {
    if (!config.selectedEntities.length) {
      setMessage("Please select at least one sheet.");
      return;
    }

    setLoading(true);
    setMessage("");
    setActiveJob(null);

    try {
      if (isBulkProductsOnly) {
        await startBulkExport();
      } else {
        await downloadDirectFile();
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Export failed.");
    } finally {
      setLoading(false);
    }
  }

  async function saveSchedule() {
    if (!config.scheduleOnDate || !config.scheduleOnTime || !config.timezone) {
      setMessage("Please set schedule date, time, and timezone first.");
      return;
    }

    try {
      setLoading(true);
      setMessage("");

      const res = await fetch("/app/export-schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "create",
          config,
        }),
      });

      const text = await res.text();
      const data = JSON.parse(text);

      if (!res.ok || !data.ok) {
        setMessage(data?.message || "Failed to save schedule.");
        return;
      }

      setMessage("Schedule saved.");
      await refreshSchedules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to save schedule.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleSchedule(id: string, enabled: boolean) {
    try {
      const res = await fetch("/app/export-schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "toggle",
          id,
          enabled,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to update schedule.");
      }

      await refreshSchedules();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to update schedule.");
    }
  }

  async function deleteSchedule(id: string) {
    try {
      const res = await fetch("/app/export-schedules", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "delete",
          id,
        }),
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "Failed to delete schedule.");
      }

      await refreshSchedules();
      setMessage("Schedule deleted.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Failed to delete schedule.");
    }
  }

  function renderEntityColumns(entity: EntityKey) {
    if (entity === "products") {
      const selected = config.selectedColumns.products || [];

      return (
        <div style={cardStyle()} key={entity}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 16,
            }}
          >
            <h3 style={subTitleStyle()}>Products</h3>
            <span style={badgeStyle("info")}>{selected.length} columns selected</span>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label style={labelStyle()}>Set Filters</label>
            <input
              style={inputStyle()}
              value={config.filters.products || ""}
              onChange={(e) => setEntityFilter("products", e.target.value)}
              placeholder="e.g. status:active AND tag:winter"
            />
          </div>

          <div
            style={{
              display: "flex",
              gap: 12,
              marginBottom: 18,
              flexWrap: "wrap",
              alignItems: "center",
            }}
          >
            <button type="button" style={smallButtonStyle()} onClick={selectAllProductColumns}>
              Select all product columns
            </button>
            <button type="button" style={smallButtonStyle()} onClick={clearAllProductColumns}>
              Clear all product columns
            </button>
          </div>

          {PRODUCT_COLUMN_GROUPS.map((group) => (
            <div key={group.group} style={softGroupStyle()}>
              <div
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "center",
                  marginBottom: 12,
                  flexWrap: "wrap",
                }}
              >
                <strong style={{ color: "#0f172a" }}>{group.group}</strong>
                {group.speed ? <span style={badgeStyle("neutral")}>{group.speed}</span> : null}
                <span style={helperTextStyle()}>{group.columns.length} columns</span>
              </div>

              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
                  gap: 10,
                }}
              >
                {group.columns.map((column) => (
                  <label key={column} style={checkboxRowStyle()}>
                    <input
                      type="checkbox"
                      checked={selected.includes(column)}
                      onChange={() => toggleColumn("products", column)}
                    />
                    <span>{column}</span>
                  </label>
                ))}
              </div>
            </div>
          ))}
        </div>
      );
    }

    const label = ENTITIES.find((e) => e.key === entity)?.label || entity;
    const selected = config.selectedColumns[entity] || [];
    const defaults = DEFAULT_ENTITY_COLUMNS[entity] || [];

    return (
      <div style={cardStyle()} key={entity}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "center",
            flexWrap: "wrap",
            marginBottom: 16,
          }}
        >
          <h3 style={subTitleStyle()}>{label}</h3>
          <span style={badgeStyle("info")}>{selected.length} columns selected</span>
        </div>

        <div style={{ marginBottom: 16 }}>
          <label style={labelStyle()}>Set Filters</label>
          <input
            style={inputStyle()}
            value={config.filters[entity] || ""}
            onChange={(e) => setEntityFilter(entity, e.target.value)}
            placeholder={`Optional filters for ${label}`}
          />
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            marginBottom: 16,
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <button
            type="button"
            style={smallButtonStyle()}
            onClick={() => selectDefaultColumns(entity)}
          >
            Select default columns
          </button>
          <button
            type="button"
            style={smallButtonStyle()}
            onClick={() => clearEntityColumns(entity)}
          >
            Clear columns
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            gap: 10,
          }}
        >
          {defaults.map((column) => (
            <label key={column} style={checkboxRowStyle()}>
              <input
                type="checkbox"
                checked={selected.includes(column)}
                onChange={() => toggleColumn(entity, column)}
              />
              <span>{column}</span>
            </label>
          ))}
        </div>
      </div>
    );
  }

  const activeEntities = Object.entries(activeJob?.entities || {});

  return (
    <div style={pageStyle()}>
      <div style={containerStyle()}>
        <div style={heroStyle()}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: 20,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div
                style={{
                  display: "inline-block",
                  marginBottom: 14,
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "rgba(255,255,255,0.08)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "#cbd5e1",
                  fontSize: 12,
                  fontWeight: 800,
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                }}
              >
                Premium Export Studio
              </div>

              <h1
                style={{
                  fontSize: 40,
                  lineHeight: 1.02,
                  margin: "0 0 10px 0",
                  letterSpacing: "-0.05em",
                }}
              >
                Export
              </h1>

              <p
                style={{
                  margin: 0,
                  maxWidth: 760,
                  color: "#cbd5e1",
                  fontSize: 16,
                  lineHeight: 1.65,
                }}
              >
                Build polished presets, choose formats, select sheets, pick columns,
                schedule exports, and generate files with a richer workflow.
              </p>
            </div>

            <div style={badgeStyle(loading ? "info" : "success")}>
              <span>●</span>
              <span>{loading ? "Working..." : "Ready"}</span>
            </div>
          </div>
        </div>

        {message ? <div style={messageCardStyle(isErrorMessage)}>{message}</div> : null}

        <div style={cardStyle()}>
          <h2 style={sectionTitleStyle()}>Preset</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr auto auto auto",
              gap: 12,
              alignItems: "end",
            }}
          >
            <div>
              <label style={labelStyle()}>Preset name</label>
              <input
                style={inputStyle()}
                value={config.presetName}
                onChange={(e) => updateConfig("presetName", e.target.value)}
                placeholder="e.g. Full store export"
              />
            </div>

            <div>
              <label style={labelStyle()}>Load saved preset</label>
              <select
                style={inputStyle()}
                defaultValue=""
                onChange={(e) => {
                  if (e.target.value) loadPreset(e.target.value);
                }}
              >
                <option value="">Select preset</option>
                {savedPresets.map((preset) => (
                  <option key={preset.name} value={preset.name}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

            <button type="button" style={smallButtonStyle()} onClick={savePreset}>
              Save preset
            </button>

            <button
              type="button"
              style={smallButtonStyle(loading)}
              onClick={saveSchedule}
              disabled={loading}
            >
              Save schedule
            </button>

            <button
              type="button"
              style={primaryButtonStyle(loading)}
              onClick={handleExportNow}
              disabled={loading}
            >
              {loading
                ? "Starting..."
                : isBulkProductsOnly
                  ? "Start bulk export"
                  : "Export now"}
            </button>
          </div>
        </div>

        <div style={cardStyle()}>
          <h2 style={sectionTitleStyle()}>Format</h2>

          <div style={{ maxWidth: 340 }}>
            <label style={labelStyle()}>Export format</label>
            <select
              style={inputStyle()}
              value={config.format}
              onChange={(e) => updateConfig("format", e.target.value as ExportFormat)}
            >
              <option value="excel">Excel</option>
              <option value="csv">CSV</option>
              <option value="google_shopping_feed">Google Shopping Data Feed</option>
              <option value="json">JSON</option>
            </select>
          </div>
        </div>

        <div style={cardStyle()}>
          <h2 style={sectionTitleStyle()}>Select Sheets</h2>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
              gap: 12,
            }}
          >
            {ENTITIES.map((entity) => (
              <label
                key={entity.key}
                style={tileStyle(config.selectedEntities.includes(entity.key))}
              >
                <input
                  type="checkbox"
                  checked={config.selectedEntities.includes(entity.key)}
                  onChange={() => toggleEntity(entity.key)}
                />
                <span style={{ fontWeight: 600, color: "#111827" }}>{entity.label}</span>
              </label>
            ))}
          </div>
        </div>

        <div>{selectedEntityObjects.map((entity) => renderEntityColumns(entity.key))}</div>

        <div style={cardStyle()}>
          <h2 style={sectionTitleStyle()}>Options</h2>

          <div style={{ marginBottom: 28 }}>
            <h3 style={subTitleStyle()}>Scheduling</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 220px 220px",
                gap: 12,
                alignItems: "end",
                marginBottom: 16,
              }}
            >
              <div>
                <label style={labelStyle()}>Schedule on</label>
                <input
                  type="date"
                  style={inputStyle()}
                  value={config.scheduleOnDate}
                  onChange={(e) => updateConfig("scheduleOnDate", e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle()}>At</label>
                <input
                  type="time"
                  style={inputStyle()}
                  value={config.scheduleOnTime}
                  onChange={(e) => updateConfig("scheduleOnTime", e.target.value)}
                />
              </div>

              <div>
                <label style={labelStyle()}>Timezone</label>
                <select
                  style={inputStyle()}
                  value={config.timezone}
                  onChange={(e) => updateConfig("timezone", e.target.value)}
                >
                  <option value="America/New_York">America/New_York</option>
                  <option value="Europe/London">Europe/London</option>
                  <option value="Europe/Zurich">Europe/Zurich</option>
                  <option value="UTC">UTC</option>
                </select>
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "160px 200px 220px 140px",
                gap: 12,
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelStyle()}>Repeat every</label>
                <input
                  type="number"
                  min={1}
                  style={inputStyle()}
                  value={config.repeatEvery}
                  onChange={(e) => updateConfig("repeatEvery", Number(e.target.value) || 1)}
                />
              </div>

              <div>
                <label style={labelStyle()}>Unit</label>
                <select
                  style={inputStyle()}
                  value={config.repeatUnit}
                  onChange={(e) => updateConfig("repeatUnit", e.target.value as ScheduleUnit)}
                >
                  <option value="days">days</option>
                  <option value="weeks">weeks</option>
                  <option value="months">months</option>
                </select>
              </div>

              <div>
                <label style={labelStyle()}>Run</label>
                <select
                  style={inputStyle()}
                  value={config.runUntil}
                  onChange={(e) =>
                    updateConfig("runUntil", e.target.value as "until_cancelled" | "times")
                  }
                >
                  <option value="until_cancelled">until cancelled</option>
                  <option value="times">specific number of times</option>
                </select>
              </div>

              {config.runUntil === "times" ? (
                <div>
                  <label style={labelStyle()}>Times</label>
                  <input
                    type="number"
                    min={1}
                    style={inputStyle()}
                    value={config.runTimes}
                    onChange={(e) => updateConfig("runTimes", Number(e.target.value) || 1)}
                  />
                </div>
              ) : (
                <div />
              )}
            </div>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h3 style={subTitleStyle()}>Results File</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "2fr 1fr",
                gap: 12,
                alignItems: "end",
                marginBottom: 16,
              }}
            >
              <div>
                <label style={labelStyle()}>Custom file name</label>
                <input
                  style={inputStyle()}
                  value={config.customFileName}
                  onChange={(e) => updateConfig("customFileName", e.target.value)}
                  placeholder="Export_%Y-%m-%d_%H%M%S"
                />
                <div style={{ ...helperTextStyle(), marginTop: 8 }}>
                  Dynamic placeholders: %Y %m %d %H %M %S
                </div>
              </div>

              <div>
                <label style={labelStyle()}>File name time source</label>
                <select
                  style={inputStyle()}
                  value={config.fileNameTimeSource}
                  onChange={(e) =>
                    updateConfig(
                      "fileNameTimeSource",
                      e.target.value as "started_at" | "completed_at",
                    )
                  }
                >
                  <option value="started_at">Started At (Default)</option>
                  <option value="completed_at">Completed At</option>
                </select>
              </div>
            </div>

            <label style={checkboxRowStyle()}>
              <input
                type="checkbox"
                checked={config.skipEmptyResults}
                onChange={(e) => updateConfig("skipEmptyResults", e.target.checked)}
              />
              <span>Do not generate Results file if there is no data</span>
            </label>
          </div>

          <div style={{ marginBottom: 28 }}>
            <h3 style={subTitleStyle()}>Upload to</h3>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "280px 1fr",
                gap: 12,
                alignItems: "end",
              }}
            >
              <div>
                <label style={labelStyle()}>Destination</label>
                <select
                  style={inputStyle()}
                  value={config.uploadTo}
                  onChange={(e) => updateConfig("uploadTo", e.target.value as "none" | "server")}
                >
                  <option value="none">None</option>
                  <option value="server">Servers</option>
                </select>
              </div>

              {config.uploadTo === "server" ? (
                <div>
                  <label style={labelStyle()}>Full URL</label>
                  <input
                    style={inputStyle()}
                    value={config.serverUrl}
                    onChange={(e) => updateConfig("serverUrl", e.target.value)}
                    placeholder="scheme://user:password@server:port/path/to/folder/"
                  />
                </div>
              ) : (
                <div />
              )}
            </div>
          </div>

          <div>
            <h3 style={subTitleStyle()}>Sorting</h3>

            <div style={{ maxWidth: 560 }}>
              <label style={labelStyle()}>Export items sorted</label>
              <select
                style={inputStyle()}
                value={config.sorting}
                onChange={(e) =>
                  updateConfig(
                    "sorting",
                    e.target.value as
                      | "shopify_order"
                      | "title_asc"
                      | "title_desc"
                      | "created_desc",
                  )
                }
              >
                <option value="shopify_order">
                  Export items sorted in the order as they come from Shopify
                </option>
                <option value="title_asc">Title A → Z</option>
                <option value="title_desc">Title Z → A</option>
                <option value="created_desc">Newest first</option>
              </select>
            </div>
          </div>
        </div>

        <div style={cardStyle()}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "center",
              flexWrap: "wrap",
              marginBottom: 14,
            }}
          >
            <h2 style={sectionTitleStyle()}>Scheduled Exports</h2>
            <span style={badgeStyle("info")}>{schedules.length} saved</span>
          </div>

          {!schedules.length ? (
            <div style={helperTextStyle()}>No schedules saved yet.</div>
          ) : (
            <div style={{ display: "grid", gap: 12 }}>
              {schedules.map((schedule) => (
                <div key={schedule.id} style={softGroupStyle()}>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "flex-start",
                      gap: 12,
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: 800,
                          color: "#111827",
                          marginBottom: 6,
                        }}
                      >
                        {schedule.id}
                      </div>

                      <div style={helperTextStyle()}>
                        Next run: {formatDateTime(schedule.nextRunAt)}
                      </div>
                      <div style={helperTextStyle()}>
                        Last run: {formatDateTime(schedule.lastRunAt)}
                      </div>
                      <div style={helperTextStyle()}>
                        Runs completed: {schedule.runCount}
                      </div>
                      <div style={helperTextStyle()}>
                        Remaining runs:{" "}
                        {schedule.remainingRuns == null ? "Unlimited" : schedule.remainingRuns}
                      </div>
                      <div style={helperTextStyle()}>
                        Status: {schedule.lastStatus || "idle"}
                      </div>
                      <div style={helperTextStyle()}>
                        Message: {schedule.lastMessage || "—"}
                      </div>
                      {schedule.lastBulkJobId ? (
                        <div style={helperTextStyle()}>
                          Bulk job: {schedule.lastBulkJobId}
                        </div>
                      ) : null}
                      {schedule.lastResultFileName ? (
                        <div style={helperTextStyle()}>
                          Latest file: {schedule.lastResultFileName}
                        </div>
                      ) : null}
                    </div>

                    <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        style={smallButtonStyle()}
                        onClick={() => toggleSchedule(schedule.id, !schedule.enabled)}
                      >
                        {schedule.enabled ? "Disable" : "Enable"}
                      </button>

                      {schedule.lastResultFileName ? (
                        <button
                          type="button"
                          style={primaryButtonStyle(loading)}
                          onClick={() => downloadScheduledFile(schedule.id)}
                          disabled={loading}
                        >
                          {loading ? "Downloading..." : "Download latest file"}
                        </button>
                      ) : null}

                      <button
                        type="button"
                        style={dangerButtonStyle()}
                        onClick={() => deleteSchedule(schedule.id)}
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {activeJob ? (
          <div style={cardStyle()}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: 14,
              }}
            >
              <h2 style={sectionTitleStyle()}>Bulk Export Job</h2>
              <span
                style={badgeStyle(
                  activeJob.status === "completed"
                    ? "success"
                    : activeJob.status === "failed"
                      ? "neutral"
                      : "info",
                )}
              >
                {activeJob.status}
              </span>
            </div>

            <div style={{ marginBottom: 8, color: "#0f172a" }}>
              <strong>Job ID:</strong> {activeJob.id}
            </div>
            <div style={{ marginBottom: 16, color: "#0f172a" }}>
              <strong>Message:</strong> {activeJob.message || ""}
            </div>

            {activeEntities.length ? (
              <div style={{ marginBottom: 16 }}>
                {activeEntities.map(([entity, state]) => (
                  <div key={entity} style={{ ...softGroupStyle(), marginBottom: 10 }}>
                    <strong style={{ color: "#111827" }}>{entity}</strong>:{" "}
                    {state?.status || "unknown"}
                    {state?.objectCount ? ` · objects ${state.objectCount}` : ""}
                    {state?.errorCode ? ` · error ${state.errorCode}` : ""}
                  </div>
                ))}
              </div>
            ) : null}

            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              <button
                type="button"
                style={smallButtonStyle()}
                onClick={async () => {
                  if (!activeJob?.id) return;
                  const res = await fetch(`/app/export-status?id=${encodeURIComponent(activeJob.id)}`);
                  const text = await res.text();
                  const data = JSON.parse(text);
                  if (res.ok) {
                    setActiveJob(data);
                    setMessage(data?.message || "");
                  }
                }}
              >
                Refresh job
              </button>

              {activeJob.status === "completed" ? (
                <button
                  type="button"
                  style={primaryButtonStyle(loading)}
                  onClick={() => downloadBulkFile(activeJob.id)}
                  disabled={loading}
                >
                  {loading
                    ? "Downloading..."
                    : `Download ${activeJob.finalFileName || "export"}`}
                </button>
              ) : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}