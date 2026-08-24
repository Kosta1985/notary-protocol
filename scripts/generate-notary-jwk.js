import { generateKeyPairSync } from "node:crypto";

const { privateKey } = generateKeyPairSync("ed25519");
process.stdout.write(`${JSON.stringify(privateKey.export({ format: "jwk" }))}\n`);
