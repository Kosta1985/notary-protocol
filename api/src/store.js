import { appendFileSync, existsSync, mkdirSync, readFileSync } from "node:fs";
import { dirname } from "node:path";

export class ReceiptStore {
  #file;
  #receipts = new Map();

  constructor(file = "./api/data/receipts.jsonl") {
    this.#file = file;
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      for (const line of readFileSync(file, "utf8").split("\n")) {
        if (!line.trim()) continue;
        try {
          const receipt = JSON.parse(line);
          this.#receipts.set(receipt.id, receipt);
        } catch {
          // Preserve availability if a final partial line remains after an interrupted write.
        }
      }
    }
  }

  save(receipt) {
    appendFileSync(this.#file, `${JSON.stringify(receipt)}\n`, { mode: 0o600 });
    this.#receipts.set(receipt.id, receipt);
    return receipt;
  }

  get(id) {
    return this.#receipts.get(id) ?? null;
  }
}
