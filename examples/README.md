# Examples

Run a complete public verification without installing dependencies:

```bash
node examples/verify.mjs
python examples/verify.py
```

Both examples request a fresh signed DealEnvelope, submit it to the verifier, and print the resulting receipt summary. Set `NOTARY_URL` to test another deployment.
