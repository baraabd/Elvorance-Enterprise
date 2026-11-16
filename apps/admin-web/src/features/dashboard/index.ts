// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** admin / dashboard: original v1.1 views and local demo actions. */
export function createDashboardFeature(context, { workforce }) {
  const {
    A,
    E,
    N,
    action,
    approvalTypes,
    dayOf,
    empty,
    go,
    idAttr,
    list,
    metric,
    money,
    pageTitle,
    person,
    progress,
    sectionTitle,
    sum,
    wrap,
  } = context;
  const booked = (...args) => workforce.booked(...args);
  const repRow = (...args) => workforce.repRow(...args);
  function weeklyChart(s) {
    const current = [],
      previous = [],
      labels = [];
    for (let index = 6; index >= 0; index--) {
      const day = A.addDays(-index),
        old = A.addDays(-index - 7);
      current.push(
        sum(
          booked(s).filter((item) => dayOf(item.signedAt || item.startDate) === day),
          (item) => item.total,
        ),
      );
      previous.push(
        sum(
          booked(s).filter((item) => dayOf(item.signedAt || item.startDate) === old),
          (item) => item.total,
        ),
      );
      labels.push(
        new Date(`${day}T12:00:00`).toLocaleDateString('ar', {
          weekday: 'short',
        }),
      );
    }
    const max = Math.max(1, ...current, ...previous),
      width = 600,
      baseline = 192;
    const bars = current
      .map((value, index) => {
        const x = 44 + index * 77,
          h = (value / max) * 140,
          p = (previous[index] / max) * 140;
        return `<rect class="chart-previous" x="${x}" y="${baseline - p}" width="18" height="${Math.max(p, 2)}" rx="5"><title>${E(labels[index])}، الأسبوع السابق: ${E(money(previous[index]))}</title></rect><rect class="chart-current" x="${x + 23}" y="${baseline - h}" width="18" height="${Math.max(h, 2)}" rx="5"><title>${E(labels[index])}، هذا الأسبوع: ${E(money(value))}</title></rect><text x="${x + 22}" y="216" text-anchor="middle">${E(labels[index])}</text>`;
      })
      .join('');
    return `<svg class="admin-chart" viewBox="0 0 ${width} 232" role="img" aria-label="مقارنة قيم العقود المعتمدة خلال آخر سبعة أيام بالأيام السبعة السابقة"><line x1="25" y1="52" x2="590" y2="52" stroke="#edf0e9"/><line x1="25" y1="122" x2="590" y2="122" stroke="#edf0e9"/><line x1="25" y1="192" x2="590" y2="192" stroke="#dce3d7"/><text x="30" y="32">${E(money(max === 1 && !sum(current, (v) => v) && !sum(previous, (v) => v) ? 0 : max))}</text>${bars}</svg><div class="admin-legend"><span><i style="background:#176b55"></i>آخر 7 أيام</span><span><i style="background:#d9f99d"></i>الأيام السبعة السابقة</span></div><p class="tiny muted">بحسب تاريخ اعتماد العقد أو تاريخ بدايته المسجل. لا تُوزّع القيم على أيام افتراضية.</p>`;
  }
  function ring(value, label) {
    const amount = Math.max(0, Math.min(100, N(value)));
    return `<div class="admin-ring" style="background:conic-gradient(#176b55 ${amount * 3.6}deg,#edf1e7 0)" role="img" aria-label="${E(label)} ${Math.round(amount)} بالمئة"><div><strong class="num">${Math.round(amount)}%</strong><span class="tiny muted">${E(label)}</span></div></div>`;
  }
  function activityList(s, limit) {
    const rows = [...list(s, 'activities')]
      .sort((a, b) => String(b.at).localeCompare(String(a.at)))
      .slice(0, limit || 6);
    return rows.length
      ? `<div class="timeline">${rows
          .map(
            (item) =>
              `<article class="timeline-item"><span class="timeline-dot"></span><div><p class="strong">${E(item.text)}</p><p class="tiny muted">${E(item.actor || 'مساحة العمل')} · ${E(
                item.at
                  ? A.date(item.at, {
                      time: true,
                    })
                  : '—',
              )}</p></div></article>`,
          )
          .join('')}</div>`
      : empty('لا نشاط مسجل بعد', 'تظهر هنا التغييرات التي تجرى في مساحة العمل.');
  }
  function home({ state: s }) {
    const opportunities = list(s, 'opportunities'),
      open = opportunities.filter((o) => !['won', 'lost'].includes(o.stage));
    const closed = opportunities.filter((o) => ['won', 'lost'].includes(o.stage));
    const wins = closed.filter((o) => o.stage === 'won').length;
    const approvals = list(s, 'approvals').filter((a) => a.status === 'pending');
    const tasks = list(s, 'tasks').filter((t) => t.status === 'open' && t.dueDate <= A.today());
    const completed = list(s, 'visits').filter((v) => v.status === 'completed');
    return wrap(
      pageTitle(
        'نظرة الإدارة',
        'الفريق على مسار واضح.',
        'تابع الفرص والتنفيذ واتخذ القرار التالي من مكان واحد.',
        go('live-tracking', 'مواقع الفريق الآن', 'pin', '', 'btn btn-secondary') +
          action('new-task', 'إسناد مهمة', 'plus', '', 'btn btn-primary'),
      ) +
        `<section class="hero hero-dark"><div class="hero-grid"><div><p class="eyebrow">قيمة العقود المعتمدة</p><h2 class="admin-hero-number num">${E(money(sum(booked(s), (c) => c.total)))}</h2><p>${booked(s).length} عقود معتمدة · ${list(s, 'clients').length} عميل في مساحة العمل</p><div class="row wrap gap-sm">${go('analytics', 'تحليل الأداء', 'chart', '', 'btn btn-lime')}${go('pipeline', 'استعراض الفرص', 'arrow-left', '', 'btn btn-secondary')}</div></div><div class="card card-flat"><span class="small muted">قيمة الفرص المفتوحة</span><h3 class="num">${E(money(sum(open, (o) => o.value)))}</h3><p class="small muted">${open.length} فرصة · قيمة مرجحة ${E(money(sum(open, (o) => (N(o.value) * N(o.probability)) / 100)))}</p>${progress(open.length ? sum(open, (o) => o.probability) / open.length : 0)}</div></div></section>` +
        `<section class="grid-4"><button class="metric-link" type="button" data-go="team" data-param-status="active">${metric('المندوبون المتاحون', `${list(s, 'reps').filter((r) => r.status === 'active').length} / ${list(s, 'reps').length}`, 'حسب الحالة المسجلة', 'users')}</button><button class="metric-link" type="button" data-go="visits-completed">${metric('الزيارات المكتملة', completed.length, 'من سجل الزيارات المشترك', 'check-circle')}</button><button class="metric-link" type="button" data-go="approvals">${metric('قرارات تنتظرك', approvals.length, 'طلبات خصم ونطاق ومواعيد', 'shield')}</button><button class="metric-link" type="button" data-go="tasks" data-param-due="1">${metric('مهام مستحقة', tasks.length, 'مهام اليوم والمتأخرة المفتوحة', 'calendar')}</button></section>` +
        `<div class="dashboard-grid"><div class="main-column stack"><section class="card">${sectionTitle('المبيعات خلال أسبوعين', go('analytics', 'كل التحليلات', 'arrow-left', '', 'btn btn-ghost btn-sm'))}${weeklyChart(s)}</section><section class="card">${sectionTitle('الفريق اليوم', go('team', 'إدارة الفريق', 'users', '', 'btn btn-ghost btn-sm'))}<p class="admin-state-note">السجلات التجارية محلية. لمتابعة الموقع الفعلي افتح مواقع الفريق الآن.</p><div class="list">${list(
          s,
          'reps',
        )
          .slice(0, 5)
          .map((rep) => repRow(s, rep))
          .join(
            '',
          )}</div></section><section class="card">${sectionTitle('توزيع التغطية', go('territories', 'فتح المناطق', 'map', '', 'btn btn-ghost btn-sm'))}${A.map(
          {
            height: 250,
            interactive: false,
          },
        )}</section></div><aside class="side-column stack"><section class="card card-accent">${sectionTitle('نسبة إغلاق الفرص')}<div class="admin-capacity">${ring(closed.length ? (wins / closed.length) * 100 : 0, 'نجاح')}<div><h3>${wins} فرص ناجحة</h3><p class="small muted">من ${closed.length} فرص حُسمت نتيجتها.</p></div></div></section><section class="card">${sectionTitle('صندوق القرار', go('approvals', 'الموافقات', 'arrow-left', '', 'btn btn-ghost btn-sm'))}${
          approvals.length
            ? approvals
                .slice(0, 3)
                .map(
                  (item) =>
                    `<article class="list-item"><p class="strong">${E(item.title)}</p><p class="small muted">${E(person(s, item.repId))} · ${E(approvalTypes[item.type] || item.type)}</p>${action('review-approval', 'مراجعة الطلب', 'eye', idAttr(item.id), 'btn btn-secondary btn-sm')}</article>`,
                )
                .join('')
            : empty('القرارات مكتملة', 'لا توجد موافقات معلّقة.')
        }</section><section class="card">${sectionTitle('آخر الأنشطة')}${activityList(s, 5)}</section></aside></div>`,
    );
  }
  function completedVisits({ state: s }) {
    const records = list(s, 'visits').filter((v) => v.status === 'completed');
    return wrap(
      pageTitle(
        'الزيارات المكتملة',
        `${records.length} زيارة موثقة`,
        'النتائج والعميل والمندوب والتاريخ لكل زيارة.',
        go('home', 'العودة للوحة', 'arrow-right', '', 'btn btn-secondary'),
      ) +
        `<section class="card"><div class="list">${records.length ? records.map((v) => `<article class="list-item"><div><strong>${E(customerName(s, v.clientId))}</strong><p class="small muted">${E(person(s, v.repId))} · ${E(A.date(v.endedAt || v.startedAt))}</p><p class="small">${E(v.outcome || v.notes || 'زيارة مكتملة')}</p></div></article>`).join('') : empty('لا زيارات مكتملة', 'تظهر هنا الزيارات بعد إنهائها.')}</div></section>`,
    );
  }
  const customerName = (s, id) => s.clients.find((c) => c.id === id)?.name || 'عميل غير موجود';
  return {
    id: 'dashboard',
    routes: {
      'visits-completed': { title: 'الزيارات المكتملة', render: completedVisits },
      home: {
        title: 'نظرة الإدارة',
        render: home,
      },
    },
    actions: {},
    api: {},
  };
}
