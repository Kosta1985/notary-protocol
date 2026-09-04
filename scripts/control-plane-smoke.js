import { fileURLToPath } from "node:url";

const defaultBaseUrl = "https://accordtrace.notary-labs.workers.dev";

export async function runControlPlaneSmoke(baseUrl = defaultBaseUrl, fetcher = fetch) {
  const base = new URL(baseUrl);
  const health = await fetcher(new URL("/health", base), { headers: { "x-notary-monitor": "control-plane-smoke" } });
  if (!health.ok) throw new Error(`GET /health returned HTTP ${health.status}`);

  const unauthenticated = await fetcher(new URL("/api/v1/control-plane/maintenance/capabilities", base), {
    headers: { "x-notary-monitor": "control-plane-smoke" }
  });
  if (![401, 404].includes(unauthenticated.status)) {
    throw new Error(`Maintenance capabilities must fail closed without credentials; got HTTP ${unauthenticated.status}`);
  }

  const token = process.env.CONTROL_PLANE_SMOKE_TOKEN;
  if (!token) {
    return {
      status: "ok",
      mode: unauthenticated.status === 404 ? "not_deployed_yet" : "fail_closed_verified",
      baseUrl: base.origin,
      authenticatedChecks: false
    };
  }

  if (unauthenticated.status === 404) throw new Error("CONTROL_PLANE_SMOKE_TOKEN is set but maintenance API is not deployed");
  const authHeaders = { authorization: `Bearer ${token}`, "x-notary-monitor": "control-plane-smoke" };
  const capabilities = await fetcher(new URL("/api/v1/control-plane/maintenance/capabilities", base), { headers: authHeaders });
  if (!capabilities.ok) throw new Error(`Authenticated maintenance capabilities returned HTTP ${capabilities.status}`);
  const body = await capabilities.json();
  for (const feature of ["ephemeral_sessions", "signed_webhook_outbox", "retention_jobs"]) {
    if (!body?.features?.includes(feature)) throw new Error(`Missing hardening feature: ${feature}`);
  }

  const baseCapabilities = await fetcher(new URL("/api/v1/control-plane/capabilities", base), { headers: authHeaders });
  if (!baseCapabilities.ok) throw new Error(`Base control plane capabilities returned HTTP ${baseCapabilities.status}`);

  return {
    status: "ok",
    mode: "authenticated",
    baseUrl: base.origin,
    authenticatedChecks: true,
    role: body.role,
    features: body.features.length
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runControlPlaneSmoke(process.argv[2] ?? process.env.ACCORDTRACE_BASE ?? defaultBaseUrl)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(`Control-plane smoke failed: ${error.message}`); process.exitCode = 1; });
}
