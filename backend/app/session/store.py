import asyncio

current_queue: asyncio.Queue | None = None
cancelled: bool = False
