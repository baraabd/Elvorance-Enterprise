// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** admin / customers: original v1.1 views and local demo actions. */
export function createCustomersFeature(context, { pipeline, state, workforce }) {
  const {
    A,
    E,
    action,
    badge,
    choices,
    clientStatuses,
    empty,
    fail,
    filter,
    find,
    form,
    go,
    idAttr,
    input,
    list,
    missing,
    money,
    needLabel,
    pageTitle,
    person,
    progress,
    projectStatuses,
    repOptions,
    search,
    searchEmpty,
    searchable,
    sectionTitle,
    select,
    selectedChecks,
    split,
    stamp,
    textarea,
    ui,
    wrap,
    zoneOptions,
  } = context;
  const opportunityRows = (...args) => pipeline.opportunityRows(...args);
  const persist = (...args) => state.persist(...args);
  const visitRows = (...args) => workforce.visitRows(...args);
  function clientRow(s, client) {
    return `<article class="list-item"><div class="row-between"><div><h3>${E(client.name)}</h3><p class="small muted">${E(client.sector || 'قطاع غير محدد')} · ${E(person(s, client.repId))}</p></div>${badge(clientStatuses[client.status] || client.status, client.status === 'customer' ? 'good' : 'neutral')}</div><div class="row-between"><p class="small muted">${E((client.needs || []).map((need) => needLabel(s, need)).join(' · ') || 'لم تُسجّل الاحتياجات بعد')}</p>${go('client-detail', 'ملف العميل', 'chevron-left', client.id, 'btn btn-ghost btn-sm')}</div></article>`;
  }
  function clients({ state: s }) {
    const rows = list(s, 'clients').filter(
      (client) => ui.clientStatus === 'all' || client.status === ui.clientStatus,
    );
    return wrap(
      pageTitle(
        'علاقات العملاء',
        'تعرف على الحاجة أولًا.',
        'الاحتياجات والقرارات والسجل المرتبط بكل شركة.',
        action('new-client', 'إضافة عميل', 'plus', '', 'btn btn-primary'),
      ) +
        `<div class="filter-bar">${search('clients', 'ابحث باسم العميل أو القطاع أو الهاتف')}${filter(
          'الحالة',
          'clientStatus',
          {
            all: 'كل العملاء',
            ...clientStatuses,
          },
        )}</div><section class="card" data-collection="clients">${rows.length ? rows.map((client) => `<div ${searchable(`${client.name} ${client.sector} ${client.phone} ${client.contact}`)}>${clientRow(s, client)}</div>`).join('') : empty('لا عملاء بهذه الحالة', 'غيّر الفلتر لاستعراض بقية السجلات.')}${searchEmpty('clients')}</section>`,
    );
  }
  function clientDetail({ state: s, params }) {
    const client = find(s, 'clients', params.id);
    if (!client) return wrap(missing());
    const clientProjects = list(s, 'projects').filter((p) => p.clientId === client.id);
    return wrap(
      pageTitle(
        'ملف العميل',
        client.name,
        client.sector || 'الاحتياجات والتواصل وسجل العمل.',
        action('edit-client', 'تعديل الملف', 'edit', idAttr(client.id), 'btn btn-primary') +
          action('open-conversation', 'المحادثة', 'message', idAttr(client.id)),
      ) +
        `${client.doNotContact ? '<div class="notice notice-warn">طلب هذا العميل عدم التواصل. احترم التفضيل قبل إنشاء مهمة أو رسالة جديدة.</div>' : ''}<div class="admin-detail-grid"><div class="stack"><section class="card">${sectionTitle('ما الذي يحتاجه العميل؟')}<div class="chips">${(client.needs || []).map((need) => badge(needLabel(s, need), 'info')).join('') || '<span class="muted">لا احتياجات مسجلة</span>'}</div><dl class="admin-kv"><div><dt>المشكلة الحالية</dt><dd>${E(client.painPoints || 'لم تسجل')}</dd></div><div><dt>النتيجة التي يريدها</dt><dd>${E(client.wishes || 'لم تسجل')}</dd></div><div><dt>الميزانية المتوقعة</dt><dd>${E(money(client.budget))}</dd></div><div><dt>صاحب القرار</dt><dd>${E(client.decisionMaker || client.contact || 'غير محدد')}</dd></div></dl><p class="admin-note">${E(client.notes || 'يمكن إضافة ملاحظات مفيدة للمندوب من تعديل الملف.')}</p></section><section class="card">${sectionTitle('سجل الزيارات')}${visitRows(
          s,
          list(s, 'visits').filter((v) => v.clientId === client.id),
        )}</section><section class="card">${sectionTitle('الفرص')}${opportunityRows(
          s,
          list(s, 'opportunities').filter((o) => o.clientId === client.id),
        )}</section></div><aside class="stack"><section class="card">${sectionTitle('التواصل والتعيين')}<dl class="admin-kv"><div><dt>جهة الاتصال</dt><dd>${E(client.contact || '—')}</dd></div><div><dt>الهاتف</dt><dd dir="ltr">${E(client.phone || '—')}</dd></div><div><dt>البريد</dt><dd dir="ltr">${E(client.email || '—')}</dd></div><div><dt>المندوب</dt><dd>${E(person(s, client.repId))}</dd></div><div><dt>المنطقة</dt><dd>${E(find(s, 'zones', client.zoneId)?.name || 'غير محددة')}</dd></div><div><dt>أفضل وقت</dt><dd>${E(client.bestTime || 'غير محدد')}</dd></div></dl><p class="small muted">${E(client.address || '')}</p><div class="row wrap gap-sm">${action('contact-client', 'بيانات التواصل', 'phone', idAttr(client.id))}${action('new-task', 'إسناد متابعة', 'calendar', `data-client="${E(client.id)}" data-rep="${E(client.repId)}"`)}</div></section><section class="card">${sectionTitle('مشاريع العميل')}${clientProjects.length ? clientProjects.map((project) => `<article class="list-item"><strong>${E(project.title)}</strong><p>${badge(projectStatuses[project.status] || project.status, project.status === 'completed' ? 'good' : 'info')}</p>${progress(project.progress)}${go('project-detail', 'تفاصيل المشروع', 'arrow-left', project.id, 'btn btn-ghost btn-sm')}</article>`).join('') : empty('لا مشاريع بعد', 'تظهر المشاريع المرتبطة بالعميل هنا.')}</section></aside></div>`,
    );
  }
  function clientModal(id) {
    const s = A.state(),
      client = id ? find(s, 'clients', id) : null;
    if (id && !client) return fail('العميل غير موجود.');
    A.modal(
      client ? 'تحرير ملف العميل' : 'إضافة عميل',
      form(
        'save-client',
        `<input type="hidden" name="contactVersion" value="${client?.doNotContact ? '1' : '0'}"><div class="form-grid">${input('اسم المنشأة', 'name', client?.name || '', 'text', 'required minlength="2" maxlength="100"')}${input('اسم جهة الاتصال', 'contact', client?.contact || '', 'text', 'maxlength="80"')}${input('الهاتف', 'phone', client?.phone || '', 'tel', 'maxlength="30"')}${input('البريد', 'email', client?.email || '', 'email', 'maxlength="120"')}${input('القطاع', 'sector', client?.sector || '', 'text', 'maxlength="80"')}${select('الحالة', 'status', clientStatuses, client?.status || 'new')}${select(
          'المنطقة',
          'zoneId',
          {
            '': 'دون منطقة',
            ...zoneOptions(s),
          },
          client?.zoneId || '',
        )}${select(
          'المندوب المسؤول',
          'repId',
          {
            '': 'غير معيّن',
            ...repOptions(s),
          },
          client?.repId || '',
        )}${input('الميزانية', 'budget', client?.budget || 0, 'number', 'min="0" max="100000000" step="1"')}${input('صاحب القرار', 'decisionMaker', client?.decisionMaker || '', 'text', 'maxlength="100"')}${input('أفضل وقت للتواصل', 'bestTime', client?.bestTime || '', 'text', 'maxlength="80"')}${input('قناة التواصل المفضلة', 'preferredContact', client?.preferredContact || '', 'text', 'maxlength="80"')}</div><h3>الخدمات المطلوبة</h3>${choices(list(s, 'catalog'), client?.needs || [], 'needIds', (service) => service.title)}${input('احتياجات إضافية، مفصولة بفاصلة', 'otherNeeds', (client?.needs || []).filter((need) => !find(s, 'catalog', need)).join('، '), 'text', 'maxlength="500"')}${input('العنوان', 'address', client?.address || '', 'text', 'maxlength="200"')}${textarea('المشكلة الحالية', 'painPoints', client?.painPoints || '', 'maxlength="1500"')}${textarea('النتيجة المطلوبة', 'wishes', client?.wishes || '', 'maxlength="1500"')}${textarea('ملاحظات مفيدة للفريق', 'notes', client?.notes || '', 'maxlength="2000"')}<label class="checkbox-row"><input type="checkbox" name="doNotContact"${client?.doNotContact ? ' checked' : ''}><span>العميل طلب عدم التواصل</span></label>`,
        client?.id,
      ),
      {
        wide: true,
      },
    );
  }
  function saveClient({ form: node, data }) {
    const s = A.state(),
      id = node.dataset.id;
    if (id && !find(s, 'clients', id)) return fail('العميل غير موجود.');
    const name = String(data.name || '').trim(),
      budget = Number(data.budget || 0);
    if (name.length < 2 || !clientStatuses[data.status] || !Number.isFinite(budget) || budget < 0)
      return fail('راجع بيانات العميل والميزانية.');
    const zone = data.zoneId ? find(s, 'zones', data.zoneId) : null,
      rep = data.repId ? find(s, 'reps', data.repId) : null;
    if ((data.zoneId && !zone) || (data.repId && !rep)) return fail('اختر منطقة ومندوبًا موجودين.');
    if (zone && rep && !(zone.repIds || []).includes(rep.id))
      return fail('أضف المندوب إلى فريق هذه المنطقة أولًا، أو اختر مندوبًا من فريقها.');
    const noContact = Boolean(node.querySelector('[name="doNotContact"]')?.checked);
    const needs = [
      ...new Set([
        ...selectedChecks(node, 'needIds').filter((serviceId) => find(s, 'catalog', serviceId)),
        ...split(data.otherNeeds),
      ]),
    ];
    persist(
      id ? 'تحديث ملف العميل واحتياجاته' : 'إضافة عميل إلى مساحة العمل',
      (state) => {
        let client = id ? find(state, 'clients', id) : null;
        A.assert(!id || client, 'العميل لم يعد موجودًا.');
        const latestZone = data.zoneId ? find(state, 'zones', data.zoneId) : null;
        const latestRep = data.repId ? find(state, 'reps', data.repId) : null;
        A.assert(
          (!data.zoneId || latestZone) &&
            (!data.repId || latestRep) &&
            (!latestZone || !latestRep || (latestZone.repIds || []).includes(latestRep.id)),
          'تغيّر توزيع المنطقة؛ أعد اختيار المندوب المسؤول.',
        );
        A.assert(
          !client ||
            data.contactVersion == null ||
            Boolean(client.doNotContact) === (data.contactVersion === '1'),
          'تغيّرت تفضيلات التواصل؛ أعد مراجعة ملف العميل قبل حفظها.',
        );
        if (!client) {
          client = {
            id: A.id('client'),
            createdAt: stamp(),
            score: 0,
            tags: [],
            location: {
              x: zone?.center?.x || 50,
              y: zone?.center?.y || 50,
            },
          };
          state.clients.push(client);
        }
        Object.assign(client, {
          name,
          contact: String(data.contact || '').trim(),
          phone: String(data.phone || '').trim(),
          email: String(data.email || '').trim(),
          sector: String(data.sector || '').trim(),
          status: data.status,
          zoneId: data.zoneId || '',
          repId: data.repId || '',
          budget,
          decisionMaker: String(data.decisionMaker || '').trim(),
          bestTime: String(data.bestTime || '').trim(),
          preferredContact: String(data.preferredContact || '').trim(),
          address: String(data.address || '').trim(),
          needs,
          painPoints: String(data.painPoints || '').trim(),
          wishes: String(data.wishes || '').trim(),
          notes: String(data.notes || '').trim(),
          doNotContact: noContact,
        });
        if (noContact) {
          list(state, 'visits')
            .filter((v) => v.clientId === client.id && v.status === 'scheduled')
            .forEach((v) => {
              v.status = 'cancelled';
              v.cancellationReason = 'طلب العميل عدم التواصل';
            });
          list(state, 'tasks')
            .filter(
              (t) => t.clientId === client.id && t.type === 'follow_up' && t.status === 'open',
            )
            .forEach((t) => {
              t.status = 'cancelled';
              t.cancellationReason = 'طلب العميل عدم التواصل';
            });
        }
      },
      'حُفظ ملف العميل.',
    );
  }
  function contactClient({ el }) {
    const client = find(A.state(), 'clients', el.dataset.id);
    if (!client) return fail('العميل غير موجود.');
    A.modal(
      'بيانات التواصل',
      `<h3>${E(client.name)}</h3>${client.doNotContact ? '<p class="notice notice-warn">العميل طلب عدم التواصل.</p>' : ''}<dl class="admin-kv"><div><dt>الهاتف</dt><dd dir="ltr">${E(client.phone || 'لم يسجل')}</dd></div><div><dt>البريد</dt><dd dir="ltr">${E(client.email || 'لم يسجل')}</dd></div><div><dt>القناة المفضلة</dt><dd>${E(client.preferredContact || 'غير محددة')}</dd></div><div><dt>أفضل وقت</dt><dd>${E(client.bestTime || 'غير محدد')}</dd></div></dl><p class="small muted">عرض بيانات الاتصال لا يجري مكالمة أو يرسل بريدًا.</p>${client.doNotContact ? '' : action('open-conversation', 'فتح المحادثة المحلية', 'message', idAttr(client.id))}`,
    );
  }
  return {
    id: 'customers',
    routes: {
      clients: {
        nav: 'more',
        title: 'العملاء',
        render: clients,
      },
      'client-detail': {
        nav: 'more',
        title: 'ملف العميل',
        render: clientDetail,
      },
    },
    actions: {
      'new-client': () => clientModal(),
      'edit-client': ({ el }) => clientModal(el.dataset.id),
      'save-client': saveClient,
      'contact-client': contactClient,
    },
    api: {
      clientRow,
    },
  };
}
