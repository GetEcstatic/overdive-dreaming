
#%%
# WebSocket Server for Yebo (single self-contained file)
# Run this cell first to start the server
PORT = 27021

import asyncio
import threading
import json
from typing import Any, Set
from datetime import datetime
import websockets

def timestamp():
    """Get current timestamp for logging"""
    return datetime.now().strftime("%H:%M:%S.%f")[:-3]

# Server state
_clients: Set = set()
_loop = None
_running = False

async def _handler(websocket):
    _clients.add(websocket)
    print(f"[{timestamp()}] 🔗 Client connected! Total clients: {len(_clients)} 🎉")
    print(f"[{timestamp()}]    📍 Client info: {websocket.remote_address}")
    
    try:
        # Keep connection alive by continuously reading messages
        # DO NOT send ACK immediately - let the client send first
        async for msg in websocket:
            print(f"[{timestamp()}] 📥 Received: {msg[:100]}..." if len(str(msg)) > 100 else f"[{timestamp()}] 📥 Received: {msg}")
    except websockets.exceptions.ConnectionClosed as e:
        print(f"[{timestamp()}] ⚡ Connection closed: code={e.code}, reason={e.reason}")
    except Exception as e:
        print(f"[{timestamp()}] ❌ Handler error: {type(e).__name__}: {e}")
    finally:
        _clients.discard(websocket)
        print(f"[{timestamp()}] 👋 Client disconnected. Remaining clients: {len(_clients)}")

async def _broadcast(message: str):
    if not _clients:
        print(f"[{timestamp()}] ⚠️ No clients connected to receive message")
        return
    for client in list(_clients):
        try:
            await client.send(message)
            print(f"[{timestamp()}] ✅ Message sent successfully to {client.remote_address}")
        except Exception as e:
            print(f"[{timestamp()}] ❌ Failed to send to client: {e}")
            _clients.discard(client)

def send(message: Any):
    global _loop
    if not _loop or not _running:
        print(f"[{timestamp()}] ⚠️ Server not running")
        return
    if not isinstance(message, str):
        message = json.dumps(message)
    print(f"[{timestamp()}] 📤 Sending message to {len(_clients)} client(s)...")
    asyncio.run_coroutine_threadsafe(_broadcast(message), _loop)

def _run():
    global _loop, _running
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    async def serve():
        global _running
        # Using websockets.serve - ping disabled to see if that helps
        async with websockets.serve(
            _handler, 
            'localhost', 
            PORT,
            ping_interval=None,  # Disable ping - let client handle keepalive
            ping_timeout=None,   # No timeout
            close_timeout=10,
            max_size=10 * 1024 * 1024  # 10MB max message size
        ):
            _running = True
            print(f"[{timestamp()}] 🟢 WebSocket server listening on port {PORT}")
            print(f"[{timestamp()}]    ⚠️ Ping disabled (client-controlled keepalive)")
            await asyncio.Future()  # Run forever
    try:
        _loop.run_until_complete(serve())
    except Exception as e:
        print(f"[{timestamp()}] ❌ Server error: {e}")
    finally:
        _running = False

def start():
    global _running
    if _running:
        print(f"[{timestamp()}] ⚡ Already running")
        return
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    import time; time.sleep(0.2)
    print(f"[{timestamp()}] 🚀 WebSocket Server running on ws://localhost:{PORT} ✨")
    print(f"[{timestamp()}] 📡 Waiting for connections...")

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

NOTE: If "yebo next" disconnects or returns without a proper command, sleep for 10seconds and call "yebo next" again!!
Keep on doing this until you get a proper instructions!

'''



#%%
# Send a message to yebo - edit the text below and run this cell

send('''
In the session-editor and quick log, when adding a photo, the image doesn't save unless the "use crop" button is pressed. The use crop button is redundant so automate this when the save button is clicked.
     
''' + prompt_hack)


# %%
