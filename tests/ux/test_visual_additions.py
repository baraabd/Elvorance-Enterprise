import json
import tempfile
import unittest
from pathlib import Path
from PIL import Image
from visual_additions import declared_additions


class NewRouteEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.before = Path(self.temp.name) / 'before'
        self.after = Path(self.temp.name) / 'after'
        self.before.mkdir()
        self.after.mkdir()
        self.old = [self.row('home', 390, 'records')]
        self.new = self.old + [self.row('schedule', width, scenario) for width, scenario in
                              [(320, 'records'), (390, 'records'), (768, 'records'),
                               (1440, 'records'), (390, 'empty'), (390, 'error')]]
        self.write()

    def row(self, route, width, scenario):
        return {'app': 'rep', 'route': route, 'width': width, 'scenario': scenario,
                'screenshot': f'rep-{route}-{width}-records.png' if width != 320 and scenario == 'records' else None,
                'diagnostics': {'overflow': False, 'overlappingNavLabels': []},
                'pageErrors': [], 'unexpectedRequests': [], 'axe': {'violations': []}}

    def write(self):
        for folder, rows in [(self.before, self.old), (self.after, self.new)]:
            (folder / 'results.json').write_text(json.dumps(rows))
            for row in rows:
                if row['screenshot']:
                    Image.new('RGB', (row['width'], 900)).save(folder / row['screenshot'])

    def check(self):
        return declared_additions(self.before, self.after,
                                  {p.name: p for p in self.before.glob('*.png')},
                                  {p.name: p for p in self.after.glob('*.png')})

    def test_declared_additions_are_separate_evidence_not_goldens(self):
        result = self.check()
        self.assertEqual(len(result), 3)
        for row in result:
            self.assertEqual(row['baseline'], 'ROUTE_NOT_PRESENT')
            self.assertIn('REQUIRES_REVIEW', row['visualApproval'])
            self.assertEqual(len(row['afterSha256']), 64)

    def test_identical_sets_need_no_exception(self):
        paths = {p.name: p for p in self.before.glob('*.png')}
        self.assertEqual(declared_additions(self.before, self.before, paths, paths), [])

    def test_removed_existing_image_fails(self):
        (self.after / 'rep-home-390-records.png').unlink()
        with self.assertRaises(ValueError): self.check()

    def test_missing_new_image_fails(self):
        (self.after / 'rep-schedule-768-records.png').unlink()
        with self.assertRaises(ValueError): self.check()

    def test_unrecorded_extra_image_fails(self):
        Image.new('RGB', (390, 900)).save(self.after / 'unexpected.png')
        with self.assertRaises(ValueError): self.check()

    def test_undeclared_route_fails(self):
        self.new.append(self.row('invented', 390, 'records'))
        self.write()
        with self.assertRaises(ValueError): self.check()

    def test_existing_route_with_missing_baseline_image_is_not_new(self):
        self.old.append(self.row('schedule', 320, 'records'))
        self.write()
        with self.assertRaises(ValueError): self.check()

    def test_failed_new_route_is_rejected(self):
        self.new[1]['diagnostics']['overflow'] = True
        self.write()
        with self.assertRaises(ValueError): self.check()

    def test_missing_state_is_rejected(self):
        self.new.pop()
        self.write()
        with self.assertRaises(ValueError): self.check()

    def test_duplicate_case_is_rejected(self):
        self.new.append(self.new[1])
        self.write()
        with self.assertRaises(ValueError): self.check()

    def test_missing_browser_report_is_rejected(self):
        (self.after / 'results.json').unlink()
        with self.assertRaises(OSError): self.check()

    def test_incorrect_capture_dimensions_are_rejected(self):
        Image.new('RGB', (389, 900)).save(self.after / 'rep-schedule-390-records.png')
        with self.assertRaises(ValueError): self.check()


if __name__ == '__main__':
    unittest.main()
