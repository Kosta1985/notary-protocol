import { generateKeyPairSync, randomBytes, sign } from "node:crypto";
import { canonicalize } from "./canonicalize.js";
import { signingPayload } from "./protocol.js";

const exportPublic = (key) => key.export({ type: "spki", format: "pem" });

export function createSignedDemo(now = new Date()) {
  const initiatorKeys = generateKeyPairSync("ed25519");
  const counterpartyKeys = generateKeyPairSync("ed25519");
  const timestamp = now.toISOString();
  const envelope = {
    version: "0.1",
    id: `deal_${randomBytes(9).toString("base64url")}`,
    createdAt: timestamp,
    expiresAt: new Date(now.getTime() + 86_400_000).toISOString(),
    initiator: { id: "agent:atlas", publicKey: exportPublic(initiatorKeys.publicKey) },
    counterparty: { id: "agent:relay", publicKey: exportPublic(counterpartyKeys.publicKey) },
    offer: {
      id: `offer_${randomBytes(9).toString("base64url")}`,
      createdAt: timestamp,
      nonce: randomBytes(16).toString("base64url"),
      terms: {
        action: "summarize_document",
        inputDigest: "sha256:demo-input",
        outputFormat: "application/json",
        deadline: new Date(now.getTime() + 3_600_000).toISOString()
      }
    },
    acceptance: {
      offerId: "",
      acceptedAt: new Date(now.getTime() + 1_000).toISOString(),
      nonce: randomBytes(16).toString("base64url")
    },
    signatures: []
  };
  envelope.acceptance.offerId = envelope.offer.id;
  envelope.signatures = [
    {
      role: "initiator",
      algorithm: "Ed25519",
      value: sign(null, Buffer.from(canonicalize(signingPayload(envelope, "initiator"))), initiatorKeys.privateKey).toString("base64url")
    },
    {
      role: "counterparty",
      algorithm: "Ed25519",
      value: sign(null, Buffer.from(canonicalize(signingPayload(envelope, "counterparty"))), counterpartyKeys.privateKey).toString("base64url")
    }
  ];
  return envelope;
}
