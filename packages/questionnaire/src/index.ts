// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Tenant-editable discovery schema. Stable identifiers survive copy edits. No customer answers are seeded here. */
const activities = [
  ['clinic','عيادة / مركز طبي'], ['restaurant','مطعم / مقهى'], ['workshop','ورشة / صيانة'],
  ['factory','مصنع / منشأة إنتاج'], ['retail','متجر / بقالية'], ['salon','صالون / مركز تجميل'],
  ['services','شركة خدمات'], ['other','نشاط آخر']
].map(([id,label])=>({id,label,active:true}));
const option = (values) => values.map(([id,label])=>({id,label}));
const base = [
  ['situation','ما الموقف مع العملاء الذي تتمنى تغييره أولًا؟','challenge', [['slow','تأخر الخدمة أو الانتظار'],['lost','فقدان فرص البيع'],['visibility','ضعف معرفة الناس بالنشاط'],['errors','أخطاء في متابعة الطلبات'],['other','أخرى']]],
  ['reach','كيف يصل العملاء إليكم الآن؟','challenge', [['walkin','زيارات مباشرة'],['referrals','توصيات ومعارف'],['social','وسائل التواصل'],['maps','خرائط ومحركات بحث'],['phone','الهاتف أو واتساب'],['other','أخرى']]],
  ['bottleneck','أين يضيع الوقت أو تتكرر الأخطاء أثناء الخدمة؟','challenge', [['booking','الحجوزات وتنظيم الدور'],['followup','الرد والمتابعة'],['records','السجلات والفواتير'],['inventory','المخزون أو التوريد'],['manual','العمل الورقي'],['other','أخرى']]],
  ['impact','كيف يؤثر هذا الوضع عليكم وعلى تجربة العميل؟','challenge', [['time','يضيع وقت الفريق'],['sales','تنخفض المبيعات'],['trust','تقل ثقة العملاء'],['repeat','تنخفض الزيارات المتكررة'],['unknown','لم يُقَس بعد'],['other','أخرى']]],
  ['priority','إذا تحسن جانب واحد أولًا، أي فرق سيعني لكم أكثر؟','challenge', [['growth','طلبات ومبيعات أكثر'],['speed','خدمة أسرع'],['loyalty','عودة العملاء مجددًا'],['accuracy','أخطاء أقل'],['visibility','ظهور أقوى'],['other','أخرى']]],
  ['constraints','ما الظروف التي يجب احترامها عند تطبيق أي حل؟','challenge', [['electricity','الكهرباء والإنترنت'],['budget','الميزانية'],['language','اللغة وطريقة استخدام الفريق'],['time','عدم تعطيل العمل'],['privacy','خصوصية بيانات العملاء'],['other','أخرى']]],
  ['goals','ما النتائج التي يريد العميل تحقيقها؟','goal', [['sales','زيادة المبيعات'],['new_clients','استقطاب عملاء جدد'],['appointments','تنظيم المواعيد'],['online','الحضور الرقمي'],['tracking','متابعة الطلبات'],['loyalty','عودة العملاء'],['other','أخرى']]],
  ['solutions','الخدمات التي يرغب العميل في عرض أسعارها','solution',[]]
].map(([id,label,section,choices],i)=>({id,label,section,type:id==='goals'||id==='solutions'?'multi':'single',required:true,active:true,activityIds:['*'],order:(i+1)*10,options:option(choices),otherAllowed:id!=='solutions',min:null,max:null}));
const sectorQuestions = [
  ['clinic','clinic_access','ما أكثر ما يرهق المراجعين عند حجز موعد أو متابعة نتيجة؟',[['queues','الازدحام وانتظار الدور'],['calls','ضغط الهاتف'],['reminder','نسيان المواعيد'],['records','الملفات والمتابعة'],['other','أخرى']]],
  ['restaurant','restaurant_orders','ما أكثر ما يُفقد المطعم طلبات أثناء ساعات الذروة؟',[['menu','صعوبة الوصول للقائمة'],['orders','تداخل الطلبات'],['delivery','تأخر التوصيل'],['social','الرسائل غير المنظمة'],['other','أخرى']]],
  ['workshop','workshop_tracking','أين يضيع التواصل مع صاحب السيارة أو الجهاز؟',[['estimate','تقدير السعر'],['status','متابعة حالة الإصلاح'],['parts','توفر القطع'],['pickup','توقيت التسليم'],['other','أخرى']]],
  ['factory','factory_sales','ما العقبة الأكبر بين طلب العميل وتسليم الإنتاج؟',[['quotations','تجهيز عروض الأسعار'],['production','جدولة الإنتاج'],['inventory','المخزون'],['distribution','التوزيع'],['other','أخرى']]],
  ['retail','retail_sales','ما الذي يعطل البيع في المتجر أكثر؟',[['stock','نفاد الأصناف'],['online','غياب الطلبات الرقمية'],['delivery','صعوبة التوصيل'],['loyalty','ضعف عودة العملاء'],['other','أخرى']]],
  ['salon','salon_appointments','ما أكثر ما يزعج الزبائن أثناء الحجز؟',[['double','تضارب المواعيد'],['cancel','الإلغاء المتأخر'],['reminder','غياب التذكير'],['online','صعوبة الحجز'],['other','أخرى']]],
  ['services','services_pipeline','أين تتعثر متابعة عروض الخدمات؟',[['leads','فقدان العملاء المحتملين'],['pricing','تأخر التسعير'],['updates','عدم وصول التحديثات'],['contracts','إدارة العقود'],['other','أخرى']]]
].map(([activity,id,label,choices],i)=>({id,label,section:'challenge',type:'single',required:true,active:true,activityIds:[activity],order:25+i,options:option(choices),otherAllowed:true,min:null,max:null}));

