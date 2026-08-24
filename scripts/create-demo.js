import { createSignedDemo } from "../api/src/demo.js";

process.stdout.write(`${JSON.stringify(createSignedDemo(), null, 2)}\n`);
