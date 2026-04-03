import { useEffect, useMemo, useRef, useState } from "react";

type EntityType = "products" | "variants" | "customers";

type Row = Record<string, any> & {
  id: string;
};

type Column = {
  key: string;
  label: string;
  width?: number;
  editable?: boolean;
  type?: "text" | "number" | "boolean" | "select";
  options?: Array<{ label: string; value: string }>;
  highlight?: boolean;
};

const PRODUCT_COLUMNS: Column[] = [
  { key: "image", label: "Image", width: 88 },
  { key: "title", label: "Title", width: 220, editable: true, type: "text" },
  { key: "handle", label: "Handle", width: 160 },
  {
    key: "status",
    label: "Status",
    width: 120,
    editable: true,
    type: "select",
    options: [
      { label: "ACTIVE", value: "ACTIVE" },
      { label: "DRAFT", value: "DRAFT" },
      { label: "ARCHIVED", value: "ARCHIVED" },
    ],
  },
  { key: "vendor", label: "Vendor", width: 150, editable: true, type: "text" },
  { key: "productType", label: "Type", width: 150, editable: true, type: "text", highlight: true },
  { key: "tags", label: "Tags", width: 220, editable: true, type: "text", highlight: true },
  { key: "price", label: "Price", width: 100, editable: true, type: "number", highlight: true },
  {
    key: "compareAtPrice",
    label: "Compare At",
    width: 120,
    editable: true,
    type: "number",
  },
  { key: "sku", label: "SKU", width: 130, editable: true, type: "text" },
  { key: "barcode", label: "Barcode", width: 140, editable: true, type: "text" },
  {
    key: "totalInventory",
    label: "Inventory",
    width: 110,
    editable: true,
    type: "number",
    highlight: true,
  },
  {
    key: "taxable",
    label: "Taxable",
    width: 95,
    editable: true,
    type: "boolean",
  },
  {
    key: "tracked",
    label: "Tracked",
    width: 95,
    editable: true,
    type: "boolean",
  },
  {
    key: "requiresShipping",
    label: "Shipping",
    width: 110,
    editable: true,
    type: "boolean",
  },
  {
    key: "inventoryPolicy",
    label: "Inventory Policy",
    width: 135,
    editable: true,
    type: "select",
    options: [
      { label: "DENY", value: "DENY" },
      { label: "CONTINUE", value: "CONTINUE" },
    ],
  },
  { key: "locationName", label: "Location", width: 150 },
  { key: "updatedAt", label: "Updated", width: 160 },
];

const VARIANT_COLUMNS: Column[] = [
  { key: "image", label: "Image", width: 88 },
  { key: "productTitle", label: "Product", width: 220 },
  { key: "title", label: "Variant", width: 170 },
  { key: "sku", label: "SKU", width: 130, editable: true, type: "text" },
  { key: "price", label: "Price", width: 100, editable: true, type: "number", highlight: true },
  {
    key: "compareAtPrice",
    label: "Compare At",
    width: 120,
    editable: true,
    type: "number",
  },
  { key: "barcode", label: "Barcode", width: 140, editable: true, type: "text" },
  { key: "available", label: "Available", width: 105, editable: true, type: "number", highlight: true },
  { key: "onHand", label: "On Hand", width: 105 },
  {
    key: "taxable",
    label: "Taxable",
    width: 95,
    editable: true,
    type: "boolean",
  },
  {
    key: "tracked",
    label: "Tracked",
    width: 95,
    editable: true,
    type: "boolean",
  },
  {
    key: "requiresShipping",
    label: "Shipping",
    width: 110,
    editable: true,
    type: "boolean",
  },
  {
    key: "inventoryPolicy",
    label: "Inventory Policy",
    width: 135,
    editable: true,
    type: "select",
    options: [
      { label: "DENY", value: "DENY" },
      { label: "CONTINUE", value: "CONTINUE" },
    ],
  },
  { key: "locationName", label: "Location", width: 150 },
  { key: "productStatus", label: "Product Status", width: 130 },
];

