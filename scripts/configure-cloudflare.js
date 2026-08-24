import { readFileSync, writeFileSync } from "node:fs";

const databaseId = process.argv[2];
if (!databaseId || !/^[0-9a-f-]{20,}$/i.test(databaseId)) {
  console.error("Usage: node scripts/configure-cloudflare.js <D1_DATABASE_ID>");
  process.exit(1);
}

const file = new URL("../wrangler.jsonc", import.meta.url);
const configuration = JSON.parse(readFileSync(file, "utf8"));
configuration.d1_databases[0].database_id = databaseId;
writeFileSync(file, `${JSON.stringify(configuration, null, 2)}\n`);
console.log("Configured D1 database binding in wrangler.jsonc");
