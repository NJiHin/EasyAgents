# EasyAgents

A visual multi-agent builder. Drag nodes onto a canvas, connect them, configure each agent's name, system prompt, and tools — then submit a task and watch it execute in real time. The visual graph maps directly to a running Gemini ADK multi-agent system.

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

EasyAgents does **not** use ADK's native `sub_agents=` transfer mechanism — that shares tool context between agents, causing `MALFORMED_FUNCTION_CALL` hallucinations. Instead:

1. Each sub-agent is a standalone `Agent` with its own isolated session and tools
2. The orchestrator gets two injected tools: `list_agents()` and `invoke_agent(agent_name, task)`
3. `invoke_agent` is `async` — ADK awaits it, keeping the event loop cooperative for real-time WS streaming
4. Graph edges determine which agents are available to the orchestrator; runtime routing is decided by the LLM

### Data Flow

```
User builds graph → submits task
  → POST /api/runs
  → Backend validates DAG, starts execute_run()
  → Frontend opens WS /ws/runs/{run_id}
  → Backend streams RunEvent JSON frames
  → Nodes highlight, edges animate, log fills, response appears
```

## Local Dev

```bash
# Backend (requires GEMINI_API_KEY in backend/.env)
cd backend && uv sync && .venv/bin/uvicorn app.main:app --reload --port 8000

# Frontend
cd frontend && pnpm install && pnpm dev  # port 5173, proxies /api and /ws to :8000
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

`web_search` · `calculator` · `read_url`
