from fastapi import APIRouter, WebSocket, WebSocketDisconnect
import app.session.store as store

router = APIRouter()


@router.websocket("/ws/runs")
async def run_websocket(websocket: WebSocket):
    await websocket.accept()

    queue = store.current_queue
    if queue is None:
        await websocket.send_json({"event": "error", "payload": {"message": "No active run"}})
        await websocket.close()
        return

    try:
        while True:
            event = await queue.get()
            if event is None:   # sentinel: run finished
                break
            await websocket.send_json(event)
        await websocket.close()
    except WebSocketDisconnect:
        pass   # client disconnected (e.g. user cancelled)
    finally:
        store.current_queue = None