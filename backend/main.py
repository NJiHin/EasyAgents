from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv

load_dotenv()

from app.api import runs, tools, ws

app = FastAPI(title="EasyAgents API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(runs.router, prefix="/api")
app.include_router(tools.router, prefix="/api")
app.include_router(ws.router)


@app.get("/api/health")
def health():
    return {"status": "ok"}
