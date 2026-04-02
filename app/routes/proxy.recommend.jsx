import { authenticate } from "../shopify.server";

export const loader = async ({ request }) => {
  console.log("HIT proxy.recommend loader", request.url);

  try {
    const { session, shop } = await authenticate.public.appProxy(request);

    return Response.json({
      ok: true,
      method: "GET",
      route: "proxy.recommend",
      shop: session?.shop || shop || null,
      url: request.url,
    });
  } catch (error) {
    console.error("proxy.recommend loader error", error);

    return Response.json(
      {
        ok: false,
        method: "GET",
        route: "proxy.recommend",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};

export const action = async ({ request }) => {
  console.log("HIT proxy.recommend action", request.url);

  try {
    const { session, shop } = await authenticate.public.appProxy(request);
    const body = await request.json().catch(() => ({}));

    return Response.json({
      ok: true,
      method: "POST",
      route: "proxy.recommend",
      shop: session?.shop || shop || null,
      body,
    });
  } catch (error) {
    console.error("proxy.recommend action error", error);

    return Response.json(
      {
        ok: false,
        method: "POST",
        route: "proxy.recommend",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
};