export function defaultCatalog() {
  const seeds=[
    ['svc-web','موقع إلكتروني احترافي',1800,'web','online,visibility,موقع'],
    ['svc-store','متجر إلكتروني وطلبات',3200,'commerce','orders,stock,delivery'],
    ['svc-brand','هوية بصرية للمنشأة',650,'design','trust,visibility,هوية'],
    ['svc-social','إدارة حضور وسائل التواصل',350,'marketing','social,new_clients,loyalty'],
    ['svc-seo','ظهور في البحث والخرائط',450,'marketing','maps,new_clients,visibility'],
    ['svc-app','تطبيق هاتف مخصص',6500,'software','mobile,online,تطبيق'],
    ['svc-crm','نظام إدارة العملاء والمتابعة',4200,'software','records,followup,tracking,leads'],
    ['svc-cloud','استضافة وصيانة',35,'infrastructure','hosting,electricity,cloud'],
    ['svc-security','فحص وحماية تقنية',900,'infrastructure','privacy,security,حماية'],
    ['svc-book','نظام مواعيد وحجوزات',2200,'software','appointments,booking,queues,reminder']
  ];
  return seeds.map(([id,title,price,category,tags])=>({id,title,price,category,short:title,unit:'للمشروع',duration:'حسب النطاق',features:[],deliverables:[],active:true,recommendationTags:tags.split(',')}));
}

