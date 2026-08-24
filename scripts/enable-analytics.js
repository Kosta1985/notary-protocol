import { readFileSync, writeFileSync } from "node:fs";

const file = new URL("../wrangler.jsonc", import.meta.url);
const configuration = JSON.parse(readFileSync(file, "utf8"));
const routes = configuration.assets?.run_worker_first;
if (!Array.isArray(routes)) throw new Error("wrangler.jsonc does not contain assets.run_worker_first");
if (!routes.includes("/")) routes.unshift("/");
writeFileSync(file, `${JSON.stringify(configuration, null, 2)}\n`);
console.log("Enabled aggregate page-view analytics without changing the D1 database binding");
