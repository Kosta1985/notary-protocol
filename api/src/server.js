import { createServer as createHttpServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import { createSignedDemo } from "./demo.js";
import { createNotary } from "./notary.js";
import { ReceiptStore } from "./store.js";

const root = fileURLToPath(new URL("../..", import.meta.url));
const webRoot = join(root, "web");
const mimeTypes = { ".css": "text/css; charset=utf-8", ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml" };

function createRateLimiter({ limit = 120, windowMs = 60_000 } = {}) {
  limit = Math.max(1, Number(limit) || 120);
  windowMs = Math.max(1_000, Number(windowMs) || 60_000);
  const clients = new Map();
  return (key) => {
    const now = Date.now();
    const current = clients.get(key);
    if (!current || current.resetAt <= now) {
      clients.set(key, { count: 1, resetAt: now + windowMs });
      return { allowed: true, remaining: limit - 1 };
    }
    current.count += 1;
    return { allowed: current.count <= limit, remaining: Math.max(0, limit - current.count), retryAfter: Math.ceil((current.resetAt - now) / 1000) };
  };
}

function json(response, status, body, origin = "*") {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "access-control-allow-origin": origin,
    "cache-control": "no-store",
    "x-content-type-options": "nosniff"
  });
  response.end(JSON.stringify(body));
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 1_048_576) throw Object.assign(new Error("Request body exceeds 1 MiB"), { status: 413 });
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw Object.assign(new Error("Request body must be valid JSON"), { status: 400 });
  }
}

async function staticFile(pathname, response) {
  const requested = pathname === "/" ? "index.html" : pathname.slice(1);
  const safePath = normalize(requested).replace(/^(\.\.(\/|\\|$))+/, "");
  const file = join(webRoot, safePath);
  if (!file.startsWith(webRoot)) return false;
  try {
    const data = await readFile(file);
    response.writeHead(200, {
      "content-type": mimeTypes[extname(file)] ?? "application/octet-stream",
      "content-security-policy": "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
      "referrer-policy": "no-referrer",
      "x-content-type-options": "nosniff",
      "x-frame-options": "DENY"
    });
    response.end(data);
    return true;
  } catch {
    return false;
  }
}

export function createServer(options = {}) {
  const dataDir = options.dataDir ?? process.env.NOTARY_DATA_DIR ?? join(root, "api/data");
  const notary = options.notary ?? createNotary({ keyFile: process.env.NOTARY_KEY_FILE ?? join(dataDir, "notary-key.pem") });
  const store = options.store ?? new ReceiptStore(join(dataDir, "receipts.jsonl"));
  const corsOrigin = process.env.CORS_ORIGIN ?? "*";
  const rateLimit = createRateLimiter(options.rateLimit ?? {
    limit: process.env.RATE_LIMIT ?? 120,
    windowMs: process.env.RATE_LIMIT_WINDOW_MS ?? 60_000
  });

  return createHttpServer(async (request, response) => {
    const url = new URL(request.url, "http://localhost");
    try {
      if (request.method === "OPTIONS") {
        response.writeHead(204, { "access-control-allow-origin": corsOrigin, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" });
        return response.end();
      }
      if (request.method === "POST") {
        const client = request.socket.remoteAddress ?? "unknown";
        const result = rateLimit(client);
        response.setHeader("x-ratelimit-remaining", result.remaining);
        if (!result.allowed) {
          response.setHeader("retry-after", result.retryAfter);
          return json(response, 429, { error: "rate_limit_exceeded", message: "Too many requests" }, corsOrigin);
        }
      }
      if (request.method === "GET" && url.pathname === "/health") return json(response, 200, { status: "ok", version: "0.1.0" }, corsOrigin);
      if (request.method === "GET" && url.pathname === "/v1/notary-key") return json(response, 200, { algorithm: "Ed25519", publicKey: notary.publicKey }, corsOrigin);
      if (request.method === "GET" && url.pathname === "/v1/demo") return json(response, 200, createSignedDemo(), corsOrigin);
      if (request.method === "POST" && url.pathname === "/v1/verify") {
        const envelope = await readJson(request);
        const receipt = store.save(notary.verify(envelope));
        return json(response, receipt.valid ? 200 : 422, receipt, corsOrigin);
      }
      if (request.method === "POST" && url.pathname === "/v1/receipts/verify") {
        const receipt = await readJson(request);
        const result = notary.verifyReceipt(receipt);
        return json(response, result.valid ? 200 : 422, result, corsOrigin);
      }
      if (request.method === "GET" && url.pathname.startsWith("/v1/receipts/")) {
        const receipt = store.get(decodeURIComponent(url.pathname.slice("/v1/receipts/".length)));
        return receipt ? json(response, 200, receipt, corsOrigin) : json(response, 404, { error: "receipt_not_found" }, corsOrigin);
      }
      if (request.method === "GET" && url.pathname === "/.well-known/agent-card.json") {
        const card = JSON.parse(await readFile(join(root, "adapters/a2a/agent-card.json"), "utf8"));
        return json(response, 200, card, corsOrigin);
      }
      if (request.method === "POST" && url.pathname === "/a2a") {
        const requestBody = await readJson(request);
        const message = requestBody.params?.message ?? requestBody.message;
        const envelope = message?.parts?.find((part) => part.data?.dealEnvelope)?.data?.dealEnvelope;
        if (!envelope) throw Object.assign(new Error("A2A message must include data.dealEnvelope"), { status: 400 });
        const receipt = store.save(notary.verify(envelope));
        return json(response, 200, {
          jsonrpc: "2.0",
          id: requestBody.id ?? null,
          result: {
            id: `task_${receipt.id}`,
            status: { state: "completed", timestamp: new Date().toISOString() },
            artifacts: [{ name: "NotaryReceipt", parts: [{ data: { notaryReceipt: receipt } }] }]
          }
        }, corsOrigin);
      }
      if (request.method === "GET" && url.pathname === "/openapi.json") {
        const spec = JSON.parse(await readFile(join(root, "docs/openapi.json"), "utf8"));
        return json(response, 200, spec, corsOrigin);
      }
      if (request.method === "GET" && url.pathname === "/schemas/deal-envelope-0.1.json") {
        const schema = JSON.parse(await readFile(join(root, "protocol/deal-envelope.schema.json"), "utf8"));
        return json(response, 200, schema, corsOrigin);
      }
      if (request.method === "GET" && url.pathname === "/schemas/notary-receipt-0.1.json") {
        const schema = JSON.parse(await readFile(join(root, "protocol/notary-receipt.schema.json"), "utf8"));
        return json(response, 200, schema, corsOrigin);
      }
      if (request.method === "GET" && await staticFile(url.pathname, response)) return;
      json(response, 404, { error: "not_found" }, corsOrigin);
    } catch (error) {
      json(response, error.status ?? 500, { error: error.status ? "invalid_request" : "internal_error", message: error.message }, corsOrigin);
    }
  });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  createServer().listen(port, host, () => console.log(`Notary Protocol listening on http://${host}:${port}`));
}
