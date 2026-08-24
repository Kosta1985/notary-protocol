# Deployment

## Runtime

The service requires Node.js 20 or later and has no runtime package dependencies. Run `node api/src/server.js` or build the included container image.

## Configuration

| Variable | Default | Purpose |
| --- | --- | --- |
| `HOST` | `127.0.0.1` | Listen address |
| `PORT` | `8787` | HTTP port |
| `NOTARY_DATA_DIR` | `./api/data` | Receipt and key storage |
| `NOTARY_KEY_FILE` | `<data-dir>/notary-key.pem` | Existing or generated PKCS8 key |
| `CORS_ORIGIN` | `*` | Allowed web origin |
| `RATE_LIMIT` | `120` | Maximum POST requests per client in one window |
| `RATE_LIMIT_WINDOW_MS` | `60000` | Rate-limit window in milliseconds |

## Production checklist

- Mount the data directory on durable encrypted storage.
- Back up the notary private key separately and restrict it to the service identity.
- Terminate TLS at a trusted reverse proxy or load balancer.
- Set an exact CORS origin when the browser UI is hosted separately.
- Add deployment-level authentication, rate limiting, monitoring and retention controls.
- Publish and pin the notary public key through a trusted channel.
- Do not log complete envelopes when their terms contain sensitive data.

The JSONL receipt store is intentionally small and auditable. Multi-instance deployments should replace the `ReceiptStore` interface with a shared durable implementation before accepting production traffic.
