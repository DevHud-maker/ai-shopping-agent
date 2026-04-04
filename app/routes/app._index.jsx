import { boundary } from "@shopify/shopify-app-react-router/server";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  await authenticate.admin(request);
  return null;
};

export default function Index() {
  return (
    <s-page heading="BulkPilot">
      {/* HERO */}
      <s-section>
        <s-heading>Manage your Shopify data faster</s-heading>
        <s-paragraph>
          BulkPilot helps you import, edit, export, and automate your store data —
          all from one powerful interface.
        </s-paragraph>

        <s-stack direction="inline" gap="base">
          <s-button href="/app/dashboard-import">Import Products</s-button>
          <s-button href="/app/bulk-edit" variant="secondary">
            Bulk Edit
          </s-button>
          <s-button href="/app/export" variant="secondary">
            Export Data
          </s-button>
        </s-stack>
      </s-section>

      {/* FEATURES */}
      <s-section heading="Core features">
        <s-stack direction="block" gap="loose">
          
          <Feature
            title="Import products"
            desc="Upload CSV or Excel files, map fields automatically, preview changes, and import products safely."
          />

          <Feature
            title="Bulk edit products"
            desc="Update prices, inventory, tags, and product details across hundreds of products in seconds."
          />

          <Feature
            title="Export store data"
            desc="Download product, variant, and customer data or generate feeds for external platforms."
          />

          <Feature
            title="Automate workflows"
            desc="Schedule exports and automate repetitive tasks to save time."
          />

        </s-stack>
      </s-section>

      {/* HOW IT WORKS */}
      <s-section heading="How it works">
        <s-unordered-list>
          <s-list-item>Upload your data (CSV or Excel)</s-list-item>
          <s-list-item>Preview changes before applying</s-list-item>
          <s-list-item>Apply updates safely in batches</s-list-item>
          <s-list-item>Export or automate your workflows</s-list-item>
        </s-unordered-list>
      </s-section>

      {/* FREE VS PRO */}
      <s-section heading="Plans">
        <s-stack direction="inline" gap="loose">

          <PlanCard
            title="Free"
            items={[
              "Import up to 100 products",
              "View bulk edits (limited)",
              "Export up to 100 items",
            ]}
          />

          <PlanCard
            title="Pro"
            highlight
            items={[
              "Unlimited imports",
              "Unlimited bulk editing",
              "Unlimited exports",
              "Scheduled exports",
              "Automation features",
            ]}
          />

        </s-stack>

        <div style={{ marginTop: 20 }}>
          <s-button href="/app/upgrade">Upgrade to Pro</s-button>
        </div>
      </s-section>

      {/* CTA */}
      <s-section>
        <s-heading>Start optimizing your workflow</s-heading>
        <s-paragraph>
          Save hours every week by managing your Shopify data in bulk.
        </s-paragraph>

        <s-button href="/app/dashboard-import">
          Get started
        </s-button>
      </s-section>
    </s-page>
  );
}

function Feature({ title, desc }) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background="subdued"
    >
      <s-heading>{title}</s-heading>
      <s-paragraph>{desc}</s-paragraph>
    </s-box>
  );
}

function PlanCard({ title, items, highlight }) {
  return (
    <s-box
      padding="base"
      borderWidth="base"
      borderRadius="base"
      background={highlight ? "interactive" : "subdued"}
      style={{
        minWidth: 250,
      }}
    >
      <s-heading>{title}</s-heading>

      <s-unordered-list>
        {items.map((item, i) => (
          <s-list-item key={i}>{item}</s-list-item>
        ))}
      </s-unordered-list>
    </s-box>
  );
}

export const headers = (headersArgs) => {
  return boundary.headers(headersArgs);
};