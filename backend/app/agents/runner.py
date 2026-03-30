from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.genai import types

import app.session.store as store
from app.agents.builder import build_graph
from app.models import GraphDefinition
from app.tools.tools import APP_NAME, _now, token_meta_from


async def execute_run(graph: GraphDefinition, task: str):
    queue = store.current_queue
    try:
        orchestrator_node = next(
            (n for n in graph.nodes if n.data.role == "orchestrator"), None
        )
        if not orchestrator_node:
            await queue.put({
                "event": "error", "agent_id": "", "agent_name": "",
                "timestamp": _now(), "payload": {"message": "No orchestrator found"},
            })
            return

        for node in graph.nodes:
            if " " in node.data.name:
                await queue.put({
                    "event": "error", "agent_id": node.id, "agent_name": node.data.name,
                    "timestamp": _now(),
                    "payload": {"message": f"Agent name cannot have whitespaces: '{node.data.name}'"},
                })
                return

        agent = build_graph(graph, queue)

        session_service = InMemorySessionService()
        runner = Runner(agent=agent, app_name=APP_NAME, session_service=session_service)
        session = await session_service.create_session(app_name=APP_NAME, user_id="user")
        user_message = types.Content(role="user", parts=[types.Part(text=task)])

        last_usage = None
        final_text = ""

        async for event in runner.run_async(
            user_id="user", session_id=session.id, new_message=user_message,
        ):
            # Track last usage_metadata
            usage = getattr(event, "usage_metadata", None)
            if usage is not None:
                last_usage = usage

            if (error_code := getattr(event, "error_code", None)) is not None:
                await queue.put({
                    "event": "error",
                    "agent_id": orchestrator_node.id,
                    "agent_name": orchestrator_node.data.name,
                    "timestamp": _now(),
                    "payload": {"message": f"{orchestrator_node.data.name}: error code {error_code}"},
                })
                return

            # Orchestrator only calls list_agents/invoke_agent
            if event.is_final_response() and event.content and event.content.parts:
                final_text = "".join(
                    p.text for p in event.content.parts if hasattr(p, "text") and p.text
                )

        await queue.put({
            "event": "response",
            "agent_id": orchestrator_node.id,
            "agent_name": orchestrator_node.data.name,
            "timestamp": _now(),
            "payload": {"text": final_text, **token_meta_from(last_usage)},
        })

        await queue.put({
            "event": "run_complete",
            "agent_id": orchestrator_node.id,
            "agent_name": orchestrator_node.data.name,
            "timestamp": _now(),
            "payload": {"summary": "Run completed."},
        })

    except Exception as e:
        await queue.put({
            "event": "error", "agent_id": "", "agent_name": "",
            "timestamp": _now(), "payload": {"message": str(e)},
        })
    finally:
        await queue.put(None)
        store.cancelled = False
        store.current_queue = None
