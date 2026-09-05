const originalFetch = globalThis.fetch;

if (typeof originalFetch === "function") {
  globalThis.fetch = function monitoredFetch(input, init = {}) {
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("x-notary-monitor", "live-smoke");
    return originalFetch(input, { ...init, headers });
  };
}
