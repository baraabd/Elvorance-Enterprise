// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** admin / support: original v1.1 views and local demo actions. */
export function createSupportFeature(context, { messages, state }) {
  const {
    A,
    E,
    badge,
    customer,
    date,
    empty,
    fail,
    filter,
    find,
    form,
    go,
    list,
    missing,
    notify,
    pageTitle,
    select,
    stamp,
    textarea,
    ticketStatuses,
    ui,
    wrap,
  } = context;
  const messageBubbles = (...args) => messages.messageBubbles(...args);
  const persist = (...args) => state.persist(...args);
  function support({ state: s }) {
    const tickets = list(s, 'tickets').filter(
      (ticket) => ui.ticketStatus === 'all' || ticket.status === ui.ticketStatus,
    );
    return wrap(
      pageTitle(
        'العناية بالعملاء',
        'كل طلب له متابعة.',
        'الردود والحالة محفوظة في سجل واحد يظهر للعميل.',
      ) +
        `<div class="filter-bar">${filter('الحالة', 'ticketStatus', {
          all: 'كل الطلبات',
          ...ticketStatuses,
        })}</div><div class="grid-2">${tickets.map((ticket) => `<article class="card"><div class="row-between">${badge(ticketStatuses[ticket.status] || ticket.status, ticket.status === 'resolved' ? 'good' : 'info')}${badge(ticket.priority === 'high' ? 'أولوية عالية' : 'عادية', ticket.priority === 'high' ? 'warn' : 'neutral')}</div><h2>${E(ticket.title)}</h2><p class="small muted">${E(customer(s, ticket.clientId))} · ${E(ticket.category || 'عام')}</p><p class="small">${E((ticket.messages || []).at(-1)?.text || 'لا رسائل بعد')}</p><div class="row-between"><span class="tiny muted">${(ticket.messages || []).length} رسائل</span>${go('ticket-detail', 'فتح الطلب', 'arrow-left', ticket.id, 'btn btn-primary')}</div></article>`).join('')}</div>${!tickets.length ? empty('لا طلبات مطابقة', 'تظهر طلبات العملاء المشتركة هنا.') : ''}`,
    );
  }
  function ticketDetail({ state: s, params }) {
    const ticket = find(s, 'tickets', params.id);
    if (!ticket) return wrap(missing());
    return wrap(
      pageTitle(
        'طلب الدعم',
        ticket.title,
        `${customer(s, ticket.clientId)} · ${ticket.category || 'عام'}`,
      ) +
        `<section class="card"><div class="row-between">${badge(ticketStatuses[ticket.status], ticket.status === 'resolved' ? 'good' : 'info')}<span class="tiny muted">${E(date(ticket.createdAt))}</span></div>${messageBubbles(ticket.messages || [], true)}${form('reply-ticket', textarea('الرد على العميل', 'text', '', 'required minlength="3" maxlength="3000"') + select('حالة الطلب بعد الرد', 'status', ticketStatuses, ticket.status === 'open' ? 'in_progress' : ticket.status), ticket.id, 'إضافة الرد')}</section>`,
    );
  }
  function replyTicket({ form: node, data }) {
    const ticket = find(A.state(), 'tickets', node.dataset.id),
      text = String(data.text || '').trim();
    if (!ticket || text.length < 3 || !ticketStatuses[data.status])
      return fail('اكتب ردًا واضحًا وحدد حالة الطلب.');
    persist(
      'إضافة رد إداري إلى طلب دعم',
      (s) => {
        const record = find(s, 'tickets', ticket.id);
        if (!Array.isArray(record.messages)) record.messages = [];
        record.messages.push({
          role: 'admin',
          text,
          at: stamp(),
        });
        record.status = data.status;
        notify(s, 'client', 'رد جديد على طلب الدعم', record.title, {
          clientId: record.clientId,
        });
      },
      'حُفظ الرد في طلب الدعم المشترك.',
    );
  }
  return {
    id: 'support',
    routes: {
      support: {
        nav: 'more',
        title: 'الدعم',
        render: support,
      },
      'ticket-detail': {
        nav: 'more',
        title: 'طلب الدعم',
        render: ticketDetail,
      },
    },
    actions: {
      'reply-ticket': replyTicket,
    },
    api: {},
  };
}
