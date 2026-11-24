"""Keyboard, form and async UX checks in real Chromium-rendered application code.
Records are local demo/transport fixtures; this does not authenticate to a live service.
"""
from __future__ import annotations
import argparse, json
from pathlib import Path
from playwright.sync_api import sync_playwright, expect
from browser_audit import ROOT, PRELUDE, portable


def run(args):
    args.output.mkdir(parents=True, exist_ok=True)
    results = []
    def passed(name, scope):
        results.append({'name': name, 'scope': scope, 'status': 'passed'})
        (args.output/'results.json').write_text(json.dumps(results, ensure_ascii=False, indent=2))
        print('PASS', name, flush=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
        for app, route in [('admin','clients'),('client','profile'),('rep','clients')]:
            page = browser.new_page(viewport={'width':1440,'height':900}, locale='ar-SA', reduced_motion='reduce')
            portable(page, (args.dist/f'{app}.html').read_text())
            page.keyboard.press('Tab')
            expect(page.locator('.skip-link')).to_be_focused()
            assert page.locator('.skip-link').evaluate('(e)=>e.getBoundingClientRect().top>=0')
            page.keyboard.press('Enter')
            expect(page.locator('main')).to_be_focused()
            passed(app+' keyboard skip link', 'actual demo application')
            page.evaluate('(route)=>Elvorance.go(route)', route)
            expect(page.locator('main')).to_be_focused()
            current = page.locator('.elv-secondary-nav [aria-current="page"]')
            if current.count():
                assert current.count() == 1
            passed(app+' route focus and navigation semantics', 'actual demo application')
            trigger = page.locator('.notification-btn')
            trigger.focus(); page.keyboard.press('Enter')
            expect(page.locator('#app-modal')).to_be_visible()
            page.wait_for_timeout(100)
            assert page.evaluate("document.querySelector('#app-modal').contains(document.activeElement)")
            for _ in range(18):
                page.keyboard.press('Tab')
                assert page.evaluate("document.querySelector('#app-modal').contains(document.activeElement)")
            page.keyboard.press('Escape')
            expect(page.locator('#app-modal')).not_to_be_visible()
            expect(trigger).to_be_focused()
            passed(app+' real notification modal tab containment and focus return', 'actual demo application')
            page.close()
        page = browser.new_page(viewport={'width':390,'height':844}, locale='ar-SA', reduced_motion='reduce')
        portable(page, (args.dist/'client.html').read_text())
        page.evaluate("Elvorance.go('profile')")
        form = page.locator('form[data-submit="save-profile"]')
        name = form.locator('[name="name"]')
        name.fill(''); form.locator('button[type="submit"]').click()
        expect(name).to_have_attribute('aria-invalid','true')
        expect(form.locator('.elv-error-summary')).to_be_visible()
        assert 'مطلوب' in page.locator('.elv-field-error').first.inner_text()
        assert page.evaluate("Elvorance.route()") == 'profile'
        name.fill('مؤسسة Atlas 123')
        expect(name).not_to_have_attribute('aria-invalid','true')
        for key in ['phone','email']:
            expect(form.locator(f'[name="{key}"]')).to_have_attribute('dir','ltr')
        expect(name).to_have_attribute('dir','auto')
        form.locator('[name="phone"]').fill('+966 555 123 456')
        form.locator('[name="email"]').fill('atlas@example.test')
        form.locator('[name="address"]').fill('الرياض، شارع الاختبار 123')
        form.locator('button[type="submit"]').click()
        page.wait_for_function("Elvorance.route()==='account'")
        page.evaluate("Elvorance.go('profile')")
        expect(page.locator('[name="name"]')).to_have_value('مؤسسة Atlas 123')
        passed('client validation, mixed text, LTR contact fields and original save behavior', 'local demo record, not backend persistence')
        page.locator('main').focus()
        for _ in range(9):
            page.keyboard.press('Tab')
            page.wait_for_timeout(30)
            assert page.evaluate("""()=>{const e=document.activeElement,r=e.getBoundingClientRect();const x=r.x+r.width/2,y=r.y+r.height/2;const hit=document.elementFromPoint(x,y);return x>=0&&x<=innerWidth&&y>=0&&y<=innerHeight&&(e===hit||e.contains(hit));}"""), 'Focused mobile control is obscured.'
        passed('client mobile keyboard focus remains visible above fixed navigation', '390px viewport, actual profile controls and actions')
        page.screenshot(path=str(args.output/'client-mixed-profile-390.png'), full_page=True, animations='disabled')
        page.close()

        page = browser.new_page(viewport={'width':390,'height':844},locale='ar-SA',reduced_motion='reduce')
        css=(args.server_build/'rep.css').read_text()
        pre=PRELUDE+"if(!crypto.randomUUID) crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(Math.floor(Math.random()*1e12)).padStart(12,'0');"
        page.set_content('<html lang="ar" dir="rtl"><head><title>اختبار الواجهة</title><style>'+css+'</style><script>'+pre+'</script></head><body><div id="app"></div></body></html>')
        page.add_script_tag(content=(args.server_build/'fixture.js').read_text())
        page.evaluate("uxHarness.start('rep')")
        page.locator('[data-page="customers"]').click()
        page.wait_for_function("document.querySelector('main')?.getAttribute('aria-busy')!=='true'")
        page.get_by_role('button',name='إضافة عميل',exact=True).click()
        form=page.locator('form.command-form')
        name=form.locator('[name="name"]')
        expect(name).to_be_focused()
        button=form.locator('button[type="submit"]')
        button.click(); expect(name).to_have_attribute('aria-invalid','true')
        name.fill('شركة Mixed 123')
        form.locator('[name="email"]').fill('mixed@example.test')
        form.locator('[name="phone"]').fill('+966555123456')
        page.evaluate("uxHarness.allowCustomerWrite('fail')")
        button.click()
        expect(button).to_be_disabled()
        expect(form).to_have_attribute('aria-busy','true')
        # Re-entrant submit event must not produce a second request while pending.
        form.evaluate("e=>e.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))")
        expect(form.locator('.form-status')).to_have_attribute('role','alert')
        expect(button).to_be_enabled(); expect(name).to_have_value('شركة Mixed 123')
        writes=page.evaluate("uxHarness.calls.filter(x=>x.method==='POST')")
        assert len(writes)==1 and writes[0]['idempotencyKey']
        passed('rep form async pending lock, failure alert and retained draft', 'actual server form and API adapter; deliberately failing test transport')
        page.screenshot(path=str(args.output/'rep-save-failure-390.png'),full_page=True,animations='disabled')
        page.evaluate("Object.defineProperty(navigator,'onLine',{value:false,configurable:true});dispatchEvent(new Event('offline'))")
        button.click()
        expect(form.locator('.form-status')).to_contain_text('الاتصال منقطع')
        assert len(page.evaluate("uxHarness.calls.filter(x=>x.method==='POST')"))==1
        expect(name).to_have_value('شركة Mixed 123')
        page.evaluate("Object.defineProperty(navigator,'onLine',{value:true,configurable:true});dispatchEvent(new Event('online'))")
        page.wait_for_timeout(100)
        assert len(page.evaluate("uxHarness.calls.filter(x=>x.method==='POST')"))==1
        passed('rep offline blocks transport, preserves draft and never auto-resubmits', 'navigator signal and actual API adapter; no service-worker claim')
        page.evaluate("uxHarness.allowCustomerWrite('succeed')")
        button.click()
        page.wait_for_function("uxHarness.calls.filter(x=>x.method==='POST').length===2")
        page.wait_for_function("!document.querySelector('form.command-form')")
        expect(page.locator('main')).to_contain_text('شركة Mixed 123')
        writes=page.evaluate("uxHarness.calls.filter(x=>x.method==='POST')")
        assert writes[0]['idempotencyKey']==writes[1]['idempotencyKey']
        assert not page.evaluate('uxHarness.unexpectedRequests')
        passed('rep explicit retry reuses intent key and updates actual view', 'successful test-only in-memory transport; not hosted persistence')
        page.evaluate("uxHarness.setScenario('slow')")
        page.locator('[data-page="tasks"]').click()
        expect(page.locator('main')).to_have_attribute('aria-busy','true')
        expect(page.locator('[data-ui-state="loading"]')).to_have_attribute('role','status')
        page.wait_for_function("document.querySelector('main')?.getAttribute('aria-busy')!=='true'")
        expect(page.locator('main')).to_be_focused()
        passed('rep slow transport loading status and focus after completion', 'controlled 800 ms fixture latency')
        page.close(); browser.close()
    (args.output/'summary.json').write_text(json.dumps({'passed':len(results),'failed':0,'scope':'real rendered frontend behavior, fixtures only; not live backend, OIDC or physical-device acceptance'},ensure_ascii=False,indent=2))

if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--dist',type=Path,default=ROOT/'dist');p.add_argument('--server-build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--chromium',default='/usr/bin/chromium');run(p.parse_args())
