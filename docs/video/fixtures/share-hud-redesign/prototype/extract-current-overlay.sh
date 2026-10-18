#!/usr/bin/env bash
# Extracts the server worker's overlaySvg() (and helpers) into currentOverlay.ts so
# still.ts can render the *current* burned HUD locally. Line ranges match
# functions/src/mediaWorker.ts at the time of the audit (overlay style v14);
# re-check them if the worker has changed.
set -euo pipefail
cd "$(dirname "$0")"
W=../../../../../functions/src/mediaWorker.ts
{
  echo "import type { DiveTimeline } from '../../../../../functions/src/lib/timelineToRoutineLog.ts';"
  echo "import { Resvg } from '../../../../../functions/node_modules/@resvg/resvg-js/index.js';"
  echo "import { mkdir, writeFile } from 'node:fs/promises'; import { join } from 'node:path'; import { tmpdir } from 'node:os'; import { randomUUID } from 'node:crypto';"
  sed -n 35,51p "$W"
  echo "interface DiveVideoDoc { [k: string]: any }"
  sed -n 227,710p "$W"
  echo "export { overlaySvg };"
} > currentOverlay.ts
echo "wrote currentOverlay.ts"
