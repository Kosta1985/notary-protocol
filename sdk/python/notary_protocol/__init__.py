"""Dependency-free Python client for Notary Protocol."""

from __future__ import annotations

import json
from typing import Any
from urllib.error import HTTPError
from urllib.parse import quote
from urllib.request import Request, urlopen

__all__ = ["NotaryClient", "signing_payload"]
__version__ = "0.1.0"


def signing_payload(envelope: dict[str, Any], role: str) -> dict[str, Any]:
    if role not in {"initiator", "counterparty"}:
        raise ValueError("role must be 'initiator' or 'counterparty'")
    payload = {
        "domain": f"notary.deal.{role}.v0.1",
        "version": envelope["version"],
        "dealId": envelope["id"],
        "createdAt": envelope["createdAt"],
        "expiresAt": envelope.get("expiresAt"),
        "initiator": envelope["initiator"],
        "counterparty": envelope["counterparty"],
        "offer": envelope["offer"],
    }
    if role == "counterparty":
        payload["acceptance"] = envelope["acceptance"]
    return payload


class NotaryClient:
    def __init__(self, base_url: str, timeout: float = 10.0) -> None:
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def verify(self, envelope: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/verify", envelope)

    def get_receipt(self, receipt_id: str) -> dict[str, Any]:
        return self._request("GET", f"/v1/receipts/{quote(receipt_id, safe='')}")

    def verify_receipt(self, receipt: dict[str, Any]) -> dict[str, Any]:
        return self._request("POST", "/v1/receipts/verify", receipt)

    def _request(self, method: str, path: str, body: dict[str, Any] | None = None) -> dict[str, Any]:
        data = json.dumps(body).encode() if body is not None else None
        request = Request(
            f"{self.base_url}{path}",
            data=data,
            method=method,
            headers={"content-type": "application/json"},
        )
        try:
            with urlopen(request, timeout=self.timeout) as response:
                return json.load(response)
        except HTTPError as error:
            payload = json.load(error)
            if "checks" in payload:
                return payload
            raise RuntimeError(payload.get("message", f"Notary request failed ({error.code})")) from error
