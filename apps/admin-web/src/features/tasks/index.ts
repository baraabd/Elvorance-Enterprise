// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** admin / tasks: original v1.1 views and local demo actions. */
export function createTasksFeature(context, { state }) {
  const {
    A,
    E,
    action,
    badge,
    clientOptions,
    customer,
    date,
    empty,
    fail,
    filter,
    find,
    form,
    icon,
    idAttr,
    input,
    list,
    notify,
    pageTitle,
    person,
    repOptions,
    select,
    textarea,
    ui,
    wrap,
  } = context;
  const persist = (...args) => state.persist(...args);
  function tasks({ state: s, params = {} }) {
    const rows = list(s, 'tasks').filter(
      (task) =>
        (ui.taskStatus === 'all' || task.status === ui.taskStatus) &&
        (params.due !== '1' || (task.status === 'open' && task.dueDate <= A.today())) &&
        (ui.taskRep === 'all' || task.repId === ui.taskRep),
    );
    return wrap(
      pageTitle(
        'التنفيذ اليومي',
        'خطوة تالية لكل متابعة.',
        'أسند المهام والمواعيد والأولويات إلى المسؤول المناسب.',
        action('new-task', 'إضافة مهمة', 'plus', '', 'btn btn-primary'),
      ) +
        `<div class="filter-bar">${filter('الحالة', 'taskStatus', {
          open: 'المهام المفتوحة',
          done: 'المكتملة',
          all: 'كل المهام',
        })}${filter('المندوب', 'taskRep', {
          all: 'كل المندوبين',
          ...repOptions(s),
        })}</div><div class="grid-2">${rows.map((task) => `<article class="card"><div class="row-between">${badge(task.priority === 'high' ? 'أولوية عالية' : 'أولوية عادية', task.priority === 'high' ? 'warn' : 'neutral')}${badge(task.status === 'done' ? 'مكتملة' : task.dueDate < A.today() ? 'متأخرة' : 'مفتوحة', task.status === 'done' ? 'good' : task.dueDate < A.today() ? 'bad' : 'info')}</div><h2>${E(task.title)}</h2><p class="muted small">${E(person(s, task.repId))}${task.clientId ? ` · ${E(customer(s, task.clientId))}` : ''}</p><p class="admin-due small">${icon('calendar')} ${E(date(task.dueDate))}</p>${task.notes ? `<p class="small">${E(task.notes)}</p>` : ''}<div class="row gap-sm wrap">${action('toggle-task', task.status === 'done' ? 'إعادة فتح' : 'إكمال المهمة', task.status === 'done' ? 'refresh' : 'check', idAttr(task.id), 'btn btn-primary')}${action('edit-task', 'تعديل', 'edit', idAttr(task.id))}</div></article>`).join('')}</div>${!rows.length ? empty('لا مهام مطابقة', 'غيّر الفلتر أو أسند مهمة جديدة.', action('new-task', 'إسناد مهمة', 'plus')) : ''}`,
    );
  }
  function taskModal(id, defaults) {
    const s = A.state(),
      task = id ? find(s, 'tasks', id) : null;
    if (id && !task) return fail('المهمة غير موجودة.');
    A.modal(
      task ? 'تعديل المهمة' : 'إسناد مهمة جديدة',
      form(
        'save-task',
        input(
          'عنوان المهمة',
          'title',
          task?.title || '',
          'text',
          'required minlength="3" maxlength="160"',
        ) +
          `<div class="form-grid">${select('المندوب المسؤول', 'repId', repOptions(s), task?.repId || defaults?.rep || list(s, 'reps')[0]?.id, 'required')}${select(
            'العميل، إن وجد',
            'clientId',
            {
              '': 'مهمة داخلية',
              ...clientOptions(s),
            },
            task?.clientId || defaults?.client || '',
          )}${input('موعد الاستحقاق', 'dueDate', task?.dueDate || A.today(), 'date', 'required')}${select(
            'الأولوية',
            'priority',
            {
              normal: 'عادية',
              high: 'عالية',
            },
            task?.priority || 'normal',
          )}${select(
            'الحالة',
            'status',
            {
              open: 'مفتوحة',
              done: 'مكتملة',
              cancelled: 'ملغاة',
            },
            task?.status || 'open',
          )}</div>${textarea('تفاصيل المهمة', 'notes', task?.notes || '', 'maxlength="2000"')}`,
        task?.id,
        task ? 'حفظ المهمة' : 'إسناد المهمة',
      ),
    );
  }
  function saveTask({ form: node, data }) {
    const s = A.state(),
      id = node.dataset.id,
      title = String(data.title || '').trim();
    if (id && !find(s, 'tasks', id)) return fail('المهمة غير موجودة.');
    if (
      title.length < 3 ||
      !find(s, 'reps', data.repId) ||
      (data.clientId && !find(s, 'clients', data.clientId)) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(data.dueDate || '') ||
      !['open', 'done', 'cancelled'].includes(data.status) ||
      !['high', 'normal'].includes(data.priority)
    )
      return fail('راجع العنوان والمندوب والموعد والأولوية.');
    persist(
      id ? 'تحديث مهمة متابعة' : 'إسناد مهمة جديدة إلى الفريق',
      (state) => {
        A.assert(
          find(state, 'reps', data.repId) &&
            (!data.clientId || find(state, 'clients', data.clientId)),
          'تغيّر العميل أو المندوب؛ لم تُسنَد المهمة.',
        );
        A.assert(!id || find(state, 'tasks', id), 'المهمة لم تعد موجودة.');
        let task = id ? find(state, 'tasks', id) : null;
        if (!task) {
          task = {
            id: A.id('task'),
            type: data.clientId ? 'follow_up' : 'internal',
          };
          state.tasks.push(task);
        }
        A.assert(
          !data.clientId ||
            data.status !== 'open' ||
            task.type === 'internal' ||
            !find(state, 'clients', data.clientId)?.doNotContact,
          'العميل طلب عدم التواصل؛ لا تُسنِد متابعة جديدة.',
        );
        Object.assign(task, {
          title,
          repId: data.repId,
          clientId: data.clientId || '',
          dueDate: data.dueDate,
          priority: data.priority,
          status: data.status,
          notes: String(data.notes || '').trim(),
        });
        notify(state, 'rep', 'تحديث مهمة للفريق', `${title} · ${person(state, data.repId)}`, {
          repId: data.repId,
        });
      },
      'حُفظت المهمة وأصبحت ظاهرة في مساحة المندوب.',
    );
  }
  return {
    id: 'tasks',
    routes: {
      tasks: {
        nav: 'more',
        title: 'المهام',
        render: tasks,
      },
    },
    actions: {
      'new-task': ({ el }) =>
        taskModal(null, {
          rep: el.dataset.rep,
          client: el.dataset.client,
        }),
      'edit-task': ({ el }) => taskModal(el.dataset.id),
      'save-task': saveTask,
      'toggle-task': ({ el }) => {
        const task = find(A.state(), 'tasks', el.dataset.id);
        if (!task) return fail('المهمة غير موجودة.');
        persist(
          'تحديث حالة مهمة',
          (s) => {
            const record = find(s, 'tasks', task.id);
            A.assert(
              record && record.status !== 'cancelled',
              'المهمة ملغاة؛ أنشئ مهمة داخلية جديدة عند الحاجة.',
            );
            A.assert(
              record.type !== 'follow_up' || !find(s, 'clients', record.clientId)?.doNotContact,
              'أوقف العميل التواصل؛ لا تعِد فتح مهمة متابعة.',
            );
            record.status = record.status === 'done' ? 'open' : 'done';
          },
          'تحدثت حالة المهمة.',
        );
      },
    },
    api: {},
  };
}
