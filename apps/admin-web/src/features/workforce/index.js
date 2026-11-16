/** admin / workforce: original v1.1 views and local demo actions. */
export function createWorkforceFeature(context, { pipeline, state }) {
  const {
    A,
    E,
    N,
    action,
    badge,
    choices,
    color,
    customer,
    date,
    dayOf,
    empty,
    fail,
    filter,
    find,
    form,
    go,
    iconAction,
    idAttr,
    input,
    list,
    metric,
    missing,
    money,
    outcomeNames,
    pageTitle,
    person,
    progress,
    repStatuses,
    search,
    searchEmpty,
    searchable,
    sectionTitle,
    select,
    selectedChecks,
    split,
    stamp,
    sum,
    ui,
    wrap,
  } = context;
  const opportunityRows = (...args) => pipeline.opportunityRows(...args);
  const persist = (...args) => state.persist(...args);
  function contractRep(s, contract) {
    return (
      find(s, 'quotes', contract.quoteId)?.repId || find(s, 'clients', contract.clientId)?.repId
    );
  }
  function booked(s, repId) {
    return list(s, 'contracts').filter(
      (contract) =>
        ['signed', 'active', 'completed'].includes(contract.status) &&
        (!repId || contractRep(s, contract) === repId),
    );
  }
  function repSales(s, repId) {
    return sum(booked(s, repId), (contract) => contract.total);
  }
  function repVisits(s, repId) {
    return list(s, 'visits').filter((visit) => !repId || visit.repId === repId);
  }
  function repRow(s, rep) {
    const completed = repVisits(s, rep.id).filter(
      (v) =>
        v.status === 'completed' && dayOf(v.endedAt || v.startedAt || v.scheduledAt) === A.today(),
    ).length;
    return `<article class="list-item admin-team-row">${A.avatar(rep.name, color(rep.avatarColor))}<div><h3>${E(rep.name)}</h3><small class="muted">${E(
      (rep.zoneIds || [])
        .map((id) => find(s, 'zones', id)?.name)
        .filter(Boolean)
        .join('، ') || 'دون منطقة',
    )} · ${completed} زيارات مكتملة اليوم</small></div>${go('team-member', 'التفاصيل', 'chevron-left', rep.id, 'btn btn-ghost btn-sm')}</article>`;
  }
  function liveTracking() {
    return wrap(
      pageTitle(
        'المتابعة الميدانية',
        'أين يوجد الفريق الآن؟',
        'قراءات الجهاز بموافقة المندوب، مع وقت القراءة ودقتها وحالة الاتصال.',
      ) + '<div data-atlas-live-team></div>',
    );
  }
  function team({ state: s, params = {} }) {
    const reps = list(s, 'reps').filter(
      (rep) => (params.status || ui.teamStatus) === 'all' || rep.status === (params.status || ui.teamStatus),
    );
    return wrap(
      pageTitle(
        'الأشخاص والأداء',
        'فريقك، بتفاصيله.',
        'الأهداف والتخصصات والمناطق في بطاقة واحدة لكل مندوب.',
        action('new-member', 'إضافة مندوب', 'plus', '', 'btn btn-primary'),
      ) +
        `<div class="filter-bar">${search('team', 'ابحث باسم المندوب أو تخصصه')}${filter(
          'الحالة المسجلة',
          'teamStatus',
          {
            all: 'كل الحالات',
            ...repStatuses,
          },
        )}</div><div class="grid-3" data-collection="team">${reps
          .map(
            (rep) =>
              `<article class="card" ${searchable(`${rep.name} ${(rep.skills || []).join(' ')} ${rep.phone}`)}><div class="row-between">${A.avatar(rep.name, color(rep.avatarColor))}${badge(repStatuses[rep.status] || rep.status, rep.status === 'active' ? 'good' : 'neutral')}</div><h2>${E(rep.name)}</h2><p class="small muted">${E(
                (rep.zoneIds || [])
                  .map((id) => find(s, 'zones', id)?.name)
                  .filter(Boolean)
                  .join(' · ') || 'دون منطقة معيّنة',
              )}</p><div class="chips">${(rep.skills || []).map((skill) => badge(skill)).join('')}</div><div class="divider"></div><div class="row-between small"><span>العقود / الهدف</span><strong class="num">${E(money(repSales(s, rep.id)))} / ${E(money(rep.target))}</strong></div>${progress(N(rep.target) ? (repSales(s, rep.id) / N(rep.target)) * 100 : 0)}<div class="admin-mini"><div><span class="tiny muted">العملاء</span><strong>${list(s, 'clients').filter((c) => c.repId === rep.id).length}</strong></div><div><span class="tiny muted">الزيارات</span><strong>${repVisits(s, rep.id).length}</strong></div><div><span class="tiny muted">الفرص</span><strong>${list(s, 'opportunities').filter((o) => o.repId === rep.id && !['won', 'lost'].includes(o.stage)).length}</strong></div></div><div class="row wrap gap-sm" style="margin-top:18px">${go('team-member', 'ملف المندوب', 'arrow-left', rep.id, 'btn btn-primary')}${iconAction('edit-member', 'تعديل بيانات المندوب', 'edit', idAttr(rep.id))}</div></article>`,
          )
          .join(
            '',
          )}</div>${searchEmpty('team')}${!reps.length ? empty('لا يوجد مندوبون بهذه الحالة', 'غيّر الفلتر أو أضف مندوبًا جديدًا.') : ''}`,
    );
  }
  function visitRows(s, visits) {
    const labels = {
      scheduled: 'مجدولة',
      active: 'جارية',
      completed: 'مكتملة',
      cancelled: 'ملغاة',
    };
    return visits.length
      ? `<div class="list">${[...visits]
          .sort((a, b) => String(b.scheduledAt).localeCompare(String(a.scheduledAt)))
          .map(
            (visit) =>
              `<article class="list-item"><div class="row-between"><strong>${E(customer(s, visit.clientId))}</strong>${badge(labels[visit.status] || visit.status, visit.status === 'completed' ? 'good' : visit.status === 'active' ? 'info' : 'neutral')}</div><p class="small muted">${E(date(visit.scheduledAt))} · ${E(person(s, visit.repId))}</p>${visit.outcome ? `<p class="small">${E(outcomeNames[visit.outcome] || visit.outcome)}</p>` : ''}${visit.notes ? `<p class="small muted">${E(visit.notes)}</p>` : ''}${visit.nextAction ? `<p class="small"><strong>الخطوة التالية:</strong> ${E(visit.nextAction)}</p>` : ''}</article>`,
          )
          .join('')}</div>`
      : empty('لا توجد زيارات', 'تظهر الزيارات المسجلة هنا تلقائيًا.');
  }
  function teamMember({ state: s, params }) {
    const rep = find(s, 'reps', params.id);
    if (!rep) return wrap(missing());
    const sales = repSales(s, rep.id),
      tasks = list(s, 'tasks').filter((t) => t.repId === rep.id && t.status === 'open');
    return wrap(
      pageTitle(
        'ملف المندوب',
        rep.name,
        'بيانات العمل والأهداف والسجل المشترك.',
        action('edit-member', 'تعديل الملف', 'edit', idAttr(rep.id), 'btn btn-primary'),
      ) +
        `<section class="card"><div class="row wrap gap-sm">${A.avatar(rep.name, color(rep.avatarColor))}${badge(repStatuses[rep.status] || rep.status, rep.status === 'active' ? 'good' : 'neutral')}${(rep.skills || []).map((skill) => badge(skill)).join('')}</div><dl class="admin-kv"><div><dt>الهاتف</dt><dd dir="ltr">${E(rep.phone || '—')}</dd></div><div><dt>المناطق</dt><dd>${E(
          (rep.zoneIds || [])
            .map((id) => find(s, 'zones', id)?.name)
            .filter(Boolean)
            .join('، ') || 'دون منطقة',
        )}</dd></div><div><dt>آخر حالة مسجلة</dt><dd>${E(
          rep.lastSeen
            ? A.date(rep.lastSeen, {
                time: true,
              })
            : 'غير محدد',
        )}</dd></div><div><dt>المهام المفتوحة</dt><dd>${tasks.length}</dd></div></dl><p class="admin-state-note">بيانات آخر ظهور وموقع خريطة الفريق توضيحية، ولا تثبت موقعًا حيًا.</p></section><section class="grid-3">${metric('قيمة العقود', money(sales), 'العقود المعتمدة لعملاء المندوب', 'wallet')}${metric('الهدف', money(rep.target), 'قابل للتعديل من ملف المندوب', 'target')}${metric('إنجاز الهدف', `${N(rep.target) ? Math.round((sales / N(rep.target)) * 100) : 0}%`, 'نسبة قيمة العقود إلى الهدف', 'trend')}</section><div class="admin-detail-grid"><section class="card">${sectionTitle('الزيارات المسجلة')}${visitRows(s, repVisits(s, rep.id))}</section><div class="stack"><section class="card">${sectionTitle('فرص المندوب')}${opportunityRows(
          s,
          list(s, 'opportunities').filter((o) => o.repId === rep.id),
        )}</section><section class="card">${sectionTitle('المهام المفتوحة', action('new-task', 'مهمة جديدة', 'plus', `data-rep="${E(rep.id)}"`, 'btn btn-ghost btn-sm'))}${tasks.length ? tasks.map((task) => `<article class="list-item"><p class="strong">${E(task.title)}</p><p class="small muted">${E(date(task.dueDate))}</p>${action('edit-task', 'تعديل المهمة', 'edit', idAttr(task.id), 'btn btn-ghost btn-sm')}</article>`).join('') : empty('لا مهام مفتوحة', 'يمكن إسناد مهمة جديدة لهذا المندوب.')}</section></div></div>`,
    );
  }
  function syncRepZones(s, repId, zoneIds) {
    const rep = find(s, 'reps', repId);
    if (!rep) return;
    rep.zoneIds = [...new Set(zoneIds)].filter((id) => find(s, 'zones', id));
    list(s, 'zones').forEach((zone) => {
      const others = (zone.repIds || []).filter((id) => id !== repId);
      zone.repIds = rep.zoneIds.includes(zone.id) ? [...others, repId] : others;
    });
  }
  function memberModal(id) {
    const s = A.state(),
      rep = id ? find(s, 'reps', id) : null;
    if (id && !rep) return fail('المندوب غير موجود.');
    A.modal(
      rep ? 'تعديل ملف المندوب' : 'إضافة مندوب إلى الفريق',
      form(
        'save-member',
        `<div class="form-grid">${input('الاسم الكامل', 'name', rep?.name || '', 'text', 'required minlength="2" maxlength="80"')}${input('الهاتف', 'phone', rep?.phone || '', 'tel', 'required minlength="6" maxlength="30"')}${input('هدف قيمة العقود', 'target', rep?.target ?? 5000, 'number', 'required min="0" max="10000000" step="1"')}${select('الحالة المسجلة', 'status', repStatuses, rep?.status || 'active')}</div>${input('التخصصات، مفصولة بفاصلة', 'skills', (rep?.skills || []).join('، '), 'text', 'maxlength="250"')}<h3>المناطق المعيّنة</h3>${choices(list(s, 'zones'), rep?.zoneIds || [], 'zoneIds')}<p class="small muted">يُحدّث اختيارك ملف المندوب وفريق كل منطقة معًا.</p>`,
        rep?.id,
        rep ? 'حفظ الملف' : 'إضافة المندوب',
      ),
      {
        wide: true,
      },
    );
  }
  function saveMember({ form: node, data }) {
    const s = A.state(),
      id = node.dataset.id,
      existing = id ? find(s, 'reps', id) : null;
    if (id && !existing) return fail('تعذر العثور على المندوب.');
    const target = Number(data.target),
      name = String(data.name || '').trim();
    if (name.length < 2 || !Number.isFinite(target) || target < 0 || !repStatuses[data.status])
      return fail('راجع الاسم والهدف والحالة.');
    const zoneIds = selectedChecks(node, 'zoneIds');
    const repId = id || A.id('rep');
    persist(
      existing ? 'تحديث ملف المندوب وأهدافه' : 'إضافة مندوب جديد',
      (state) => {
        let rep = find(state, 'reps', repId);
        if (!rep) {
          rep = {
            id: repId,
            zoneIds: [],
            sales: 0,
            visitsToday: 0,
            avatarColor: '#e4efdc',
            location: {
              x: 50,
              y: 50,
            },
          };
          state.reps.push(rep);
        }
        Object.assign(rep, {
          name,
          phone: String(data.phone || '').trim(),
          target,
          status: data.status,
          skills: split(data.skills),
          lastSeen: stamp(),
        });
        syncRepZones(state, repId, zoneIds);
      },
      'حُفظ ملف المندوب وتوزيع مناطقه.',
    );
  }
  return {
    id: 'workforce',
    routes: {
      team: {
        title: 'الفريق',
        render: team,
      },
      'live-tracking': {
        nav: 'team',
        title: 'مواقع الفريق الآن',
        render: liveTracking,
      },
      'team-member': {
        nav: 'team',
        title: 'ملف المندوب',
        render: teamMember,
      },
    },
    actions: {
      'new-member': () => memberModal(),
      'edit-member': ({ el }) => memberModal(el.dataset.id),
      'save-member': saveMember,
    },
    api: {
      contractRep,
      booked,
      repRow,
      visitRows,
    },
  };
}
