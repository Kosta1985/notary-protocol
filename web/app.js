const input = document.querySelector("#envelope-input");
const loadDemo = document.querySelector("#load-demo");
const verifyButton = document.querySelector("#verify-button");
const editorStatus = document.querySelector("#editor-status");
const idle = document.querySelector("#result-idle");
const content = document.querySelector("#result-content");
const copyButton = document.querySelector("#copy-receipt");
const downloadButton = document.querySelector("#download-receipt");
const fileTab = document.querySelector("#file-tab");
const fileInput = document.querySelector("#file-input");
const receiptLookup = document.querySelector("#receipt-lookup");
const receiptQuery = document.querySelector("#receipt-query");
let lastReceipt = null;

async function updateNetworkStatus() {
  const status = document.querySelector("#network-status");
  try {
    const response = await fetch("/health", { cache: "no-store" });
    if (!response.ok) throw new Error();
    status.className = "network-status online";
    status.querySelector("span").textContent = "API online";
  } catch {
    status.className = "network-status offline";
    status.querySelector("span").textContent = "API offline";
  }
}

updateNetworkStatus();
setInterval(updateNetworkStatus, 30_000);
window.addEventListener("scroll", () => document.querySelector(".site-header").classList.toggle("scrolled", window.scrollY > 24), { passive: true });

const checkLabels = {
  structure: "Envelope structure",
  version: "Protocol version",
  deal_id: "Deal identifier",
  created_at: "Creation timestamp",
  parties: "Party records",
  distinct_parties: "Distinct parties",
  offer: "Offer structure",
  acceptance: "Acceptance structure",
  offer_link: "Offer linkage",
  creation_order: "Creation order",
  time_order: "Timestamp order",
  expiry_order: "Expiry order",
  not_expired: "Envelope validity window",
  signature_set: "Signature set",
  initiator_signature: "Initiator signature",
  counterparty_signature: "Counterparty signature"
};

function setBusy(busy) {
  verifyButton.disabled = busy;
  loadDemo.disabled = busy;
  verifyButton.firstChild.textContent = busy ? "Verifying… " : "Verify envelope ";
}

