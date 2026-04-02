export const CAPABILITIES = {
  products: ["list", "count", "tag_add", "tag_remove", "archive", "delete"],
  orders: ["list", "count"],
  customers: ["list", "count", "tag_add", "tag_remove"],
  collections: ["list", "add_products", "remove_products"],
  imports: ["product_import"],
} as const;

export type Resource = keyof typeof CAPABILITIES;

export type Operation =
  | "list"
  | "count"
  | "delete"
  | "archive"
  | "tag_add"
  | "tag_remove"
  | "add_products"
  | "remove_products"
  | "product_import";

export function isSupported(resource: string, operation: string) {
  const ops = CAPABILITIES[resource as Resource];
  return Array.isArray(ops) && ops.includes(operation as never);
}