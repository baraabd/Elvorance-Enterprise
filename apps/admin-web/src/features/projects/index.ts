// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** admin / projects: original v1.1 views and local demo actions. */
export function createProjectsFeature(context, { state }) {
  const {
    A,
    E,
    N,
    action,
    badge,
    customer,
    date,
    empty,
    fail,
    filter,
    find,
    form,
    go,
    icon,
    idAttr,
    input,
    list,
    missing,
    notify,
    pageTitle,
    progress,
    projectStages,
    projectStatuses,
    search,
    searchEmpty,
    searchable,
    sectionTitle,
    select,
    stamp,
    textarea,
    ui,
    wrap,
  } = context;
  const persist = (...args) => state.persist(...args);
  function projects({ state: s }) {
    const rows = list(s, 'projects').filter(
      (project) => ui.projectStatus === 'all' || project.status === ui.projectStatus,
    );
    return wrap(
      pageTitle(
        'تسليم المشاريع',
        'من الوعد إلى الإنجاز.',
        'راقب المراحل والتسليمات وطلبات تعديل العملاء.',
      ) +
        `<div class="filter-bar">${search('projects', 'ابحث باسم المشروع أو العميل')}${filter(
          'الحالة',
          'projectStatus',
          {
            all: 'كل المشاريع',
            ...projectStatuses,
          },
        )}</div><div class="grid-2" data-collection="projects">${rows.map((project) => `<article class="card" ${searchable(`${project.title} ${customer(s, project.clientId)} ${project.manager}`)}><div class="row-between"><span class="icon-box icon-box-lime">${icon('layers')}</span>${badge(projectStatuses[project.status] || project.status, project.status === 'completed' ? 'good' : project.status === 'delayed' ? 'bad' : 'info')}</div><h2>${E(project.title)}</h2><p class="small muted">${E(customer(s, project.clientId))} · ${E(project.manager || 'مدير غير محدد')}</p><div class="row-between small"><span>${E(projectStages[project.stage] || project.stage)}</span><strong>${N(project.progress)}%</strong></div>${progress(project.progress)}<p class="small muted">${icon('calendar')} التسليم ${E(date(project.dueDate))}</p>${(project.deliverables || []).some((d) => d.status === 'changes_requested') ? '<p class="notice notice-warn">يوجد طلب تعديل من العميل يحتاج ردًا.</p>' : ''}${go('project-detail', 'إدارة المشروع', 'arrow-left', project.id, 'btn btn-primary')}</article>`).join('')}</div>${searchEmpty('projects')}${!rows.length ? empty('لا مشاريع مطابقة', 'غيّر الفلتر لمراجعة بقية المشاريع.') : ''}`,
    );
  }
  function projectDetail({ state: s, params }) {
    const project = find(s, 'projects', params.id);
    if (!project) return wrap(missing());
    return wrap(
      pageTitle(
        'ملف المشروع',
        project.title,
        `${customer(s, project.clientId)} · ${project.manager || 'مدير غير محدد'}`,
        action('edit-project', 'إدارة الحالة', 'edit', idAttr(project.id), 'btn btn-primary'),
      ) +
        `<section class="card"><div class="row-between">${badge(projectStatuses[project.status] || project.status, project.status === 'delayed' ? 'bad' : project.status === 'completed' ? 'good' : 'info')}<strong class="num">${N(project.progress)}%</strong></div><h2>${E(projectStages[project.stage] || project.stage)}</h2>${progress(project.progress)}<p class="muted small">موعد التسليم ${E(date(project.dueDate))}</p></section><div class="admin-detail-grid"><section class="card">${sectionTitle('المراحل ومواعيدها')}<div class="timeline">${
          (project.milestones || [])
            .map(
              (milestone) =>
                `<article class="timeline-item"><span class="timeline-dot"></span><div><div class="row-between"><h3>${E(milestone.title)}</h3>${badge(
                  {
                    done: 'مكتملة',
                    active: 'جارية',
                    pending: 'لاحقًا',
                  }[milestone.status] || milestone.status,
                  milestone.status === 'done' ? 'good' : 'neutral',
                )}</div><p class="small muted">${E(date(milestone.date))}</p>${action('edit-milestone', 'تحديث المرحلة', 'edit', `${idAttr(project.id)} data-milestone="${E(milestone.id)}"`, 'btn btn-ghost btn-sm')}</div></article>`,
            )
            .join('') || empty('لا مراحل معرفة', 'يمكن إدارة الحالة العامة للمشروع من أعلى الصفحة.')
        }</div></section><section class="card">${sectionTitle('التسليمات وملاحظات العميل', action('new-deliverable', 'إضافة تسليم', 'plus', idAttr(project.id), 'btn btn-primary btn-sm'))}${
          (project.deliverables || []).length
            ? (project.deliverables || [])
                .map(
                  (deliverable) =>
                    `<article class="list-item"><h3>${E(deliverable.title)}</h3><div class="row wrap gap-sm">${badge(
                      {
                        pending: 'بانتظار المراجعة',
                        approved: 'معتمد',
                        changes_requested: 'تعديلات مطلوبة',
                      }[deliverable.status] || deliverable.status,
                      deliverable.status === 'approved'
                        ? 'good'
                        : deliverable.status === 'changes_requested'
                          ? 'warn'
                          : 'info',
                    )}<span class="tiny muted">نسخة ${E(deliverable.version || 1)}</span></div>${deliverable.content ? `<p class="admin-note">${E(deliverable.content)}</p>` : ''}${deliverable.notes ? `<p class="admin-note">${E(deliverable.notes)}</p>` : ''}${deliverable.adminResponse ? `<p class="small"><strong>رد الإدارة:</strong> ${E(deliverable.adminResponse)}</p>` : ''}${action('respond-deliverable', 'الرد وتحديث التسليم', 'message', `${idAttr(project.id)} data-deliverable="${E(deliverable.id)}"`, 'btn btn-secondary btn-sm')}</article>`,
                )
                .join('')
            : empty('لا تسليمات مسجلة', 'ستظهر المواد التي تحتاج مراجعة العميل هنا.')
        }</section></div><section class="card">${sectionTitle('تواصل مرتبط بالمشروع')}<p class="muted">سجّل تحديثًا للعميل أو افتح سجل طلبات الدعم المتعلقة بالمشروع.</p><div class="row wrap gap-sm">${action('open-conversation', 'محادثة العميل', 'message', idAttr(project.clientId))}${go('support', 'طلبات الدعم', 'headphones')}</div></section>`,
    );
  }
  function hasDeliverableContent(project, item) {
    return (
      String(item.content || '').trim().length >= 10 ||
      /^https:\/\//i.test(item.url || '') ||
      /^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/i.test(item.fileData || '') ||
      (['project-1', 'project-2'].includes(project.id) &&
        ['deliverable-1', 'deliverable-2', 'deliverable-3'].includes(item.id))
    );
  }
  function completionReady(project) {
    const deliveries = (project.deliverables || []).filter((d) => d.type !== 'client_attachment');
    return (
      (project.milestones || []).length > 0 &&
      project.milestones.every((m) => m.status === 'done') &&
      deliveries.length > 0 &&
      deliveries.every((d) => d.status === 'approved' && hasDeliverableContent(project, d))
    );
  }
  function guardProjectCompletion(project) {
    A.assert(
      completionReady(project),
      'لا يكتمل المشروع قبل إنجاز جميع المراحل ووجود تسليم فعلي معتمد، دون تعديلات معلقة.',
    );
  }
  function projectModal(id) {
    const project = find(A.state(), 'projects', id);
    if (!project) return fail('المشروع غير موجود.');
    A.modal(
      'تحديث حالة المشروع',
      form(
        'save-project',
        `<div class="form-grid">${input('عنوان المشروع', 'title', project.title, 'text', 'required minlength="3" maxlength="150"')}${input('مدير المشروع', 'manager', project.manager || '', 'text', 'maxlength="80"')}${select('الحالة', 'status', projectStatuses, project.status)}${select('المرحلة', 'stage', projectStages, project.stage)}${input('التقدم %', 'progress', project.progress, 'number', 'required min="0" max="100" step="1"')}${input('موعد التسليم — يحدد بعد التخطيط', 'dueDate', project.dueDate || '', 'date')}</div><p class="small muted">اكتمال المشروع ونسبة 100% يتطلبان إنجاز جميع المراحل واعتماد تسليمات فعلية. لا يغيّر هذا النموذج سجل المراحل تلقائيًا.</p>`,
        project.id,
      ),
    );
  }
  function saveProject({ form: node, data }) {
    if (!find(A.state(), 'projects', node.dataset.id)) return fail('المشروع غير موجود.');
    const value = Number(data.progress);
    if (
      !projectStatuses[data.status] ||
      !projectStages[data.stage] ||
      !Number.isFinite(value) ||
      value < 0 ||
      value > 100 ||
      String(data.title || '').trim().length < 3
    )
      return fail('راجع حالة المشروع والتقدم والعنوان.');
    persist(
      'تحديث حالة وتسليم المشروع',
      (s) => {
        const project = find(s, 'projects', node.dataset.id);
        A.assert(project, 'المشروع لم يعد موجودًا.');
        A.assert(
          (data.status === 'completed') === (value === 100),
          'نسبة 100% وحالة مكتمل يجب أن تتطابقا؛ استخدم نسبة أقل للمشروع الجاري.',
        );
        if (data.status === 'completed') guardProjectCompletion(project);
        if (data.stage !== project.stage) {
          const stageIndex = Object.keys(projectStages).indexOf(data.stage);
          A.assert(
            (project.milestones || []).slice(0, stageIndex).every((m) => m.status === 'done'),
            'أنجز المراحل السابقة أولًا قبل الانتقال إلى هذه المرحلة.',
          );
        }
        A.assert(data.status !== 'planning' || value === 0, 'المشروع قيد التخطيط يبدأ بنسبة صفر.');
        Object.assign(project, {
          title: String(data.title).trim(),
          manager: String(data.manager || '').trim(),
          status: data.status,
          stage: data.stage,
          progress: value,
          dueDate: data.dueDate || null,
        });
        if (data.status === 'completed') project.completedAt = stamp();
        notify(
          s,
          'client',
          'تحديث مشروعك',
          `${project.title}: ${projectStatuses[project.status]}`,
          {
            clientId: project.clientId,
          },
        );
      },
      'حُفظت حالة المشروع وفق المراحل والاعتمادات المسجلة.',
    );
  }
  function editMilestone({ el }) {
    const project = find(A.state(), 'projects', el.dataset.id),
      milestone = project?.milestones?.find((m) => m.id === el.dataset.milestone);
    if (!milestone) return fail('المرحلة غير موجودة.');
    A.modal(
      'تحديث مرحلة العمل',
      form(
        'save-milestone',
        `<input type="hidden" name="milestoneId" value="${E(milestone.id)}">${input('اسم المرحلة', 'title', milestone.title, 'text', 'required minlength="2" maxlength="120"')}${select(
          'الحالة',
          'status',
          {
            pending: 'لاحقًا',
            active: 'جارية',
            done: 'مكتملة',
          },
          milestone.status,
        )}${input('موعد المرحلة', 'date', milestone.date, 'date', 'required')}<p class="small muted">يُحسب التقدم هنا من نسبة المراحل المكتملة بعد الحفظ.</p>`,
        project.id,
      ),
    );
  }
  function saveMilestone({ form: node, data }) {
    const project = find(A.state(), 'projects', node.dataset.id);
    if (
      !project?.milestones?.find((m) => m.id === data.milestoneId) ||
      !['pending', 'active', 'done'].includes(data.status)
    )
      return fail('المرحلة أو حالتها غير صحيحة.');
    persist(
      'تحديث مرحلة مشروع',
      (s) => {
        const record = find(s, 'projects', project.id),
          index = record?.milestones?.findIndex((m) => m.id === data.milestoneId);
        A.assert(record && index >= 0, 'تغيّرت مراحل المشروع؛ أعد فتح النموذج.');
        A.assert(
          data.status === 'pending' ||
            record.milestones.slice(0, index).every((m) => m.status === 'done'),
          'يجب إنهاء المراحل السابقة قبل تشغيل أو إغلاق هذه المرحلة.',
        );
        const milestone = record.milestones[index];
        A.assert(String(data.title || '').trim().length >= 2, 'اكتب اسمًا واضحًا للمرحلة.');
        Object.assign(milestone, {
          title: String(data.title || '').trim(),
          status: data.status,
          date: data.date || null,
        });
        const done = record.milestones.filter((m) => m.status === 'done').length;
        if (completionReady(record)) {
          record.progress = 100;
          record.status = 'completed';
          record.stage = 'launch';
          record.completedAt = stamp();
        } else {
          record.progress = Math.min(99, Math.round((done / record.milestones.length) * 100));
          record.status =
            done === record.milestones.length
              ? 'waiting_client'
              : done === 0 && data.status === 'pending'
                ? 'planning'
                : 'active';
          const currentIndex = record.milestones.findIndex((m) => m.status !== 'done');
          record.stage =
            Object.keys(projectStages)[currentIndex < 0 ? 5 : currentIndex] || record.stage;
        }
        notify(s, 'client', 'تحديث مرحلة المشروع', `${record.title}: ${milestone.title}`, {
          clientId: record.clientId,
        });
      },
      'تحدثت المرحلة؛ الإغلاق النهائي ينتظر اكتمال العمل واعتماد التسليمات.',
    );
  }
  function deliverableInputs(item = {}) {
    return `${textarea('محتوى التسليم أو وصف التغييرات الفعلية', 'content', item.content || '', 'maxlength="10000"')}${input('رابط HTTPS للملف أو المعاينة — اختياري', 'url', item.url || '', 'url', 'maxlength="1500"')}<label class="field"><span>ملف صورة أو PDF — اختياري، حتى 500 كيلوبايت</span><input type="file" name="file" accept="image/png,image/jpeg,image/webp,application/pdf"></label>`;
  }
  function newDeliverable({ el }) {
    const project = find(A.state(), 'projects', el.dataset.id);
    if (!project) return fail('المشروع غير موجود.');
    if (project.status === 'completed')
      return fail('أعد فتح المشروع أولًا قبل إضافة نطاق أو تسليم جديد.');
    A.modal(
      'إضافة تسليم للمراجعة',
      form(
        'save-deliverable',
        `${input('عنوان التسليم', 'title', '', 'text', 'required minlength="3" maxlength="120"')}${select(
          'نوع التسليم',
          'type',
          {
            document: 'مستند ومحتوى',
            design: 'تصميم ومعاينة',
          },
          'document',
        )}${select('المرحلة المرتبطة', 'stage', projectStages, project.stage)}${deliverableInputs()}<p class="small muted">أضف محتوى واضحًا أو ملفًا أو رابطًا فعليًا. سيظهر هذا التسليم للعميل بحالة بانتظار المراجعة.</p>`,
        project.id,
        'إرسال للمراجعة',
      ),
      {
        wide: true,
      },
    );
  }
  async function readDeliverableFile(node) {
    const file = node.querySelector('input[name="file"]')?.files?.[0];
    if (!file) return {};
    A.assert(
      ['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type) &&
        file.size <= 500 * 1024,
      'اختر صورة أو PDF لا يتجاوز 500 كيلوبايت.',
    );
    const fileData = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('تعذر قراءة الملف.'));
      reader.readAsDataURL(file);
    });
    return {
      fileData,
      fileName: file.name.slice(0, 150),
      fileType: file.type,
    };
  }
  function checkedDeliverableInput(data, file) {
    const content = String(data.content || '').trim(),
      url = String(data.url || '').trim();
    A.assert(!url || /^https:\/\//i.test(url), 'استخدم رابط HTTPS صالحًا.');
    if (url) {
      const parsed = new URL(url);
      A.assert(!parsed.username && !parsed.password, 'لا تضع بيانات دخول داخل رابط التسليم.');
    }
    A.assert(
      content.length >= 30 || url || file.fileData,
      'أضف محتوى مفيدًا من 30 حرفًا أو رابطًا أو ملفًا فعليًا.',
    );
    return {
      content,
      url,
      ...file,
    };
  }
  async function saveDeliverable({ form: node, data }) {
    let payload;
    try {
      payload = checkedDeliverableInput(data, await readDeliverableFile(node));
    } catch (error) {
      return fail(error.userMessage || error.message);
    }
    if (
      String(data.title || '').trim().length < 3 ||
      !['document', 'design'].includes(data.type) ||
      !projectStages[data.stage]
    )
      return fail('راجع عنوان التسليم ونوعه ومرحلته.');
    const requestId = node.dataset.requestId || (node.dataset.requestId = A.id('delivery'));
    persist(
      'إضافة تسليم فعلي لمراجعة العميل',
      (state) => {
        const project = find(state, 'projects', node.dataset.id);
        A.assert(project && project.status !== 'completed', 'تغيّرت حالة المشروع؛ أعد فتحه.');
        project.deliverables ||= [];
        A.assert(
          !project.deliverables.some((item) => item.requestId === requestId),
          'أُضيف هذا التسليم بالفعل.',
        );
        project.deliverables.push({
          id: A.id('deliverable'),
          requestId,
          title: String(data.title).trim(),
          type: data.type,
          stage: data.stage,
          version: 1,
          status: 'pending',
          notes: '',
          submittedAt: stamp(),
          history: [],
          ...payload,
        });
        project.status = 'waiting_client';
        project.progress = Math.min(99, N(project.progress));
        notify(state, 'client', 'تسليم جديد للمراجعة', data.title, {
          clientId: project.clientId,
        });
      },
      'أُضيف التسليم بمحتواه وأصبح متاحًا للعميل.',
    );
  }
  function respondDeliverable({ el }) {
    const project = find(A.state(), 'projects', el.dataset.id),
      deliverable = project?.deliverables?.find((d) => d.id === el.dataset.deliverable);
    if (!deliverable) return fail('التسليم غير موجود.');
    A.modal(
      'الرد على مراجعة العميل',
      form(
        'save-deliverable-response',
        `<input type="hidden" name="deliverableId" value="${E(deliverable.id)}"><input type="hidden" name="expectedVersion" value="${E(deliverable.version || 1)}"><h3>${E(deliverable.title)}</h3><p class="admin-note">${E(deliverable.notes || 'لا ملاحظة من العميل بعد.')}</p>${textarea('رد الإدارة والخطوة التالية', 'response', '', 'required minlength="6" maxlength="2500"')}${select(
          'إجراء المتابعة',
          'resolution',
          {
            response: 'تسجيل رد فقط',
            resubmit: 'تقديم محتوى معدل بنسخة جديدة',
          },
          'response',
        )}${deliverableInputs(deliverable)}<p class="small muted">الرد وحده لا يرفع رقم النسخة. إعادة الطرح تتطلب محتوى أو رابطًا أو ملفًا جديدًا، وتحفظ النسخة السابقة.</p>`,
        project.id,
        'حفظ الرد والتسليم',
      ),
      {
        wide: true,
      },
    );
  }
  async function saveDeliverableResponse({ form: node, data }) {
    const project = find(A.state(), 'projects', node.dataset.id),
      response = String(data.response || '').trim();
    if (
      !project?.deliverables?.find((d) => d.id === data.deliverableId) ||
      response.length < 6 ||
      !['response', 'resubmit'].includes(data.resolution)
    )
      return fail('راجع التسليم واكتب ردًا واضحًا.');
    let payload = null;
    if (data.resolution === 'resubmit') {
      try {
        payload = checkedDeliverableInput(data, await readDeliverableFile(node));
      } catch (error) {
        return fail(error.userMessage || error.message);
      }
    }
    persist(
      'الرد الإداري على ملاحظات تسليم المشروع',
      (s) => {
        const record = find(s, 'projects', project.id),
          deliverable = record?.deliverables?.find((d) => d.id === data.deliverableId);
        A.assert(deliverable, 'لم يعد هذا التسليم موجودًا.');
        if (data.expectedVersion)
          A.assert(
            String(deliverable.version || 1) === String(data.expectedVersion),
            'ظهرت نسخة أحدث؛ أعد مراجعتها قبل الرد.',
          );
        if (data.resolution === 'resubmit') {
          A.assert(record.status !== 'completed', 'أعد فتح المشروع قبل طرح نسخة جديدة.');
          A.assert(
            payload.content !== String(deliverable.content || '') ||
              payload.url !== String(deliverable.url || '') ||
              (payload.fileData && payload.fileData !== deliverable.fileData),
            'المحتوى لم يتغير؛ يمكنك حفظ الرد دون إنشاء نسخة جديدة.',
          );
          deliverable.history ||= [];
          deliverable.history.push({
            version: deliverable.version || 1,
            status: deliverable.status,
            notes: deliverable.notes || '',
            content: deliverable.content || '',
            url: deliverable.url || '',
            fileData: deliverable.fileData || '',
            fileName: deliverable.fileName || '',
            archivedAt: stamp(),
          });
          Object.assign(deliverable, payload);
          deliverable.status = 'pending';
          deliverable.notes = '';
          deliverable.reviewedAt = null;
          deliverable.version = N(String(deliverable.version || '1').replace(/^v/i, '')) + 1;
          deliverable.submittedAt = stamp();
          record.status = 'waiting_client';
          record.progress = Math.min(99, N(record.progress));
        }
        deliverable.adminResponse = response;
        deliverable.respondedAt = stamp();
        notify(s, 'client', 'رد جديد على مراجعة المشروع', `${deliverable.title}: ${response}`, {
          clientId: record.clientId,
        });
      },
      'حُفظ الرد والمحتوى الفعلي وأصبحا متاحين للعميل.',
    );
  }
  return {
    id: 'projects',
    routes: {
      projects: {
        nav: 'more',
        title: 'المشاريع',
        render: projects,
      },
      'project-detail': {
        nav: 'more',
        title: 'إدارة المشروع',
        render: projectDetail,
      },
    },
    actions: {
      'edit-project': ({ el }) => projectModal(el.dataset.id),
      'save-project': saveProject,
      'edit-milestone': editMilestone,
      'save-milestone': saveMilestone,
      'new-deliverable': newDeliverable,
      'save-deliverable': saveDeliverable,
      'respond-deliverable': respondDeliverable,
      'save-deliverable-response': saveDeliverableResponse,
    },
    api: {},
  };
}
