#!/usr/bin/env node
import { createInterface } from "node:readline";
import { NotaryClient } from "../../sdk/typescript/dist/index.js";

const client = new NotaryClient(process.env.NOTARY_URL ?? "http://127.0.0.1:8787");
const input = createInterface({ input: process.stdin, terminal: false });

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
      result = { protocolVersion: "2025-03-26", capabilities: { tools: {} }, serverInfo: { name: "notary-protocol", version: "0.1.0" } };
    } else if (request.method === "tools/list") {
      result = { tools };
    } else if (request.method === "tools/call" && request.params?.name === "notary_verify") {
      result = { content: [{ type: "text", text: JSON.stringify(await client.verify(request.params.arguments.envelope), null, 2) }] };
    } else if (request.method === "tools/call" && request.params?.name === "notary_get_receipt") {
      result = { content: [{ type: "text", text: JSON.stringify(await client.getReceipt(request.params.arguments.receiptId), null, 2) }] };
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
