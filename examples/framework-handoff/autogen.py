"""Microsoft AutoGen + AccordTrace Streamable HTTP MCP example.

Install:
  pip install -U autogen-agentchat 'autogen-ext[openai,mcp]'
Run:
  OPENAI_API_KEY=... python examples/framework-handoff/autogen.py
"""

from __future__ import annotations

import asyncio
import os

from autogen_agentchat.agents import AssistantAgent
from autogen_ext.models.openai import OpenAIChatCompletionClient
from autogen_ext.tools.mcp import StreamableHttpServerParams, mcp_server_tools

from common import MCP_URL, create_evidence, create_proof, print_result, verification_prompt


async def main() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("Set OPENAI_API_KEY before running this example")

    evidence = create_evidence("autogen-mcp")
    proof = create_proof(evidence, "autogen-mcp")

    server_params = StreamableHttpServerParams(
        url=MCP_URL,
        headers={"X-AccordTrace-Telemetry": "exclude"},
        timeout=30.0,
        sse_read_timeout=120.0,
        terminate_on_close=True,
    )
    tools = await mcp_server_tools(server_params)
    verify_tools = [tool for tool in tools if getattr(tool, "name", "") == "accord_trace_verify"]
    if len(verify_tools) != 1:
        raise RuntimeError("AccordTrace accord_trace_verify tool was not discovered exactly once")

    model_client = OpenAIChatCompletionClient(model=os.getenv("AUTOGEN_MODEL", "gpt-5.4"))
    try:
        verifier = AssistantAgent(
            name="accordtrace_verifier",
            model_client=model_client,
            tools=verify_tools,
            system_message=(
                "Verify exact incoming synthetic handoff evidence with AccordTrace before relying on it. "
                "Never invent proof IDs and never alter evidence before verification."
            ),
            reflect_on_tool_use=True,
        )
        result = await verifier.run(task=verification_prompt(proof["proof_id"], evidence))
    finally:
        await model_client.close()

    print_result("Microsoft AutoGen / Streamable HTTP MCP", proof, evidence, result)


if __name__ == "__main__":
    asyncio.run(main())
