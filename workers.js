import erpApi from "./src/index.js";

/**
 * Cloudflare Worker entry point.
 * GitHub Pages serves the static ERP frontend; this Worker handles /api/* only.
 * Keep domain/API implementation in src/modules and src/index.js.
 */
export async function fetch(request, env, ctx) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith("/api/")) {
    return new Response("Not found", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "cache-control": "no-store",
        "x-content-type-options": "nosniff"
      }
    });
  }
  return erpApi.fetch(request, env, ctx);
}

export default { fetch };
