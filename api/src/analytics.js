import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export const ANALYTICS_EVENTS = new Set([
  "page_view",
  "demo_loaded",
  "verification_started",
  "verification_valid",
  "verification_invalid",
  "receipt_retrieved"
]);

export class AnalyticsStore {
  #file;
  #counts = {};

  constructor(file = "./api/data/analytics.json") {
    this.#file = file;
    mkdirSync(dirname(file), { recursive: true });
    if (existsSync(file)) {
      try { this.#counts = JSON.parse(readFileSync(file, "utf8")); } catch { this.#counts = {}; }
    }
  }

  record(event, now = new Date()) {
    if (!ANALYTICS_EVENTS.has(event)) throw new TypeError("Unsupported analytics event");
    const day = now.toISOString().slice(0, 10);
    this.#counts[day] ??= {};
    this.#counts[day][event] = (this.#counts[day][event] ?? 0) + 1;
    try {
      const temporary = `${this.#file}.tmp`;
      writeFileSync(temporary, JSON.stringify(this.#counts), { mode: 0o600 });
      renameSync(temporary, this.#file);
    } catch {
      // Telemetry must never interrupt verification.
    }
  }

  summary(days = 30, now = new Date()) {
    const threshold = new Date(now);
    threshold.setUTCDate(threshold.getUTCDate() - days + 1);
    const minimumDay = threshold.toISOString().slice(0, 10);
    const daily = Object.entries(this.#counts)
      .filter(([day]) => day >= minimumDay)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([day, events]) => ({ day, ...events }));
    const totals = {};
    for (const row of daily) {
      for (const [event, count] of Object.entries(row)) {
        if (event !== "day") totals[event] = (totals[event] ?? 0) + count;
      }
    }
    return { windowDays: days, totals, daily, privacy: "Aggregate event counts only; no user identifiers are stored." };
  }
}
