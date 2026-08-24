"""Verify a fresh signed envelope against the public Notary Protocol endpoint."""

import json
import os
from urllib.request import Request, urlopen

base_url = os.environ.get("NOTARY_URL", "https://notary-protocol.notary-labs.workers.dev")
with urlopen(f"{base_url}/v1/demo", timeout=10) as response:
    envelope = json.load(response)

request = Request(
    f"{base_url}/v1/verify",
    data=json.dumps(envelope).encode(),
    headers={"content-type": "application/json"},
    method="POST",
)
with urlopen(request, timeout=10) as response:
    receipt = json.load(response)

print(json.dumps({
    "receiptId": receipt["id"],
    "valid": receipt["valid"],
    "checks": len(receipt["checks"]),
    "violations": receipt["violations"],
}, indent=2))
