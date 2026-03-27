import asyncio
from fastapi import APIRouter, BackgroundTasks, HTTPException

from app.graph.validator import validate_graph
import app.session.store as store
from app.agents.runner import execute_run
from app.models import RunRequest

router = APIRouter()


@router.post("/runs")
async def create_run(req: RunRequest, background_tasks: BackgroundTasks):
    if store.current_queue is not None:
        raise HTTPException(status_code=409, detail="A run is already in progress.")

    result = validate_graph(req.graph)
    if not result["valid"]:
        raise HTTPException(status_code=422, detail=result["errors"])

    store.current_queue = asyncio.Queue()
    background_tasks.add_task(execute_run, req.graph, req.task)
    return {"started": True}


@router.delete("/runs")
def cancel_run():
    return {"cancelled": True}