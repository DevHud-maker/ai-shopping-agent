import { useEffect, useMemo, useState } from "react";

type DashboardResponse = {
  ok: boolean;
  mode: "preview" | "executed" | "error";
  message: string;
  plan?: any;
  rows?: Array<Record<string, any>>;
  count?: number;
  destructive?: boolean;
  confirmationToken?: string;
  bulkOperationId?: string | null;
};

export default function DashboardPage() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [result, setResult] = useState<DashboardResponse | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  async function submit(confirm = false) {
    setLoading(true);

    try {
      const res = await fetch("/app/dashboard-api", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          query,
          confirm,
          confirmationToken: result?.confirmationToken ?? null,
        }),
      });

      const text = await res.text();

      let data: DashboardResponse;
      try {
        data = JSON.parse(text);
      } catch {
        setResult({
          ok: false,
          mode: "error",
          message: `Server returned non-JSON response (status ${res.status}). Response starts with: ${text.slice(0, 120)}`,
        });
        return;
      }

      setResult(data);
    } catch (error) {
      setResult({
        ok: false,
        mode: "error",
        message: error instanceof Error ? error.message : "Request failed",
      });
    } finally {
      setLoading(false);
    }
  }

  async function runQuickAction(action: "archive" | "delete", ids?: string[]) {
    const finalIds = ids?.length ? ids : selectedIds;

    if (!finalIds.length) {
      setResult({
        ok: false,
        mode: "error",
        message: "No products selected.",
      });
      return;
    }

    const confirmed = window.confirm(
      action === "delete"
        ? `Delete ${finalIds.length} selected product(s)?`
        : `Archive ${finalIds.length} selected product(s)?`,
    );

    if (!confirmed) return;

    setActionLoading(true);

    try {
      const res = await fetch("/app/dashboard-quick-action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action,
          ids: finalIds,
        }),
      });

      const text = await res.text();

      let data: { ok: boolean; message: string };
      try {
        data = JSON.parse(text);
      } catch {
        setResult({
          ok: false,
          mode: "error",
          message: `Quick action returned non-JSON response (status ${res.status}).`,
        });
        return;
      }

      if (!data.ok) {
        setResult({
          ok: false,
          mode: "error",
          message: data.message,
        });
        return;
      }

      setResult((prev) =>
        prev
          ? {
              ...prev,
              ok: true,
              mode: "executed",
              message: data.message,
              rows: (prev.rows ?? []).filter((row) => !finalIds.includes(String(row.id))),
              count: Math.max(0, (prev.count ?? 0) - finalIds.length),
            }
          : {
              ok: true,
              mode: "executed",
              message: data.message,
              rows: [],
              count: 0,
            },
      );

      setSelectedIds((prev) => prev.filter((id) => !finalIds.includes(id)));
    } catch (error) {
      setResult({
        ok: false,
        mode: "error",
        message:
          error instanceof Error ? error.message : "Quick action failed",
      });
    } finally {
      setActionLoading(false);
    }
  }

  const isProductResult = useMemo(() => {
    if (!result?.rows?.length) return false;
    return result.rows.every((row) => "adminEditUrl" in row);
  }, [result?.rows]);

  useEffect(() => {
    setSelectedIds([]);
  }, [result?.rows]);

  function toggleSelected(id: string) {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  }

  function toggleSelectAll() {
    if (!result?.rows?.length) return;
    const allIds = result.rows.map((row) => String(row.id));

    setSelectedIds((prev) =>
      prev.length === allIds.length ? [] : allIds,
    );
  }

  function renderCell(key: string, value: unknown) {
    if (key === "adminEditUrl" && typeof value === "string" && value) {
      return (
        <a
          href={value}
          target="_top"
          rel="noreferrer"
          style={{
            display: "inline-block",
            padding: "8px 12px",
            borderRadius: "8px",
            background: "#111",
            color: "#fff",
            textDecoration: "none",
            whiteSpace: "nowrap",
          }}
        >
          Edit product
        </a>
      );
    }

    if (key === "id") {
      return (
        <span
          style={{
            fontSize: 12,
            color: "#666",
            wordBreak: "break-all",
          }}
        >
          {String(value)}
        </span>
      );
    }

    if (typeof value === "boolean") return value ? "Yes" : "No";
    if (value === null || value === undefined) return "";
    if (Array.isArray(value)) return value.join(", ");
    if (typeof value === "object") return JSON.stringify(value);

    return String(value);
  }

  const protectedDataWarning = useMemo(() => {
    const msg = result?.message ?? "";
    return (
      msg.includes("not approved to access the Customer object") ||
      msg.includes("Access denied for orders field") ||
      msg.includes("Access denied for customers") ||
      msg.includes("Access denied for giftCards") ||
      msg.includes("Access denied")
    );
  }, [result?.message]);

  const tableKeys = useMemo(() => {
    if (!result?.rows?.length) return [];

    const keys = Array.from(new Set(result.rows.flatMap((row) => Object.keys(row))));
    return keys.filter((key) => key !== "id");
  }, [result?.rows]);

  const allSelected =
    isProductResult &&
    result?.rows?.length &&
    selectedIds.length === result.rows.length;

  return (
    <div style={{ padding: "24px", maxWidth: "1200px", margin: "0 auto" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "16px" }}>Dashboard AI</h1>

      <div
        style={{
          border: "1px solid #ddd",
          borderRadius: "12px",
          padding: "16px",
          marginBottom: "20px",
          background: "#fff",
        }}
      >
        <p style={{ marginTop: 0 }}>
          Search products, orders, customers, and gift cards. Run safe actions
          with preview and confirmation.
        </p>

        <div
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g. show me all products, latest orders today, products with name ski"
            style={{
              flex: 1,
              minWidth: "320px",
              padding: "12px",
              borderRadius: "8px",
              border: "1px solid #ccc",
            }}
          />

          <button
            onClick={() => submit(false)}
            disabled={loading || !query.trim()}
            style={{
              padding: "12px 16px",
              borderRadius: "8px",
              border: "1px solid #111",
              background: "#111",
              color: "#fff",
              cursor: loading ? "not-allowed" : "pointer",
              opacity: loading || !query.trim() ? 0.7 : 1,
            }}
          >
            {loading ? "Running..." : "Run"}
          </button>

          {result?.destructive && result?.mode === "preview" ? (
            <button
              onClick={() => submit(true)}
              disabled={loading}
              style={{
                padding: "12px 16px",
                borderRadius: "8px",
                border: "1px solid #b91c1c",
                background: "#b91c1c",
                color: "#fff",
                cursor: loading ? "not-allowed" : "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              Confirm action
            </button>
          ) : null}
        </div>
      </div>

      {result ? (
        <div
          style={{
            border: "1px solid #ddd",
            borderRadius: "12px",
            padding: "16px",
            background: "#fff",
          }}
        >
          <div
            style={{
              marginBottom: "16px",
              padding: "12px",
              borderRadius: "8px",
              background:
                result.mode === "error"
                  ? "#fee2e2"
                  : result.mode === "executed"
                    ? "#dcfce7"
                    : "#dbeafe",
            }}
          >
            {result.message}
          </div>

          {protectedDataWarning ? (
            <div
              style={{
                marginBottom: "16px",
                padding: "12px",
                borderRadius: "8px",
                background: "#fff7ed",
                border: "1px solid #fdba74",
              }}
            >
              Orders, customers, and gift cards need Shopify access/scopes. If
              you still see access-denied errors, update your app scopes,
              redeploy, reauthorize the app, and complete protected customer
              data access where required.
            </div>
          ) : null}

          {typeof result.count === "number" ? (
            <p>
              <strong>Count:</strong> {result.count}
            </p>
          ) : null}

          {result.bulkOperationId ? (
            <p>
              <strong>Bulk operation:</strong> {result.bulkOperationId}
            </p>
          ) : null}

          {result.plan ? (
            <>
              <h3>Plan</h3>
              <pre
                style={{
                  background: "#f6f6f6",
                  padding: "12px",
                  borderRadius: "8px",
                  overflowX: "auto",
                  fontSize: "12px",
                }}
              >
                {JSON.stringify(result.plan, null, 2)}
              </pre>
            </>
          ) : null}

          {isProductResult && result.rows?.length ? (
            <div
              style={{
                display: "flex",
                gap: "12px",
                alignItems: "center",
                flexWrap: "wrap",
                marginBottom: "16px",
                padding: "12px",
                borderRadius: "8px",
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
              }}
            >
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "8px",
                }}
              >
                <input
                  type="checkbox"
                  checked={Boolean(allSelected)}
                  onChange={toggleSelectAll}
                />
                Select all
              </label>

              <span>{selectedIds.length} selected</span>

              <button
                onClick={() => runQuickAction("archive")}
                disabled={!selectedIds.length || actionLoading}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #111",
                  background: "#fff",
                  cursor:
                    !selectedIds.length || actionLoading
                      ? "not-allowed"
                      : "pointer",
                  opacity: !selectedIds.length || actionLoading ? 0.6 : 1,
                }}
              >
                {actionLoading ? "Working..." : "Archive selected"}
              </button>

              <button
                onClick={() => runQuickAction("delete")}
                disabled={!selectedIds.length || actionLoading}
                style={{
                  padding: "10px 14px",
                  borderRadius: "8px",
                  border: "1px solid #b91c1c",
                  background: "#b91c1c",
                  color: "#fff",
                  cursor:
                    !selectedIds.length || actionLoading
                      ? "not-allowed"
                      : "pointer",
                  opacity: !selectedIds.length || actionLoading ? 0.6 : 1,
                }}
              >
                {actionLoading ? "Working..." : "Delete selected"}
              </button>
            </div>
          ) : null}

          {result.rows?.length ? (
            <>
              <h3>Results</h3>
              <div style={{ overflowX: "auto" }}>
                <table
                  style={{
                    width: "100%",
                    borderCollapse: "collapse",
                    marginTop: "12px",
                  }}
                >
                  <thead>
                    <tr>
                      {isProductResult ? (
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #ddd",
                            padding: "10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Select
                        </th>
                      ) : null}

                      {tableKeys.map((key) => (
                        <th
                          key={key}
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #ddd",
                            padding: "10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {key}
                        </th>
                      ))}

                      {isProductResult ? (
                        <th
                          style={{
                            textAlign: "left",
                            borderBottom: "1px solid #ddd",
                            padding: "10px",
                            whiteSpace: "nowrap",
                          }}
                        >
                          Quick actions
                        </th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, i) => {
                      const rowId = String(row.id ?? i);
                      const checked = selectedIds.includes(rowId);

                      return (
                        <tr key={rowId}>
                          {isProductResult ? (
                            <td
                              style={{
                                borderBottom: "1px solid #eee",
                                padding: "10px",
                                verticalAlign: "top",
                              }}
                            >
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => toggleSelected(rowId)}
                              />
                            </td>
                          ) : null}

                          {tableKeys.map((key) => (
                            <td
                              key={key}
                              style={{
                                borderBottom: "1px solid #eee",
                                padding: "10px",
                                verticalAlign: "top",
                              }}
                            >
                              {renderCell(key, row[key])}
                            </td>
                          ))}

                          {isProductResult ? (
                            <td
                              style={{
                                borderBottom: "1px solid #eee",
                                padding: "10px",
                                verticalAlign: "top",
                              }}
                            >
                              <div
                                style={{
                                  display: "flex",
                                  gap: "8px",
                                  flexWrap: "wrap",
                                }}
                              >
                                <button
                                  onClick={() => runQuickAction("archive", [rowId])}
                                  disabled={actionLoading}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid #111",
                                    background: "#fff",
                                    cursor: actionLoading ? "not-allowed" : "pointer",
                                  }}
                                >
                                  Archive
                                </button>

                                <button
                                  onClick={() => runQuickAction("delete", [rowId])}
                                  disabled={actionLoading}
                                  style={{
                                    padding: "8px 12px",
                                    borderRadius: "8px",
                                    border: "1px solid #b91c1c",
                                    background: "#b91c1c",
                                    color: "#fff",
                                    cursor: actionLoading ? "not-allowed" : "pointer",
                                  }}
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          ) : null}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}