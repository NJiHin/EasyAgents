from fastapi import APIRouter

router = APIRouter()

TOOLS = [
    {"id": "web_search",  "name": "Web Search",  "description": "Search the web for current information"},
    {"id": "read_url",    "name": "Read URL",    "description": "Fetch and parse text content from a URL"},
    #{"id": "python_repl", "name": "Python REPL", "description": "Execute Python code and return stdout"},
    #{"id": "file_read",   "name": "File Read",   "description": "Read a file from the workspace directory"},
    #{"id": "file_write",  "name": "File Write",  "description": "Write a file to the workspace directory"},
    {"id": "calculator",  "name": "Calculator",  "description": "Evaluate a mathematical expression"},
]


@router.get("/tools")
def list_tools():
    return TOOLS
