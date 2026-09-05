"""CrewAI + AccordTrace Streamable HTTP MCP example.

Install:
  pip install 'crewai[tools]'
Run with your configured CrewAI model credentials:
  python examples/framework-handoff/crewai.py
"""

from __future__ import annotations

import os

from crewai import Agent, Crew, LLM, Process, Task
from crewai_tools import MCPServerAdapter

from common import MCP_URL, create_evidence, create_proof, print_result, verification_prompt


def main() -> None:
    evidence = create_evidence("crewai-mcp")
    proof = create_proof(evidence, "crewai-mcp")

    server_params = {
        "url": MCP_URL,
        "transport": "streamable-http",
        "headers": {"X-AccordTrace-Telemetry": "exclude"},
    }
    llm = LLM(model=os.getenv("CREWAI_MODEL", "openai/gpt-5.4"))

    with MCPServerAdapter(server_params) as tools:
        verify_tools = [tool for tool in tools if getattr(tool, "name", "") == "accord_trace_verify"]
        if len(verify_tools) != 1:
            raise RuntimeError("AccordTrace accord_trace_verify tool was not discovered exactly once")

        verifier = Agent(
            role="Cross-agent evidence verifier",
            goal="Verify exact incoming synthetic handoff evidence before it is trusted.",
            backstory="You enforce an evidence-first handoff policy and never alter evidence before verification.",
            tools=verify_tools,
            llm=llm,
            allow_delegation=False,
            verbose=False,
        )
        task = Task(
            description=verification_prompt(proof["proof_id"], evidence),
            expected_output="A concise statement reporting valid and hash_match from AccordTrace verification.",
            agent=verifier,
        )
        result = Crew(
            agents=[verifier],
            tasks=[task],
            process=Process.sequential,
            verbose=False,
        ).kickoff()

    print_result("CrewAI / Streamable HTTP MCP", proof, evidence, result)


if __name__ == "__main__":
    main()