const CUSTOMER_COLUMNS: Column[] = [
  { key: "title", label: "Name", width: 220 },
  { key: "email", label: "Email", width: 220 },
  { key: "phone", label: "Phone", width: 160 },
  { key: "state", label: "State", width: 100 },
  { key: "tags", label: "Tags", width: 220, editable: true, type: "text", highlight: true },
  { key: "numberOfOrders", label: "Orders", width: 90 },
  { key: "createdAt", label: "Created", width: 160 },
];

function getColumns(entity: EntityType) {
  if (entity === "products") return PRODUCT_COLUMNS;
  if (entity === "variants") return VARIANT_COLUMNS;
  return CUSTOMER_COLUMNS;
}

function stringifyCell(value: unknown) {
  if (value == null) return "";
  if (Array.isArray(value)) return value.join(", ");
  if (typeof value === "boolean") return value ? "true" : "false";
  return String(value);
}

function parseCsv(text: string) {
  const rows: string[][] = [];
  let current = "";
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(current);
      current = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      row.push(current);
      current = "";
      if (row.some((x) => x !== "")) rows.push(row);
      row = [];
      continue;
    }

    current += char;
  }

  row.push(current);
  if (row.some((x) => x !== "")) rows.push(row);

  if (!rows.length) return [];

  const headers = rows[0].map((h) => h.trim());
  return rows.slice(1).map((r) => {
    const obj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      obj[h] = r[idx] ?? "";
    });
    return obj;
  });
}

export default function BulkEditPage() {
  const [entity, setEntity] = useState<EntityType>("products");
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [edited, setEdited] = useState<Record<string, Record<string, any>>>({});
  const [bulkField, setBulkField] = useState("");
  const [bulkValue, setBulkValue] = useState("");
  const [csvFileName, setCsvFileName] = useState("");
  const [dragging, setDragging] = useState(false);
  const [dragMode, setDragMode] = useState<"select" | "unselect">("select");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const columns = useMemo(() => getColumns(entity), [entity]);

  useEffect(() => {
    loadRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  useEffect(() => {
    function stopDragging() {
      setDragging(false);
    }
    window.addEventListener("mouseup", stopDragging);
    return () => window.removeEventListener("mouseup", stopDragging);
  }, []);

  useEffect(() => {
    const editable = columns.filter((c) => c.editable);
    setBulkField(editable[0]?.key || "");
    setBulkValue("");
    setSelectedIds([]);
    setEdited({});
    setFilters({});
  }, [columns]);

  async function loadRows() {
    setLoading(true);
    setMessage("");

    try {
      const res = await fetch("/app/bulk-edit-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "list", entity, search }),
      });

      const data = await res.json();
if (!res.ok || !data.ok) {
  if ((data?.code === "PLAN_REQUIRED" || data?.code === "PLAN_LIMIT") && data?.upgradeUrl) {
    window.location.href = data.upgradeUrl;
    return;
  }
  throw new Error(data.message || "Failed to load rows.");
}

      setRows(data.rows || []);
      setSelectedIds([]);
      setEdited({});
      setMessage(`Loaded ${data.count || 0} ${entity}.`);
    } catch (error) {
      setRows([]);
      setMessage(error instanceof Error ? error.message : "Failed to load rows.");
    } finally {
      setLoading(false);
    }
  }

  function setRowEdit(id: string, key: string, value: any) {
    setEdited((prev) => ({
      ...prev,
      [id]: {
        ...(prev[id] || {}),
        [key]: value,
      },
    }));
  }

  function getCellValue(row: Row, key: string) {
    if (edited[row.id] && key in edited[row.id]) {
      return edited[row.id][key];
    }
    return row[key];
  }

  function applyBulkValueToSelected() {
    if (!bulkField || !selectedIds.length) {
      setMessage("Select rows and choose a field first.");
      return;
    }

    const column = columns.find((c) => c.key === bulkField);
    const isSpecialTagField =
      bulkField === "addTags" || bulkField === "removeTags" || bulkField === "tags";

    if (!column?.editable && !isSpecialTagField) {
      setMessage("That field is not editable.");
      return;
    }

    setEdited((prev) => {
      const next = { ...prev };

      for (const id of selectedIds) {
        next[id] = {
          ...(next[id] || {}),
          [bulkField]:
            column?.type === "boolean"
              ? bulkValue === "true"
              : column?.type === "number"
                ? bulkValue
                : bulkValue,
        };

        const row = rows.find((r) => r.id === id);
        if (row?.locationId) {
          next[id].locationId = row.locationId;
        }
      }

      return next;
    });

    setMessage(`Prepared "${bulkField}" for ${selectedIds.length} selected rows.`);
  }

  async function saveSelected() {
    if (!selectedIds.length) {
      setMessage("Select at least one row.");
      return;
    }

    setSaving(true);
    setMessage("");

    try {
      const perRowDiffs = selectedIds.map((id) => ({
        id,
        changes: edited[id] || {},
      }));

      for (const item of perRowDiffs) {
        if (!Object.keys(item.changes).length) continue;

        const res = await fetch("/app/bulk-edit-api", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            mode: "apply",
            entity,
            ids: [item.id],
            changes: item.changes,
          }),
        });

        const data = await res.json();
        if (!res.ok || !data.ok) {
  if (data?.code === "PLAN_REQUIRED" && data?.upgradeUrl) {
    window.location.href = data.upgradeUrl;
    return;
  }
  throw new Error(data.message || "Request failed.");
}
      }

      setMessage(`Saved ${selectedIds.length} ${entity}.`);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function uploadCsv(file: File) {
    try {
      const text = await file.text();
      const parsedRows = parseCsv(text);

      if (!parsedRows.length) {
        throw new Error("CSV is empty.");
      }

      setSaving(true);
      const res = await fetch("/app/bulk-edit-api", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "csv-apply",
          entity,
          rows: parsedRows,
        }),
      });

      const data = await res.json();
