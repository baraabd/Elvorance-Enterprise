// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** client / projects: original v1.1 views and local demo actions. */
export function createProjectsFeature(context, { state }) {
  const {
    A,
    E,
    act,
    addMessage,
    area,
    badge,
    clientId,
    customer,
    date,
    error,
    go,
    heading,
    label,
    mine,
    missing,
    notify,
    now,
    num,
    owned,
    paragraph,
    projectLabels,
    reviewToken,
    section,
    stageLabels,
    wrap,
  } = context;
  const commit = (...args) => state.commit(...args);
  function projectCard(project) {
    const reviews = (project.deliverables || []).filter(
      (item) => item.status === 'pending' && item.type !== 'client_attachment',
    ).length;
    return `<button type="button" class="card card-link client-project-card" data-go="project-detail" data-id="${E(project.id)}"><div class="row-between"><span class="icon-box icon-box-dark">${A.icon(project.serviceId === 'svc-brand' ? 'sparkles' : 'monitor')}</span>${badge(label(projectLabels, project.status), project.status)}</div><h3>${E(project.title)}</h3><p class="muted small">${E(label(stageLabels, project.stage))} · التسليم ${E(date(project.dueDate))}</p><div class="row-between"><span class="small">تقدم المشروع</span><strong class="num">${Math.min(100, Math.max(0, num(project.progress)))}%</strong></div>${A.progress(num(project.progress))}<div class="row-between small"><span>${reviews ? `${reviews} عناصر للمراجعة` : 'تابع الملفات والمراحل'}</span>${A.icon('arrow-left')}</div></button>`;
  }
  function renderProjects({ state, params }) {
    const status = params.status || '';
    const projects = mine(state, 'projects').filter(
      (item) =>
        !status || (status === 'open' ? item.status !== 'completed' : item.status === status),
    );
    return wrap(
      `${heading('المشاريع', 'من فكرة إلى إطلاق', 'تابع المراحل، راجع الأعمال وشارك رأيك في الوقت المناسب.')}<div class="chips">${[
        ['', 'كل المشاريع'],
        ['open', 'قيد العمل'],
        ['waiting_client', 'تحتاج مراجعتي'],
        ['completed', 'مكتملة'],
      ]
        .map(([value, text]) =>
          go(
            text,
            'projects',
            {
              'param-status': value,
            },
            `chip ${status === value ? 'active' : ''}`,
            '',
          ),
        )
        .join(
          '',
        )}</div><div class="grid-2">${projects.map(projectCard).join('') || A.empty('لا توجد مشاريع في هذا التصنيف', 'ابدأ خدمة أو راجع كل مشاريعك.', go('كل المشاريع', 'projects'))}</div>`,
    );
  }
  function timeline(project) {
    const milestones = project.milestones || [];
    if (!milestones.length) return '<p class="muted small">لم يحدد الفريق خطة المراحل بعد.</p>';
    return `<ol class="client-stage-list">${milestones
      .map((milestone, i) => {
        const done = milestone.status === 'done';
        const active = milestone.status === 'active' && project.status !== 'planning';
        return `<li class="${done ? 'done' : active ? 'current' : ''}"><span class="client-stage-dot">${done ? A.icon('check') : String(i + 1).padStart(2, '0')}</span><div><strong>${E(milestone.title || label(stageLabels, milestone.stage))}</strong><p class="tiny muted">${done ? 'اكتملت بحسب تحديث الفريق' : active ? 'قيد العمل بحسب تحديث الفريق' : 'مخططة — لم تبدأ بعد'}</p>${milestone.date ? `<span class="tiny muted">${E(date(milestone.date))}</span>` : ''}</div>${active ? A.badge('الآن', 'good') : ''}</li>`;
      })
      .join('')}</ol>`;
  }
  function deliverableRow(project, item) {
    const attachment = item.type === 'client_attachment';
    return `<article class="client-deliverable-row"><span class="icon-box ${item.status === 'pending' && !attachment ? 'icon-box-lime' : ''}">${A.icon(attachment ? 'upload' : item.type === 'document' ? 'file' : 'image')}</span><div><strong>${E(item.title)}</strong><p class="muted tiny">${attachment ? 'مرجع أرفقته أنت' : `الإصدار ${item.version || 1}`} · ${item.status === 'approved' ? 'معتمد' : item.status === 'changes_requested' ? 'طلب تعديل' : attachment ? 'بانتظار مراجعة الفريق' : 'للمراجعة'}</p></div>${go(
      attachment ? 'الملف' : 'عرض',
      'deliverable-detail',
      {
        id: project.id,
        'param-deliverable': item.id,
      },
      'btn-ghost btn-sm',
      'eye',
    )}</article>`;
  }
  function renderProject({ state, params }) {
    const project = owned(state, 'projects', params.id);
    if (!project) return missing('المشروع غير موجود');
    const pending = (project.deliverables || []).filter(
      (item) => item.status === 'pending' && item.type !== 'client_attachment',
    );
    return wrap(
      `${heading('مساحة المشروع', project.title, `مدير المشروع: ${project.manager || 'فريق إلفورانس'} · التسليم ${date(project.dueDate)}`, badge(label(projectLabels, project.status), project.status))}<section class="card client-progress-summary"><div><p class="eyebrow">المرحلة الحالية</p><h2>${E(project.status === 'planning' ? 'خطة بانتظار البدء' : label(stageLabels, project.stage))}</h2><p class="muted small">${project.status === 'planning' ? 'المشروع مسجل بعد اعتماد العقد، ولم يبدأ التنفيذ. يحدد الفريق المسؤول والمواعيد ثم يبدأ المراحل؛ لا توجد تسليمات جاهزة بعد.' : project.status === 'completed' ? 'اكتمل المشروع. ملفاتك واتفاقك يبقيان في متناولك.' : 'نُحدّث المراحل عند إنجاز العمل، وتظهر طلبات المراجعة هنا.'}</p></div><div><strong class="hero-number num">${num(project.progress)}<small>%</small></strong>${A.progress(num(project.progress))}</div></section>${
        pending.length
          ? `<div class="notice notice-warn row-between"><div class="row">${A.icon('eye')}<div><strong>${pending.length} عناصر تحتاج رأيك</strong><p class="small">راجع النسخة المعروضة قبل الاعتماد أو طلب التعديل.</p></div></div>${go(
              'ابدأ المراجعة',
              'deliverable-detail',
              {
                id: project.id,
                'param-deliverable': pending[0].id,
              },
              'btn-primary btn-sm',
            )}</div>`
          : ''
      }<div class="dashboard-grid"><div class="main-column stack"><section class="card">${section(
        'ملفات وتسليمات المشروع',
        'كل نسخة لها حالة وقرار محفوظ.',
        act(
          'إرفاق مرجع',
          'attach-project-modal',
          {
            id: project.id,
          },
          'btn-secondary btn-sm',
          'upload',
        ),
      )}<div class="stack-sm">${(project.deliverables || []).map((item) => deliverableRow(project, item)).join('') || '<p class="muted">ستظهر الملفات عند تجهيز أول تسليم.</p>'}</div></section><section class="card">${section('تواصل مرتبط بالمشروع')}<p class="muted">التفاصيل الصغيرة تصنع فرقًا. شاركنا ملاحظاتك مع اسم المشروع لتبقى واضحة.</p><div class="row wrap">${go(
        'رسالة للفريق',
        'messages',
        {
          'param-topic': project.title,
        },
        'btn-secondary',
        'message',
      )}${go(
        'طلب مساعدة',
        'new-ticket',
        {
          'param-project': project.id,
        },
        'btn-ghost',
        'headphones',
      )}${
        project.contractId
          ? go(
              'العقد',
              'contract-detail',
              {
                id: project.contractId,
              },
              'btn-ghost',
              'file',
            )
          : ''
      }</div></section></div><aside class="side-column"><section class="card">${section('رحلة التنفيذ')}${timeline(project)}</section></aside></div>`,
    );
  }
  function designPreview(state, project, deliverable) {
    const client = customer(state);
    const safeUrl = /^https:\/\//i.test(String(deliverable.url || ''))
      ? String(deliverable.url)
      : '';
    const content = `${deliverable.content ? `<p>${paragraph(deliverable.content)}</p>` : ''}${safeUrl ? `<a class="btn btn-secondary" href="${E(safeUrl)}" target="_blank" rel="noopener noreferrer">فتح رابط التسليم</a>` : ''}`;
    if (deliverable.fileData) {
      const safeImage = /^data:image\/(png|jpeg|webp);base64,/i.test(deliverable.fileData);
      return safeImage
        ? `<div class="client-file-preview"><img src="${E(deliverable.fileData)}" alt="${E(deliverable.title)}">${content}</div>`
        : `<div class="client-document-preview"><span class="icon-box icon-box-dark">${A.icon('file')}</span><h3>${E(deliverable.fileName || deliverable.title)}</h3><p>${E(deliverable.fileType || 'ملف محلي')}</p>${content}${act(
            'تنزيل الملف المحلي',
            'download-attachment',
            {
              id: project.id,
              deliverable: deliverable.id,
            },
            'btn-secondary',
            'download',
          )}</div>`;
    }
    if (content)
      return `<div class="client-document-preview"><span class="icon-box icon-box-lime">${A.icon('file')}</span><h2>${E(deliverable.title)}</h2>${content}</div>`;
    if (project.id === 'project-2' && deliverable.id === 'deliverable-3')
      return `<div class="client-brand-proof"><p class="small">اتجاه الهوية البصرية · النسخة ${E(deliverable.version || 1)}</p><div class="client-brand-mark">م<span>●</span></div><h2>${E(client?.name || 'مدار')}</h2><p>مساحة تجمعنا.</p><div class="client-brand-colors"><span style="background:#173a2d"></span><span style="background:#dfc8a6"></span><span style="background:#faf6ee"></span></div><p class="tiny">الشعار / لوحة الألوان / تطبيق رقمي توضيحي</p></div>`;
    if (project.id === 'project-1' && deliverable.id === 'deliverable-1')
      return `<div class="client-proof-browser"><div class="client-proof-chrome"><i></i><i></i><i></i><span>معاينة تصميم · ${E(deliverable.version || 1)} — ليست موقعًا منشورًا</span></div><div class="client-cafe-proof"><header><strong>مـدار<span>café & moments</span></strong><span class="tiny">المكان · القائمة · تواصل</span></header><div class="client-cafe-hero"><div><p class="tiny">قهوة مختارة. لحظات أهدأ.</p><h2>خذ وقتك.<br>أنت في مدار.</h2><p class="small">مساحتك اليومية للقهوة الطيبة،<br>والأحاديث التي تستحق وقتها.</p><span class="client-proof-pill">اكتشف قائمتنا ←</span></div><svg viewBox="0 0 200 230" role="img" aria-label="تصور توضيحي لفنجان قهوة"><ellipse cx="95" cy="195" rx="75" ry="18" fill="#b49a74" opacity=".2"/><ellipse cx="90" cy="167" rx="62" ry="18" fill="#e6d9c5"/><path d="M140 75h15q43 5 25 50q-12 17-38 8" fill="none" stroke="#f7f2e8" stroke-width="16"/><path d="M30 67h115l-8 83q-8 28-49 28t-49-28z" fill="#f7f2e8"/><ellipse cx="87" cy="68" rx="57" ry="17" fill="#ded1bb"/><ellipse cx="87" cy="68" rx="49" ry="12" fill="#5a3523"/><path d="M73 67q14-17 30 0q-10 14-30 0" fill="#dbc39a"/><path d="M65 43q-13-17 0-32M95 43q-13-17 0-32M122 43q-13-17 0-32" stroke="#f7f2e8" stroke-width="4" fill="none" opacity=".7"/></svg></div><div class="client-cafe-features"><div><strong>01</strong><span>حبوب مختارة بعناية</span></div><div><strong>02</strong><span>مساحة تلتقي فيها الأفكار</span></div><div><strong>03</strong><span>في قلب حلب</span></div></div><footer>مقهى مدار <span>كل يوم، بداية جديدة.</span></footer></div></div>`;
    return `<div class="client-document-preview"><span class="icon-box icon-box-lime">${A.icon('layers')}</span><p class="eyebrow">تسليم مشروع · إصدار ${E(deliverable.version || 1)}</p><h2>${E(deliverable.title)}</h2><p>${paragraph(deliverable.notes || 'راجع تفاصيل هذا التسليم مع الفريق قبل اعتماد المرحلة.')}</p><div class="divider"></div><p class="small muted">${E(project.title)}</p></div>`;
  }
  function renderDeliverable({ state, params }) {
    const project = owned(state, 'projects', params.id);
    const item = project?.deliverables?.find((entry) => entry.id === params.deliverable);
    if (!project || !item) return missing('النسخة المطلوبة غير موجودة');
    const attachment = item.type === 'client_attachment';
    return wrap(
      `${heading(
        project.title,
        item.title,
        `النسخة ${item.version || 1}`,
        go(
          'المشروع',
          'project-detail',
          {
            id: project.id,
          },
          'btn-ghost',
          'arrow-right',
        ),
      )}<div class="client-review-layout"><div class="stack">${designPreview(state, project, item)}${item.notes ? `<section class="card"><h3>سياق النسخة وملاحظاتها</h3><p class="small">${paragraph(item.notes)}</p></section>` : ''}${item.adminResponse ? `<section class="card notice-good"><h3>رد فريق المشروع</h3><p>${paragraph(item.adminResponse)}</p>${item.respondedAt ? `<p class="tiny muted">${E(date(item.respondedAt))}</p>` : ''}</section>` : ''}</div><aside class="stack"><section class="card"><div class="row-between"><h3>${attachment ? 'مرجعك للمشروع' : 'قرارك على هذه النسخة'}</h3>${badge(item.status === 'approved' ? 'معتمد' : item.status === 'changes_requested' ? 'طلب تعديل' : 'للمراجعة', item.status)}</div><p class="muted small">${attachment ? 'هذا المرجع محفوظ محليًا ضمن المشروع التجريبي.' : 'راجع الاتجاه البصري والمحتوى والنطاق. الموافقة تحفظ قرارك لهذه النسخة فقط.'}</p>${
        !attachment && item.status !== 'approved'
          ? `<div class="stack-sm">${act(
              'أعتمد هذه النسخة',
              'approve-deliverable',
              {
                id: project.id,
                deliverable: item.id,
              },
              'btn-primary btn-block',
              'check',
            )}${act(
              'أطلب تعديلات',
              'revise-deliverable-modal',
              {
                id: project.id,
                deliverable: item.id,
              },
              'btn-secondary btn-block',
              'edit',
            )}</div>`
          : !attachment
            ? '<div class="notice notice-good small">تم حفظ اعتمادك. يتابع الفريق الخطوة التالية في خطة المشروع.</div>'
            : ''
      }${
        item.fileData
          ? act(
              'تنزيل المرفق',
              'download-attachment',
              {
                id: project.id,
                deliverable: item.id,
              },
              'btn-secondary btn-block',
              'download',
            )
          : act(
              'نسخة للمراجعة والطباعة',
              'print-deliverable',
              {
                id: project.id,
                deliverable: item.id,
              },
              'btn-ghost btn-block',
              'download',
            )
      }</section>${go(
        'ناقش مع الفريق',
        'messages',
        {
          'param-topic': item.title,
        },
        'btn-secondary btn-block',
        'message',
      )}</aside></div>`,
    );
  }
  function getDeliverable(state, projectId, deliverableId) {
    const project = owned(state, 'projects', projectId);
    const item = project?.deliverables?.find((entry) => entry.id === deliverableId);
    return {
      project,
      item,
    };
  }
  function approveDeliverable({ el }) {
    const { project, item } = getDeliverable(A.state(), el.dataset.id, el.dataset.deliverable);
    if (!project || !item || item.type === 'client_attachment' || item.status === 'approved')
      return error('هذه النسخة غير متاحة للاعتماد.');
    const reviewed = reviewToken(item);
    A.confirm(
      'اعتماد هذه النسخة؟',
      `سيُحفظ اعتمادك لنسخة ${item.version || 1} من «${item.title}». راجع المعاينة قبل التأكيد.`,
      () => {
        commit(
          (next) => {
            const current = getDeliverable(next, project.id, item.id);
            A.assert(
              current.item &&
                current.item.type !== 'client_attachment' &&
                current.item.status !== 'approved' &&
                reviewToken(current.item) === reviewed,
              'تغيرت نسخة التسليم. افتح المعاينة الحالية قبل الاعتماد.',
            );
            current.item.status = 'approved';
            current.item.approvedAt = now();
            current.item.approvedBy = clientId(next);
            current.item.notes =
              `${current.item.notes || ''}\nاعتمد العميل هذه النسخة بتاريخ ${A.today()}.`.trim();
            const pending = current.project.deliverables.some(
              (entry) => entry.status === 'pending' && entry.type !== 'client_attachment',
            );
            if (!pending && current.project.status === 'waiting_client')
              current.project.status = 'active';
            notify(
              next,
              'اعتمد العميل تسليمًا',
              `${customer(next)?.name}: ${item.title} — ${project.title}`,
            );
          },
          `اعتمد العميل ${item.title} — نسخة ${item.version || 1}`,
          {
            message: 'حُفظ اعتماد النسخة وأُخطر الفريق داخل التجربة.',
          },
        );
      },
    );
  }
  function revisionModal({ el }) {
    const { project, item } = getDeliverable(A.state(), el.dataset.id, el.dataset.deliverable);
    if (!project || !item || item.status === 'approved' || item.type === 'client_attachment')
      return error('هذه النسخة غير متاحة لطلب تعديل.');
    A.modal(
      'ملاحظات تساعدنا على التحسين',
      `<form class="stack" data-submit="revise-deliverable"><input type="hidden" name="projectId" value="${E(project.id)}"><input type="hidden" name="deliverableId" value="${E(item.id)}"><input type="hidden" name="reviewToken" value="${E(reviewToken(item))}"><p class="muted small">${E(item.title)} · النسخة ${E(item.version || 1)}</p>${area(
        'ما الذي تريد تغييره تحديدًا؟',
        'reason',
        '',
        {
          minlength: 12,
          placeholder: 'اذكر الجزء، التغيير المطلوب والسبب. مثال: أريد تكبير زر الحجز في الواجهة.',
        },
      )}<button class="btn btn-primary" type="submit">${A.icon('edit')}حفظ طلب التعديل</button></form>`,
    );
  }
  function reviseDeliverable({ data }) {
    const { project, item } = getDeliverable(A.state(), data.projectId, data.deliverableId);
    const reason = String(data.reason || '').trim();
    if (!project || !item || item.status === 'approved' || item.type === 'client_attachment')
      return error('النسخة المطلوبة غير متاحة للتعديل.');
    if (reason.length < 12) return error('أضف ملاحظة محددة تساعد الفريق على التنفيذ.');
    if (data.reviewToken !== reviewToken(item))
      return error('تغيرت نسخة التسليم. راجعها قبل إرسال الملاحظات.');
    commit(
      (next) => {
        const current = getDeliverable(next, project.id, item.id);
        A.assert(
          current.item &&
            current.item.type !== 'client_attachment' &&
            current.item.status !== 'approved' &&
            reviewToken(current.item) === data.reviewToken,
          'تغيرت نسخة التسليم. راجع النسخة الحالية.',
        );
        current.item.status = 'changes_requested';
        current.item.revisionRequestedAt = now();
        current.item.notes =
          `${current.item.notes || ''}\nتعديل طلبه العميل (${A.today()}): ${reason}`.trim();
        if (current.project.status === 'waiting_client') current.project.status = 'active';
        notify(
          next,
          'ملاحظات جديدة على التسليم',
          `${customer(next)?.name}: ${item.title} — ${reason}`,
        );
        addMessage(next, `ملاحظتي على «${item.title}» في مشروع «${project.title}»: ${reason}`);
      },
      `طلب العميل تعديل ${item.title}`,
      {
        message: 'حُفظت ملاحظتك على نفس النسخة ووصلت إلى مساحة الفريق.',
      },
    );
  }
  function attachmentModal({ el }) {
    const project = owned(A.state(), 'projects', el.dataset.id);
    if (!project) return error('المشروع غير موجود.');
    if (
      (project.deliverables || []).filter((item) => item.type === 'client_attachment').length >= 3
    )
      return error('الحد الأقصى ثلاثة مرفقات محلية لكل مشروع.');
    A.modal(
      'إرفاق مرجع للمشروع',
      `<form class="stack" data-submit="attach-project"><input type="hidden" name="projectId" value="${E(project.id)}"><div class="notice"><p class="small">صورة PNG / JPEG / WebP أو PDF، حتى 500 كيلوبايت. يُحفظ الملف داخل هذا المتصفح فقط، ولا يُرفع إلى خادم. ثلاثة مرفقات لكل مشروع.</p></div><label class="field"><span>الملف</span><input class="input" type="file" name="attachment" accept="image/png,image/jpeg,image/webp,application/pdf" required></label>${area(
        'ما الذي تريد أن ينتبه إليه الفريق؟',
        'notes',
        '',
        {
          required: false,
          rows: 3,
        },
      )}<button class="btn btn-primary" type="submit">${A.icon('upload')}حفظ المرفق محليًا</button></form>`,
    );
  }
  async function attachProject({ data, form }) {
    const file = form.elements.attachment?.files?.[0];
    const project = owned(A.state(), 'projects', data.projectId);
    if (!project || !file) return error('اختر ملفًا لمشروعك.');
    if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf'].includes(file.type))
      return error('يسمح بالصور المحددة وPDF فقط.');
    if (file.size > 500 * 1024) return error('حجم الملف أكبر من 500 كيلوبايت. استخدم نسخة أصغر.');
    if (!file.size) return error('الملف فارغ. اختر ملفًا صالحًا.');
    if (
      (project.deliverables || []).filter((item) => item.type === 'client_attachment').length >= 3
    )
      return error('وصلت إلى حد المرفقات لهذا المشروع.');
    const submit = form.querySelector('button[type="submit"]');
    if (submit) submit.disabled = true;
    try {
      const fileData = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(new Error('File read failed'));
        reader.readAsDataURL(file);
      });
      const attachmentId = A.id('attachment');
      commit(
        (next) => {
          const current = owned(next, 'projects', project.id);
          if (!current) throw new Error('Project unavailable');
          current.deliverables ||= [];
          if (current.deliverables.filter((item) => item.type === 'client_attachment').length >= 3)
            throw new Error('Attachment limit');
          current.deliverables.push({
            id: attachmentId,
            title: file.name.slice(0, 150),
            type: 'client_attachment',
            status: 'pending',
            version: 1,
            notes: String(data.notes || '').trim(),
            fileName: file.name.slice(0, 150),
            fileType: file.type,
            fileData,
            uploadedAt: now(),
            uploadedBy: clientId(next),
          });
          notify(
            next,
            'مرجع جديد للمشروع',
            `${customer(next)?.name} أرفق ملفًا محليًا في ${current.title}.`,
          );
        },
        `أرفق العميل مرجعًا في ${project.title}`,
        {
          message: 'حُفظ الملف محليًا. يمكنك معاينته وتنزيله من المشروع.',
        },
      );
    } catch (err) {
      error('تعذر قراءة الملف أو حفظه. جرّب ملفًا أصغر.');
    } finally {
      if (submit?.isConnected) submit.disabled = false;
    }
  }
  function downloadAttachment({ el }) {
    const { item } = getDeliverable(A.state(), el.dataset.id, el.dataset.deliverable);
    if (
      !item ||
      !/^data:(image\/(png|jpeg|webp)|application\/pdf);base64,/i.test(item.fileData || '')
    )
      return error('هذا المرفق غير متاح للتنزيل.');
    const anchor = document.createElement('a');
    anchor.href = item.fileData;
    anchor.download = item.fileName || item.title || 'elvorance-attachment';
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    A.toast('جهّز المتصفح تنزيل المرفق المحلي.', 'info');
  }
  function printDeliverable({ el }) {
    const state = A.state();
    const { project, item } = getDeliverable(state, el.dataset.id, el.dataset.deliverable);
    if (!project || !item) return error('التسليم غير موجود.');
    A.printDocument(
      `مراجعة ${item.title}`,
      `<p>${E(project.title)} · النسخة ${E(item.version || 1)}</p>${designPreview(state, project, item)}<p>${paragraph(item.notes || '')}</p><p>الحالة: ${E(item.status === 'approved' ? 'معتمد' : item.status === 'changes_requested' ? 'طلب تعديل' : 'قيد المراجعة')}</p>`,
    );
  }
  return {
    id: 'projects',
    routes: {
      projects: {
        title: 'مشاريعي',
        nav: 'projects',
        render: renderProjects,
      },
      'project-detail': {
        title: 'مساحة المشروع',
        nav: 'projects',
        render: renderProject,
      },
      'deliverable-detail': {
        title: 'مراجعة التسليم',
        nav: 'projects',
        render: renderDeliverable,
      },
    },
    actions: {
      'approve-deliverable': approveDeliverable,
      'revise-deliverable-modal': revisionModal,
      'revise-deliverable': reviseDeliverable,
      'attach-project-modal': attachmentModal,
      'attach-project': attachProject,
      'download-attachment': downloadAttachment,
      'print-deliverable': printDeliverable,
    },
    api: {
      projectCard,
    },
  };
}
