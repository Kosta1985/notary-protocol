import { createPublicKey, verify as verifyBytes } from "node:crypto";
import { canonicalize } from "./canonicalize.js";

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isDate = (value) => typeof value === "string" && !Number.isNaN(Date.parse(value));

export function signingPayload(envelope, role) {
  const base = {
    domain: `notary.deal.${role}.v0.1`,
    version: envelope.version,
    dealId: envelope.id,
    createdAt: envelope.createdAt,
    expiresAt: envelope.expiresAt ?? null,
    initiator: envelope.initiator,
    counterparty: envelope.counterparty,
    offer: envelope.offer
  };

  if (role === "counterparty") base.acceptance = envelope.acceptance;
  return base;
}

function verifySignature(envelope, role) {
  const signature = envelope.signatures.find((item) => item?.role === role);
  const party = envelope[role];
  if (!signature || signature.algorithm !== "Ed25519" || !party?.publicKey) return false;

  try {
    const key = createPublicKey(party.publicKey);
    if (key.asymmetricKeyType !== "ed25519") return false;
    return verifyBytes(
      null,
      Buffer.from(canonicalize(signingPayload(envelope, role))),
      key,
      Buffer.from(signature.value, "base64url")
    );
  } catch {
    return false;
  }
}

export function verifyEnvelope(envelope, now = new Date()) {
  const checks = [];
  const add = (code, passed) => checks.push({ code, passed: Boolean(passed) });

  add("structure", isObject(envelope));
  if (!isObject(envelope)) return checks;

  add("version", envelope.version === "0.1");
  add("deal_id", typeof envelope.id === "string" && envelope.id.length > 0 && envelope.id.length <= 200);
  add("created_at", isDate(envelope.createdAt));
  add("parties", isObject(envelope.initiator) && isObject(envelope.counterparty));
  add("distinct_parties", envelope.initiator?.id && envelope.counterparty?.id && envelope.initiator.id !== envelope.counterparty.id);
  add("offer", isObject(envelope.offer) && typeof envelope.offer.id === "string" && isObject(envelope.offer.terms) && isDate(envelope.offer.createdAt) && typeof envelope.offer.nonce === "string" && envelope.offer.nonce.length >= 16);
  add("acceptance", isObject(envelope.acceptance) && isDate(envelope.acceptance.acceptedAt) && typeof envelope.acceptance.nonce === "string" && envelope.acceptance.nonce.length >= 16);
  add("offer_link", envelope.acceptance?.offerId === envelope.offer?.id);
  add("creation_order", isDate(envelope.createdAt) && isDate(envelope.offer?.createdAt) && Date.parse(envelope.offer.createdAt) >= Date.parse(envelope.createdAt));
  add("time_order", isDate(envelope.offer?.createdAt) && isDate(envelope.acceptance?.acceptedAt) && Date.parse(envelope.acceptance.acceptedAt) >= Date.parse(envelope.offer.createdAt));
  add("expiry_order", envelope.expiresAt == null || (isDate(envelope.expiresAt) && isDate(envelope.acceptance?.acceptedAt) && Date.parse(envelope.expiresAt) >= Date.parse(envelope.acceptance.acceptedAt)));
  add("not_expired", envelope.expiresAt == null || (isDate(envelope.expiresAt) && Date.parse(envelope.expiresAt) >= now.getTime()));
  add("signature_set", Array.isArray(envelope.signatures) && envelope.signatures.length === 2 && new Set(envelope.signatures.map((item) => item?.role)).size === 2);
  add("initiator_signature", Array.isArray(envelope.signatures) && verifySignature(envelope, "initiator"));
  add("counterparty_signature", Array.isArray(envelope.signatures) && verifySignature(envelope, "counterparty"));

  return checks;
}
