import { NotaryClient } from "../../sdk/typescript/dist/index.js";

export function createNotaryA2AHandler({ baseUrl = "http://127.0.0.1:8787" } = {}) {
  const client = new NotaryClient(baseUrl);
  return async function handle(task) {
    const message = task?.params?.message ?? task?.message;
    const envelope = message?.parts?.find((part) => part.data?.dealEnvelope)?.data?.dealEnvelope;
    if (!envelope) throw new TypeError("A2A task must include data.dealEnvelope");
    const receipt = await client.verify(envelope);
    return {
      id: task.id,
      status: { state: "completed", timestamp: new Date().toISOString() },
      artifacts: [{ name: "NotaryReceipt", parts: [{ data: { notaryReceipt: receipt } }] }]
    };
  };
}
