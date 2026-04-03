import { Outlet, useLoaderData, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";
import { authenticate } from "../shopify.server";
import { getCurrentPlan } from "../services/plan.server";

export const loader = async ({ request }) => {
  const { admin } = await authenticate.admin(request);
  const plan = await getCurrentPlan(admin);

  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
    plan: plan.plan,
    hasPaidPlan: plan.hasPaidPlan,
  };
};

export default function App() {
  const { apiKey, hasPaidPlan } = useLoaderData();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <s-app-nav>
        <s-link href="/app">Home</s-link>
        <s-link href="/app/dashboard-import">Import</s-link>
        <s-link href="/app/export">Export</s-link>
        <s-link href="/app/bulk-edit">Bulk Edit</s-link>

        <span
          style={{
            marginLeft: "auto",
            padding: "6px 12px",
            borderRadius: "12px",
            background: hasPaidPlan ? "#16a34a" : "#7c3aed",
            color: "white",
            fontSize: "12px",
            fontWeight: "600",
          }}
        >
          {hasPaidPlan ? "Pro Plan" : "Free Plan"}
        </span>

        {!hasPaidPlan && (
          <a
            href="/app/upgrade"
            style={{
              marginLeft: "10px",
              padding: "8px 14px",
              borderRadius: "12px",
              background: "linear-gradient(135deg,#1d4ed8,#7c3aed)",
              color: "white",
              textDecoration: "none",
              fontWeight: "600",
            }}
          >
            Upgrade
          </a>
        )}
      </s-app-nav>

      <Outlet />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};