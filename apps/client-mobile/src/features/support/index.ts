// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** client / support: original v1.1 views and local demo actions. */
export function createSupportFeature(context, { state }) {
  const {
    A,
    E,
    area,
    badge,
    categoryLabels,
    clientId,
    customer,
    date,
    error,
    field,
    go,
    heading,
    label,
    list,
    mine,
    missing,
    notify,
    now,
    owned,
    paragraph,
    select,
    ticketLabels,
    wrap,
  } = context;
  const commit = (...args) => state.commit(...args);
  function renderSupport({ state }) {
    const tickets = mine(state, 'tickets')
      .slice()
      .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    return wrap(
      `${heading('نحن معك', 'مركز المساعدة', 'كل طلب له سياق، حالة ومحادثة واضحة.', go('طلب مساعدة جديد', 'new-ticket', {}, 'btn-primary', 'plus'))}<section class="hero hero-lime"><div class="row"><span class="icon-box icon-box-dark">${A.icon('headphones')}</span><div><h2>دعنا نحلها معك.</h2><p>اربط استفسارك بمشروعك ليصل السياق كاملًا إلى الفريق.</p></div></div></section><div class="stack-sm">${
        tickets
          .map(
            (ticket) =>
              `<article class="card row-between"><div><p class="eyebrow">${E(label(categoryLabels, ticket.category))}</p><h3>${E(ticket.title)}</h3><p class="small muted">${E(date(ticket.createdAt))} · ${(ticket.messages || []).length} رسائل</p></div><div class="stack-sm">${badge(label(ticketLabels, ticket.status), ticket.status)}${go(
                'فتح الطلب',
                'ticket-detail',
                {
                  id: ticket.id,
                },
                'btn-secondary btn-sm',
              )}</div></article>`,
          )
          .join('') ||
        A.empty(
          'لا توجد تذاكر مساعدة',
          'عندما تحتاجنا، افتح طلبًا وحدد التفاصيل.',
          go('طلب جديد', 'new-ticket', {}, 'btn-primary', 'plus'),
        )
      }</div>`,
    );
  }
  function renderNewTicket({ state, params }) {
    return wrap(
      `${heading('طلب مساعدة', 'ما الذي نساعدك فيه؟', 'صف ما حدث، وما النتيجة التي تتوقعها.')}<form class="card stack" data-submit="create-ticket"><input type="hidden" name="requestId" value="${E(A.id('ticket'))}">${field(
        'عنوان واضح للطلب',
        'title',
        '',
        {
          minlength: 5,
          placeholder: 'مثال: تعديل النص الرئيسي في الموقع',
        },
      )}<div class="form-grid">${select('التصنيف', 'category', Object.entries(categoryLabels), 'project')}${select(
        'الأولوية',
        'priority',
        [
          ['normal', 'عادية'],
          ['high', 'عالية — تعيق العمل'],
        ],
        'normal',
      )}${select('المشروع المرتبط', 'projectId', [['', 'استفسار غير مرتبط بمشروع'], ...mine(state, 'projects').map((project) => [project.id, project.title])], params.project || '', false)}</div>${area(
        'التفاصيل',
        'message',
        '',
        {
          minlength: 15,
          placeholder: 'أضف الخطوات، اسم الصفحة أو النسخة، والتغيير الذي تحتاجه.',
        },
      )}<div class="form-actions"><button class="btn btn-primary" type="submit">${A.icon('send')}إنشاء الطلب التجريبي</button>${go('إلغاء', 'support', {}, 'btn-ghost')}</div></form>`,
    );
  }
  function renderTicket({ state, params }) {
    const ticket = owned(state, 'tickets', params.id);
    if (!ticket) return missing();
    return wrap(
      `${heading(label(categoryLabels, ticket.category), ticket.title, `${ticket.id} · ${date(ticket.createdAt)}`, badge(label(ticketLabels, ticket.status), ticket.status))}${
        ticket.projectId
          ? go(
              'المشروع المرتبط',
              'project-detail',
              {
                id: ticket.projectId,
              },
              'btn-secondary',
              'monitor',
            )
          : ''
      }<section class="card stack"><div class="client-message-list">${(ticket.messages || [])
        .map(
          (message) =>
            `<article class="message-bubble ${message.role === 'client' ? 'message-bubble-own' : ''}"><div class="row-between tiny muted"><span>${message.role === 'client' ? 'أنت' : 'فريق إلفورانس'}</span><span>${E(
              A.date(message.at, {
                time: true,
              }),
            )}</span></div><p>${paragraph(message.text)}</p></article>`,
        )
        .join(
          '',
        )}</div>${ticket.status === 'resolved' ? `<div class="notice notice-good"><p>تم حل هذا الطلب. إذا بقيت ملاحظة، أعد فتحه مع توضيحها.</p></div>` : ''}<form class="stack-sm" data-submit="reply-ticket"><input type="hidden" name="requestId" value="${E(A.id('ticket-message'))}"><input type="hidden" name="ticketId" value="${E(ticket.id)}">${area(
        ticket.status === 'resolved' ? 'لماذا تريد إعادة فتح الطلب؟' : 'أضف ردك',
        'message',
        '',
        {
          minlength: 3,
          rows: 3,
        },
      )}<button type="submit" class="btn btn-primary">${A.icon('send')}${ticket.status === 'resolved' ? 'إعادة الفتح وإرسال الرد' : 'إرسال الرد'}</button></form></section>`,
    );
  }
  function createTicket({ data }) {
    if (String(data.title || '').trim().length < 5 || String(data.message || '').trim().length < 15)
      return error('أضف عنوانًا وتفاصيل توضح الطلب.');
    if (!categoryLabels[data.category] || !['normal', 'high'].includes(data.priority))
      return error('راجع التصنيف والأولوية.');
    if (data.projectId && !owned(A.state(), 'projects', data.projectId))
      return error('اختر مشروعًا من حسابك.');
    const ticketId = String(data.requestId || A.id('ticket'));
    if (mine(A.state(), 'tickets').some((item) => item.id === ticketId))
      return error('طلب المساعدة محفوظ بالفعل.');
    commit(
      (next) => {
        A.assert(
          !list(next, 'tickets').some((item) => item.id === ticketId),
          'طلب المساعدة محفوظ بالفعل.',
        );
        A.assert(
          !data.projectId || owned(next, 'projects', data.projectId),
          'المشروع غير متاح لهذا العميل.',
        );
        next.tickets.push({
          id: ticketId,
          clientId: clientId(next),
          projectId: data.projectId || null,
          title: String(data.title).trim(),
          category: data.category,
          priority: data.priority,
          status: 'open',
          messages: [
            {
              role: 'client',
              text: String(data.message).trim(),
              at: now(),
            },
          ],
          createdAt: now(),
        });
        notify(next, 'طلب مساعدة جديد', `${customer(next)?.name}: ${data.title}`);
      },
      `فتح العميل طلب مساعدة: ${data.title}`,
      {
        route: 'ticket-detail',
        params: {
          id: ticketId,
        },
        message: 'أُنشئ الطلب في مساحة الفريق المشتركة.',
      },
    );
  }
  function replyTicket({ data }) {
    const ticket = owned(A.state(), 'tickets', data.ticketId);
    const message = String(data.message || '').trim();
    if (!ticket || message.length < 3) return error('أضف ردًا واضحًا.');
    commit(
      (next) => {
        const current = owned(next, 'tickets', ticket.id);
        A.assert(current, 'طلب المساعدة غير متاح.');
        current.messages ||= [];
        A.assert(
          !current.messages.some((message) => message.id === data.requestId),
          'هذا الرد محفوظ بالفعل.',
        );
        current.messages.push({
          id: data.requestId || A.id('ticket-message'),
          role: 'client',
          text: message,
          at: now(),
        });
        if (current.status === 'resolved') current.status = 'open';
        notify(next, 'رد جديد على طلب المساعدة', `${customer(next)?.name}: ${current.title}`);
      },
      `رد العميل على ${ticket.title}`,
      {
        message: ticket.status === 'resolved' ? 'أُعيد فتح الطلب مع ردك.' : 'حُفظ ردك في الطلب.',
      },
    );
  }
  return {
    id: 'support',
    routes: {
      support: {
        title: 'مركز المساعدة',
        nav: 'account',
        render: renderSupport,
      },
      'new-ticket': {
        title: 'طلب مساعدة',
        nav: 'account',
        render: renderNewTicket,
      },
      'ticket-detail': {
        title: 'تفاصيل طلب المساعدة',
        nav: 'account',
        render: renderTicket,
      },
    },
    actions: {
      'create-ticket': createTicket,
      'reply-ticket': replyTicket,
    },
    api: {},
  };
}
