/* Elvorance representative visit journey regression, adapted to the current four-step discovery flow.
 * The old v1 visit fields were intentionally removed; this suite tests the new public UI,
 * not legacy controls. This is a JSDOM test, not a device or network acceptance test. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM, VirtualConsole } = require('jsdom');

type Result = { name: string; status: 'passed' | 'failed'; error?: string };
const results: Result[] = [];
const root = path.resolve(__dirname, '../../dist/test-adapters');
const storeKey = 'atlas.crm.2027.v1';
const pause = () => new Promise<void>((done) => setTimeout(done, 15));

async function create(saved: Record<string,string> = {}) {
  const errors: string[] = [];
  const virtualConsole = new VirtualConsole();
  virtualConsole.on('jsdomError', (err: Error) => errors.push(String(err)));
  const dom = new JSDOM(
    '<!doctype html><html lang="ar" dir="rtl"><body><div id="app"></div></body></html>',
    { url: 'https://elvorance-journey.test/rep/', runScripts: 'outside-only', pretendToBeVisual: true, virtualConsole },
  );
  const w = dom.window;
  w.structuredClone = structuredClone;
  w.CSS ??= {};
  w.CSS.escape ??= (text: string) => String(text).replace(/[^a-zA-Z0-9_-]/g, (c: string) => '\\' + c);
  w.scrollTo = () => {};
  for (const [key,value] of Object.entries(saved)) w.localStorage.setItem(key,value);
  for (const source of ['src/shared/icons.js','src/shared/seed.js','src/shared/core.js','src/apps/rep.js'])
    w.eval(fs.readFileSync(path.join(root,source),'utf8'));
  w.Elvorance.start('rep');
  await pause();
  return { dom,w,errors,A:w.Elvorance };
}

function state(ctx: any) {
  return ctx.A.state();
}
function field(ctx: any, selector: string) {
  const node=ctx.w.document.querySelector(selector);
  assert.ok(node,'Missing UI field: '+selector);
  return node;
}
function submit(ctx: any, form: any) {
  form.dispatchEvent(new ctx.w.Event('submit',{bubbles:true,cancelable:true}));
}
async function go(ctx: any, route: string, params: Record<string,string> = {}) {
  ctx.A.go(route, params);
  await pause();
  assert.ok(!ctx.w.document.querySelector('#main-content')?.textContent?.includes('تعذر عرض هذه الصفحة'),route+' failed to render');
}
async function check(name: string, test: ()=>Promise<void>) {
  try {
    await test();
    results.push({name,status:'passed'});
    console.log('PASS '+name);
  } catch (error) {
    results.push({name,status:'failed',error:String(error)});
    console.error('FAIL '+name+': '+String(error));
    throw error;
  }
}

async function main() {
  let ctx=await create();
  try {
    await check('Check-in remains explicit and requires a reason',async()=>{
      await go(ctx,'visit-checkin',{id:'client-1',visit:'visit-1'});
      submit(ctx,field(ctx,'form[data-submit="start-visit"]'));
      assert.equal(state(ctx).visits.filter((v:any)=>v.status==='active').length,0);
      field(ctx,'[name="manualReason"]').value='تم تأكيد الوصول وتعذر الحصول على إحداثيات الموقع داخل المبنى.';
      field(ctx,'[name="notes"]').value='جلسة موثقة مع مدير المنشأة لمراجعة الاحتياجات.';
      submit(ctx,field(ctx,'form[data-submit="start-visit"]'));
      await pause();
      assert.equal(state(ctx).visits.filter((v:any)=>v.id==='visit-1'&&v.status==='active').length,1);
    });
    await check('Discovery wizard starts with activity and does not persist an incomplete discovery',async()=>{
      await go(ctx,'visit-questionnaire',{id:'visit-1'});
      const visit=state(ctx).visits.find((v:any)=>v.id==='visit-1');
      assert.ok(!visit.discovery);
      assert.equal(field(ctx,'form[data-submit="discovery-next"]').dataset.step,'0');
      const select=field(ctx,'select[name="activityId"]');
      select.value='clinic';
      submit(ctx,field(ctx,'form[data-submit="discovery-next"]'));
      await pause();
      assert.equal(field(ctx,'form[data-submit="discovery-next"]').dataset.step,'1');
      assert.ok(!state(ctx).visits.find((v:any)=>v.id==='visit-1').discovery);
    });
    await check('Mandatory activity-specific challenges and goals are captured in sequence',async()=>{
      for (const step of [1,2,3]) {
        assert.equal(Number(field(ctx,'form[data-submit="discovery-next"]').dataset.step),step);
        const sections=[...ctx.w.document.querySelectorAll('.survey-question')];
        assert.ok(sections.length>0,'No questions rendered for step '+step);
        for (const section of sections) {
          const select=section.querySelector('select');
          if (select) {
            const option=[...select.options].find((o:any)=>o.value&&!o.disabled);
            assert.ok(option,'Select has no option');
            select.value=option.value;
          }
          const checkboxes=[...section.querySelectorAll('input[type="checkbox"]')];
          if (checkboxes.length) checkboxes[0].checked=true;
          const numeric=section.querySelector('input[type="number"]');
          if (numeric) numeric.value=String(numeric.min || 1);
          const textarea=section.querySelector('textarea');
          if (textarea) textarea.value='وصف احتياج حقيقي قابل للمتابعة والمراجعة';
        }
        submit(ctx,field(ctx,'form[data-submit="discovery-next"]'));
        await pause();
      }
      const visit=state(ctx).visits.find((v:any)=>v.id==='visit-1');
      assert.ok(visit.discovery,'Completed questionnaire was not saved');
      assert.equal(visit.discovery.activityId,'clinic');
      assert.ok(Array.isArray(visit.discovery.answers.solutions));
      assert.ok(visit.discovery.answers.solutions.length>0);
      assert.ok(Array.isArray(visit.workingDraft.needs));
      assert.ok(visit.workingDraft.needs.length>0);
    });
    await check('Saved discovery and its revision survive a reload',async()=>{
      const before=state(ctx).visits.find((v:any)=>v.id==='visit-1').discovery;
      const saved:Record<string,string>={};
      for(let i=0;i<ctx.w.localStorage.length;i++){const k=ctx.w.localStorage.key(i);saved[k]=ctx.w.localStorage.getItem(k);}
      ctx.dom.window.close();
      ctx=await create(saved);
      await go(ctx,'visit-active',{id:'visit-1'});
      const after=state(ctx).visits.find((v:any)=>v.id==='visit-1').discovery;
      assert.equal(after.configRevision,before.configRevision);
      assert.deepEqual(JSON.parse(JSON.stringify(after.answers)),JSON.parse(JSON.stringify(before.answers)));
    });
    await check('Quote builder is linked to the qualified visit and retains numeric totals',async()=>{
      await go(ctx,'visit-active',{id:'visit-1'});
      const button=field(ctx,'[data-action="quote-new"]');
      button.dispatchEvent(new ctx.w.MouseEvent('click',{bubbles:true,cancelable:true}));
      await pause();
      field(ctx,'[name="title"]').value='عرض تجريبي مرتبط بزيارة مؤهلة';
      field(ctx,'[name="title"]').dispatchEvent(new ctx.w.Event('input',{bubbles:true}));
      const existing=[...ctx.w.document.querySelectorAll('[data-input="quote-qty"]')];
      if (!existing.length) {
        const add=field(ctx,'[data-action="quote-add"]');
        add.dispatchEvent(new ctx.w.MouseEvent('click',{bubbles:true,cancelable:true}));
        await pause();
      }
      field(ctx,'[data-input="quote-discount-input"]').value='0';
      field(ctx,'[data-input="quote-discount-input"]').dispatchEvent(new ctx.w.Event('input',{bubbles:true}));
      const suggest=field(ctx,'[data-action="quote-payment-suggest"]');
      suggest.dispatchEvent(new ctx.w.MouseEvent('click',{bubbles:true,cancelable:true}));
      submit(ctx,field(ctx,'#rep-quote-form'));
      await pause();
      const quote=state(ctx).quotes.find((q:any)=>q.title==='عرض تجريبي مرتبط بزيارة مؤهلة');
      assert.ok(quote,'Quote was not saved; toast: '+String(ctx.w.document.querySelector('#toasts')?.textContent));
      assert.equal(quote.visitId,'visit-1');
      assert.ok(quote.items.length>0);
      assert.ok(quote.total>0);
      assert.equal(typeof quote.total,'number');
    });
    assert.deepEqual(ctx.errors,[],'Unexpected JSDOM runtime errors');
  } finally {
    ctx.dom.window.close();
    console.log(JSON.stringify({suite:'rep-journey',passed:results.filter(x=>x.status==='passed').length,failed:results.filter(x=>x.status==='failed').length,results},null,2));
  }
}
main().catch((err:Error)=>{console.error(err);process.exitCode=1;});
