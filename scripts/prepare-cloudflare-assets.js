import { cpSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const output = new URL("cloudflare/public/", root);
rmSync(output, { recursive: true, force: true });
mkdirSync(new URL("schemas/", output), { recursive: true });
cpSync(new URL("web/", root), output, { recursive: true });

const openapi = JSON.parse(readFileSync(new URL("docs/openapi.json", root), "utf8"));
const fragmentsDir = new URL("docs/openapi-fragments/", root);
for (const file of readdirSync(fragmentsDir).filter((name) => name.endsWith(".json")).sort()) {
  const fragment = JSON.parse(readFileSync(new URL(file, fragmentsDir), "utf8"));
  openapi.paths ??= {};
  for (const [path, definition] of Object.entries(fragment.paths ?? {})) {
    if (openapi.paths[path]) throw new Error(`OpenAPI fragment duplicates path: ${path}`);
    openapi.paths[path] = definition;
  }
  openapi.components ??= {};
  for (const [group, definitions] of Object.entries(fragment.components ?? {})) {
    openapi.components[group] ??= {};
    for (const [name, definition] of Object.entries(definitions)) {
      if (openapi.components[group][name]) throw new Error(`OpenAPI fragment duplicates ${group}: ${name}`);
      openapi.components[group][name] = definition;
    }
  }
}
writeFileSync(new URL("openapi.json", output), `${JSON.stringify(openapi, null, 2)}\n`);

cpSync(new URL("protocol/deal-envelope.schema.json", root), new URL("schemas/deal-envelope-0.1.json", output));
cpSync(new URL("protocol/notary-receipt.schema.json", root), new URL("schemas/notary-receipt-0.1.json", output));
console.log("Prepared Cloudflare static assets");
