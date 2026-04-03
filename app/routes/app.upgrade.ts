import { redirect } from "react-router";
import type { LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";

function getStoreHandle(shopDomain: string) {
  return shopDomain.replace(".myshopify.com", "");
}

// Replace with the app_handle from your shopify.app.toml
const APP_HANDLE = "bulkpilot";

export async function loader({ request }: LoaderFunctionArgs) {
  const { session } = await authenticate.admin(request);

  const storeHandle = getStoreHandle(session.shop);
  const pricingUrl = `https://admin.shopify.com/store/${storeHandle}/charges/${APP_HANDLE}/pricing_plans`;

  throw redirect(pricingUrl);
}