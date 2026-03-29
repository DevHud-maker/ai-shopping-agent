import { useLoaderData } from "react-router";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);

  const response = await admin.graphql(`
    #graphql
    query GetProducts {
      products(first: 10) {
        edges {
          node {
            id
            title
            handle
            totalInventory
          }
        }
      }
    }
  `);

  const responseJson = await response.json();
  return {
    products: responseJson.data.products.edges,
  };
};

export default function ProductsPage() {
  const { products } = useLoaderData();

  return (
    <div style={{ padding: 20 }}>
      <h1>Store Products</h1>
      <ul>
        {products.map(({ node }) => (
          <li key={node.id}>
            <strong>{node.title}</strong><br />
            Handle: {node.handle}<br />
            Inventory: {node.totalInventory}
          </li>
        ))}
      </ul>
    </div>
  );
}