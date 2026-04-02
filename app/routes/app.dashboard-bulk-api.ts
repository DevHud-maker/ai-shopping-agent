import { data } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const res = await admin.graphql(
      `#graphql
      query BulkOperation($id: ID!) {
        bulkOperation(id: $id) {
          id
          status
          type
          objectCount
          fileSize
          url
          partialDataUrl
          errorCode
          createdAt
          completedAt
        }
      }`,
      { variables: { id } },
    );
    const json = await res.json();
    return data(json.data.bulkOperation);
  }

  const res = await admin.graphql(
    `#graphql
    query BulkOperations {
      bulkOperations(first: 20, query: "status:RUNNING OR status:CREATED OR status:COMPLETED OR status:FAILED") {
        edges {
          node {
            id
            status
            type
            objectCount
            errorCode
            createdAt
            completedAt
            url
          }
        }
      }
    }`,
  );

  const json = await res.json();
  return data(json.data.bulkOperations.edges.map((e: any) => e.node));
}