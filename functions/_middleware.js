const NATIVE_APP_ORIGIN = "https://appassets.androidplatform.net";
const SAFE_METHODS = new Set(["GET", "HEAD"]);

export async function onRequest({ request, next }) {
  const origin = request.headers.get("Origin");
  const sameOrigin = origin === new URL(request.url).origin;
  const nativeOrigin = origin === NATIVE_APP_ORIGIN;

  if (request.method === "OPTIONS") {
    if (!nativeOrigin) return new Response(null, { status: 403 });
    return new Response(null, { status: 204, headers: {
      "Access-Control-Allow-Origin": NATIVE_APP_ORIGIN,
      "Access-Control-Allow-Credentials": "true",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      "Vary": "Origin"
    }});
  }

  if (origin && !sameOrigin && !nativeOrigin && request.method !== "GET") {
    return new Response(JSON.stringify({ error: "Cross-origin request blocked." }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }

  // The session cookie is SameSite=None (needed by the Android WebView), so also refuse state-changing requests that the
  // browser itself labels as coming from another site even when it sent no Origin header.
  const fetchSite = request.headers.get("Sec-Fetch-Site");
  if (!origin && !SAFE_METHODS.has(request.method) && fetchSite && fetchSite !== "same-origin" && fetchSite !== "none") {
    return new Response(JSON.stringify({ error: "Cross-site request blocked." }), {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
    });
  }

  const response = await next();
  if (!nativeOrigin) return response;
  const headers = new Headers(response.headers);
  headers.set("Access-Control-Allow-Origin", NATIVE_APP_ORIGIN);
  headers.set("Access-Control-Allow-Credentials", "true");
  headers.append("Vary", "Origin");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
