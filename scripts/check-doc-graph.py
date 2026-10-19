#!/usr/bin/env python3
"""Read-only validation of the reviewed navigation surface (stdlib only)."""
from pathlib import Path
import re
import sys
from urllib.parse import unquote, urlsplit

ROOT = Path(__file__).resolve().parents[1]
CURATED = (
    'AGENTS.md',
    'docs/reference/knowledge-graph.md',
    'docs/video/README.md',
    'docs/storage-infra/README.md',
    'docs/routines/README.md',
    'README.md',
    'DEVELOPMENT.md',
    'functions/README.md',
)


def check(root: Path) -> list[str]:
    errors = []
    claude_files = [p for p in root.iterdir() if p.name.lower() == 'claude.md']
    if len(claude_files) != 1 or claude_files[0].read_text().strip() != '@AGENTS.md':
        errors.append('CLAUDE.md must only import AGENTS.md')
    index = (root / 'docs/INDEX.md').read_text()
    for name in CURATED:
        path = root / name
        text = path.read_text()
        if name.startswith('docs/'):
            if 'Up: [Docs index](../INDEX.md)' not in text:
                errors.append(f'{name}: missing parent edge')
            if name.removeprefix('docs/') not in index:
                errors.append(f'{name}: missing index entry')
        # Deliberately scoped to inline links in the reviewed maps; not a
        # general Markdown parser. Code fences are excluded.
        text = re.sub(r'```.*?```', '', text, flags=re.S)
        for target in re.findall(r'\[[^\]\n]*\]\(([^\s)]+)\)', text):
            url = urlsplit(target)
            if url.scheme or url.netloc or not url.path:
                continue
            destination = (path.parent / unquote(url.path)).resolve()
            if not destination.is_relative_to(root.resolve()):
                errors.append(f'{name}: link leaves repository: {target}')
            elif not destination.exists():
                errors.append(f'{name}: missing target: {target}')
    return errors


if __name__ == '__main__':
    problems = check(ROOT)
    for problem in problems:
        print(problem)
    print(f'Curated graph: {len(problems)} error(s); historical docs and semantic freshness not checked.')
    sys.exit(bool(problems))
