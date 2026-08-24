# TypeScript SDK

```ts
import { NotaryClient } from "@notary-protocol/sdk";

const notary = new NotaryClient("http://localhost:8787");
const receipt = await notary.verify(envelope);
console.log(receipt.valid, receipt.id);

const receiptCheck = await notary.verifyReceipt(receipt);
console.log(receiptCheck.valid);
```

The package has no runtime dependencies. It exports typed protocol objects, canonical JSON encoding, signing payload construction, and the HTTP client.
