"""Tests for authority classification; entirely local temporary fixtures."""
import importlib.util
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('audit', Path(__file__).with_name('audit-docs.py'))
audit = importlib.util.module_from_spec(spec)
spec.loader.exec_module(audit)


class ClassificationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / 'current.md').write_text('[Old](old.md)')
        (self.root / 'old.md').write_text('Superseded — not implementation guidance')
        self.policy = {'documents': {
            'current.md': {'status': 'current-reference', 'evidence': 'Reviewed'},
            'old.md': {'status': 'superseded', 'evidence': 'Contradicts implementation', 'replacement': 'current.md'},
        }}

    def errors(self):
        return audit.validate(self.root, audit.classify(['current.md', 'old.md'], self.policy), self.policy)

    def test_unknown_is_not_approved(self):
        self.assertEqual(audit.classify(['new.md'], self.policy)['new.md']['status'], 'needs-review')

    def test_current_cannot_silently_recommend_superseded(self):
        self.assertTrue(any('label history link' in e for e in self.errors()))

    def test_explicit_history_allowed(self):
        (self.root / 'current.md').write_text('Superseded: [Old](old.md)')
        self.assertEqual(self.errors(), [])

    def test_opening_warning_required(self):
        (self.root / 'old.md').write_text('Unmarked old guidance')
        self.assertTrue(any('visible supersession notice' in e for e in self.errors()))

    def test_replacement_required(self):
        self.policy['documents']['old.md']['replacement'] = 'missing.md'
        self.assertTrue(any('replacement target' in e for e in self.errors()))

    def test_removed_documents_detected(self):
        rows = audit.classify(['current.md'], self.policy)
        self.assertTrue(any('missing document' in e for e in audit.validate(self.root, rows, self.policy)))

    def test_historical_does_not_mean_removed_feature(self):
        self.policy['documents']['old.md'] = {'status': 'historical', 'evidence': 'Historical plan; feature may remain'}
        (self.root / 'current.md').write_text('Historical: [Old](old.md)')
        self.assertEqual(self.errors(), [])


if __name__ == '__main__':
    unittest.main()
