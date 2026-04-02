import { data, type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

async function gql(admin: any, query: string, variables?: Record<string, any>) {
  const response = await admin.graphql(query, { variables });
  const json = await response.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  return json.data;
}

async function archiveProducts(admin: any, ids: string[]) {
  for (const id of ids) {
    const data = await gql(
      admin,
      `#graphql
      mutation ProductUpdate($product: ProductUpdateInput!) {
        productUpdate(product: $product) {
          product { id status }
          userErrors { field message }
        }
      }`,
      { product: { id, status: "ARCHIVED" } },
    );

    if (data.productUpdate.userErrors?.length) {
      throw new Error(
        data.productUpdate.userErrors.map((e: any) => e.message).join("; "),
      );
    }
  }
}

async function deleteProducts(admin: any, ids: string[]) {
  for (const id of ids) {
    const data = await gql(
      admin,
      `#graphql
      mutation ProductDelete($input: ProductDeleteInput!) {
        productDelete(input: $input) {
          deletedProductId
          userErrors { field message }
        }
      }`,
      { input: { id } },
    );

    if (data.productDelete.userErrors?.length) {
      throw new Error(
        data.productDelete.userErrors.map((e: any) => e.message).join("; "),
      );
    }
  }
}

export async function action({ request }: ActionFunctionArgs) {
  const { admin } = await authenticate.admin(request);
  const body = await request.json();

  const action = String(body?.action || "");
  const ids = Array.isArray(body?.ids)
    ? body.ids.map((x: unknown) => String(x)).filter(Boolean)
    : [];

  if (!ids.length) {
    return data(
      { ok: false, message: "No products selected." },
      { status: 400 },
    );
  }

  try {
    if (action === "archive") {
      await archiveProducts(admin, ids);
      return data({
        ok: true,
        message: `Archived ${ids.length} product(s).`,
      });
    }

    if (action === "delete") {
      await deleteProducts(admin, ids);
      return data({
        ok: true,
        message: `Deleted ${ids.length} product(s).`,
      });
    }

    return data(
      { ok: false, message: "Unsupported quick action." },
      { status: 400 },
    );
  } catch (error) {
    return data(
      {
        ok: false,
        message:
          error instanceof Error ? error.message : "Quick action failed.",
      },
      { status: 400 },
    );
  }
}