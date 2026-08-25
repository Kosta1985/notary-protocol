import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const states = new Set(["submitted", "eligible", "offer_issued", "accepted", "pilot_running", "completed", "declined", "withdrawn", "expired"]);
const transitions = {
  submitted: new Set(["eligible", "declined", "withdrawn", "expired"]),
  eligible: new Set(["offer_issued", "declined", "withdrawn", "expired"]),
  offer_issued: new Set(["accepted", "declined", "withdrawn", "expired"]),
  accepted: new Set(["pilot_running", "withdrawn", "expired"]),
  pilot_running: new Set(["completed", "withdrawn", "expired"]),
  completed: new Set(), declined: new Set(), withdrawn: new Set(), expired: new Set()
};

const fail = (message) => { throw new Error(message); };
const object = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isoDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
const httpsUrl = (value) => {
  try { return new URL(value).protocol === "https:"; } catch { return false; }
};
function requireKeys(value, keys, path) {
  if (!object(value)) fail(`${path} must be an object`);
  for (const key of keys) if (!(key in value)) fail(`${path}.${key} is required`);
}

export function validateApplication(application, filename, termsSha256) {
  requireKeys(application, ["intake_version", "application_id", "application_is_acceptance", "submitted_at", "agent", "pilot", "consent", "status"], filename);
  if (application.intake_version !== "accordtrace-agent-intake/0.1") fail(`${filename}: unsupported intake_version`);
  if (!/^app_[a-z0-9][a-z0-9_-]{5,63}$/.test(application.application_id)) fail(`${filename}: invalid application_id`);
  if (filename !== "example.json" && basename(filename, ".json") !== application.application_id) fail(`${filename}: filename must match application_id`);
  if (application.application_is_acceptance !== false) fail(`${filename}: an application is never an Acceptance`);
  if (!isoDate(application.submitted_at)) fail(`${filename}: submitted_at must be RFC3339`);

  requireKeys(application.agent, ["agent_id", "agent_card_url", "interface"], `${filename}.agent`);
  if (typeof application.agent.agent_id !== "string" || application.agent.agent_id.length < 3) fail(`${filename}: invalid agent_id`);
  if (!httpsUrl(application.agent.agent_card_url)) fail(`${filename}: agent_card_url must use HTTPS`);
  requireKeys(application.agent.interface, ["type", "url"], `${filename}.agent.interface`);
  if (!["a2a", "mcp", "http"].includes(application.agent.interface.type)) fail(`${filename}: unsupported interface type`);
  if (!httpsUrl(application.agent.interface.url)) fail(`${filename}: interface URL must use HTTPS`);

  requireKeys(application.pilot, ["use_case", "proposed_test", "data_mode", "financial_activity", "personal_data", "credentials", "external_side_effects"], `${filename}.pilot`);
  if (typeof application.pilot.use_case !== "string" || application.pilot.use_case.length < 10) fail(`${filename}: use_case is too short`);
  if (typeof application.pilot.proposed_test !== "string" || application.pilot.proposed_test.length < 10) fail(`${filename}: proposed_test is too short`);
  if (application.pilot.data_mode !== "synthetic") fail(`${filename}: only synthetic intake data is allowed`);
  for (const key of ["financial_activity", "personal_data", "credentials", "external_side_effects"]) {
    if (application.pilot[key] !== false) fail(`${filename}: pilot.${key} must be false`);
  }

  requireKeys(application.consent, ["terms_version", "terms_sha256", "terms_accepted", "public_attribution", "publish_receipt", "publish_response_excerpt", "git_history_public_acknowledged"], `${filename}.consent`);
  if (application.consent.terms_version !== "0.1" || application.consent.terms_sha256 !== termsSha256) fail(`${filename}: terms do not match PARTNERS.md`);
  if (application.consent.terms_accepted !== true || application.consent.git_history_public_acknowledged !== true) fail(`${filename}: required consent is missing`);
  for (const key of ["public_attribution", "publish_receipt", "publish_response_excerpt"]) {
    if (typeof application.consent[key] !== "boolean") fail(`${filename}: consent.${key} must be boolean`);
  }

  requireKeys(application.status, ["state", "updated_at", "history"], `${filename}.status`);
  if (!states.has(application.status.state) || !isoDate(application.status.updated_at)) fail(`${filename}: invalid current status`);
  if (!Array.isArray(application.status.history) || application.status.history.length === 0) fail(`${filename}: status history is required`);
  if (application.status.history[0].state !== "submitted") fail(`${filename}: first state must be submitted`);
  for (let index = 0; index < application.status.history.length; index += 1) {
    const item = application.status.history[index];
    requireKeys(item, ["state", "at", "actor"], `${filename}.status.history[${index}]`);
    if (!states.has(item.state) || !isoDate(item.at) || typeof item.actor !== "string" || item.actor.length === 0) fail(`${filename}: invalid status history item`);
    if (index > 0 && !transitions[application.status.history[index - 1].state].has(item.state)) {
      fail(`${filename}: invalid transition ${application.status.history[index - 1].state} -> ${item.state}`);
    }
  }
  if (application.status.history.at(-1).state !== application.status.state) fail(`${filename}: current state must equal final history state`);
  if (["accepted", "pilot_running", "completed"].includes(application.status.state) && !httpsUrl(application.status.acceptance_url)) fail(`${filename}: accepted states require acceptance_url`);
  if (application.status.state === "completed" && !httpsUrl(application.status.receipt_url)) fail(`${filename}: completed state requires receipt_url`);
  return true;
}

export async function validateAll(base = root) {
  const terms = await readFile(join(base, "PARTNERS.md"));
  const termsSha256 = `sha256:${createHash("sha256").update(terms).digest("hex")}`;
  const applicationsDir = join(base, "partners", "applications");
  const applicationFiles = (await readdir(applicationsDir)).filter((name) => name.endsWith(".json")).sort();
  for (const name of applicationFiles) validateApplication(JSON.parse(await readFile(join(applicationsDir, name), "utf8")), name, termsSha256);

  const catalog = JSON.parse(await readFile(join(base, "partners", "catalog.json"), "utf8"));
  const indexed = new Map();
  for (const item of catalog.transactions ?? []) indexed.set(item.receipt_id, (indexed.get(item.receipt_id) ?? 0) + 1);
  const receiptFiles = (await readdir(join(base, "partners", "receipts"))).filter((name) => name.endsWith(".json") && !name.endsWith(".proof.json"));
  for (const name of receiptFiles) {
    const receipt = JSON.parse(await readFile(join(base, "partners", "receipts", name), "utf8"));
    if (indexed.get(receipt.receipt_id) !== 1) fail(`${name}: receipt must be indexed exactly once in partners/catalog.json`);
  }
  if (indexed.size !== receiptFiles.length) fail("partners/catalog.json contains a missing or duplicate receipt entry");
  return { applications: applicationFiles.length, receipts: receiptFiles.length, termsSha256 };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  validateAll().then((result) => console.log(`Partner intake valid: ${result.applications} application template(s), ${result.receipts} receipt(s)`)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