if (!res.ok || !data.ok) {
  if (data?.code === "PLAN_REQUIRED" && data?.upgradeUrl) {
    window.location.href = data.upgradeUrl;
    return;
  }
  throw new Error(data.message || "Request failed.");
}

      setMessage(data.message);
      await loadRows();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "CSV apply failed.");
    } finally {
      setSaving(false);
    }
  }

  function toggleRow(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleDragStart(id: string) {
    const alreadySelected = selectedIds.includes(id);
    setDragMode(alreadySelected ? "unselect" : "select");
    setDragging(true);

    setSelectedIds((prev) =>
      alreadySelected ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function handleDragEnter(id: string) {
    if (!dragging) return;

    setSelectedIds((prev) => {
      if (dragMode === "select") {
        return prev.includes(id) ? prev : [...prev, id];
      }
      return prev.filter((x) => x !== id);
    });
  }

  function toggleAllVisible(filteredRows: Row[]) {
    const visibleIds = filteredRows.map((r) => r.id);
    const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));

    setSelectedIds((prev) => {
      if (allVisibleSelected) {
        return prev.filter((id) => !visibleIds.includes(id));
      }
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      for (const [key, needle] of Object.entries(filters)) {
        if (!needle) continue;
        const value = stringifyCell(getCellValue(row, key)).toLowerCase();
        if (!value.includes(needle.toLowerCase())) return false;
      }
      return true;
    });
  }, [rows, filters, edited]);

  const editableColumns = useMemo(
    () => columns.filter((c) => c.editable),
    [columns],
  );

  const bulkFieldOptions = useMemo(() => {
    const base = editableColumns.map((c) => ({
      key: c.key,
      label: c.label,
    }));

    if (entity === "products") {
      return [
        ...base,
        { key: "addTags", label: "Add tags" },
        { key: "removeTags", label: "Remove tags" },
      ];
    }

    if (entity === "customers") {
      return [
        ...base,
        { key: "addTags", label: "Add tags" },
        { key: "removeTags", label: "Remove tags" },
      ];
    }

    return base;
  }, [editableColumns, entity]);

  const visibleSelectedCount = filteredRows.filter((r) => selectedIds.includes(r.id)).length;
  const allVisibleSelected =
    filteredRows.length > 0 &&
    filteredRows.every((r) => selectedIds.includes(r.id));

  function renderCell(row: Row, col: Column) {
    const value = getCellValue(row, col.key);

    if (col.key === "image") {
      return row.image ? (
        <img
          src={row.image}
          alt={row.title || "Product"}
          style={imageThumbStyle}
        />
      ) : (
        <div style={imagePlaceholderStyle}>—</div>
      );
    }

    if (!col.editable) {
      if (Array.isArray(value)) {
        return (
          <div style={tagWrapStyle}>
            {value.length
              ? value.map((tag) => (
                  <span key={tag} style={tagStyle}>
                    {tag}
                  </span>
                ))
              : <span style={mutedMiniStyle}>—</span>}
          </div>
        );
      }

      if (typeof value === "boolean") {
        return <span style={value ? goodPillStyle : grayPillStyle}>{value ? "True" : "False"}</span>;
      }

      return <span>{stringifyCell(value) || "—"}</span>;
    }

    if (col.type === "boolean") {
      return (
        <select
          value={String(Boolean(value))}
          onChange={(e) => setRowEdit(row.id, col.key, e.target.value === "true")}
          style={cellInputStyle}
        >
          <option value="true">True</option>
          <option value="false">False</option>
        </select>
      );
    }

    if (col.type === "select") {
      return (
        <select
          value={stringifyCell(value)}
          onChange={(e) => setRowEdit(row.id, col.key, e.target.value)}
          style={cellInputStyle}
        >
          {(col.options || []).map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
      );
    }

    return (
      <input
        value={stringifyCell(value)}
        onChange={(e) => setRowEdit(row.id, col.key, e.target.value)}
        type={col.type === "number" ? "number" : "text"}
        style={{
          ...cellInputStyle,
          background: col.highlight ? "#fff8c5" : "#fffdf2",
        }}
      />
    );
  }

  return (
    <div style={outerAppShellStyle}>
      <div ref={containerRef} style={pageStyle}>
        <div style={heroStyle}>
          <div>
            <div style={eyebrowStyle}>Premium bulk editing studio</div>
            <h1 style={heroTitleStyle}>Bulk Edit</h1>
            <p style={heroTextStyle}>
              Product images, editable tags, editable price, editable inventory, drag select,
              filters, CSV updates, and a much larger spreadsheet-style grid.
            </p>
          </div>

          <div style={heroStatsWrapStyle}>
            <div style={heroStatCardStyle}>
              <div style={heroStatNumberStyle}>{rows.length}</div>
              <div style={heroStatLabelStyle}>Loaded rows</div>
            </div>
            <div style={heroStatCardStyle}>
              <div style={heroStatNumberStyle}>{selectedIds.length}</div>
              <div style={heroStatLabelStyle}>Selected rows</div>
            </div>
            <div style={heroStatCardStyle}>
              <div style={heroStatNumberStyle}>{Object.keys(edited).length}</div>
              <div style={heroStatLabelStyle}>Edited rows</div>
            </div>
          </div>
        </div>

        {message ? (
          <div style={/failed|error|denied|scope|empty/i.test(message) ? warningBoxStyle : infoBoxStyle}>
            {message}
          </div>
        ) : null}

        <div style={controlsGridStyle}>
          <section style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>Data source</h2>
                <p style={sectionTextStyle}>
                  Load products, variants, or customers with server-side pagination.
                </p>
              </div>
              <span style={badgeBlueStyle}>{entity}</span>
            </div>

            <div style={tabsStyle}>
              {(["products", "variants", "customers"] as EntityType[]).map((key) => (
                <button
                  key={key}
                  onClick={() => setEntity(key)}
                  style={tabButtonStyle(entity === key)}
                >
                  {key}
                </button>
              ))}
            </div>

            <div style={{ marginTop: 12 }}>
              <label style={labelStyle}>Global Shopify search</label>
              <div style={searchRowStyle}>
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={
                    entity === "products"
                      ? "status:active OR title:banana"
                      : entity === "variants"
                        ? "sku:BNN*"
                        : "email:gmail.com"
                  }
                  style={inputStyle}
                />
                <button onClick={loadRows} style={primaryButtonStyle(loading)} disabled={loading}>
                  {loading ? "Loading..." : "Load all"}
                </button>
              </div>
            </div>

            <div style={miniHelpStyle}>
              Free plan: import up to 100 rows. Upgrade to unlock unlimited imports and premium bulk actions.
            </div>
          </section>

          <section style={cardStyle}>
            <div style={cardHeaderStyle}>
              <div>
                <h2 style={sectionTitleStyle}>Bulk tools</h2>
                <p style={sectionTextStyle}>
                  Apply one value to selected rows. Helpful for stock, price, tags, SKU, vendor,
                  barcode, type, and more.
                </p>
              </div>
              <span style={badgePurpleStyle}>Excel-like</span>
            </div>

            <div style={formGridStyle}>
              <div>
                <label style={labelStyle}>Field</label>
                <select
                  value={bulkField}
                  onChange={(e) => setBulkField(e.target.value)}
                  style={inputStyle}
                >
                  {bulkFieldOptions.map((opt) => (
                    <option key={opt.key} value={opt.key}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={labelStyle}>Value</label>
                <input
                  value={bulkValue}
                  onChange={(e) => setBulkValue(e.target.value)}
                  placeholder={
                    bulkField === "addTags" || bulkField === "removeTags" || bulkField === "tags"
                      ? "tag1, tag2"
                      : bulkField === "totalInventory" || bulkField === "available"
                        ? "100"
                        : "Enter a value"
                  }
                  style={inputStyle}
                />
              </div>
            </div>

            <div style={buttonRowStyle}>
              <button
                onClick={applyBulkValueToSelected}
                style={secondaryButtonStyle(!selectedIds.length)}
                disabled={!selectedIds.length}
              >
                Apply value to selected
              </button>

              <button
                onClick={saveSelected}
                style={primaryGradientButtonStyle(saving || !selectedIds.length)}
                disabled={saving || !selectedIds.length}
              >
                {saving ? "Saving..." : "Save selected"}
              </button>
            </div>

            <div style={csvBoxStyle}>
              <div style={csvHeaderStyle}>
                <strong>CSV bulk edit</strong>
                {csvFileName ? <span style={badgeGrayStyle}>{csvFileName}</span> : null}
              </div>

              <div style={miniHelpStyle}>
                Required header: <code>id</code>. Then add columns like <code>price</code>,{" "}
                <code>tags</code>, <code>totalInventory</code>, <code>vendor</code>,{" "}
                <code>productType</code>, <code>sku</code>, <code>barcode</code>,{" "}
                <code>tracked</code>, <code>requiresShipping</code>.
              </div>

              <input
                type="file"
                accept=".csv"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  setCsvFileName(file.name);
                  await uploadCsv(file);
                }}
                style={{ marginTop: 10 }}
              />
            </div>
          </section>
        </div>

        <section style={cardStyle}>
          <div style={tableHeaderBarStyle}>
            <div>
              <h2 style={sectionTitleStyle}>Grid</h2>
              <p style={sectionTextStyle}>
                Smaller inside UI, bigger outside area, sticky header, sticky pick column, and more
                room to work.
              </p>
            </div>

            <div style={topPillsWrapStyle}>
              <span style={badgeBlueStyle}>{filteredRows.length} visible</span>
              <span style={badgePurpleStyle}>{visibleSelectedCount} visible selected</span>
              <button onClick={() => toggleAllVisible(filteredRows)} style={tinyButtonStyle}>
                {allVisibleSelected ? "Unselect visible" : "Select visible"}
              </button>
            </div>
          </div>

          <div style={gridWrapStyle}>
            <table style={tableStyle}>
              <thead>
                <tr>
                  <th
                    style={{
                      ...thStyle,
                      width: 58,
                      minWidth: 58,
                      position: "sticky",
                      left: 0,
                      zIndex: 4,
                    }}
                  >
                    Pick
                  </th>

                  {columns.map((col) => (
                    <th key={col.key} style={{ ...thStyle, minWidth: col.width || 140 }}>
                      <div style={thTitleStyle}>{col.label}</div>
                      {col.key !== "image" ? (
                        <input
                          value={filters[col.key] || ""}
                          onChange={(e) =>
                            setFilters((prev) => ({ ...prev, [col.key]: e.target.value }))
                          }
                          placeholder="Filter..."
                          style={filterInputStyle}
                        />
                      ) : null}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody>
                {filteredRows.map((row) => {
                  const selected = selectedIds.includes(row.id);

                  return (
                    <tr key={row.id} style={selected ? selectedRowStyle : undefined}>
                      <td
                        style={pickCellStyle}
                        onMouseDown={() => handleDragStart(row.id)}
                        onMouseEnter={() => handleDragEnter(row.id)}
                      >
                        <div style={pickCellInnerStyle}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => toggleRow(row.id)}
                          />
                        </div>
                      </td>

                      {columns.map((col) => (
                        <td
                          key={col.key}
                          style={{
                            ...tdStyle,
                            background:
                              edited[row.id] && col.key in edited[row.id]
                                ? "rgba(254,240,138,0.55)"
                                : selected
                                  ? "rgba(239,246,255,0.65)"
                                  : "#fff",
                          }}
                        >
                          {renderCell(row, col)}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}

const outerAppShellStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: "100%",
  minHeight: "100vh",
  margin: 0,
  padding: 0,
};

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  padding: "10px 6px",
  width: "100%",
  maxWidth: "100%",
  background:
    "radial-gradient(circle at top left, rgba(99,102,241,0.12), transparent 20%), radial-gradient(circle at top right, rgba(236,72,153,0.08), transparent 26%), linear-gradient(180deg, #f8fafc 0%, #eef2ff 100%)",
};

const heroStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1.25fr 0.75fr",
  gap: 16,
  borderRadius: 22,
  padding: 20,
  marginBottom: 14,
  color: "#fff",
  background: "linear-gradient(135deg, #0f172a 0%, #1d4ed8 48%, #7c3aed 100%)",
  boxShadow: "0 18px 40px rgba(59,130,246,0.18)",
};

const eyebrowStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "rgba(255,255,255,0.14)",
  fontWeight: 800,
  fontSize: 11,
  letterSpacing: ".08em",
  textTransform: "uppercase",
};

const heroTitleStyle: React.CSSProperties = {
  margin: "10px 0 0",
  fontSize: 30,
  fontWeight: 900,
  letterSpacing: "-0.04em",
  lineHeight: 1,
};

const heroTextStyle: React.CSSProperties = {
  margin: "10px 0 0",
  maxWidth: 760,
  lineHeight: 1.5,
  color: "rgba(255,255,255,0.88)",
  fontSize: 14,
};

const heroStatsWrapStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 10,
  alignSelf: "stretch",
};

const heroStatCardStyle: React.CSSProperties = {
  borderRadius: 16,
  padding: 14,
  background: "rgba(255,255,255,0.12)",
  border: "1px solid rgba(255,255,255,0.18)",
  backdropFilter: "blur(12px)",
};

const heroStatNumberStyle: React.CSSProperties = {
  fontSize: 22,
  fontWeight: 900,
};

const heroStatLabelStyle: React.CSSProperties = {
  marginTop: 4,
  color: "rgba(255,255,255,0.76)",
  fontSize: 12,
};

const cardStyle: React.CSSProperties = {
  borderRadius: 18,
  padding: 16,
  background: "rgba(255,255,255,0.96)",
  border: "1px solid rgba(255,255,255,0.95)",
  boxShadow: "0 10px 28px rgba(15,23,42,0.06)",
  marginBottom: 14,
};

const controlsGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 14,
};

const cardHeaderStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
};

const sectionTitleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 20,
  fontWeight: 900,
  letterSpacing: "-0.03em",
  color: "#0f172a",
};

const sectionTextStyle: React.CSSProperties = {
  margin: "6px 0 0",
  color: "#64748b",
  lineHeight: 1.45,
  fontSize: 13,
};

const labelStyle: React.CSSProperties = {
  display: "block",
  marginBottom: 6,
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#475569",
};

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  borderRadius: 12,
  border: "1px solid #dbe4f0",
  boxSizing: "border-box",
  background: "#fff",
  fontSize: 13,
};

const searchRowStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr auto",
  gap: 10,
};

const tabsStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(3, 1fr)",
  gap: 8,
  marginTop: 12,
};

