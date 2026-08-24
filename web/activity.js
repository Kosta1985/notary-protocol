const value = (totals, name) => Number(totals[name] ?? 0);
const percentage = (numerator, denominator) => denominator ? `${Math.round((numerator / denominator) * 100)}%` : "—";

try {
  const response = await fetch("/v1/stats", { cache: "no-store" });
  if (!response.ok) throw new Error(`Stats unavailable (${response.status})`);
  const stats = await response.json();
  const views = value(stats.totals, "page_view");
  const demos = value(stats.totals, "demo_loaded");
  const attempts = value(stats.totals, "verification_started");
  const valid = value(stats.totals, "verification_valid");
  const invalid = value(stats.totals, "verification_invalid");
  const completed = valid + invalid;

  document.querySelector("#metric-views").textContent = views.toLocaleString();
  document.querySelector("#metric-demos").textContent = demos.toLocaleString();
  document.querySelector("#metric-verifications").textContent = attempts.toLocaleString();
  document.querySelector("#metric-valid").textContent = valid.toLocaleString();
  document.querySelector("#metric-retrievals").textContent = value(stats.totals, "receipt_retrieved").toLocaleString();
  document.querySelector("#rate-demo").textContent = percentage(demos, views);
  document.querySelector("#rate-verify").textContent = percentage(completed, attempts);
  document.querySelector("#rate-valid").textContent = percentage(valid, completed);
  document.querySelector("#activity-updated").textContent = `Updated ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;

  const maximum = Math.max(1, ...stats.daily.map((row) => value(row, "verification_started")));
  const chart = document.querySelector("#activity-chart");
  if (!stats.daily.length) {
    chart.textContent = "No activity recorded yet.";
  } else {
    chart.replaceChildren(...stats.daily.map((row) => {
      const count = value(row, "verification_started");
      const item = document.createElement("div");
      const date = document.createElement("time");
      const track = document.createElement("span");
      const bar = document.createElement("i");
      const total = document.createElement("strong");
      date.dateTime = row.day;
      date.textContent = new Date(`${row.day}T00:00:00Z`).toLocaleDateString([], { month: "short", day: "numeric", timeZone: "UTC" });
      bar.style.width = `${Math.max(2, (count / maximum) * 100)}%`;
      track.append(bar);
      total.textContent = count.toLocaleString();
      item.append(date, track, total);
      return item;
    }));
  }
} catch (error) {
  document.querySelector("#activity-chart").textContent = error.message;
  document.querySelector("#activity-updated").textContent = "Unavailable";
}
