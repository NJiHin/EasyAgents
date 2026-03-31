import asyncio
from google.adk.agents import Agent
from google.adk.agents.callback_context import CallbackContext
from google.adk.models.llm_request import LlmRequest
from google.adk.tools import FunctionTool
from google.genai import types as genai_types
from app.tools.tools import (
    TOOL_MAP,
    EVALUATOR_TOOL_MAP,
    ORCHESTRATOR_TOOLS,
    ORCHESTRATOR_PREAMBLE,
    SUBAGENT_PREAMBLE,
    EVALUATOR_PREAMBLE,
    set_run_context,
    make_invoke_evaluator,
    make_list_tools,
)
from app.models import GraphDefinition
import app.session.store as store


def _cancel_callback(
    callback_context: CallbackContext,
    llm_request: LlmRequest,
) -> genai_types.GenerateContentResponse | None:
    """Return a stub response to abort this LLM call if the run is cancelled."""
    if store.cancelled:
        return genai_types.GenerateContentResponse(
            candidates=[
                genai_types.Candidate(
                    content=genai_types.Content(
                        role="model",
                        parts=[genai_types.Part(text="[cancelled]")],
                    ),
                    finish_reason=genai_types.FinishReason.STOP,
                )
            ]
        )
    return None


def build_graph(
    graph: GraphDefinition,
    queue: asyncio.Queue,
) -> Agent:
    name_to_id = {n.data.name: n.id for n in graph.nodes}

    orchestrator_node = next(n for n in graph.nodes if n.data.role == "orchestrator")
    evaluator_nodes = [n for n in graph.nodes if n.data.role == "evaluator"]
    worker_nodes = [n for n in graph.nodes if n.data.role == "subagent"]

    # Build all evaluator agents keyed by node id; not added to sub_agent_map
    evaluator_agents: dict[str, Agent] = {}
    for ev_node in evaluator_nodes:
        ev_tools = [EVALUATOR_TOOL_MAP[t] for t in ev_node.data.enabledTools if t in EVALUATOR_TOOL_MAP]
        all_ev_tools = [FunctionTool(make_list_tools(ev_tools, agent_name=ev_node.data.name, agent_id=ev_node.id))] + ev_tools
        evaluator_agents[ev_node.id] = Agent(
            name=ev_node.data.name,
            description=(ev_node.data.systemPrompt or "")[:120],
            model="gemini-2.5-flash",
            instruction=EVALUATOR_PREAMBLE + "\n\n" + (ev_node.data.systemPrompt or ""),
            tools=all_ev_tools,
            before_model_callback=_cancel_callback,
        )

    # Map each worker node id → (evaluator Agent, max_iterations)
    # A worker has an evaluator if there is an edge worker→evaluator and evaluator→worker.
    worker_evaluator_map: dict[str, tuple[Agent, int]] = {}
    for ev_node in evaluator_nodes:
        ev_id = ev_node.id
        incoming = [e for e in graph.edges if e.target == ev_id]
        outgoing = [e for e in graph.edges if e.source == ev_id]
        if len(incoming) == 1 and len(outgoing) == 1 and incoming[0].source == outgoing[0].target:
            worker_node_id = incoming[0].source
            worker_evaluator_map[worker_node_id] = (
                evaluator_agents[ev_id],
                ev_node.data.maxIterations,
            )

    # Build sub-agent map (workers only)
    # Each worker that owns an evaluator gets a dedicated invoke_evaluator closure injected.

    # Two-pass: first create all worker Agent objects (so we can pass them to make_invoke_evaluator)
    worker_agents: dict[str, Agent] = {}
    for node in worker_nodes:
        base_tools = [TOOL_MAP[t] for t in node.data.enabledTools if t in TOOL_MAP]
        all_tools = [FunctionTool(make_list_tools(base_tools, agent_name=node.data.name, agent_id=node.id))] + base_tools
        agent = Agent(
            name=node.data.name,
            description=(node.data.systemPrompt or "")[:120],
            model="gemini-2.5-flash",
            instruction=SUBAGENT_PREAMBLE + "\n\n" + (node.data.systemPrompt or "You are a helpful assistant."),
            tools=all_tools,
            before_model_callback=_cancel_callback,
        )
        worker_agents[node.id] = agent

    # Second pass: rebuild agents that need invoke_evaluator injected
    for node in worker_nodes:
        if node.id in worker_evaluator_map:
            ev_agent, max_iter = worker_evaluator_map[node.id]
            worker_agent = worker_agents[node.id]
            invoke_evaluator_fn = make_invoke_evaluator(ev_agent, worker_agent, max_iter)
            base_tools = [TOOL_MAP[t] for t in node.data.enabledTools if t in TOOL_MAP]
            all_tools = [FunctionTool(invoke_evaluator_fn)] + base_tools
            agent = Agent(
                name=node.data.name,
                description=(node.data.systemPrompt or "")[:120],
                model="gemini-2.5-flash",
                instruction=SUBAGENT_PREAMBLE + "\n\n" + (node.data.systemPrompt or "You are a helpful assistant."),
                tools=[FunctionTool(make_list_tools(all_tools, agent_name=node.data.name, agent_id=node.id))] + all_tools,
                before_model_callback=_cancel_callback,
            )
            worker_agents[node.id] = agent

    sub_agent_map = {node.data.name: worker_agents[node.id] for node in worker_nodes}

    set_run_context(
        sub_agent_map,
        queue,
        name_to_id,
        orchestrator_id=orchestrator_node.id,
        orchestrator_name=orchestrator_node.data.name,
    )

    instruction = ORCHESTRATOR_PREAMBLE + "\n\n" + (orchestrator_node.data.systemPrompt or "")
    orchestrator = Agent(
        name=orchestrator_node.data.name,
        description="Orchestrator: decomposes tasks and delegates to sub-agents.",
        model="gemini-2.5-flash",
        instruction=instruction,
        tools=ORCHESTRATOR_TOOLS,
        before_model_callback=_cancel_callback,
    )

    return orchestrator