const tabButtonStyle = (active: boolean): React.CSSProperties => ({
  padding: "11px 12px",
  borderRadius: 12,
  border: active ? "1px solid #6366f1" : "1px solid #e2e8f0",
  background: active ? "linear-gradient(180deg, #eef2ff 0%, #e0e7ff 100%)" : "#fff",
  color: active ? "#3730a3" : "#0f172a",
  fontWeight: 800,
  cursor: "pointer",
  fontSize: 13,
});

const primaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid transparent",
  background: disabled ? "#cbd5e1" : "linear-gradient(135deg, #111827 0%, #2563eb 100%)",
  color: "#fff",
  fontWeight: 800,
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 13,
});

const primaryGradientButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid transparent",
  background: disabled ? "#cbd5e1" : "linear-gradient(135deg, #7c3aed 0%, #2563eb 100%)",
  color: "#fff",
  fontWeight: 800,
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 13,
});

const secondaryButtonStyle = (disabled: boolean): React.CSSProperties => ({
  padding: "10px 14px",
  borderRadius: 12,
  border: "1px solid #cbd5e1",
  background: disabled ? "#e2e8f0" : "#fff",
  color: "#0f172a",
  fontWeight: 800,
  cursor: disabled ? "not-allowed" : "pointer",
  fontSize: 13,
});

