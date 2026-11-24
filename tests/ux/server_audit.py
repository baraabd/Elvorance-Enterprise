"""Actual server workspace renderers with explicit deterministic transport fixtures.
This is frontend acceptance, not OIDC/backend/device acceptance.
"""
from __future__ import annotations
import argparse,hashlib,json,sys
from pathlib import Path
from playwright.sync_api import sync_playwright
from browser_audit import PRELUDE

def run(args):
    args.output.mkdir(parents=True,exist_ok=True)
    results=[]
    with sync_playwright() as p:
        browser=p.chromium.launch(executable_path=args.chromium,args=['--no-sandbox'])
        for role in args.apps.split(','):
            for width in map(int,args.widths.split(',')):
                page=browser.new_page(viewport={'width':width,'height':900},locale='ar-SA',timezone_id='UTC',reduced_motion='reduce',device_scale_factor=1)
                errors=[]; page.on('pageerror',lambda error:errors.append(str(error)))
                css=(args.build/('rep.css' if role=='rep' else {'admin':'admin-web.css','client':'client-mobile.css','rep-compat':'rep-mobile.css'}[role])).read_text()
                pre=PRELUDE+"if(!crypto.randomUUID) crypto.randomUUID=()=> '00000000-0000-4000-8000-'+String(Math.floor(Math.random()*1e12)).padStart(12,'0');"
                page.set_content('<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><title>اختبار الواجهة</title><style>'+css+'</style><script>'+pre+'</script></head><body><div id="app"></div></body></html>')
                page.add_script_tag(content=(args.build/'fixture.js').read_text())
                page.evaluate('(role)=>uxHarness.start(role)',role)
                page.add_script_tag(content=args.axe.read_text())
                selector='[data-page]' if role=='rep' else '[data-live-section]'
                attr='data-page' if role=='rep' else 'data-live-section'
                routes=page.locator(selector).evaluate_all('(els,attr)=>els.map(e=>({route:e.getAttribute(attr),label:e.textContent}))',attr)
                for state in (['records','empty','error'] if args.states and width==390 else ['records']):
                    page.evaluate('(state)=>uxHarness.setScenario(state)',state)
                    for route in routes:
                        name=route['route']
                        page.locator(f'[{attr}="{name}"]').click()
                        page.wait_for_function("()=>document.querySelector('main')?.getAttribute('aria-busy')!=='true'")
                        page.wait_for_timeout(50)
                        diagnostics=page.evaluate('''()=>({overflow:document.documentElement.scrollWidth>innerWidth+1,scrollWidth:document.documentElement.scrollWidth,title:document.title,content:document.querySelector('main').innerText,forms:document.querySelectorAll('main form').length,focus:document.activeElement.tagName,overlappingNavLabels:[...document.querySelectorAll('.app-nav .nav-link')].filter(e=>e.scrollWidth>e.clientWidth+1).map(e=>e.textContent)})''')
                        axe=page.evaluate('''async()=>{const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:r.passes.length};}''')
                        filename=f'{role}-{name}-{width}-{state}.png'
                        if args.screenshots and width!=320 and state=='records':page.screenshot(path=str(args.output/filename),full_page=True,animations='disabled')
                        results.append({'app':role,'route':name,'width':width,'scenario':state,'diagnostics':diagnostics,'axe':axe,'pageErrors':errors.copy(),'unexpectedRequests':page.evaluate('uxHarness.unexpectedRequests'),'calls':page.evaluate('uxHarness.calls'),'screenshot':filename if (args.output/filename).exists() else None})
                        (args.output/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
                        print(role,name,width,state,'overflow' if diagnostics['overflow'] else 'fits','axe='+str(len(axe['violations'])),flush=True)
                page.close()
        browser.close()
    summary={'cases':len(results),'overflow':sum(r['diagnostics']['overflow'] for r in results),'pageErrors':sum(bool(r['pageErrors']) for r in results),'overlappingNavLabelCases':sum(bool(r['diagnostics']['overlappingNavLabels']) for r in results),'unexpectedRequests':sum(bool(r['unexpectedRequests']) for r in results),'axeViolations':sum(len(r['axe']['violations']) for r in results),'scope':'Actual server renderers; explicit test-only transport. No live authentication/backend acceptance.'}
    (args.output/'summary.json').write_text(json.dumps(summary,indent=2))
    print(json.dumps(summary),flush=True)
    if args.strict and any(summary[k] for k in ['overflow','pageErrors','axeViolations','unexpectedRequests','overlappingNavLabelCases']):raise SystemExit(1)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--build',type=Path,required=True);p.add_argument('--output',type=Path,required=True);p.add_argument('--axe',type=Path,required=True);p.add_argument('--apps',default='admin,client,rep,rep-compat');p.add_argument('--widths',default='320,390,768,1440');p.add_argument('--chromium',default='/usr/bin/chromium');p.add_argument('--states',action='store_true');p.add_argument('--screenshots',action='store_true');p.add_argument('--strict',action='store_true');run(p.parse_args())
