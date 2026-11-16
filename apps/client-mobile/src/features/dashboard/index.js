/** client / dashboard: original v1.1 views and local demo actions. */
export function createDashboardFeature(context, { projects, quotes }) {
  const {
    A,
    E,
    act,
    customer,
    go,
    heading,
    label,
    mine,
    missing,
    money,
    notice,
    num,
    section,
    stageLabels,
    wrap,
  } = context;
  const projectCard = (...args) => projects.projectCard(...args);
  const quoteTotal = (...args) => quotes.quoteTotal(...args);
  function renderHome({ state }) {
    const client = customer(state);
    if (!client) return missing('حساب العميل غير موجود');
    const projects = mine(state, 'projects');
    const activeProjects = projects.filter((item) => item.status !== 'completed');
    const quotes = mine(state, 'quotes').filter((item) => item.status === 'sent');
    const pendingContracts = mine(state, 'contracts').filter((item) => item.status === 'pending');
    const reviews = projects.flatMap((project) =>
      (project.deliverables || [])
        .filter((item) => item.status === 'pending' && item.type !== 'client_attachment')
        .map((deliverable) => ({
          project,
          deliverable,
        })),
    );
    const due = mine(state, 'invoices').reduce(
      (sum, invoice) => sum + Math.max(0, num(invoice.total) - num(invoice.paid)),
      0,
    );
    const featured = activeProjects[0] || projects[0];
    const needed = reviews.length + pendingContracts.length + quotes.length;
    return wrap(`${heading(client.name, `أهلاً، ${client.contact || 'شريكنا'}`, 'كل اتفاق، خطوة وملف. في مساحة واحدة.', act('رسائلك', 'open-messages', {}, 'icon-btn', 'message'))}
      <section class="hero hero-dark client-home-hero"><div><p class="eyebrow">نبني حضورك الرقمي</p><h2>فكرتك تتقدم.<br><span class="client-lime-text">وأنت تعرف كل خطوة.</span></h2><p>${featured ? `${E(featured.title)} في مرحلة ${E(label(stageLabels, featured.stage))}.` : 'ابدأ خدمة جديدة ودعنا نبني خطة تناسب مشروعك.'}</p><div class="row wrap">${
        featured
          ? go(
              'تابع مشروعك',
              'project-detail',
              {
                id: featured.id,
              },
              'btn-lime',
              'arrow-left',
            )
          : go('اكتشف الخدمات', 'services', {}, 'btn-lime', 'plus')
      }${go('تحدث معنا', 'messages', {}, 'btn-ghost', 'message')}</div></div><div class="client-hero-progress"><span class="tiny">المشروع الحالي</span><strong class="hero-number num">${featured ? num(featured.progress) : 0}<small>%</small></strong><div class="client-hero-track"><span style="width:${Math.min(100, Math.max(0, num(featured?.progress)))}%"></span></div><span class="small">${featured ? E(label(stageLabels, featured.stage)) : 'خطوتك الأولى تبدأ هنا'}</span></div></section>
      <div class="metric-grid"><button class="stat metric-link" type="button" data-go="projects" data-param-status="open" aria-label="فتح المشاريع الجارية"><span class="stat-label">مشاريع جارية ${A.icon('arrow-left')}</span><strong class="stat-value num">${activeProjects.length}</strong><span class="tiny muted">عرض قائمة المشاريع</span></button><button class="stat metric-link" type="button" data-go="decisions" aria-label="فتح القرارات المطلوبة"><span class="stat-label">تحتاج قرارك ${A.icon('arrow-left')}</span><strong class="stat-value num">${needed}</strong><span class="tiny muted">عروض وعقود وتصاميم</span></button><button class="stat metric-link" type="button" data-go="invoices" data-param-open="1" aria-label="فتح الفواتير ذات الرصيد المتبقي"><span class="stat-label">الرصيد المتبقي ${A.icon('arrow-left')}</span><strong class="stat-value num">${money(due)}</strong><span class="tiny muted">الفواتير غير المسددة</span></button></div>
      <div class="dashboard-grid"><div class="main-column stack">${
        needed
          ? `${section('مساحة قراراتك', 'خطوة صغيرة منك، تقدم أكبر للمشروع.')}<div class="stack-sm">${reviews
              .slice(0, 2)
              .map(
                ({ project, deliverable }) =>
                  `<article class="card card-accent row-between"><div class="row"><span class="icon-box icon-box-lime">${A.icon('eye')}</span><div><strong>${E(deliverable.title)}</strong><p class="small muted">${E(project.title)} · نسخة ${E(deliverable.version)}</p></div></div>${go(
                    'راجع التصميم',
                    'deliverable-detail',
                    {
                      id: project.id,
                      'param-deliverable': deliverable.id,
                    },
                    'btn-primary btn-sm',
                    'arrow-left',
                  )}</article>`,
              )
              .join('')}${pendingContracts
              .slice(0, 1)
              .map(
                (contract) =>
                  `<article class="card row-between"><div><strong>${E(contract.title)}</strong><p class="muted small">اتفاق واضح ينتظر موافقتك التجريبية</p></div>${go(
                    'مراجعة',
                    'contract-detail',
                    {
                      id: contract.id,
                    },
                    'btn-secondary btn-sm',
                  )}</article>`,
              )
              .join('')}${quotes
              .slice(0, 1)
              .map(
                (quote) =>
                  `<article class="card row-between"><div><strong>${E(quote.title)}</strong><p class="muted small">عرض جديد بقيمة ${money(quoteTotal(quote))}</p></div>${go(
                    'العرض',
                    'quote-detail',
                    {
                      id: quote.id,
                    },
                    'btn-secondary btn-sm',
                  )}</article>`,
              )
              .join('')}</div>`
          : notice(
              'أنت على اطلاع بكل شيء',
              'لا توجد موافقات معلقة الآن. سنظهر هنا أي عنصر يحتاج رأيك.',
              'check-circle',
            )
      }
      ${section('مشاريعك', 'التفاصيل التي تهمك، دون أن تضيع في الرسائل.', go('كل المشاريع', 'projects', {}, 'btn-ghost btn-sm'))}<div class="grid-2">${projects.slice(0, 2).map(projectCard).join('') || A.empty('لم يبدأ مشروع بعد', 'عروضك وعقودك هي نقطة البداية.', go('العروض', 'quotes'))}</div></div>
      <aside class="side-column stack"><section class="card"><div class="row"><span class="icon-box icon-box-dark">${A.icon('briefcase')}</span><div><h3>علاقات واضحة</h3><p class="muted small">من العرض إلى التسليم.</p></div></div><div class="client-link-list">${go('عروض الأسعار', 'quotes', {}, 'btn-ghost btn-block', 'file')}${go('العقود والاتفاقات', 'contracts', {}, 'btn-ghost btn-block', 'signature')}${go('الفواتير والدفعات', 'invoices', {}, 'btn-ghost btn-block', 'receipt')}${go('طلبات الخدمات', 'requests', {}, 'btn-ghost btn-block', 'layers')}</div></section><section class="card card-dark"><span class="icon-box">${A.icon('headphones')}</span><h3>فريقك قريب.</h3><p class="small">سؤال عن تصميم؟ تعديل في الخطة؟ افتح محادثة أو تذكرة مرتبطة بمشروعك.</p>${go('مركز المساعدة', 'support', {}, 'btn-lime btn-block', 'arrow-left')}</section></aside></div>`);
  }
  function renderDecisions({state:s}) {
    const pendingQuotes=mine(s,'quotes').filter(q=>q.status==='sent');
    const pendingContracts=mine(s,'contracts').filter(c=>c.status==='pending');
    const pendingReviews=mine(s,'projects').flatMap(p=>(p.deliverables||[]).filter(d=>d.status==='pending'&&d.type!=='client_attachment').map(d=>({project:p,deliverable:d})));
    const count=pendingQuotes.length+pendingContracts.length+pendingReviews.length;
    return wrap(`${heading('قراراتك المطلوبة',`تحتاج مراجعتك · ${count}`,'افتح كل مستند واتخذ قرارك بنفسك؛ لا تُسجل موافقة تلقائيًا.')}${go('العودة للرئيسية','home',{},'btn-secondary','arrow-right')}<div class="stack-sm">${pendingQuotes.map(q=>`<article class="card row-between"><div><strong>${E(q.title)}</strong><p class="muted small">عرض ينتظر قرارك</p></div>${go('فتح العرض','quote-detail',{id:q.id},'btn-primary','arrow-left')}</article>`).join('')}${pendingContracts.map(c=>`<article class="card row-between"><div><strong>${E(c.title)}</strong><p class="muted small">عقد بانتظار اعتمادك</p></div>${go('مراجعة العقد','contract-detail',{id:c.id},'btn-primary','arrow-left')}</article>`).join('')}${pendingReviews.map(({project,deliverable})=>`<article class="card row-between"><div><strong>${E(deliverable.title)}</strong><p class="muted small">${E(project.title)} · تسليم بانتظار رأيك</p></div>${go('مراجعة التصميم','deliverable-detail',{id:project.id,'param-deliverable':deliverable.id},'btn-primary','arrow-left')}</article>`).join('')}${count?'':A.empty('لا قرارات معلقة','كل الموافقات الحالية قد حُسمت أو لم تُنشأ بعد.')}</div>`);
  }
  return {
    id: 'dashboard',
    routes: {
      decisions: {title:'قرارات مطلوبة',render:renderDecisions,nav:'home'},
      home: {
        title: 'الرئيسية',
        nav: 'home',
        render: renderHome,
      },
    },
    actions: {},
    api: {},
  };
}
