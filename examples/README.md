# Examples

Run a complete public verification without installing dependencies:

```bash
node examples/verify.mjs
python examples/verify.py
```

Both examples request a fresh signed DealEnvelope, submit it to the verifier, and print the resulting receipt summary. Set `NOTARY_URL` to test another deployment.

For current Accord Trace production handoffs over REST, MCP, A2A, OpenAI, and Claude, see [`agent-handoff/README.md`](./agent-handoff/README.md).
