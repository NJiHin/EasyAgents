from fastapi import APIRouter

router = APIRouter()

TOOLS = [
    {"id": "web_search",  "name": "Web Search",  "description": "Search the web for current information"},
    {"id": "read_url",    "name": "Read URL",    "description": "Fetch and parse text content from a URL"},
    {"id": "calculator",  "name": "Calculator",  "description": "Evaluate a mathematical expression"},
]

EVALUATOR_TOOLS = [
    {"id": "python_repl", "name": "Python REPL", "description": "Execute Python code and return stdout/stderr"},
]


@router.get("/tools")
def list_tools():
    return {"tools": TOOLS, "evaluatorTools": EVALUATOR_TOOLS}
