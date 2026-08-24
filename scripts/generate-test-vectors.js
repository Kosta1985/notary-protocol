import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { canonicalize, digest } from "../api/src/canonicalize.js";
import { createNotary } from "../api/src/notary.js";
import { signingPayload } from "../api/src/protocol.js";

const directory = new URL("../protocol/test-vectors/", import.meta.url);
mkdirSync(directory, { recursive: true });
const initiator = generateKeyPairSync("ed25519");
const counterparty = generateKeyPairSync("ed25519");
const notaryKeys = generateKeyPairSync("ed25519");
const publicPem = (key) => key.export({ type: "spki", format: "pem" });
const envelope = {
  version: "0.1",
  id: "deal_conformance_001",
  createdAt: "2026-08-24T00:00:00.000Z",
  expiresAt: "2099-12-31T23:59:59.000Z",
  initiator: { id: "agent:test-initiator", publicKey: publicPem(initiator.publicKey) },
  counterparty: { id: "agent:test-counterparty", publicKey: publicPem(counterparty.publicKey) },
  offer: {
    id: "offer_conformance_001",
    createdAt: "2026-08-24T00:00:00.000Z",
    nonce: randomBytes(16).toString("base64url"),
    terms: { action: "conformance_test", count: 3, nested: { enabled: true, labels: ["alpha", "beta"] } }
  },
  acceptance: {
    offerId: "offer_conformance_001",
    acceptedAt: "2026-08-24T00:00:01.000Z",
    nonce: randomBytes(16).toString("base64url")
  },
  signatures: []
};

for (const [role, keys] of [["initiator", initiator], ["counterparty", counterparty]]) {
  envelope.signatures.push({
    role,
    algorithm: "Ed25519",
    value: sign(null, Buffer.from(canonicalize(signingPayload(envelope, role))), keys.privateKey).toString("base64url")
  });
}

const verifiedAt = new Date("2026-08-24T00:00:02.000Z");
const receipt = createNotary({ privateKey: notaryKeys.privateKey }).verify(envelope, verifiedAt);
const tampered = structuredClone(envelope);
tampered.offer.terms.count = 4;
const expected = {
  evidenceDigest: digest(envelope),
  initiatorSigningPayload: canonicalize(signingPayload(envelope, "initiator")),
  counterpartySigningPayload: canonicalize(signingPayload(envelope, "counterparty")),
  receipt
};

const write = (name, value) => writeFileSync(new URL(name, directory), `${JSON.stringify(value, null, 2)}\n`);
write("valid-envelope.json", envelope);
write("tampered-envelope.json", tampered);
write("expected.json", expected);
console.log("Generated Notary Protocol 0.1 conformance vectors");
