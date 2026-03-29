import { useState } from "react";

export default function AssistantPage() {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [filters, setFilters] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSearch() {
    try {
      setLoading(true);
      setError("");
      setResults([]);
      setFilters(null);

      const response = await fetch("/app/api/recommend", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong");
      }

      setResults(data.products || []);
      setFilters(data.filters || null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h1>AI Shopping Assistant</h1>
      <p>Describe what the shopper wants in natural language.</p>

      <div style={{ marginBottom: 20 }}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Example: i want a gift for ski green color, with max 100 usd"
          style={{
            padding: 10,
            width: 500,
            marginRight: 10,
          }}
        />
        <button onClick={handleSearch} style={{ padding: 10 }}>
          {loading ? "Thinking..." : "Ask AI"}
        </button>
      </div>

      {error ? (
        <div style={{ color: "red", marginBottom: 20 }}>
          <strong>Error:</strong> {error}
        </div>
      ) : null}

      {filters ? (
        <div
          style={{
            marginBottom: 20,
            padding: 12,
            border: "1px solid #ddd",
            borderRadius: 8,
            background: "#f9f9f9",
          }}
        >
          <h3>AI understood these filters:</h3>
          <p><strong>Activity:</strong> {filters.activity || "None"}</p>
          <p><strong>Color:</strong> {filters.color || "None"}</p>
          <p><strong>Max Price:</strong> {filters.maxPrice ?? "None"}</p>
          <p><strong>Intent:</strong> {filters.intent || "None"}</p>
        </div>
      ) : null}

      <h2>Results</h2>

      {results.length === 0 ? (
        <p>No recommendations yet.</p>
      ) : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 20 }}>
          {results.map((product) => (
            <div
              key={product.id}
              style={{
                border: "1px solid #ddd",
                padding: 10,
                width: 220,
                borderRadius: 8,
              }}
            >
              <img
                src={product.image || "https://via.placeholder.com/150"}
                alt={product.title}
                style={{
                  width: "100%",
                  height: 150,
                  objectFit: "cover",
                  borderRadius: 6,
                }}
              />
              <h3>{product.title}</h3>
              <p>💰 {product.price}</p>
              <p>Stock: {product.totalInventory}</p>
              <p style={{ color: "#666", fontSize: 14 }}>
                Handle: {product.handle}
              </p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}