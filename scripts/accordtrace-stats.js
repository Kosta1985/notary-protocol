import { fileURLToPath } from "node:url";

const base = String(process.argv[2] || "https://accordtrace.notary-labs.workers.dev").replace(/\/$/, "");

function numericSummary(value) {
  if (!value || typeof value !== "object") return {};
  const summary = {};
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === "number" || typeof item === "boolean" || typeof item === "string" && /count|total|window/i.test(key)) summary[key] = item;
    else if (Array.isArray(item)) summary[`${key}Count`] = item.length;
    else if (item && typeof item === "object" && /total|count|stat|metric|summary/i.test(key)) summary[key] = numericSummary(item);
  }
  return summary;
}

export async function probeAccordTrace(fetcher = fetch) {
  const [openapiResponse, homepageResponse] = await Promise.all([
    fetcher(`${base}/openapi.json`),
    fetcher(`${base}/`)
  ]);
  const openapi = openapiResponse.ok ? await openapiResponse.json() : {};
  const homepage = homepageResponse.ok ? await homepageResponse.text() : "";
  const endpoints = Object.keys(openapi.paths || {});
  const candidates = ["/api/v1/stats", "/v1/stats", "/api/v1/proofs?limit=0"];
  const probes = {};
  for (const path of candidates) {
    const response = await fetcher(`${base}${path}`, { headers: { "x-notary-monitor": "statistics-probe" } });
    let summary = {};
    if (response.ok) summary = numericSummary(await response.json().catch(() => ({})));
    probes[path] = { status: response.status, summary };
  }
  return {
    generatedAt: new Date().toISOString(),
    service: base,
    homepage: {
      status: homepageResponse.status,
      accordTraceBrand: /AccordTrace/i.test(homepage),
      oldNotaryHeadline: homepage.includes('<h1 id="hero-title">Notary Protocol</h1>')
    },
    openapiPaths: endpoints,
    probes
  };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  probeAccordTrace()
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(`AccordTrace stats probe failed: ${error.message}`); process.exitCode = 1; });
}
