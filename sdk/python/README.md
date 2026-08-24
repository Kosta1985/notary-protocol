# Python SDK

```python
from notary_protocol import NotaryClient

notary = NotaryClient("http://localhost:8787")
receipt = notary.verify(envelope)
print(receipt["valid"], receipt["id"])

receipt_check = notary.verify_receipt(receipt)
print(receipt_check["valid"])
```

The package uses only the Python standard library. Applications that sign payloads should pass `signing_payload(...)` through an RFC 8785 canonicalizer supplied by their cryptographic stack.
