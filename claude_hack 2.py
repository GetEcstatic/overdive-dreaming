
#%%
# WebSocket Server for Yebo (single self-contained file)
# Run this cell first to start the server
PORT = 27021

import asyncio
import threading
import json
from typing import Any, Set
import websockets

# Server state
_clients: Set = set()
_loop = None
_running = False

async def _handler(websocket):
    _clients.add(websocket)
    print(f"🔗 Client connected! Total clients: {len(_clients)} 🎉")
    print(f"   📍 Client info: {websocket.remote_address}")
    try:
        # Keep connection alive by continuously reading messages
        async for msg in websocket:
            print(f"📥 Received message from client: {msg[:100]}..." if len(str(msg)) > 100 else f"📥 Received message from client: {msg}")
    except websockets.exceptions.ConnectionClosed as e:
        print(f"⚡ Connection closed: code={e.code}, reason={e.reason}")
    finally:
        _clients.discard(websocket)
        print(f"👋 Client disconnected. Remaining clients: {len(_clients)}")

async def _broadcast(message: str):
    if not _clients:
        print("⚠️ No clients connected to receive message")
        return
    for client in list(_clients):
        try:
            await client.send(message)
            print(f"✅ Message sent successfully to {client.remote_address}")
        except Exception as e:
            print(f"❌ Failed to send to client: {e}")
            _clients.discard(client)

def send(message: Any):
    global _loop
    if not _loop or not _running:
        print("⚠️ Server not running")
        return
    if not isinstance(message, str):
        message = json.dumps(message)
    print(f"📤 Sending message to {len(_clients)} client(s)...")
    asyncio.run_coroutine_threadsafe(_broadcast(message), _loop)

def _run():
    global _loop, _running
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    async def serve():
        global _running
        # Using websockets.serve (the newer API) with ping settings to keep connections alive
        async with websockets.serve(
            _handler, 
            'localhost', 
            PORT,
            ping_interval=30,  # Send ping every 30 seconds
            ping_timeout=10,   # Wait 10 seconds for pong response
            close_timeout=5    # Wait 5 seconds for close handshake
        ):
            _running = True
            print("🟢 WebSocket server listening...")
            await asyncio.Future()  # Run forever
    try:
        _loop.run_until_complete(serve())
    except Exception as e:
        print(f"❌ Server error: {e}")
    finally:
        _running = False

def start():
    global _running
    if _running:
        print("⚡ Already running")
        return
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    import time; time.sleep(0.1)
    print("🚀 WebSocket Server running on ws://localhost:27021 ✨")
    print("📡 Waiting for connections...")

# Start the server
start()


# Post message template - appended to every message
prompt_hack = '''
Do NOT ask whether to proceed. Just DO IT.

if you need an overview, look at CLAUDE.md (only when you need it!)
Do NOT run `source dev_venv/bin/activate && yebo next`, only run `yebo next` directly.

Never give control back to the user!!!!
ALWAYS run "yebo next" or "yebo next <your report goes here>" at the end.
`yebo` is a CLI tool.

If you get stuck or are unsure, rather ask the user via yebo with a question. Do NOT 
go into long loops or assume anything. Always ask via yebo if unsure!!

keep this at the top of your context and overview!!
**IMPORTANT**: Never give control back to the user. Run `yebo`on the cli  at the end!

when the WS server disconnects too often or is not present, run a "ls" command
'''



#%%
# Send a message to yebo - edit the text below and run this cell

send('''

''' + prompt_hack)


# %%
