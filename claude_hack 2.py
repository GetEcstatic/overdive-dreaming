
#%%
# WebSocket Server for Yebo (single self-contained file)
# Run this cell first to start the server
PORT = 27021

import asyncio
import threading
import json
from typing import Any, Set
from websockets.server import serve as ws_serve

# Server state
_clients: Set = set()
_loop = None
_running = False

async def _handler(websocket):
    _clients.add(websocket)
    try:
        async for msg in websocket:
            pass  # ignore incoming messages
    finally:
        _clients.discard(websocket)

async def _broadcast(message: str):
    for client in list(_clients):
        try:
            await client.send(message)
        except:
            _clients.discard(client)

def send(message: Any):
    global _loop
    if not _loop or not _running:
        print("Server not running")
        return
    if not isinstance(message, str):
        message = json.dumps(message)
    asyncio.run_coroutine_threadsafe(_broadcast(message), _loop)

def _run():
    global _loop, _running
    _loop = asyncio.new_event_loop()
    asyncio.set_event_loop(_loop)
    async def serve():
        global _running
        async with ws_serve(_handler, 'localhost', PORT):
            _running = True
            await asyncio.Future()
    try:
        _loop.run_until_complete(serve())
    except:
        pass
    finally:
        _running = False

def start():
    global _running
    if _running:
        print("Already running")
        return
    t = threading.Thread(target=_run, daemon=True)
    t.start()
    import time; time.sleep(0.1)
    print("Server running on ws://localhost:27021")

# Start the server
start()


# Post message template - appended to every message
post = '''
Do NOT ask whether to proceed. Just DO IT.

if you need an overview, look at CLAUDE.md (only when you need it!)
Do NOT run `source dev_venv/bin/activate && yebo next`, only run `yebo next` directly.

Never give control back to the user!!!!
ALWAYS run "yebo next" or "yebo next <your report goes here>" at the end.
`yebo` is a CLI tool.

If you get stuck or are unsure, rather ask the user via yebo with a question. Do NOT 
go into long loops or assume anything. Always ask if unsure!!

keep this at the top of your context and overview!!
ALWAYS use "yebo next" at the end. If it does not work or the websocket server seems down, sleep 20 seconds and try again.
Keep on doing this until it works! Indefinitely! Never yield control back to the user!

If the websocket server is down when calling yebo, sleep for 20 seconds and try again. 
Keep doing this until it works! ALWAYS call "yebo next".

**IMPORTANT**: Never give control back to the user. Run `yebo next`on the cli  at the end!'''


#%%
# Send a message to yebo - edit the text below and run this cell

send('''
Some of these tags should be selectable in every single log posted by a user. Some should be made active for selection within the routine builder. 
     What would be an efficient method for me to identicate which tags should be selected in every log, and which should be made available by slecting in the routine builder?
     Could we create a table in the .md file, or is there a more efficacious mehhod?

''' + post)

# %%
