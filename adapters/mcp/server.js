#!/usr/bin/env node
import { createInterface } from "node:readline";
const baseUrl = (process.env.NOTARY_URL ?? "https://notary-protocol.notary-labs.workers.dev").replace(/\/$/, "");
const input = createInterface({ input: process.stdin, terminal: false });
const supportedVersions = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"];

async function callApi(path, options) {
  const response = await fetch(`${baseUrl}${path}`, options);
  const body = await response.json();
  if (!body.checks && !response.ok) throw new Error(body.message ?? `Notary request failed (${response.status})`);
  return body;
}

const tools = [
  {
    name: "notary_verify",
    description: "Verify a signed DealEnvelope and return a NotaryReceipt.",
    inputSchema: { type: "object", required: ["envelope"], properties: { envelope: { type: "object" } } }
  },
  {
    name: "notary_get_receipt",
    description: "Retrieve a previously issued NotaryReceipt.",
    inputSchema: { type: "object", required: ["receiptId"], properties: { receiptId: { type: "string" } } }
  }
];

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

input.on("line", async (line) => {
  let request;
  try {
    request = JSON.parse(line);
    let result;
    if (request.method === "initialize") {
      const requested = request.params?.protocolVersion;
      result = { protocolVersion: supportedVersions.includes(requested) ? requested : supportedVersions[0], capabilities: { tools: {} }, serverInfo: { name: "notary-protocol", version: "0.1.0" } };
    } else if (request.method === "tools/list") {
      result = { tools };
    } else if (request.method === "tools/call" && request.params?.name === "notary_verify") {
      result = { content: [{ type: "text", text: JSON.stringify(await requestApiVerification(request.params.arguments.envelope), null, 2) }] };
    } else if (request.method === "tools/call" && request.params?.name === "notary_get_receipt") {
      result = { content: [{ type: "text", text: JSON.stringify(await callApi(`/v1/receipts/${encodeURIComponent(request.params.arguments.receiptId)}`), null, 2) }] };
    } else if (request.method === "notifications/initialized") {
      return;
    } else {
      throw Object.assign(new Error("Method not found"), { code: -32601 });
    }
    send({ jsonrpc: "2.0", id: request.id, result });
  } catch (error) {
    send({ jsonrpc: "2.0", id: request?.id ?? null, error: { code: error.code ?? -32603, message: error.message } });
  }
});

function requestApiVerification(envelope) {
  return callApi("/v1/verify", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(envelope) });
}
