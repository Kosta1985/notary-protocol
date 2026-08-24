import { cpSync, mkdirSync, rmSync } from "node:fs";

const root = new URL("../", import.meta.url);
const output = new URL("cloudflare/public/", root);
rmSync(output, { recursive: true, force: true });
mkdirSync(new URL("schemas/", output), { recursive: true });
cpSync(new URL("web/", root), output, { recursive: true });
cpSync(new URL("docs/openapi.json", root), new URL("openapi.json", output));
cpSync(new URL("protocol/deal-envelope.schema.json", root), new URL("schemas/deal-envelope-0.1.json", output));
cpSync(new URL("protocol/notary-receipt.schema.json", root), new URL("schemas/notary-receipt-0.1.json", output));
console.log("Prepared Cloudflare static assets");
