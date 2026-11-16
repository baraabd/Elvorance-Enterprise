// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** client / messages: original v1.1 views and local demo actions. */
export function createMessagesFeature(context, { state }) {
  const {
    A,
    E,
    addMessage,
    area,
    customer,
    error,
    go,
    heading,
    list,
    mine,
    notify,
    paragraph,
    wrap,
  } = context;
  const commit = (...args) => state.commit(...args);
  function renderMessages({ state, params }) {
    const client = customer(state);
    const rep = list(state, 'reps').find((item) => item.id === client?.repId);
    const messages = mine(state, 'messages')
      .slice()
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return wrap(
      `${heading('المحادثات', 'مساحة واحدة مع فريقك', 'الرسائل محفوظة محليًا ومشتركة بين تطبيقات العرض التجريبي.', go('الدعم', 'support', {}, 'btn-secondary', 'headphones'))}<section class="card client-chat-card"><div class="row">${A.avatar(rep?.name || 'فريق إلفورانس')}<div><h3>${E(rep?.name || 'فريق إلفورانس')}</h3><p class="small muted">المندوب المسؤول · ${E(client?.name)}</p></div></div><div class="divider"></div><div class="client-message-list" id="client-messages">${
        messages
          .map(
            (message) =>
              `<article class="message-bubble ${message.from === 'client' ? 'message-bubble-own' : ''}"><div class="row-between tiny muted"><span>${message.from === 'client' ? 'أنت' : message.from === 'rep' ? E(rep?.name || 'مندوبك') : 'فريق الإدارة'}</span><span>${E(
                A.date(message.at, {
                  time: true,
                }),
              )}</span></div><p>${paragraph(message.text)}</p></article>`,
          )
          .join('') ||
        '<div class="empty-state"><p>ابدأ المحادثة. شارك السؤال أو الفكرة التي تشغلك.</p></div>'
      }</div><form class="stack-sm client-chat-composer" data-submit="send-message"><input type="hidden" name="requestId" value="${E(A.id('msg'))}">${params.topic ? `<p class="small muted">بخصوص: ${E(params.topic)}</p>` : ''}<input type="hidden" name="topic" value="${E(params.topic || '')}">${area(
        'رسالتك',
        'message',
        '',
        {
          minlength: 2,
          rows: 3,
          maxlength: 2000,
          placeholder: 'اكتب رسالتك للفريق…',
        },
      )}<div class="row-between"><span class="tiny muted">لا يتم إرسال بريد أو رسالة خارجية.</span><button class="btn btn-primary" type="submit">${A.icon('send')}إرسال</button></div></form></section>`,
    );
  }
  function sendMessage({ data }) {
    const text = String(data.message || '').trim();
    if (text.length < 2 || text.length > 2000) return error('اكتب رسالة بين حرفين و2000 حرف.');
    commit(
      (next) => {
        A.assert(
          !list(next, 'messages').some((message) => message.id === data.requestId),
          'هذه الرسالة محفوظة بالفعل.',
        );
        addMessage(
          next,
          `${data.topic ? `بخصوص ${String(data.topic).slice(0, 250)}:\n` : ''}${text}`,
          data.requestId || A.id('msg'),
        );
        notify(next, 'رسالة جديدة من العميل', `${customer(next)?.name}: ${text.slice(0, 120)}`);
      },
      'أرسل العميل رسالة داخل التجربة',
      {
        route: 'messages',
        message: 'حُفظت الرسالة في مساحة الفريق. لا إرسال خارجي.',
      },
    );
  }
  return {
    id: 'messages',
    routes: {
      messages: {
        title: 'المحادثات',
        nav: 'account',
        render: renderMessages,
      },
    },
    actions: {
      'open-messages': () => A.go('messages'),
      'send-message': sendMessage,
    },
    api: {},
  };
}
