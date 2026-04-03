export type AppPlan = "free" | "pro";

type SubscriptionInfo = {
  id: string;
  name: string;
  status: string;
  test?: boolean;
  currentPeriodEnd?: string | null;
};

export const FREE_LIMITS = {
  bulkEditViewRows: 100,
  importRows: 100,
  exportRows: 100,
};

async function gql(admin: any, query: string, variables?: Record<string, any>) {
  const res = await admin.graphql(query, { variables });
  const json = await res.json();

  if (json.errors?.length) {
    throw new Error(json.errors.map((e: any) => e.message).join("; "));
  }

  return json.data;
}

// ✅ THIS IS THE IMPORTANT EXPORT
export async function getCurrentPlan(admin: any): Promise<{
  plan: AppPlan;
  subscription: SubscriptionInfo | null;
  hasPaidPlan: boolean;
}> {
  const data = await gql(
    admin,
    `#graphql
    query {
      currentAppInstallation {
        activeSubscriptions {
          id
          name
          status
          test
          currentPeriodEnd
        }
      }
    }`
  );

  const subs = data?.currentAppInstallation?.activeSubscriptions ?? [];
  const active = subs[0] ?? null;

  if (!active) {
    return {
      plan: "free",
      subscription: null,
      hasPaidPlan: false,
    };
  }

  const isPro = String(active.name || "").toLowerCase().includes("pro");

  return {
    plan: isPro ? "pro" : "free",
    subscription: active,
    hasPaidPlan: isPro,
  };
}