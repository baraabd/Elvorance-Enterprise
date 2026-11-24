"""Render the real portable application bundles in Chromium. No hosted/backend claim.

No browser policy bypass is required: set_content also works in restricted review
containers. Storage, time and business records are deterministic TEST fixtures.
"""
from __future__ import annotations
import argparse, hashlib, json, re, time
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[2]
PRELUDE = r'''(() => {
 const NativeDate = Date, now = NativeDate.parse('2027-02-10T12:00:00.000Z');
 window.Date = class extends NativeDate { constructor(...a) { super(...(a.length?a:[now])); } static now(){return now;} };
 let seed=20270110; Math.random=()=>((seed=(Math.imul(seed,1664525)+1013904223)>>>0)/4294967296);
 const memory = new Map();
 Object.defineProperty(window,'localStorage',{value:{getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,String(v)),removeItem:k=>memory.delete(k),clear:()=>memory.clear()}, configurable:true});
 window.BroadcastChannel=undefined;
})();'''

def portable(page, source: str):
    html = re.sub(r'(<head[^>]*>)', lambda m: m[1]+'<script>'+PRELUDE+'</script>', source, count=1)
    page.set_content(html, wait_until='load')
    page.wait_for_function('window.Elvorance && window.ElvoranceBundle?.definition')
    page.wait_for_timeout(60)


def run(args):
    args.output.mkdir(parents=True, exist_ok=True)
    frozen = json.loads((ROOT/'tests/design-parity/baseline-v1.1.json').read_text())
    cases = {(c['app'],c['route']):c for c in frozen['cases']}
    extra_params = {('rep','visit-questionnaire'):{'id':'client-1'},('client','needs-survey'): {}}
    results, screens = [], []
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium, args=['--no-sandbox'])
        for app in args.apps.split(','):
            for width in [int(x) for x in args.widths.split(',')]:
                page = browser.new_page(viewport={'width':width,'height':900},locale='ar-SA',timezone_id='UTC',reduced_motion='reduce',device_scale_factor=1)
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                portable(page, (args.dist/f'{app}.html').read_text())
                seed = page.evaluate('Elvorance.state()')
                routes = page.evaluate('Object.entries(ElvoranceBundle.definition.routes).map(([route,d])=>({route,title:d.title,nav:d.nav??null}))')
                if args.axe:
                    page.add_script_tag(content=args.axe.read_text())
                for route in routes:
                    name = route['route']
                    if args.routes and name not in args.routes.split(','): continue
                    case = cases.get((app,name),{})
                    fixture = frozen['fixtures'].get(case.get('fixture','default'),{})
                    params = case.get('params',extra_params.get((app,name),{}))
                    page.evaluate('''({seed,fixture,route,params}) => {
                        Elvorance.update(s=>{Object.assign(s,structuredClone(seed)); for(const [collection, rows] of Object.entries(fixture)) for(const [id,patch] of Object.entries(rows)) Object.assign(s[collection].find(r=>r.id===id),patch);});
                        Elvorance.go(route,params);
                    }''', {'seed':seed,'fixture':fixture,'route':name,'params':params})
                    page.wait_for_function('(r)=>Elvorance.route()===r', arg=name)
                    page.wait_for_timeout(70)
                    diagnostics = page.evaluate('''() => {
                      const visible=e=>e.getClientRects().length && getComputedStyle(e).visibility!=='hidden';
                      const main=document.querySelector('main');
                      const controls=[...main.querySelectorAll('button,input,select,textarea,a[href],[role=button]')].filter(visible);
                      return {
                       overflow:document.documentElement.scrollWidth>innerWidth+1,
                       scrollWidth:document.documentElement.scrollWidth,
                       title:document.title, headings:[...main.querySelectorAll('h1,h2,h3')].map(e=>({level:e.tagName,text:e.textContent.trim()})),
                       forms:main.querySelectorAll('form').length, controls:controls.length,
                       unlabeled:controls.filter(e=>!e.textContent.trim()&&!e.getAttribute('aria-label')&&!e.getAttribute('aria-labelledby')&&!e.labels?.length&&!e.getAttribute('title')).map(e=>e.outerHTML.slice(0,300)),
                       smallTargets:controls.filter(e=>{const r=e.getBoundingClientRect();return r.width<24||r.height<24}).map(e=>({html:e.outerHTML.slice(0,250),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})),
                       fallback:/تعذر عرض هذه الصفحة|تعذّر عرض هذه الصفحة/.test(main.textContent),
                       content:main.innerText.slice(0,350),
                       overflowElements:[...main.querySelectorAll('*')].filter(visible).filter(e=>{const r=e.getBoundingClientRect();return (r.right>innerWidth+1||r.left< -1)&&getComputedStyle(e).position!=='absolute'}).slice(0,12).map(e=>({tag:e.tagName,cls:e.className,left:e.getBoundingClientRect().left,right:e.getBoundingClientRect().right}))
                      };
                    }''')
                    axe = None
                    if args.axe:
                        axe = page.evaluate('''async () => {const r=await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa','wcag22aa']}});return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,description:v.description,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.length})),passes:r.passes.length};}''')
                    file = f'{app}-{name}-{width}.png'
                    digest = None
                    if args.screenshots and width != 320:
                        page.screenshot(path=str(args.output/file),full_page=True,animations='disabled')
                        digest = hashlib.sha256((args.output/file).read_bytes()).hexdigest()
                    result={'app':app,'route':name,'width':width,'routeDefinition':route,'params':params,'fixture':case.get('fixture','default'),'diagnostics':diagnostics,'axe':axe,'pageErrors':errors.copy(),'screenshot':file if digest else None,'sha256':digest}
                    results.append(result)
                    print(app,name,width,'overflow' if diagnostics['overflow'] else 'fits', 'axe='+str(len(axe['violations'])) if axe else '', flush=True)
                    (args.output/'results.json').write_text(json.dumps(results,ensure_ascii=False,indent=2))
                page.close()
        browser.close()
    summary={'cases':len(results),'overflow':sum(x['diagnostics']['overflow'] for x in results),'renderErrors':sum(bool(x['pageErrors']) or x['diagnostics']['fallback'] for x in results),'axeExecuted':bool(args.axe),'axeViolations':sum(len(x['axe']['violations']) for x in results if x['axe']),'source':'real portable bundles; deterministic local demo fixtures; not backend acceptance'}
    (args.output/'summary.json').write_text(json.dumps(summary,ensure_ascii=False,indent=2))
    print(json.dumps(summary),flush=True)
    if args.strict and not args.axe: raise SystemExit('Strict audit requires axe; missing execution cannot pass.')
    if args.strict and (summary['overflow'] or summary['renderErrors'] or summary['axeViolations']): raise SystemExit(1)

if __name__=='__main__':
    parser=argparse.ArgumentParser()
    parser.add_argument('--dist',type=Path,default=ROOT/'dist')
    parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--chromium',default='/usr/bin/chromium')
    parser.add_argument('--apps',default='admin,client,rep')
    parser.add_argument('--widths',default='320,390,768,1440')
    parser.add_argument('--routes')
    parser.add_argument('--axe',type=Path)
    parser.add_argument('--screenshots',action='store_true')
    parser.add_argument('--strict',action='store_true')
    run(parser.parse_args())