const formGridStyle: React.CSSProperties = {
  display: "grid",
  gridTemplateColumns: "1fr 1fr",
  gap: 12,
  marginTop: 12,
};

const buttonRowStyle: React.CSSProperties = {
  display: "flex",
  gap: 10,
  flexWrap: "wrap",
  marginTop: 14,
};

const csvBoxStyle: React.CSSProperties = {
  marginTop: 14,
  padding: 14,
  borderRadius: 14,
  background: "linear-gradient(180deg, #faf5ff 0%, #f8fafc 100%)",
  border: "1px solid #ddd6fe",
};

const csvHeaderStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const miniHelpStyle: React.CSSProperties = {
  marginTop: 8,
  fontSize: 12,
  color: "#64748b",
  lineHeight: 1.5,
};

const tableHeaderBarStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "space-between",
  gap: 12,
  alignItems: "flex-start",
  flexWrap: "wrap",
  marginBottom: 12,
};

const topPillsWrapStyle: React.CSSProperties = {
  display: "flex",
  gap: 8,
  alignItems: "center",
  flexWrap: "wrap",
};

const gridWrapStyle: React.CSSProperties = {
  overflow: "auto",
  borderRadius: 18,
  border: "1px solid #dbe4f0",
  background: "#fff",
  height: "calc(100vh - 190px)",
};

