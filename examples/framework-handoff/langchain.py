"""LangChain/LangGraph-compatible AccordTrace MCP handoff example.

Install:
  pip install langchain langchain-mcp-adapters langchain-openai
Run:
  OPENAI_API_KEY=... python examples/framework-handoff/langchain.py
"""

from __future__ import annotations

import asyncio
import os

from langchain.agents import create_agent
from langchain_mcp_adapters.client import MultiServerMCPClient

from common import MCP_URL, create_evidence, create_proof, print_result, verification_prompt


async def main() -> None:
    evidence = create_evidence("langchain-mcp")
    proof = create_proof(evidence, "langchain-mcp")

    client = MultiServerMCPClient(
        {
            "accordtrace": {
                "transport": "http",
                "url": MCP_URL,
                "headers": {"X-AccordTrace-Telemetry": "exclude"},
            }
        },
        handle_tool_errors=False,
    )
    tools = await client.get_tools()
    verify_tools = [tool for tool in tools if getattr(tool, "name", "") == "accord_trace_verify"]
    if len(verify_tools) != 1:
        raise RuntimeError("AccordTrace accord_trace_verify tool was not discovered exactly once")

    agent = create_agent(os.getenv("LANGCHAIN_MODEL", "openai:gpt-5.4"), verify_tools)
    response = await agent.ainvoke(
        {"messages": [{"role": "user", "content": verification_prompt(proof["proof_id"], evidence)}]}
    )
    print_result("LangChain / MCP adapter", proof, evidence, response)


if __name__ == "__main__":
    asyncio.run(main())
