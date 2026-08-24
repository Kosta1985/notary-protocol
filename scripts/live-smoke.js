import { fileURLToPath } from "node:url";

const defaultBaseUrl = "https://notary-protocol.notary-labs.workers.dev";

export async function runSmoke(baseUrl = defaultBaseUrl, fetcher = fetch) {
  const base = new URL(baseUrl);
  const request = async (pathname, options) => {
    const response = await fetcher(new URL(pathname, base), {
      ...options,
      headers: { "x-notary-monitor": "live-smoke", ...options?.headers }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) throw new Error(`${options?.method ?? "GET"} ${pathname} returned HTTP ${response.status}`);
    return body;
  };

  const health = await request("/health");
  if (health?.status !== "ok") throw new Error("Health response is not ok");

  const capabilitiesResponse = await fetcher(new URL("/v1/capabilities", base), { headers: { "x-notary-monitor": "live-smoke" } });
  let capabilitiesAvailable = false;
  if (capabilitiesResponse.ok) {
    const capabilities = await capabilitiesResponse.json();
    if (!capabilities?.protocolVersions?.includes("0.1")) throw new Error("Protocol 0.1 is not advertised");
    capabilitiesAvailable = true;
  } else if (capabilitiesResponse.status !== 404) {
    throw new Error(`GET /v1/capabilities returned HTTP ${capabilitiesResponse.status}`);
  }
  if (!capabilitiesAvailable) {
    return { status: "ok", mode: "health-only", baseUrl: base.origin, protocolVersion: "0.1", capabilitiesAvailable };
  }

  const envelope = await request("/v1/demo");
  const receipt = await request("/v1/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(envelope)
  });
  if (!receipt?.valid || typeof receipt.id !== "string") throw new Error("Demo did not produce a valid receipt");

  const verification = await request("/v1/receipts/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(receipt)
  });
  if (!verification?.valid) throw new Error("Receipt signature verification failed");

  const stored = await request(`/v1/receipts/${encodeURIComponent(receipt.id)}`);
  if (stored?.id !== receipt.id || stored?.evidenceDigest !== receipt.evidenceDigest) throw new Error("Stored receipt does not match");

  return { status: "ok", mode: "full", baseUrl: base.origin, protocolVersion: "0.1", capabilitiesAvailable, receiptId: receipt.id, checks: receipt.checks?.length ?? 0 };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runSmoke(process.argv[2] ?? process.env.NOTARY_BASE_URL ?? defaultBaseUrl)
    .then((result) => console.log(JSON.stringify(result, null, 2)))
    .catch((error) => { console.error(`Live smoke failed: ${error.message}`); process.exitCode = 1; });
}