const tableStyle: React.CSSProperties = {
  width: "max-content",
  minWidth: "100%",
  borderCollapse: "separate",
  borderSpacing: 0,
};

const thStyle: React.CSSProperties = {
  position: "sticky",
  top: 0,
  zIndex: 3,
  textAlign: "left",
  padding: "10px 12px",
  borderBottom: "1px solid #dbe4f0",
  background: "#f8fafc",
  verticalAlign: "bottom",
};

const thTitleStyle: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 800,
  letterSpacing: ".08em",
  textTransform: "uppercase",
  color: "#64748b",
  marginBottom: 6,
};

const filterInputStyle: React.CSSProperties = {
  width: "100%",
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid #dbe4f0",
  fontSize: 12,
  background: "#fff",
  boxSizing: "border-box",
};

const tdStyle: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eef2f7",
  verticalAlign: "top",
  background: "#fff",
  fontSize: 13,
};

const pickCellStyle: React.CSSProperties = {
  ...tdStyle,
  width: 58,
  minWidth: 58,
  background: "#f8fafc",
  cursor: "crosshair",
  position: "sticky",
  left: 0,
  zIndex: 2,
};

const pickCellInnerStyle: React.CSSProperties = {
  display: "flex",
  justifyContent: "center",
  alignItems: "center",
  minHeight: 40,
};