async function showReceipt(receipt) {
  lastReceipt = receipt;
  idle.hidden = true;
  content.hidden = false;
  const valid = receipt.valid;
  const icon = document.querySelector("#result-icon");
  icon.textContent = valid ? "✓" : "×";
  icon.classList.toggle("invalid", !valid);
  document.querySelector("#result-kicker").textContent = valid ? "Evidence intact" : "Evidence rejected";
  document.querySelector("#result-state").textContent = valid ? "Verified" : "Not verified";
  document.querySelector("#receipt-id").textContent = receipt.id;
  document.querySelector("#receipt-digest").textContent = receipt.evidenceDigest;
  document.querySelector("#receipt-time").textContent = new Date(receipt.verifiedAt).toLocaleString();
  const signatureStatus = document.querySelector("#receipt-signature");
  signatureStatus.textContent = "Checking locally…";
  document.querySelector("#checks-count").textContent = `${receipt.checks.filter((check) => check.passed).length}/${receipt.checks.length}`;
  const list = document.querySelector("#checks-list");
  list.replaceChildren(...receipt.checks.map((check) => {
    const item = document.createElement("li");
    const label = document.createElement("span");
    const state = document.createElement("span");
    label.textContent = checkLabels[check.code] ?? check.code;
    state.className = `check-state${check.passed ? "" : " failed"}`;
    state.textContent = check.passed ? "PASS" : "FAIL";
    item.append(label, state);
    return item;
  }));
  editorStatus.textContent = valid ? "Signed receipt issued" : `${receipt.violations.length} check${receipt.violations.length === 1 ? "" : "s"} failed`;
  const signatureValid = await verifyReceiptSignature(receipt);
  signatureStatus.textContent = signatureValid ? "Valid · checked locally" : "Invalid or unsupported";
  signatureStatus.className = signatureValid ? "signature-valid" : "signature-invalid";
  content.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

async function loadFile(file) {
  if (!file) return;
  if (file.size > 1_048_576) {
    editorStatus.textContent = "File exceeds 1 MiB";
    return;
  }
  try {
    const parsed = JSON.parse(await file.text());
    input.value = JSON.stringify(parsed, null, 2);
    editorStatus.textContent = `${file.name} loaded`;
  } catch {
    editorStatus.textContent = "File does not contain valid JSON";
  }
}

loadDemo.addEventListener("click", async () => {
  setBusy(true);
  editorStatus.textContent = "Generating signed envelope…";
  try {
    const response = await fetch("/v1/demo");
    if (!response.ok) throw new Error("Demo endpoint unavailable");
    input.value = JSON.stringify(await response.json(), null, 2);
    editorStatus.textContent = "Signed demo ready";
  } catch (error) {
    editorStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

verifyButton.addEventListener("click", async () => {
  let envelope;
  try {
    envelope = JSON.parse(input.value);
  } catch {
    editorStatus.textContent = "JSON is not valid";
    input.focus();
    return;
  }

  setBusy(true);
  editorStatus.textContent = "Checking cryptographic evidence…";
  try {
    const response = await fetch("/v1/verify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(envelope)
    });
    const receipt = await response.json();
    if (!receipt.checks) throw new Error(receipt.message ?? "Verification failed");
    await showReceipt(receipt);
  } catch (error) {
    editorStatus.textContent = error.message;
  } finally {
    setBusy(false);
  }
});

fileTab.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", () => loadFile(fileInput.files[0]));
for (const eventName of ["dragenter", "dragover"]) {
  input.addEventListener(eventName, (event) => { event.preventDefault(); input.classList.add("drop-target"); });
}
for (const eventName of ["dragleave", "drop"]) {
  input.addEventListener(eventName, (event) => { event.preventDefault(); input.classList.remove("drop-target"); });
}
input.addEventListener("drop", (event) => loadFile(event.dataTransfer.files[0]));

receiptLookup.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = receiptQuery.value.trim();
  if (!id) return receiptQuery.focus();
  editorStatus.textContent = "Retrieving receipt…";
  try {
    const response = await fetch(`/v1/receipts/${encodeURIComponent(id)}`);
    if (!response.ok) throw new Error("Receipt not found");
    await showReceipt(await response.json());
    editorStatus.textContent = "Stored receipt retrieved";
  } catch (error) {
    editorStatus.textContent = error.message;
  }
});

copyButton.addEventListener("click", async () => {
  if (!lastReceipt) return;
  await navigator.clipboard.writeText(JSON.stringify(lastReceipt, null, 2));
  copyButton.firstChild.textContent = "Copied ";
  setTimeout(() => { copyButton.firstChild.textContent = "Copy receipt JSON "; }, 1400);
});

downloadButton.addEventListener("click", () => {
  if (!lastReceipt) return;
  const url = URL.createObjectURL(new Blob([JSON.stringify(lastReceipt, null, 2)], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = `${lastReceipt.id}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

async function verifyReceiptSignature(receipt) {
  try {
    const { notary, ...unsigned } = receipt;
    const pemBody = notary.publicKey.replace(/-----[^-]+-----/g, "").replace(/\s/g, "");
    const keyBytes = Uint8Array.from(atob(pemBody), (character) => character.charCodeAt(0));
    const signatureBase64 = notary.signature.replace(/-/g, "+").replace(/_/g, "/");
    const padded = signatureBase64.padEnd(Math.ceil(signatureBase64.length / 4) * 4, "=");
    const signature = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
    const key = await crypto.subtle.importKey("spki", keyBytes, { name: "Ed25519" }, false, ["verify"]);
    return crypto.subtle.verify("Ed25519", key, signature, new TextEncoder().encode(canonicalize(unsigned)));
  } catch {
    return false;
  }
}

function canonicalize(value) {
  if (value === null || typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Invalid canonical JSON number");
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(value[key])}`).join(",")}}`;
  throw new TypeError("Unsupported canonical JSON value");
}

const observer = new IntersectionObserver((entries) => {
  for (const entry of entries) if (entry.isIntersecting) entry.target.classList.add("visible");
}, { threshold: .15 });
document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));
