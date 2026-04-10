# EasyAgents

A visual multi-agent builder. Drag nodes onto a canvas, connect them, configure each agent's name, system prompt, and tools - submit a task and watch it execute in real time, review the logs and view the flamegraph-style chart for visualisation of tool use timeline. The visual node graph maps directly to a running Gemini ADK multi-agent system. Choose from Research Agent or Coding Reviewer template systems or build your own!

https://github.com/user-attachments/assets/1becb2d8-a739-47fb-ab26-8acbdc2829a5

## Stack

- **Frontend** — React 18 + Vite + TypeScript, React Flow canvas, Zustand state
- **Backend** — FastAPI + Python 3.12, Google Gemini ADK (`google-adk`)
- All agents run `gemini-2.5-flash`

## How It Works

### Agent Roles

- **Orchestrator** (exactly one) — receives the task, uses `list_agents` + `invoke_agent` tools to decompose and delegate
- **Sub-agents** — isolated workers with their own tools; never see other agents' context
- **Evaluators** — quality-gate agents paired 1:1 with a worker; respond `PASS` or `FAIL: <critique>`; loop up to `maxIterations` times

### Orchestrator-Decomposition Pattern

EasyAgents does **not** use ADK's native `sub_agents=` transfer mechanism which shares tool context between agents, causing tool-calling hallucinations. Instead:

1. Each sub-agent is a standalone `Agent` with its own isolated session and tools
2. The orchestrator gets two injected tools: `list_agents()` and `invoke_agent(agent_name, task)`
3. The evaluator runs as a standalone `Agent` with `list_tools` + `python_repl` baked in; it responds `PASS` or `FAIL: <critique>` and loops up to `maxIterations` times via the `invoke_evaluator` tool injected into its paired worker
4. `invoke_agent` is `async` — ADK awaits it, keeping the event loop cooperative for real-time WS streaming
5. Graph edges determine which agents are available to the orchestrator; runtime routing is decided by the LLM

## Local Dev

```bash
# Backend (requires GEMINI_API_KEY in backend/.env, see .env.example)
uv run poe serve  # uvicorn on :8000

# Frontend
uv run poe dev    # port 5173, proxies /api and /ws to :8000
```

## API

| Method | Path                 | Purpose                    |
| ------ | -------------------- | -------------------------- |
| GET    | `/api/health`        | Health check               |
| GET    | `/api/tools`         | List built-in tools        |
| POST   | `/api/runs`          | Start a run → `{ run_id }` |
| DELETE | `/api/runs/{run_id}` | Cancel a run               |
| WS     | `/ws/runs/{run_id}`  | Stream run events          |

## Built-in Tools

- `web_search` — queries DuckDuckGo and returns the top 3 results (title, URL, snippet)
- `calculator` — evaluates a math expression using Python's `math` module; no builtins
- `read_url` — fetches a URL, strips scripts/nav/footer, and returns up to 4 000 chars of main text
- `python_repl` — runs Python code in a sandboxed Docker container (no network, 128 MB RAM limit) and returns stdout + stderr