export const QUESTION_SECTIONS = {challenge:'اكتشاف التحديات',goal:'النتائج المطلوبة',solution:'اختيار الحلول'};
export const FIELD_TYPES = {single:'اختيار واحد',multi:'اختيارات متعددة',text:'نص',number:'رقم'};
export function defaultConfiguration() { return {schemaVersion:1,revision:1,activities:structuredClone(activities),questions:structuredClone([...base,...sectorQuestions]),updatedAt:null}; }
export function configured(state) { return state?.formConfig || defaultConfiguration(); }
export function visibleQuestions(config, activityId, section) {return (config.questions||[]).filter(q=>q.active!==false&&q.section===section&&(q.activityIds||['*']).some(a=>a==='*'||a===activityId)).sort((a,b)=>(a.order||0)-(b.order||0));}
export function validateConfiguration(value, catalog=[]) {
  const errors=[];
  if(!value || typeof value!=='object') return ['التعريف يجب أن يكون كائنًا.'];
  const activities=value.activities, questions=value.questions;
  if(!Array.isArray(activities)||activities.length<1||activities.length>100) errors.push('يجب تعريف 1–100 نوع نشاط.');
  if(!Array.isArray(questions)||questions.length<1||questions.length>250) errors.push('يجب تعريف 1–250 سؤالًا.');
  const ids=new Set(), aIds=new Set();
  (Array.isArray(activities)?activities:[]).forEach((a,i)=>{if(!/^[a-z0-9_-]{2,50}$/i.test(a?.id||'')||aIds.has(a.id)) errors.push(`معرّف النشاط ${i+1} غير صالح أو مكرر.`); else aIds.add(a.id);if(typeof a?.label!=='string'||a.label.trim().length<2||a.label.length>100)errors.push(`اسم النشاط ${i+1} غير صالح.`);});
  (Array.isArray(questions)?questions:[]).forEach((q,i)=>{
    if(!/^[a-z0-9_-]{2,60}$/i.test(q?.id||'')||ids.has(q.id)) errors.push(`معرّف السؤال ${i+1} غير صالح أو مكرر.`);else ids.add(q.id);
    if(typeof q?.label!=='string'||q.label.trim().length<8||q.label.length>300)errors.push(`صياغة السؤال ${i+1} يجب أن تكون 8–300 حرف.`);
    if(!QUESTION_SECTIONS[q?.section]) errors.push(`قسم السؤال ${i+1} غير صالح.`);
    if(!FIELD_TYPES[q?.type])errors.push(`نوع السؤال ${i+1} غير صالح.`);
    if(typeof q?.required!=='boolean')errors.push(`إلزامية السؤال ${i+1} غير محددة.`);
    if(!Array.isArray(q?.activityIds)||!q.activityIds.length||q.activityIds.some(a=>a!=='*'&&!aIds.has(a)))errors.push(`أنشطة السؤال ${i+1} غير صالحة.`);
    if(q?.type==='single'||q?.type==='multi'){
      if(q.id==='solutions') return;
      if(!Array.isArray(q.options)||q.options.length<1||q.options.length>60)errors.push(`خيارات السؤال ${i+1} مطلوبة (1–60).`);
      const choices=new Set();(Array.isArray(q.options)?q.options:[]).forEach((opt,j)=>{if(!/^[a-z0-9_-]{1,60}$/i.test(opt?.id||'')||choices.has(opt.id))errors.push(`رمز الخيار ${j+1} في السؤال ${i+1} غير صالح.`);else choices.add(opt.id);if(typeof opt?.label!=='string'||!opt.label.trim()||opt.label.length>150)errors.push(`نص الخيار ${j+1} في السؤال ${i+1} غير صالح.`);});
    }
    if(q.type==='number' && (![q.min,q.max].every(n=>n===null||n===undefined||(typeof n==='number'&&Number.isFinite(n)))||q.min!=null&&q.max!=null&&q.min>q.max))errors.push(`حدود السؤال الرقمي ${i+1} غير صالحة.`);
  });
  if(catalog && (!Array.isArray(catalog)||catalog.length>250))errors.push('الكتالوج لا يتجاوز 250 خدمة.');
  (Array.isArray(catalog)?catalog:[]).forEach((s,i)=>{if(!/^[a-z0-9_-]{2,60}$/i.test(s?.id||''))errors.push(`معرّف الخدمة ${i+1} غير صالح.`);if(typeof s?.title!=='string'||s.title.trim().length<2||s.title.length>150)errors.push(`اسم الخدمة ${i+1} غير صالح.`);if(typeof s?.price!=='number'||!Number.isFinite(s.price)||s.price<0||s.price>100000000)errors.push(`السعر ${i+1} يجب أن يكون رقمًا موجبًا أو صفرًا لخدمة بتقدير خاص.`);});
  return errors;
}
export function validateAnswers(config, activityId, answers={}, catalog=[]) {
  const errors={};const questionSet=[...visibleQuestions(config,activityId,'challenge'),...visibleQuestions(config,activityId,'goal'),...visibleQuestions(config,activityId,'solution')];
  for(const q of questionSet) {
    const value=answers[q.id]; const selected=Array.isArray(value)?value:(value==null||value===''?[]:[value]);
    if(q.required&&!selected.length) {errors[q.id]='هذا السؤال مطلوب.';continue;}
    if(q.type==='single'&&selected.length>1){errors[q.id]='اختر إجابة واحدة فقط.';continue;}
    if(['single','multi'].includes(q.type)) {
      const valid=q.id==='solutions'?new Set(catalog.filter(s=>s.active!==false).map(s=>s.id)):new Set((q.options||[]).map(o=>o.id));
      if(selected.some(x=>!valid.has(x))) errors[q.id]='توجد خيارات غير معتمدة.';
      if(selected.includes('other')&&q.otherAllowed&&String(answers[q.id+'__other']||'').trim().length<3)errors[q.id]='اشرح خيار «أخرى» بثلاثة أحرف على الأقل.';
    }
    if(q.type==='number'&&selected.length){const n=Number(value);if(typeof value==='boolean'||String(value).trim()===''||!Number.isFinite(n)||(q.min!=null&&n<q.min)||(q.max!=null&&n>q.max))errors[q.id]='أدخل رقمًا صالحًا ضمن المجال.';}
    if(q.type==='text'&&selected.length&&(typeof value!=='string'||value.trim().length<(q.required?2:1)||value.length>2000)) errors[q.id]='أدخل نصًا صالحًا، حتى 2000 حرف.';
  }
  return errors;
}
export function recommendServices(config, activity, answers, catalog) {
  // Explainable heuristics; no claim of AI prediction or guaranteed revenue.
  const combined=Object.values(answers||{}).flat().join(' ').toLowerCase();
  const rules=[['booking', ['appointments','booking','reminder','queues','double','cancel','svc-book']],['web',['online','visibility','maps','svc-web']],['social',['social','new_clients','loyalty','svc-social']],['crm',['records','followup','tracking','leads','svc-crm']],['store',['orders','delivery','stock','svc-store']],['seo',['maps','visibility','new_clients','svc-seo']]];
  return catalog.filter(s=>s.active!==false).map(s=>{let score=0;const reasons=[];const name=(s.id+' '+s.category+' '+s.title).toLowerCase();for(const [key,triggers] of rules){if(name.includes(key)||s.id.includes(key)){const hits=triggers.filter(word=>combined.includes(word));score+=hits.length*2; if(hits.length)reasons.push('يتوافق مع إجاباتك عن: '+hits.join('، '));}}if(s.recommendationTags){for(const tag of s.recommendationTags){if(combined.includes(String(tag).toLowerCase())){score+=3;reasons.push('مرتبط بهدف: '+tag);}}}return {...s,score,reasons:reasons.slice(0,2)};}).filter(s=>s.score>0).sort((a,b)=>b.score-a.score);
}
