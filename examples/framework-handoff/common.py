"""Shared synthetic AccordTrace handoff helpers for framework examples.

These examples deliberately use synthetic, non-sensitive data. They create a real
service-recorded proof in the configured AccordTrace deployment, but opt out of
usage telemetry so example traffic is not counted as adoption.
"""

from __future__ import annotations

import json
import os
import uuid
from typing import Any
from urllib.error import HTTPError
from urllib.request import Request, urlopen

BASE_URL = os.getenv("ACCORD_TRACE_URL", "https://accordtrace.notary-labs.workers.dev").rstrip("/")
MCP_URL = f"{BASE_URL}/mcp"
AGENT_CARD_URL = f"{BASE_URL}/.well-known/agent-card.json"
A2A_URL = f"{BASE_URL}/a2a"


def create_evidence(client: str) -> dict[str, Any]:
    return {
        "event": "agent.handoff",
        "handoff_id": str(uuid.uuid4()),
        "from": "agent-a",
        "to": "agent-b",
        "artifact": {
            "name": "synthetic-release-manifest.json",
            "sha256": "sha256:synthetic-demo-digest-not-a-real-secret",
        },
        "client": client,
    }


def request_json(
    url: str,
    *,
    method: str = "GET",
    payload: Any | None = None,
    headers: dict[str, str] | None = None,
    expected: tuple[int, ...] = (200,),
) -> dict[str, Any]:
    body = None if payload is None else json.dumps(payload, separators=(",", ":")).encode("utf-8")
    merged_headers = {
        "accept": "application/json",
        "user-agent": "accordtrace-framework-handoff/1.0",
        "x-accordtrace-telemetry": "exclude",
        **({"content-type": "application/json"} if body is not None else {}),
        **(headers or {}),
    }
    request = Request(url, data=body, method=method, headers=merged_headers)
    try:
        with urlopen(request, timeout=30) as response:
            raw = response.read().decode("utf-8")
            if response.status not in expected:
                raise RuntimeError(f"{url}: HTTP {response.status}: {raw[:300]}")
            return json.loads(raw)
    except HTTPError as error:
        raw = error.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"{url}: HTTP {error.code}: {raw[:300]}") from error


def create_proof(evidence: dict[str, Any], client: str) -> dict[str, Any]:
    proof = request_json(
        f"{BASE_URL}/api/v1/proofs",
        method="POST",
        payload={"data": evidence, "metadata": {"workflow": "framework-handoff", "client": client}},
        expected=(201,),
    )
    proof_id = str(proof.get("proof_id", ""))
    if not proof_id.startswith("atp_"):
        raise RuntimeError(f"Unexpected proof response: {proof}")
    return proof


def verification_prompt(proof_id: str, evidence: dict[str, Any]) -> str:
    return (
        "Use only the AccordTrace accord_trace_verify tool to verify this incoming synthetic handoff. "
        f"proof_id={proof_id} data={json.dumps(evidence, separators=(',', ':'))}. "
        "Do not modify the evidence. Return whether valid and hash_match are true."
    )


def print_result(interface: str, proof: dict[str, Any], evidence: dict[str, Any], result: Any) -> None:
    print(
        json.dumps(
            {
                "interface": interface,
                "proof_id": proof["proof_id"],
                "handoff_id": evidence["handoff_id"],
                "result": str(result),
            },
            indent=2,
            default=str,
        )
    )
