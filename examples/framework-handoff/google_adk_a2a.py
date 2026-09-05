"""Google ADK/A2A v1 protocol-level AccordTrace handoff example.

Google ADK's A2A integration uses the A2A SDK. This example stays at that
protocol layer so the structured AccordTrace action is explicit and reproducible.

Install:
  pip install 'google-adk[a2a]' httpx
Run:
  python examples/framework-handoff/google_adk_a2a.py
"""

from __future__ import annotations

import asyncio
import uuid

import httpx
from a2a.client import ClientConfig, create_client
from a2a.types import Message, Part, Role, SendMessageRequest
from google.protobuf.json_format import MessageToDict, ParseDict
from google.protobuf.struct_pb2 import Value

from common import BASE_URL, create_evidence, create_proof, print_result


async def main() -> None:
    evidence = create_evidence("google-adk-a2a-v1")
    proof = create_proof(evidence, "google-adk-a2a-v1")

    action = {
        "action": "verify_proof",
        "arguments": {"proof_id": proof["proof_id"], "data": evidence},
    }
    part = Part(
        data=ParseDict(action, Value()),
        media_type="application/json",
    )
    message = Message(
        role=Role.ROLE_USER,
        message_id=str(uuid.uuid4()),
        parts=[part],
    )
    request = SendMessageRequest(message=message)

    verification = None
    async with httpx.AsyncClient(
        timeout=30.0,
        headers={"X-AccordTrace-Telemetry": "exclude"},
    ) as httpx_client:
        client = await create_client(
            BASE_URL,
            client_config=ClientConfig(httpx_client=httpx_client, streaming=False),
            relative_card_path="/.well-known/agent-card.json",
        )
        try:
            async for chunk in client.send_message(request):
                if not chunk.HasField("task"):
                    continue
                for artifact in chunk.task.artifacts:
                    for result_part in artifact.parts:
                        if result_part.HasField("data"):
                            candidate = MessageToDict(result_part.data)
                            if isinstance(candidate, dict) and "valid" in candidate:
                                verification = candidate
        finally:
            await client.close()

    if not verification or verification.get("valid") is not True or verification.get("hash_match") is not True:
        raise RuntimeError(f"A2A verification failed: {verification}")

    print_result("Google ADK-compatible A2A v1 client", proof, evidence, verification)


if __name__ == "__main__":
    asyncio.run(main())
