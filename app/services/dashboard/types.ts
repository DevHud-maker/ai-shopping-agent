export type DashboardIntent =
  | "list_sales"
  | "count_sales"
  | "list_products"
  | "bulk_delete_products";

export type DashboardPlan = {
  intent: DashboardIntent;
  action: "read" | "delete";
  resource: "orders" | "products";
  filters: {
    dateRange?: "today" | "yesterday" | "last_7_days" | "this_month";
    minTotalUsd?: number;
    maxPriceUsd?: number;
    titlePrefix?: string;
  };
  limit?: number;
  requiresConfirmation?: boolean;
  summary?: string;
};