const selectedRowStyle: React.CSSProperties = {
  boxShadow: "inset 4px 0 0 #2563eb",
};

const cellInputStyle: React.CSSProperties = {
  width: "100%",
  minWidth: 84,
  padding: "7px 9px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fffdf2",
  boxSizing: "border-box",
  fontSize: 12,
};

const imageThumbStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 10,
  objectFit: "cover",
  border: "1px solid #e2e8f0",
  background: "#fff",
};

const imagePlaceholderStyle: React.CSSProperties = {
  width: 52,
  height: 52,
  borderRadius: 10,
  border: "1px dashed #cbd5e1",
  color: "#94a3b8",
  display: "grid",
  placeItems: "center",
  fontSize: 12,
};

const infoBoxStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 14,
  background: "#eff6ff",
  border: "1px solid #bfdbfe",
  color: "#1d4ed8",
  fontWeight: 700,
  fontSize: 13,
};

const warningBoxStyle: React.CSSProperties = {
  marginBottom: 14,
  padding: 12,
  borderRadius: 14,
  background: "#fff7ed",
  border: "1px solid #fdba74",
  color: "#9a3412",
  fontWeight: 700,
  fontSize: 13,
};

const tagWrapStyle: React.CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 5,
};

const tagStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#eef2ff",
  color: "#3730a3",
  fontSize: 11,
  fontWeight: 800,
};

const mutedMiniStyle: React.CSSProperties = {
  color: "#94a3b8",
  fontSize: 12,
};

const badgeBlueStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#dbeafe",
  color: "#1d4ed8",
  fontWeight: 800,
  fontSize: 11,
};

const badgePurpleStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#ede9fe",
  color: "#6d28d9",
  fontWeight: 800,
  fontSize: 11,
};

const badgeGrayStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "5px 10px",
  borderRadius: 999,
  background: "#f1f5f9",
  color: "#475569",
  fontWeight: 800,
  fontSize: 11,
};

const goodPillStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#dcfce7",
  color: "#166534",
  fontWeight: 800,
  fontSize: 11,
};

const grayPillStyle: React.CSSProperties = {
  display: "inline-flex",
  padding: "4px 8px",
  borderRadius: 999,
  background: "#e5e7eb",
  color: "#374151",
  fontWeight: 800,
  fontSize: 11,
};

const tinyButtonStyle: React.CSSProperties = {
  padding: "7px 10px",
  borderRadius: 8,
  border: "1px solid #cbd5e1",
  background: "#fff",
  color: "#0f172a",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 12,
};