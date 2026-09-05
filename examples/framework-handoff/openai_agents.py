"""OpenAI Agents SDK + AccordTrace Streamable HTTP MCP example.

Install:
  pip install openai-agents
Run:
  OPENAI_API_KEY=... python examples/framework-handoff/openai_agents.py
"""

from __future__ import annotations

import asyncio
import os

from agents import Agent, Runner
from agents.mcp import MCPServerStreamableHttp, create_static_tool_filter

from common import MCP_URL, create_evidence, create_proof, print_result, verification_prompt

VERIFY_TOOL = "accord_trace_verify"


async def main() -> None:
    if not os.getenv("OPENAI_API_KEY"):
        raise SystemExit("Set OPENAI_API_KEY before running this example")

    evidence = create_evidence("openai-agents-sdk")
    proof = create_proof(evidence, "openai-agents-sdk")

    async with MCPServerStreamableHttp(
        name="AccordTrace",
        params={
            "url": MCP_URL,
            "headers": {"X-AccordTrace-Telemetry": "exclude"},
            "timeout": 20,
        },
        tool_filter=create_static_tool_filter(allowed_tool_names=[VERIFY_TOOL]),
        cache_tools_list=True,
        max_retry_attempts=2,
    ) as server:
        discovered = await server.list_tools()
        discovered_names = {str(getattr(tool, "name", "")) for tool in discovered}
        if VERIFY_TOOL not in discovered_names:
            raise RuntimeError(f"AccordTrace {VERIFY_TOOL} tool was not discovered")

        agent = Agent(
            name="AccordTraceHandoffVerifier",
            model=os.getenv("OPENAI_MODEL", "gpt-5.4"),
            instructions=(
                "You receive synthetic cross-agent handoffs. Use AccordTrace to verify the exact incoming "
                "evidence before relying on it. Never invent proof IDs or alter evidence before verification."
            ),
            mcp_servers=[server],
        )
        result = await Runner.run(agent, verification_prompt(proof["proof_id"], evidence))

    print_result("OpenAI Agents SDK / Streamable HTTP MCP", proof, evidence, result.final_output)


if __name__ == "__main__":
    asyncio.run(main())
