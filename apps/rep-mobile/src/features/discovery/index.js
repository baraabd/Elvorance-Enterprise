import { configured, visibleQuestions, validateAnswers, recommendServices } from '@atlas/questionnaire';

/** CRM discovery wizard. Every completed answer stores the questionnaire revision and label snapshot. */
export function createDiscoveryFeature(context,{state}){
  const {A,e,ic,go,head,client,rep,ownVisits,missing}=context;
  const steps=[{key:'activity',title:'نوع النشاط'},{key:'challenge',title:'تحديات المنشأة'},{key:'goal',title:'النتائج المطلوبة'},{key:'solution',title:'الخدمات المقترحة'}];
  const safe=x=>e(String(x??''));
  const answerField=(q,answer,catalog,otherValue='')=>{
    const selection=Array.isArray(answer)?answer:[answer||''];
    const options=q.id==='solutions'?catalog.filter(s=>s.active!==false).map(s=>({id:s.id,label:`${s.title} · $${Number(s.price).toLocaleString('en-US')}`})):(q.options||[]);
    const otherShown=selection.includes('other')&&q.otherAllowed;
    let control='';
    if(q.type==='single') control=`<select class="select" name="ans_${safe(q.id)}" data-change="discovery-other-toggle" ${q.required?'required':''}><option value="">اختر الإجابة المناسبة</option>${options.map(o=>`<option value="${safe(o.id)}" ${selection.includes(o.id)?'selected':''}>${safe(o.label)}</option>`).join('')}</select>`;
    else if(q.type==='multi')control=`<div class="survey-options">${options.map(o=>`<label class="checkbox-row"><input type="checkbox" name="ans_${safe(q.id)}" data-change="discovery-other-toggle" value="${safe(o.id)}" ${selection.includes(o.id)?'checked':''}><span>${safe(o.label)}</span></label>`).join('')}</div>`;
    else if(q.type==='number')control=`<input class="input" type="number" name="ans_${safe(q.id)}" step="any" ${q.min!=null?`min="${q.min}"`:''} ${q.max!=null?`max="${q.max}"`:''} value="${safe(answer??'')}" ${q.required?'required':''}>`;
    else control=`<textarea class="textarea" name="ans_${safe(q.id)}" maxlength="2000" rows="3" ${q.required?'required minlength="2"':''}>${safe(answer||'')}</textarea>`;
    return `<section class="card survey-question" data-question="${safe(q.id)}"><label class="field"><span><strong>${safe(q.label)} ${q.required?'*':''}</strong></span>${control}</label>${q.otherAllowed&&options.some(o=>o.id==='other')?`<label class="field survey-other" ${otherShown?'':'hidden'}><span>وضّح إجابة «أخرى»</span><input class="input" type="text" name="ans_${safe(q.id)}__other" minlength="3" maxlength="500" placeholder="اكتب شرحًا قصيرًا" value="${safe(otherValue)}" ${otherShown?'required':''}></label>`:''}</section>`;
  };
  const render=({state:s,params})=>{
    const v=ownVisits(s).find(x=>x.id===params.id&&x.status==='active'); if(!v)return missing('الزيارة غير متاحة أو انتهت');
    const c=client(s,v.clientId);if(!c)return missing('العميل غير موجود');
    const conf=configured(s), saved=v.discoveryDraft||v.discovery||{},activityId=saved.activityId||c.activityId||'';
    const index=Math.min(3,Math.max(0,Number(params.step)||0)), step=steps[index];
    const Q=index===0?[]:visibleQuestions(conf,activityId,step.key);
    const recommended=index===3?recommendServices(conf,activityId,saved.answers||{},s.catalog):[];
    return `${head('اكتشاف احتياج العميل',c.name,go('visit-active','العودة للزيارة','arrow-right',`data-id="${safe(v.id)}"`))}
      <nav class="survey-stepper" aria-label="مراحل الاستبيان">${steps.map((s,i)=>`<span class="survey-step ${i===index?'current':i<index?'complete':''}">${i+1}. ${safe(s.title)}</span>`).join('')}</nav>
      <div class="rep-narrow"><section class="card"><h2>${safe(step.title)}</h2><p class="muted">الأسئلة المعتمدة من الإدارة · الإصدار ${conf.revision}. لا تضع بيانات حساسة غير ضرورية في الملاحظات.</p></section>
      <form class="stack" data-submit="discovery-next" data-id="${safe(v.id)}" data-step="${index}">
        ${index===0?`<section class="card"><label class="field"><span>ما نوع نشاط المنشأة؟ *</span><select name="activityId" class="select" required><option value="">اختر نشاط المنشأة</option>${conf.activities.filter(a=>a.active||a.id===activityId).map(a=>`<option value="${safe(a.id)}" ${activityId===a.id?'selected':''}>${safe(a.label)}</option>`).join('')}</select></label></section>`:''}
        ${Q.map(q=>answerField(q,saved.answers?.[q.id],s.catalog,saved.answers?.[q.id+'__other'])).join('')}
        ${index===3?`<section class="card"><h3>اقتراحات قابلة للتفسير من الإجابات</h3>${recommended.length?recommended.map(svc=>`<p class="small"><strong>${safe(svc.title)}</strong> — ${safe(svc.reasons.join('؛ ')||'مطابقة لكلمات الاحتياج')}</p>`).join(''):'<p class="muted">لا توجد مطابقة آلية مؤكدة. اختر من الكتالوج ما يوافق عليه العميل بعد مراجعة النطاق.</p>'}<p class="tiny muted">هذه قواعد ترشيح قابلة لتعديل وسومها من الإدارة؛ ليست وعدًا بإيرادات أو قرارًا ملزمًا للعميل.</p></section>`:''}
        <div class="row wrap gap-sm">${index?`<button class="btn btn-secondary" type="button" data-go="visit-questionnaire" data-id="${safe(v.id)}" data-param-step="${index-1}">السابق</button>`:''}<button class="btn btn-primary" type="submit">${ic('check')}${index===3?'حفظ الاستبيان وفتح الزيارة':'الخطوة التالية'}</button></div>
      </form></div>`;
  };
  function parseStep(form,qs){
    const answers={}; for(const q of qs){
      const name='ans_'+q.id, inputs=[...form.querySelectorAll(`[name="${CSS.escape(name)}"]`)];
      const selected=q.type==='multi'?inputs.filter(el=>el.checked).map(el=>el.value):inputs.find(el=>!['checkbox','radio'].includes(el.type))?.value||'';
      answers[q.id]=selected;
      if(q.otherAllowed){const other=form.querySelector(`[name="${CSS.escape(name+'__other')}"]`);if(other&&other.value.trim())answers[q.id+'__other']=other.value.trim();}
    }return answers;
  }
  return {id:'discovery',routes:{'visit-questionnaire':{title:'استبيان العميل',render,nav:'territory'}},actions:{
    'discovery-other-toggle':({el})=>{
      const box=el.closest('[data-question]');if(!box)return;
      const other=box.querySelector('.survey-other');if(!other)return;
      const isOther=[...box.querySelectorAll('select,input[type="checkbox"]')].some(x=>x.value==='other'&&(x.checked||x.selectedOptions?.[0]?.value==='other'));
      other.hidden=!isOther;const input=other.querySelector('input');input.required=isOther;if(!isOther)input.value='';
    },
    'discovery-next':({form,params})=>{
      const s=A.state(),v=ownVisits(s).find(x=>x.id===form.dataset.id&&x.status==='active');if(!v)return A.toast('الزيارة غير متاحة','error');
      const idx=Number(form.dataset.step),conf=configured(s), current=v.discoveryDraft||v.discovery||{}, activityId=idx===0?String(form.elements.activityId.value||''):current.activityId;
      if(!conf.activities.some(a=>a.id===activityId&&a.active))return A.toast('اختر نوع نشاط معتمد.','error');
      const qs=idx===0?[]:visibleQuestions(conf,activityId,steps[idx].key);
      const answers={...(current.answers||{}),...parseStep(form,qs)};
      const issues=validateAnswers(conf,activityId,answers,s.catalog);
      const relevant=qs.map(q=>issues[q.id]).find(Boolean);if(relevant)return A.toast(relevant,'error');
      if(idx===3){const all=Object.values(issues).filter(Boolean);if(all.length)return A.toast('أكمل الإجابات المطلوبة: '+all[0],'error');}
      const snapshot={activityId,answers,configRevision:conf.revision,questions:conf.questions.filter(q=>q.active!==false).map(q=>({id:q.id,label:q.label,options:q.options,activityIds:q.activityIds})),services:s.catalog.filter(svc=>(answers.solutions||[]).includes(svc.id)).map(svc=>({id:svc.id,title:svc.title,price:svc.price})),savedAt:new Date().toISOString()};
      const ok=state.commit((st)=>{
        const now=st.visits.find(x=>x.id===v.id);A.assert(now&&now.status==='active','الزيارة انتهت أو تغيرت.');
        now.discoveryDraft=snapshot;
        if(idx===3){now.discovery=snapshot;const format=(q)=>{const raw=answers[q.id],v=Array.isArray(raw)?raw:[raw].filter(Boolean);return v.map(id=>q.id==='solutions'?st.catalog.find(x=>x.id===id)?.title||id:q.options?.find(o=>o.id===id)?.label||id).join('، ');};
          const challenge=visibleQuestions(conf,activityId,'challenge'),goals=visibleQuestions(conf,activityId,'goal');
          now.workingDraft={...(now.workingDraft||{}),needs:answers.solutions||[],painPoints:challenge.map(q=>`${q.label}: ${format(q)}`).join('\n'),wishes:goals.map(q=>format(q)).join('، ')};const cust=st.clients.find(x=>x.id===now.clientId);if(cust){cust.activityId=activityId;cust.needs=[...new Set([...(cust.needs||[]),...(answers.solutions||[])])];}}
      },'تحديث استبيان احتياج العميل');if(ok===false)return;
      A.go(idx===3?'visit-active':'visit-questionnaire',{id:v.id,...(idx===3?{}:{step:idx+1})});
    },
  },api:{}};
}
