/* ATLAS_DASHBOARD_DRILLDOWN_2027 */
/** rep / tasks: original v1.1 views and local demo actions. */
export function createTasksFeature(context, { state }) {
  const { A, act, chipLink, client, date, drilldownSummary, e, head, ic, iconGo, ownClients, rep } = context;
  const commit = (...args) => state.commit(...args);
  function tasks({ state: s, params }) {
    const filter = ['open', 'done', 'cancelled', 'all'].includes(params.filter) ? params.filter : 'open',
      rows = s.tasks
        .filter((t) => t.repId === rep(s).id && (filter === 'all' || t.status === filter))
        .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)));
    return `${head('الخطوة التالية لا تضيع', 'مهامك الشخصية وما يسنده فريق الإدارة إليك.', act('task-new', 'مهمة جديدة', 'plus', '', 'btn btn-primary'))}${drilldownSummary(params, 'مهام مفتوحة', rows.length, 'اضغط على العميل أو أكمل المهمة من القائمة')}<div class="chips">${[
      ['open', 'المفتوحة'],
      ['done', 'المكتملة'],
      ['cancelled', 'الملغاة'],
      ['all', 'الكل'],
    ]
      .map(([k, l]) => chipLink('tasks', k, l, k === filter))
      .join(
        '',
      )}</div><div class="card list">${rows.map((t) => `<article class="list-item"><button class="icon-btn ${t.status === 'done' ? 'text-good' : ''}" data-action="task-toggle" data-id="${t.id}" data-value="${t.status === 'done' ? 'open' : 'done'}" ${t.status === 'cancelled' ? 'disabled title="أُلغيت المهمة ولا تعني اكتمال التنفيذ"' : ''} aria-label="${t.status === 'done' ? 'إعادة فتح' : 'إكمال'} ${e(t.title)}">${ic(t.status === 'done' ? 'check-circle' : 'check')}</button><div class="rep-grow"><h3>${e(t.title)}</h3><p class="muted small">${e(s.clients.find((c) => c.id === t.clientId)?.name || 'مهمة داخلية')} · ${e(date(t.dueDate))}</p></div>${t.status === 'cancelled' ? A.badge('ملغاة', 'warn') : ''}${t.priority === 'high' ? A.badge('عالية الأولوية', 'warn') : ''}${t.status === 'open' && String(t.dueDate).slice(0, 10) < A.today() ? A.badge('متأخرة', 'bad') : ''}${t.clientId ? iconGo('client-detail', 'ملف العميل', 'chevron-left', `data-id="${t.clientId}"`) : ''}</article>`).join('') || A.empty('لا مهام هنا', 'سيظهر هنا كل موعد متابعة ومهمة يسندها الفريق.')}</div>`;
  }
  function taskModal(s, id) {
    A.modal(
      'مهمة متابعة',
      `<form data-submit="save-task" data-client="${e(id || '')}" class="stack"><label class="field">نوع المهمة<select class="select" name="type"><option value="follow_up">متابعة مع العميل</option><option value="data_correction">تصحيح أو عمل داخلي دون تواصل</option></select></label><label class="field">ما المطلوب؟<input class="input" name="title" required minlength="5" maxlength="160"></label><label class="field">العميل<select class="select" name="clientId"><option value="">مهمة داخلية</option>${ownClients(
        s,
      )
        .map(
          (c) => `<option value="${c.id}" ${id === c.id ? 'selected' : ''}>${e(c.name)}</option>`,
        )
        .join(
          '',
        )}</select></label><div class="form-grid"><label class="field">الموعد<input class="input" type="date" name="dueDate" required min="${A.today()}" value="${A.today()}"></label><label class="field">الأولوية<select class="select" name="priority"><option value="normal">عادية</option><option value="high">عالية</option></select></label></div><button type="submit" class="btn btn-primary">${ic('check')}حفظ المهمة</button></form>`,
    );
  }
  return {
    id: 'tasks',
    routes: {
      tasks: {
        title: 'المهام',
        render: tasks,
        nav: 'more',
      },
    },
    actions: {
      'task-new'({ state, el }) {
        taskModal(state, el.dataset.id);
      },
      'save-task'({ data, state }) {
        const title = String(data.title || '').trim(),
          type =
            data.type === 'data_correction' || !data.clientId ? 'data_correction' : 'follow_up';
        if (title.length < 5 || !data.dueDate || data.dueDate < A.today())
          return A.toast('أكمل المهمة وموعدها الصحيح.', 'error');
        if (
          commit(
            (s) => {
              const c = data.clientId && client(s, data.clientId);
              A.assert(!data.clientId || c, 'العميل لم يعد ضمن حسابك.');
              A.assert(
                !c?.doNotContact || type === 'data_correction',
                'التواصل موقوف؛ يمكن حفظ مهمة تصحيح داخلية فقط.',
              );
              s.tasks.unshift({
                id: A.id('task'),
                title,
                repId: rep(s).id,
                clientId: c?.id || '',
                dueDate: data.dueDate,
                priority: data.priority === 'high' ? 'high' : 'normal',
                status: 'open',
                type,
              });
            },
            type === 'data_correction' ? 'إضافة مهمة داخلية' : 'إضافة مهمة متابعة',
          ) === false
        )
          return;
        A.closeModal();
        A.toast('أُضيفت المهمة.', 'success');
      },
      'task-toggle'({ el, state }) {
        const task = state.tasks.find((t) => t.id === el.dataset.id && t.repId === rep(state).id);
        if (!task || task.status === 'cancelled') return;
        const target = el.dataset.value || (task.status === 'done' ? 'open' : 'done');
        if (!['open', 'done'].includes(target)) return;
        commit(
          (s) => {
            const t = s.tasks.find((x) => x.id === task.id && x.repId === rep(s).id);
            A.assert(
              t && t.status !== 'cancelled',
              'تغيّر إسناد المهمة أو أُلغيت؛ لا يمكن تعديلها.',
            );
            A.assert(
              target !== 'open' ||
                t.type !== 'follow_up' ||
                !s.clients.find((c) => c.id === t.clientId)?.doNotContact,
              'طلب العميل عدم التواصل؛ لا يمكن إعادة فتح متابعة.',
            );
            t.status = target;
          },
          target === 'done' ? 'إكمال مهمة' : 'إعادة فتح مهمة',
        );
      },
    },
    api: {},
  };
}
