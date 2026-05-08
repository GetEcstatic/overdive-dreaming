
#%%
# WebSocket Server for Yebo (single self-contained file)
# Run this cell first to start the server
PORT = 27021

import asyncio
import threading
import json
from typing import Any, Set
from websockets import serve as ws_serve

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
=============
GENERAL

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


## Terminal Stability (VSCode)

VSCode terminal output can garble sometimes. Rules:

1. **Short commands run directly** — no temp files or redirection for simple operations.
2. **Large output → redirect to file** — if output might exceed 50 lines, redirect: `cmd > /tmp/out.txt 2>&1` and read the file.
3. **Disable pagers** — always use `--no-pager` or `| cat`.
4. **yebo calls** — always run directly as a simple terminal string.
5. **If the main terminal starts garbling output** — report to yebo and ask the user to kill the main terminal.
6. Run subagents with reasonable timeouts (based on the task, e.g. 30s) to avoid hanging indefinitely.

**IMPORTANT**: Never give control back to the user. Run `yebo next`on the cli  at the end!

## Guide
- Do NOT do more than asked for! Especially, never implement unless explicitly asked for by the user!
- if you are unsure about anything and have been going for a while, ask yebo! Dpo not try to solve or understand yourself and go down a rabbit hole!


now call `yebo next` on the cli
'''


#%%
# Send a message to yebo - edit the text below and run this cell

send('''

====== This is a new task! =====
If there are uncommited    

     Let's ignore all the tracked metric combinations for now, and just think of the modifier. 
Never do more than explicitly asked for. Ask yebo if anything is unclear - don't get stuck in rabitholes.
Therafter report back to yebo (call `yebo next` on cli. No report. just the bare command). Make a TODO list and note down all steps.
Make SURE to call "yebo next" at the end!!! Never give control back. also not for intermediate questions. always use "yebo"






''' + post)

I # %%

# %%

# %%
