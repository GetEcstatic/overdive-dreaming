"""Regression checks for the curated graph validator; no repository writes."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('graph', Path(__file__).with_name('check-doc-graph.py'))
graph = importlib.util.module_from_spec(spec)
spec.loader.exec_module(graph)


class GraphTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in graph.CURATED:
            path = self.root / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text('Up: [Docs index](../INDEX.md)\n' if name.startswith('docs/') else '')
        (self.root / 'CLAUDE.md').write_text('@AGENTS.md\n')
        (self.root / 'docs/INDEX.md').write_text(' '.join(name.removeprefix('docs/') for name in graph.CURATED if name.startswith('docs/')))

    def test_valid_graph(self):
        self.assertEqual(graph.check(self.root), [])

    def test_missing_target(self):
        (self.root / 'AGENTS.md').write_text('[Missing](missing.md)')
        self.assertTrue(any('missing target' in e for e in graph.check(self.root)))

    def test_external_and_fenced_links_ignored(self):
        (self.root / 'AGENTS.md').write_text('[Web](https://example.com)\n```\n[X](missing.md)\n```')
        self.assertEqual(graph.check(self.root), [])

    def test_parent_and_index_required(self):
        (self.root / 'docs/video/README.md').write_text('No parent')
        (self.root / 'docs/INDEX.md').write_text('')
        errors = graph.check(self.root)
        self.assertTrue(any('parent edge' in e for e in errors))
        self.assertTrue(any('index entry' in e for e in errors))

    def test_single_instruction_owner(self):
        (self.root / 'CLAUDE.md').write_text('Different instructions')
        self.assertTrue(any('only import' in e for e in graph.check(self.root)))

    def test_no_repository_escape(self):
        (self.root / 'AGENTS.md').write_text('[Outside](../outside.md)')
        self.assertTrue(any('leaves repository' in e for e in graph.check(self.root)))


if __name__ == '__main__':
    unittest.main()
