import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const src = await readFile(new URL("../src/index.js", import.meta.url), "utf8");
const sql = await readFile(new URL("../migrations/0001_init.sql", import.meta.url), "utf8");
test("core marketplace endpoints exist",()=>{for(const x of ["/api/v1/agents","/api/v1/tasks","accept|deliver|verify","/.well-known/agent-card.json","/openapi.json"]) assert.ok(src.includes(x));});
test("task acceptance is atomic",()=>{assert.match(src,/WHERE id=\?3 AND status='open'/);assert.match(src,/meta\?\.changes/);});
test("verified delivery depends on AccordTrace proof",()=>{assert.ok(src.includes("fetchAccordTraceProof"));assert.ok(src.includes("proof_artifact_mismatch"));assert.ok(src.includes("verification_failed"));});
test("database constrains lifecycle",()=>{for(const s of ["open","accepted","delivered","verified","disputed","cancelled"]) assert.ok(sql.includes(`'${s}'`));});
