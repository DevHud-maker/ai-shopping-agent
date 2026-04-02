import { useEffect, useState } from "react";

type BulkOp = {
  id: string;
  status: string;
  type: string;
  objectCount?: string;
  errorCode?: string | null;
  createdAt?: string;
  completedAt?: string | null;
  url?: string | null;
};

export default function DashboardBulkPage() {
  const [rows, setRows] = useState<BulkOp[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    try {
      const res = await fetch("/app/dashboard-bulk-api");
      const text = await res.text();
      setRows(JSON.parse(text));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, []);

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: "0 auto" }}>
      <h1>Bulk Jobs</h1>
      <p>Tracks running and recent Shopify bulk operations.</p>

      <button onClick={load} disabled={loading}>
        {loading ? "Refreshing..." : "Refresh"}
      </button>

      <div style={{ marginTop: 20, overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {["id", "status", "type", "objectCount", "errorCode", "createdAt", "completedAt"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid #ddd" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{row.id}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{row.status}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{row.type}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{row.objectCount ?? ""}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{row.errorCode ?? ""}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{row.createdAt ?? ""}</td>
                <td style={{ padding: 10, borderBottom: "1px solid #eee" }}>{row.completedAt ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}