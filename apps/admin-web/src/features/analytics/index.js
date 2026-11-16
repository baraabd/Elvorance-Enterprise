/** admin / analytics: original v1.1 views and local demo actions. */
export function createAnalyticsFeature(context, { workforce }) {
  const {
    A,
    E,
    N,
    action,
    empty,
    filter,
    find,
    list,
    metric,
    money,
    pageTitle,
    repOptions,
    sectionTitle,
    sum,
    ui,
    within,
    wrap,
    zoneOptions,
  } = context;
  const booked = (...args) => workforce.booked(...args);
  const contractRep = (...args) => workforce.contractRep(...args);
  function analyticsData(s) {
    const matches = (clientId, repId) =>
      (ui.analyticsRep === 'all' || repId === ui.analyticsRep) &&
      (ui.analyticsZone === 'all' || find(s, 'clients', clientId)?.zoneId === ui.analyticsZone);
    const contracts = booked(s).filter(
      (c) => matches(c.clientId, contractRep(s, c)) && within(c.signedAt || c.startDate, ui.period),
    );
    const visits = list(s, 'visits').filter(
      (v) =>
        matches(v.clientId, v.repId) &&
        within(v.endedAt || v.startedAt || v.scheduledAt, ui.period),
    );
    const opportunities = list(s, 'opportunities').filter(
      (o) =>
        matches(o.clientId, o.repId) &&
        within(o.closedAt || o.createdAt || o.expectedClose, ui.period),
    );
    const reps = list(s, 'reps').filter(
      (r) =>
        (ui.analyticsRep === 'all' || r.id === ui.analyticsRep) &&
        (ui.analyticsZone === 'all' || (r.zoneIds || []).includes(ui.analyticsZone)),
    );
    const rows = reps.map((rep) => ({
      id: rep.id,
      name: rep.name,
      zones: (rep.zoneIds || [])
        .map((id) => find(s, 'zones', id)?.name)
        .filter(Boolean)
        .join('، '),
      sales: sum(
        contracts.filter((c) => contractRep(s, c) === rep.id),
        (c) => c.total,
      ),
      target: N(rep.target),
      visits: visits.filter((v) => v.repId === rep.id && v.status === 'completed').length,
      opportunities: opportunities.filter((o) => o.repId === rep.id).length,
      won: opportunities.filter((o) => o.repId === rep.id && o.stage === 'won').length,
    }));
    return {
      contracts,
      visits,
      opportunities,
      rows,
    };
  }
  function analytics({ state: s }) {
    const data = analyticsData(s),
      max = Math.max(1, ...data.rows.map((row) => row.sales));
    const completed = data.visits.filter((v) => v.status === 'completed').length;
    const won = data.opportunities.filter((o) => o.stage === 'won').length;
    const lost = data.opportunities.filter((o) => o.stage === 'lost');
    return wrap(
      pageTitle(
        'التحليلات',
        'اعرف ما يصنع الفارق.',
        'قارن العقود والزيارات ونتائج الفرص بالفترة والفريق والمنطقة.',
        action('export-analytics', 'تصدير CSV', 'download', '', 'btn btn-primary'),
      ) +
        `<div class="filter-bar">${filter('الفترة', 'period', {
          7: 'آخر 7 أيام',
          30: 'آخر 30 يومًا',
          90: 'آخر 90 يومًا',
          all: 'كل الفترات',
        })}${filter('المندوب', 'analyticsRep', {
          all: 'كل المندوبين',
          ...repOptions(s),
        })}${filter('المنطقة', 'analyticsZone', {
          all: 'كل المناطق',
          ...zoneOptions(s),
        })}</div><div class="grid-4">${metric('قيمة العقود', money(sum(data.contracts, (c) => c.total)), `${data.contracts.length} عقود ضمن الفترة`, 'wallet')}${metric('الزيارات المكتملة', completed, `${data.visits.length} زيارات ضمن الفترة`, 'check-circle')}${metric('الفرص الناجحة', won, `${data.opportunities.length} فرص ضمن الفلتر`, 'flag')}${metric('نسبة إنجاز الزيارات', `${data.visits.length ? Math.round((completed / data.visits.length) * 100) : 0}%`, 'المكتملة من كل الزيارات المرشحة', 'chart')}</div><div class="admin-detail-grid"><section class="card">${sectionTitle('قيمة العقود حسب المندوب')}<div class="admin-bars">${data.rows.map((row) => `<div><div class="admin-bar-label"><span>${E(row.name)}</span><strong>${E(money(row.sales))}</strong></div><div class="admin-bar-track" role="img" aria-label="${E(row.name)} ${E(money(row.sales))}"><div class="admin-bar-fill" style="width:${(row.sales / max) * 100}%"></div></div></div>`).join('') || empty('لا بيانات تطابق الفلتر', 'غيّر الفترة أو الفريق.')}</div></section><section class="card">${sectionTitle('أسباب خسارة الفرص')}${lost.length ? lost.map((o) => `<article class="list-item"><strong>${E(o.lossReason || 'لم يسجل سبب')}</strong><p class="small muted">${E(o.title)} · ${E(money(o.value))}</p></article>`).join('') : empty('لا خسائر ضمن الفلتر', 'تظهر الأسباب المسجلة عند إغلاق فرصة بخسارة.')}</section></div><section class="card">${sectionTitle('مقارنة الفريق')}<div class="table-wrap"><table class="data-table"><thead><tr><th>المندوب</th><th>قيمة العقود</th><th>الهدف</th><th>الزيارات المكتملة</th><th>الفرص الناجحة</th></tr></thead><tbody>${data.rows.map((row) => `<tr><td>${E(row.name)}</td><td class="num">${E(money(row.sales))}</td><td class="num">${E(money(row.target))}</td><td>${row.visits}</td><td>${row.won}</td></tr>`).join('')}</tbody></table></div><p class="tiny muted">العقود بحسب الاعتماد أو البداية؛ الزيارات بحسب آخر تاريخ عمل مسجل؛ الفرص بحسب تاريخ الحسم أو الإنشاء أو الإغلاق المتوقع عند غيابهما. الهدف هدف المندوب المسجل ولا يُعاد توزيعه زمنيًا.</p></section>`,
    );
  }
  function exportAnalytics() {
    const data = analyticsData(A.state());
    if (!data.rows.length) return A.toast('لا بيانات تطابق الفلاتر للتصدير.', 'info');
    A.exportCSV(
      `Atlas-Analytics-${A.today()}.csv`,
      data.rows.map((row) => ({
        المندوب: row.name,
        المناطق: row.zones,
        'قيمة العقود': row.sales,
        'الهدف المسجل': row.target,
        'الزيارات المكتملة': row.visits,
        'عدد الفرص': row.opportunities,
        'الفرص الناجحة': row.won,
        'الفترة بالأيام': ui.period === 'all' ? 'كل الفترات' : ui.period,
      })),
    );
  }
  return {
    id: 'analytics',
    routes: {
      analytics: {
        nav: 'more',
        title: 'التحليلات',
        render: analytics,
      },
    },
    actions: {
      'export-analytics': exportAnalytics,
    },
    api: {},
  };
}
