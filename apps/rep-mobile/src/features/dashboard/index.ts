// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* ELVORANCE_DASHBOARD_DRILLDOWN_2027 */
/** rep / dashboard: original v1.1 views and local demo actions. */
export function createDashboardFeature(context, { territory }) {
  const {
    A,
    act,
    activeVisit,
    cash,
    date,
    e,
    go,
    head,
    ic,
    localDay,
    metric,
    metricLink,
    ownOpps,
    ownQuotes,
    ownVisits,
    rep,
    section,
    time,
  } = context;
  const stopCard = (...args) => territory.stopCard(...args);
  function home({ state: s }) {
    const r = rep(s),
      today = ownVisits(s)
        .filter((v) => localDay(v.scheduledAt || v.startedAt) === A.today())
        .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    const next = today.find((v) => v.status === 'scheduled'),
      nextClient = next && s.clients.find((c) => c.id === next.clientId),
      active = activeVisit(s);
    const done = today.filter((v) => v.status === 'completed').length,
      tasks = s.tasks.filter((t) => t.repId === r.id && t.status === 'open'),
      won = ownOpps(s)
        .filter((o) => o.stage === 'won')
        .reduce((x, o) => x + Number(o.value), 0);
    return `${head('يومك يبدأ بخطوة واضحة', 'مرحبًا ' + r.name + '، هذه أولوياتك الميدانية اليوم.', `<button type="button" class="icon-btn" data-action="notifications" aria-label="التنبيهات">${ic('bell')}</button>`)}<section class="hero hero-dark rep-home-hero"><div class="hero-grid"><div><p class="eyebrow">${e(
      new Date().toLocaleDateString('ar', {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
      }),
    )}</p><h2>قريب من العميل.<br>أقرب إلى الفرصة.</h2><p>رتّب محطاتك، استمع للاحتياج، وأنهِ كل زيارة بخطوة واضحة.</p><div class="row wrap">${active ? go('visit-active', 'العودة إلى الزيارة الجارية', 'play', `data-id="${active.id}"`, 'btn btn-lime') : next ? go('visit-checkin', 'ابدأ محطتك التالية', 'pin', `data-id="${next.clientId}" data-param-visit="${next.id}"`, 'btn btn-lime') : act('schedule-visit', 'خطط لزيارة جديدة', 'plus', '', 'btn btn-lime')}${go('territory', 'مسار اليوم', 'route', '', 'btn btn-ghost')}</div></div><div class="rep-hero-summary"><span class="hero-number num">${done}<small> / ${today.length}</small></span><span>زيارات مكتملة اليوم</span>${A.progress(today.length ? (done / today.length) * 100 : 0)}<p class="small">${nextClient ? 'المحطة التالية: ' + e(nextClient.name) + ' · ' + e(time(next.scheduledAt)) : 'لا مواعيد أخرى اليوم. يمكنك ترتيب موعد جديد.'}</p></div></div></section><div class="metric-grid">${metricLink(tasks.length, 'مهام مفتوحة', 'checklist', tasks.filter((t) => t.dueDate < A.today()).length + ' متأخرة', 'tasks', 'open')}${metricLink(ownOpps(s).filter((o) => !['won', 'lost'].includes(o.stage)).length, 'فرص قيد العمل', 'briefcase', 'جميع الفرص غير المغلقة', 'opportunities', 'open')}${metricLink(cash(won), 'قيمة الفرص المكتسبة', 'trend', 'مجموع الفرص المكتسبة', 'opportunities', 'won')}${metricLink(ownQuotes(s).filter((q) => q.status === 'sent').length, 'عروض تنتظر العميل', 'file', 'المرسلة ولم يصدر قرار بشأنها', 'quotes', 'sent')}</div><div class="dashboard-grid"><div class="main-column">${section('مسار اليوم', 'المحطات مرتبة بحسب المواعيد المسجّلة.', go('territory', 'عرض المسار', 'map', '', 'btn btn-ghost btn-sm'))}<div class="card rep-map-card">${A.map(
      {
        height: 230,
        repId: r.id,
      },
    )}</div><div class="card list">${
      today.length
        ? today
            .slice(0, 4)
            .map((v, i) => stopCard(s, v, i))
            .join('')
        : A.empty(
            'جدولك متاح',
            'أضف زيارة لعميل من منطقتك.',
            act('schedule-visit', 'إضافة موعد', 'plus'),
          )
    }</div></div><aside class="side-column">${section('خطوة سريعة')}<div class="action-grid">${go('client-form', 'عميل جديد', 'users', '', 'quick-action')}${go('catalog', 'الخدمات', 'layers', '', 'quick-action')}${act('quote-new', 'عرض سعر', 'file', '', 'quick-action')}${go('tasks', 'المهام', 'checklist', '', 'quick-action')}</div><div class="card card-accent">${section('أولوية المتابعة', '', go('tasks', 'الكل', 'chevron-left', '', 'btn btn-ghost btn-sm'))}${
      tasks
        .slice(0, 3)
        .map(
          (t) =>
            `<div class="rep-task-mini"><button class="icon-btn" data-action="task-toggle" data-id="${t.id}" data-value="${t.status === 'done' ? 'open' : 'done'}" ${t.status === 'cancelled' ? 'disabled title="أُلغيت المهمة ولا تعني اكتمال التنفيذ"' : ''} aria-label="إكمال ${e(t.title)}">${ic('check')}</button><div><strong>${e(t.title)}</strong><p class="muted tiny">${e(date(t.dueDate))}</p></div></div>`,
        )
        .join('') || '<p class="muted">كل المهام مكتملة. أحسنت تنظيم يومك.</p>'
    }</div></aside></div>`;
  }
  return {
    id: 'dashboard',
    routes: {
      home: {
        title: 'الرئيسية',
        render: home,
      },
    },
    actions: {},
    api: {},
  };
}
