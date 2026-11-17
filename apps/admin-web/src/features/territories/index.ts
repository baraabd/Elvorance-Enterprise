// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** admin / territories: original v1.1 views and local demo actions. */
export function createTerritoriesFeature(context, { customers, state, workforce }) {
  const {
    A,
    E,
    N,
    action,
    badge,
    choices,
    color,
    empty,
    fail,
    find,
    form,
    go,
    icon,
    idAttr,
    input,
    list,
    metric,
    missing,
    money,
    notify,
    pageTitle,
    person,
    progress,
    repStatuses,
    sectionTitle,
    selectedChecks,
    within,
    wrap,
  } = context;
  const clientRow = (...args) => customers.clientRow(...args);
  const persist = (...args) => state.persist(...args);
  const repRow = (...args) => workforce.repRow(...args);
  function zoneStats(s, zone) {
    const clients = list(s, 'clients').filter((client) => client.zoneId === zone.id);
    const visits = list(s, 'visits').filter(
      (visit) =>
        clients.some((client) => client.id === visit.clientId) &&
        within(visit.scheduledAt, '30') &&
        visit.status !== 'cancelled',
    );
    const capacity = zone.capacity == null ? (zone.repIds || []).length * 40 : N(zone.capacity);
    const assigned = clients.filter((client) => (zone.repIds || []).includes(client.repId)).length;
    return {
      clients,
      visits,
      capacity,
      coverage: clients.length ? (assigned / clients.length) * 100 : 0,
      assigned,
    };
  }
  function territories({ state: s }) {
    return wrap(
      pageTitle(
        'التغطية والتوزيع',
        'كل منطقة لها فريق.',
        'وزّع أكثر من مندوب على المنطقة، واضبط القدرة والأهداف.',
        action('new-zone', 'إضافة منطقة', 'plus', '', 'btn btn-primary'),
      ) +
        `<section class="card">${A.map({
          height: 330,
          interactive: false,
        })}<p class="admin-state-note">خريطة تخطيطية لتوزيع العملاء والمناطق، وليست خريطة تتبع مباشر.</p></section><div class="grid-2">${list(
          s,
          'zones',
        )
          .map((zone) => {
            const z = zoneStats(s, zone);
            return `<article class="card"><div class="row-between"><span class="icon-box" style="background:${color(zone.color)}">${icon('map')}</span>${badge(`${(zone.repIds || []).length} مندوبين`)}</div><h2>${E(zone.name)}</h2><p class="small muted">${E((zone.repIds || []).map((id) => person(s, id)).join('، ') || 'تحتاج تعيين مندوب')}</p><div class="admin-mini"><div><span class="tiny muted">العملاء</span><strong>${z.clients.length}</strong></div><div><span class="tiny muted">زيارات 30 يومًا</span><strong>${z.visits.length}</strong></div><div><span class="tiny muted">التغطية</span><strong>${Math.round(z.coverage)}%</strong></div></div><p class="small muted">${z.assigned} من ${z.clients.length} عملاء معيّنون لمندوب ضمن فريق المنطقة.</p>${progress(z.coverage)}<div class="row wrap gap-sm">${go('zone-detail', 'تفاصيل المنطقة', 'arrow-left', zone.id, 'btn btn-primary')}${action('assign-zone', 'توزيع الفريق', 'users', idAttr(zone.id), 'btn btn-secondary')}</div></article>`;
          })
          .join('')}</div>`,
    );
  }
  function zoneDetail({ state: s, params }) {
    const zone = find(s, 'zones', params.id);
    if (!zone) return wrap(missing());
    const z = zoneStats(s, zone);
    return wrap(
      pageTitle(
        'ملف المنطقة',
        zone.name,
        'المندوبون والقدرة التخطيطية وتغطية العملاء.',
        action('assign-zone', 'إدارة التوزيع', 'users', idAttr(zone.id), 'btn btn-primary') +
          action('edit-zone', 'إعدادات المنطقة', 'settings', idAttr(zone.id)),
      ) +
        `<section class="grid-3">${metric('تغطية التعيين', `${Math.round(z.coverage)}%`, `${z.assigned} عملاء من ${z.clients.length}`, 'target')}${metric('القدرة الشهرية', z.capacity, zone.capacity == null ? 'تقدير أولي: 40 زيارة لكل مندوب' : 'زيارات مخططة بحسب إعداد المنطقة', 'calendar')}${metric('هدف المنطقة', money(zone.target), 'هدف قيمة العقود المسجل', 'wallet')}</section><div class="admin-detail-grid"><section class="card">${A.map(
          {
            height: 300,
            selectedZone: zone.id,
            interactive: false,
          },
        )}<h3>استخدام القدرة التخطيطية</h3>${progress(z.capacity ? (z.visits.length / z.capacity) * 100 : 0)}<p class="small muted">${z.visits.length} زيارة مسجلة خلال آخر 30 يومًا من ${z.capacity} زيارة مخططة.</p>${!z.capacity ? `<p class="notice notice-warn">عيّن فريقًا أو قدرة للمنطقة حتى يمكن قياس الاستخدام.</p>` : ''}</section><section class="card">${sectionTitle('الفريق المعيّن')}${
          (zone.repIds || []).length
            ? (zone.repIds || [])
                .map((id) => find(s, 'reps', id))
                .filter(Boolean)
                .map((rep) => repRow(s, rep))
                .join('')
            : empty(
                'المنطقة بلا فريق',
                'يمكن تعيين عدة مندوبين معًا.',
                action('assign-zone', 'تعيين الفريق', 'plus', idAttr(zone.id)),
              )
        }</section></div><section class="card">${sectionTitle('عملاء المنطقة')}<div class="list">${z.clients.length ? z.clients.map((client) => clientRow(s, client)).join('') : empty('لا عملاء في المنطقة', 'تظهر هنا سجلات العملاء المرتبطة بهذه المنطقة.')}</div></section>`,
    );
  }
  function syncZoneReps(s, zoneId, repIds) {
    const zone = find(s, 'zones', zoneId);
    if (!zone) return;
    zone.repIds = [...new Set(repIds)].filter((id) => find(s, 'reps', id));
    list(s, 'reps').forEach((rep) => {
      const others = (rep.zoneIds || []).filter((id) => id !== zoneId);
      rep.zoneIds = zone.repIds.includes(rep.id) ? [...others, zoneId] : others;
    });
  }
  function zoneModal(id) {
    const s = A.state(),
      zone = id ? find(s, 'zones', id) : null;
    if (id && !zone) return fail('المنطقة غير موجودة.');
    A.modal(
      zone ? 'إعدادات المنطقة' : 'إضافة منطقة تخطيطية',
      form(
        'save-zone',
        `<div class="form-grid">${input('اسم المنطقة', 'name', zone?.name || '', 'text', 'required minlength="2" maxlength="80"')}${input('هدف قيمة العقود', 'target', zone?.target ?? 10000, 'number', 'required min="0" max="100000000" step="1"')}${input('القدرة الشهرية بالزيارات', 'capacity', zone ? zoneStats(s, zone).capacity : 40, 'number', 'required min="0" max="10000" step="1"')}${input('لون المنطقة', 'color', color(zone?.color), 'color')}</div><p class="small muted">القدرة تخطيطية قابلة للتعديل؛ الخريطة في العرض توضيحية.</p>`,
        zone?.id,
        zone ? 'حفظ المنطقة' : 'إضافة المنطقة',
      ),
    );
  }
  function saveZone({ form: node, data }) {
    const id = node.dataset.id,
      s = A.state();
    if (id && !find(s, 'zones', id)) return fail('المنطقة غير موجودة.');
    const target = Number(data.target),
      capacity = Number(data.capacity),
      name = String(data.name || '').trim();
    if (
      name.length < 2 ||
      !Number.isFinite(target) ||
      target < 0 ||
      !Number.isFinite(capacity) ||
      capacity < 0
    )
      return fail('راجع الاسم والهدف والقدرة.');
    persist(
      'تحديث التخطيط والأهداف للمنطقة',
      (state) => {
        let zone = id ? find(state, 'zones', id) : null;
        if (!zone) {
          const index = state.zones.length;
          zone = {
            id: A.id('zone'),
            repIds: [],
            center: {
              x: 25 + (index % 3) * 25,
              y: 30 + (Math.floor(index / 3) % 3) * 20,
            },
            polygon: '',
          };
          state.zones.push(zone);
        }
        Object.assign(zone, {
          name,
          target,
          capacity: Math.round(capacity),
          color: color(data.color),
        });
      },
      'حُفظت إعدادات المنطقة.',
    );
  }
  function assignZone({ el }) {
    const s = A.state(),
      zone = find(s, 'zones', el.dataset.id);
    if (!zone) return fail('المنطقة غير موجودة.');
    A.modal(
      `فريق ${zone.name}`,
      form(
        'save-zone-team',
        `<p class="muted">يمكن تعيين عدة مندوبين. إلغاء التعيين يزيل المنطقة من ملف المندوب أيضًا.</p>${choices(list(s, 'reps'), zone.repIds || [], 'repIds', (rep) => `${rep.name} · ${repStatuses[rep.status] || rep.status}`)}`,
        zone.id,
        'حفظ توزيع الفريق',
      ),
    );
  }
  function saveZoneTeam({ form: node }) {
    const zoneId = node.dataset.id,
      repIds = selectedChecks(node, 'repIds');
    if (!find(A.state(), 'zones', zoneId)) return fail('المنطقة غير موجودة.');
    persist(
      'تحديث توزيع المندوبين على المنطقة',
      (s) => {
        syncZoneReps(s, zoneId, repIds);
        notify(s, 'rep', 'تحديث توزيع المناطق', 'راجع المناطق المعيّنة لك في مساحة المندوب.');
      },
      'تزامن توزيع المنطقة مع ملفات المندوبين.',
    );
  }
  return {
    id: 'territories',
    routes: {
      territories: {
        title: 'المناطق',
        render: territories,
      },
      'zone-detail': {
        nav: 'territories',
        title: 'تفاصيل المنطقة',
        render: zoneDetail,
      },
    },
    actions: {
      'new-zone': () => zoneModal(),
      'edit-zone': ({ el }) => zoneModal(el.dataset.id),
      'save-zone': saveZone,
      'assign-zone': assignZone,
      'save-zone-team': saveZoneTeam,
    },
    api: {},
  };
}
