// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** rep / territory: original v1.1 views and local demo actions. */
export function createTerritoryFeature(context) {
  const {
    A,
    act,
    badge,
    e,
    go,
    head,
    ic,
    labels,
    localDay,
    outcomes,
    ownVisits,
    rep,
    section,
    time,
  } = context;
  function stopCard(s, v, index) {
    const c = s.clients.find((x) => x.id === v.clientId);
    if (!c) return '';
    return `<article class="list-item rep-stop"><div class="rep-stop-number num">${index + 1}</div><div class="rep-grow"><div class="row-between"><h3>${e(c.name)}</h3><span class="num strong">${e(time(v.scheduledAt))}</span></div><p class="muted small">${e(c.address)}</p><div class="row-between"><span class="small">${badge(v.status)}</span>${v.status === 'active' ? go('visit-active', 'متابعة الزيارة', 'play', `data-id="${v.id}"`, 'btn btn-primary btn-sm') : v.status === 'scheduled' ? go('visit-checkin', 'بدء الزيارة', 'pin', `data-id="${v.clientId}" data-param-visit="${v.id}"`, 'btn btn-secondary btn-sm') : go('visit-detail', 'النتيجة', 'file', `data-id="${v.id}"`, 'btn btn-ghost btn-sm')}</div></div></article>`;
  }
  function territory({ state: s, params }) {
    const r = rep(s),
      zones = s.zones.filter((z) => (r.zoneIds || []).includes(z.id)),
      selected = params.zone || '',
      selectedDay = /^\d{4}-\d{2}-\d{2}$/.test(params.day || '') ? params.day : A.today();
    const visits = ownVisits(s)
      .filter(
        (v) =>
          localDay(v.scheduledAt) === selectedDay &&
          (!selected || s.clients.find((c) => c.id === v.clientId)?.zoneId === selected),
      )
      .sort((a, b) => new Date(a.scheduledAt) - new Date(b.scheduledAt));
    return `${head('منطقتك ومسار اليوم', 'مخطط توضيحي للمناطق؛ المواعيد والعملاء من سجلاتك الفعلية في هذا العرض.', act('schedule-visit', 'موعد جديد', 'plus', '', 'btn btn-primary'))}<div class="chips"><button class="chip ${!selected ? 'active' : ''}" data-go="territory" data-param-day="${selectedDay}">كل مناطقي</button>${zones.map((z) => `<button class="chip ${selected === z.id ? 'active' : ''}" data-go="territory" data-param-zone="${z.id}" data-param-day="${selectedDay}">${e(z.name)}</button>`).join('')}</div><div class="dashboard-grid"><div class="main-column"><div class="card rep-map-card">${A.map(
      {
        height: 430,
        repId: r.id,
        selectedZone: selected || null,
      },
    )}</div><div class="notice small">${ic('compass')} ترتيب المحطات بحسب الوقت، ولا يمثل حساب مسافات أو ملاحة مباشرة. يطلب تسجيل الزيارة الموقع بإذنك أو توثيق سبب الإدخال اليدوي.</div></div><aside class="side-column">${section('محطاتك', visits.length + ' موعد في التاريخ المختار')}<label class="field">اليوم<input class="input" type="date" value="${selectedDay}" data-change="territory-day" data-zone="${e(selected)}"></label><div class="card list">${visits.map((v, i) => stopCard(s, v, i)).join('') || A.empty('لا محطات في هذا النطاق', 'اختر منطقة أخرى أو أضف موعدًا.')}</div></aside></div>`;
  }
  return {
    id: 'territory',
    routes: {
      territory: {
        title: 'المناطق والمسار',
        render: territory,
      },
    },
    actions: {
      'territory-day'({ el }) {
        if (/^\d{4}-\d{2}-\d{2}$/.test(el.value))
          A.go('territory', {
            day: el.value,
            zone: el.dataset.zone || '',
          });
      },
      'export-day'({ state }) {
        const rows = ownVisits(state).map((v) => ({
          العميل: state.clients.find((c) => c.id === v.clientId)?.name || '',
          الموعد: v.scheduledAt || '',
          البداية: v.startedAt || '',
          النهاية: v.endedAt || '',
          الحالة: labels[v.status] || v.status,
          النتيجة: outcomes.find((x) => x[0] === v.outcome)?.[1] || '',
          الملاحظات: v.notes || '',
          الخطوة_التالية: v.nextAction || '',
          المتابعة: v.followUpAt || '',
        }));
        A.exportCSV('Elvorance-My-Visits.csv', rows);
      },
    },
    api: {
      stopCard,
    },
  };
}
