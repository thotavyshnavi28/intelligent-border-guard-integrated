from collections import defaultdict
from fastapi import WebSocket
import asyncio

class ConnectionManager:
    def __init__(self):
        self.connections: dict[str, set[WebSocket]] = defaultdict(set)
        self.lock = asyncio.Lock()

    async def connect(self, channel: str, websocket: WebSocket):
        await websocket.accept()
        async with self.lock: self.connections[channel].add(websocket)

    async def disconnect(self, channel: str, websocket: WebSocket):
        async with self.lock: self.connections[channel].discard(websocket)

    async def broadcast(self, channel: str, payload: dict):
        stale = []
        for ws in list(self.connections[channel]):
            try: await ws.send_json(payload)
            except Exception: stale.append(ws)
        for ws in stale: await self.disconnect(channel, ws)

manager = ConnectionManager()
