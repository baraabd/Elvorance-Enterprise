"""Real-browser regression for Arabic status text in narrow visit summaries.

Use the shipped portable bundle and frozen visit fixtures. Changing the local
font stack reproduces the CI overflow without hiding text or enlarging the
viewport. These are frontend fixtures, not backend acceptance.
"""
import json
import os
import unittest
from playwright.sync_api import sync_playwright
from browser_audit import ROOT, portable


class VisitSummaryLayout(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.playwright = sync_playwright().start()
        cls.browser = cls.playwright.chromium.launch(
            executable_path=os.environ.get('CHROMIUM', '/usr/bin/chromium'),
            args=['--no-sandbox'],
        )
        cls.html = (ROOT / 'dist/rep.html').read_text()
        cls.baseline = json.loads((ROOT / 'tests/design-parity/baseline-v1.1.json').read_text())

    @classmethod
    def tearDownClass(cls):
        cls.browser.close()
        cls.playwright.stop()

    def test_status_text_stays_inside_visit_summary(self):
        for route in ['visit-outcome', 'visit-detail']:
            case = next(c for c in self.baseline['cases'] if c['app'] == 'rep' and c['route'] == route)
            for width in [320, 390, 768, 1440]:
                for font in ['system-ui', '"DejaVu Sans", sans-serif']:
                    with self.subTest(route=route, width=width, font=font):
                        page = self.browser.new_page(
                            viewport={'width': width, 'height': 900}, locale='ar-SA',
                            timezone_id='UTC', reduced_motion='reduce',
                        )
                        try:
                            portable(page, self.html)
                            page.evaluate('''({fixture, route, params, font}) => {
                                document.documentElement.style.setProperty('--font', font);
                                Elvorance.update(s => {
                                    for (const [collection, rows] of Object.entries(fixture))
                                        for (const [id, patch] of Object.entries(rows))
                                            Object.assign(s[collection].find(r => r.id === id), patch);
                                });
                                Elvorance.go(route, params);
                            }''', {'fixture': self.baseline['fixtures'][case['fixture']],
                                   'route': route, 'params': case['params'], 'font': font})
                            page.wait_for_function('(route) => Elvorance.route() === route', arg=route)
                            page.evaluate('document.fonts.ready')
                            badge = page.locator('.rep-agreement-summary > .row-between > .badge')
                            self.assertEqual(badge.count(), 1)
                            self.assertEqual(badge.inner_text(), 'عرض مرسل ينتظر قرار العميل')
                            dimensions = badge.evaluate('''e => ({
                                content: e.scrollWidth, box: e.clientWidth,
                                page: document.documentElement.scrollWidth, viewport: innerWidth,
                                overflow: getComputedStyle(e).overflowX,
                                left: e.getBoundingClientRect().left,
                                right: e.getBoundingClientRect().right
                            })''')
                            self.assertLessEqual(dimensions['page'], width + 1, dimensions)
                            self.assertLessEqual(dimensions['content'], dimensions['box'] + 1, dimensions)
                            self.assertGreaterEqual(dimensions['left'], -1, dimensions)
                            self.assertLessEqual(dimensions['right'], width + 1, dimensions)
                            self.assertNotIn(dimensions['overflow'], ['hidden', 'clip'])
                            self.assertEqual(page.locator('.rep-agreement-summary th').count(), 4)
                        finally:
                            page.close()


if __name__ == '__main__':
    unittest.main()
