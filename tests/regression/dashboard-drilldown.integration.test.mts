// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Runs using Node's built-in test runner; does not require npm dependencies or browser access. */
import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
const root = resolve(process.argv[2] || process.cwd());
const importAt = async (path) => import(pathToFileURL(join(root, path)).href);
const { createDemoData } = await importAt('packages/demo-data/src/index.ts');
const { createRepButtons } = await importAt('packages/ui/src/buttons.ts');
const { createRepPageHeads } = await importAt('packages/ui/src/page-heads.ts');
const { createQueries } = await importAt('apps/rep-mobile/src/queries.ts');
const { createDashboardFeature } = await importAt('apps/rep-mobile/src/features/dashboard/index.ts');
const { createTasksFeature } = await importAt('apps/rep-mobile/src/features/tasks/index.ts');
const { createOpportunitiesFeature } = await importAt('apps/rep-mobile/src/features/opportunities/index.ts');
const { createQuotesFeature } = await importAt('apps/rep-mobile/src/features/quotes/index.ts');

const s = createDemoData();
const e = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const A = {
  esc:e, icon:n=>`<svg data-icon="${e(n)}"></svg>`,
  money: n=>'$'+Number(n||0).toLocaleString('en-US'),
  today:()=> new Date().toISOString().slice(0,10),
  date: x=>String(x||''),
  empty:(title,detail)=>`<div class="empty-state">${e(title)} ${e(detail)}</div>`,
  progress: v=>`<span data-progress="${Number(v)||0}"></span>`,
  badge: (name)=>`<span class="badge">${e(name)}</span>`,
  map:()=>'<div class="test-map"></div>',
  state:()=>s,
  quoteFingerprint:()=> 'test',
};
const helpers=createRepButtons({e,ic:A.icon});
const heads=createRepPageHeads({e,ic:A.icon});
const queries=createQueries({});
const context = {
  A,e,ic:A.icon,...helpers,...heads,...queries,
  act:helpers.act,
  cash:n=>A.money(n),date:x=>String(x||''), time:x=>String(x||''),
  localDay: x=> { const d = new Date(x); return Number.isFinite(d.getTime()) ? d.toISOString().slice(0,10) : ''; },
  badge: (status)=>A.badge(status),
  chipLink:(route,key,label,active)=>`<button data-go="${e(route)}" data-param-filter="${e(key)}" class="${active?'active':''}">${e(label)}</button>`,
  labels:{won:'مكتسب',lost:'خاسر',new:'جديد',qualified:'مؤهّل',negotiation:'تفاوض',proposal:'عرض'},
  stageList:['new','qualified','proposal','negotiation','won','lost'],
  clone: v=>structuredClone(v),
  draftKey:()=>'',getVisit:()=>null,missing:()=>'',notify:()=>'',now:()=>new Date().toISOString(),
  ui:{},
};
const dashboard=createDashboardFeature(context,{territory:{stopCard:()=>'<div>visit</div>'}});
const tasks=createTasksFeature(context,{state:{commit:()=>{}}});
const opps=createOpportunitiesFeature(context,{state:{commit:()=>{}},quotes:{quoteStatus:()=>''},visits:{currentVisitFor:()=>null}});
const quotes=createQuotesFeature(context,{state:{commit:()=>{},readDraft:()=>null,removeDraft:()=>{},writeDraft:()=>{}},visits:{bindQuoteToVisit:()=>{},currentVisitFor:()=>null,visitWorking:()=>({})}});
const htmlHome= state => dashboard.routes.home.render({state});
const extractKpis = html => [...html.matchAll(/<button\s+[^>]*class="stat rep-stat-link"[^>]*>/g)].map(match=>({html:match[0],route:match[0].match(/data-go="([^"]+)"/)?.[1],filter:match[0].match(/data-param-filter="([^"]+)"/)?.[1],source:match[0].match(/data-param-source="([^"]+)"/)?.[1]}));
const own=queries;

await test('exactly four accessible dashboard KPI buttons, each pointing to its distinct filtered list', () => {
 const items=extractKpis(htmlHome(s));
 assert.equal(items.length,4);
 assert.deepEqual(items.map(x=>[x.route,x.filter,x.source]),[
  ['tasks','open','dashboard'],['opportunities','open','dashboard'],['opportunities','won','dashboard'],['quotes','sent','dashboard']]);
 for (const x of items) {assert.match(x.html,/type="button"/);assert.match(x.html,/aria-label="عرض/);}
 assert.ok(!items.some(x=>/onclick\s*=/.test(x.html)),'Navigation uses existing delegated data-go listener');
});

await test('open tasks KPI matches filtered open tasks, displays original task actions and back navigation', () => {
 const expected=s.tasks.filter(t=>t.repId===own.rep(s).id&&t.status==='open').length;
 const home=htmlHome(s);assert.match(home,new RegExp(`>${expected}<\\/strong>`));
 const html=tasks.routes.tasks.render({state:s,params:{filter:'open',source:'dashboard'}});
 assert.match(html,/مهام مفتوحة/);assert.match(html,new RegExp(`${expected} سجل مطابق`));
 assert.match(html,/data-go="home"/);assert.match(html,/data-action="task-toggle"/);
 assert.doesNotMatch(html,/data-id="task-9999999"/);
});

await test('working opportunities exclude both won and lost, with dedicated chip and details navigation', () => {
 const rows=own.ownOpps(s).filter(o=>!['won','lost'].includes(o.stage));
 const html=opps.routes.opportunities.render({state:s,params:{filter:'open',source:'dashboard'}});
 assert.match(html,/فرص قيد العمل/); assert.match(html,new RegExp(`${rows.length} سجل مطابق`));
 assert.match(html,/data-param-filter="open"/); assert.match(html,/data-go="home"/);
 rows.forEach(o=>assert.ok(html.includes(e(o.title)),`Working opportunity missing: ${o.title}`));
 own.ownOpps(s).filter(o=>['won','lost'].includes(o.stage)).forEach(o=>{
  assert.ok(!html.includes(`<h2>${e(o.title)}</h2>`),'Closed opportunity leaked into working list: '+o.id);
 });
});

await test('won value card opens only won opportunities; listed values total the same as dashboard', () => {
 const rows=own.ownOpps(s).filter(o=>o.stage==='won');
 const amount=rows.reduce((sum,o)=>sum+Number(o.value),0);
 const html=opps.routes.opportunities.render({state:s,params:{filter:'won',source:'dashboard'}});
 assert.match(html,/قيمة الفرص المكتسبة/);assert.ok(html.includes(A.money(amount)));
 rows.forEach(o=>assert.ok(html.includes(`<h2>${e(o.title)}</h2>`)));
 const home=htmlHome(s);assert.ok(home.includes(A.money(amount)));
 assert.match(html,/data-go="home"/);
});

await test('sent quotes KPI lists exactly sent quotes with quote detail actions', () => {
 const rows=own.ownQuotes(s).filter(q=>q.status==='sent');
 const html=quotes.routes.quotes.render({state:s,params:{filter:'sent',source:'dashboard'}});
 assert.match(html,/عروض تنتظر العميل/);assert.match(html,new RegExp(`${rows.length} سجل مطابق`));
 assert.match(html,/data-go="home"/);assert.match(html,/data-go="quote-detail"/);
 rows.forEach(q=>assert.ok(html.includes(`<h2>${e(q.title)}</h2>`),'Missing sent quote '+q.id));
});

await test('dashboard counts and detail list dynamically reflect data changes (no hardcoded counts)', () => {
 const m=structuredClone(s);const r=own.rep(m);
 m.tasks.find(t=>t.repId===r.id&&t.status==='open').status='done';
 m.opportunities.find(o=>o.repId===r.id&&o.stage==='won').stage='lost';
 m.quotes.find(q=>q.repId===r.id&&q.status==='sent').status='accepted';
 const html=htmlHome(m);
 const items=extractKpis(html);assert.equal(items.length,4);
 const openTasks=m.tasks.filter(t=>t.repId===r.id&&t.status==='open').length;
 assert.ok(html.includes(`>${openTasks}</strong>`));
 const taskPage=tasks.routes.tasks.render({state:m,params:{filter:'open',source:'dashboard'}});
 assert.match(taskPage,new RegExp(`${openTasks} سجل مطابق`));
 const sent=m.quotes.filter(q=>q.repId===r.id&&q.status==='sent').length;
 const sentPage=quotes.routes.quotes.render({state:m,params:{filter:'sent',source:'dashboard'}});
 assert.match(sentPage,new RegExp(`${sent} سجل مطابق`));
});

await test('empty dashboard KPI still opens a filtered empty state rather than dead navigation', () => {
 const empty=structuredClone(s);
 empty.tasks=empty.tasks.filter(t=>t.repId!==own.rep(empty).id);
 empty.quotes=empty.quotes.filter(q=>q.repId!==own.rep(empty).id);
 empty.opportunities=empty.opportunities.filter(o=>o.repId!==own.rep(empty).id);
 const kpis=extractKpis(htmlHome(empty));
 assert.equal(kpis.length,4);
 for(const kpi of kpis) assert.equal(kpi.source,'dashboard');
 const taskList=tasks.routes.tasks.render({state:empty,params:{filter:'open',source:'dashboard'}});
 assert.match(taskList,/0 سجل مطابق/);
 assert.match(taskList,/لا مهام هنا/);
 assert.match(taskList,/data-go=\"home\"/);
 const quoteList=quotes.routes.quotes.render({state:empty,params:{filter:'sent',source:'dashboard'}});
 assert.match(quoteList,/0 سجل مطابق/);
 assert.match(quoteList,/لا عروض في هذه القائمة/);
});

await test('keyboard focus design and mobile tap style exist; source is module-based and safe to include', async () => {
 const css=await readFile(join(root,'apps/rep-mobile/src/styles.css'),'utf8');
 assert.match(css,/\.rep-stat-link:focus-visible/);assert.match(css,/touch-action:manipulation/);
 const runtime=await readFile(join(root,'packages/app-runtime/src/index.ts'),'utf8');
 assert.ok(runtime.includes("if (el.dataset.go)"));
 assert.ok(runtime.includes("key.startsWith('param')"));
});
console.log('Dashboard drill-down: static rendering, filters, real seed calculations and existing route contract verified. Not a physical-device or end-to-end browser test.');
