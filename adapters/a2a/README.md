# A2A adapter

`createNotaryA2AHandler` maps an A2A task containing `data.dealEnvelope` to a completed task with a `NotaryReceipt` artifact. The HTTP transport remains the responsibility of the host A2A server so the adapter can fit existing deployments.
