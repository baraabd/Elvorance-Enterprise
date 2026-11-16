/** admin / messages: original v1.1 views and local demo actions. */
export function createMessagesFeature(context, { state }) {
  const {
    A,
    E,
    action,
    badge,
    fail,
    find,
    form,
    go,
    idAttr,
    list,
    missing,
    notify,
    pageTitle,
    search,
    searchEmpty,
    searchable,
    stamp,
    textarea,
    wrap,
  } = context;
  const persist = (...args) => state.persist(...args);
  function messageBubbles(messages, ticket) {
    return `<div class="admin-thread">${
      messages
        .map((message) => {
          const role = ticket ? message.role : message.from;
          return `<article class="admin-message${role === 'admin' ? ' own' : ''}"><span class="tiny strong">${E(
            {
              admin: 'الإدارة',
              client: 'العميل',
              rep: 'المندوب',
            }[role] || role,
          )}</span><div>${E(message.text)}</div><small>${E(
            message.at
              ? A.date(message.at, {
                  time: true,
                })
              : '',
          )}</small></article>`;
        })
        .join('') || '<p class="muted">ابدأ محادثة مفيدة وواضحة.</p>'
    }</div>`;
  }
  function messages({ state: s }) {
    const clientsWithMessages = [...list(s, 'clients')].sort((a, b) => {
      const last = (id) =>
        list(s, 'messages')
          .filter((m) => m.clientId === id)
          .map((m) => m.at)
          .sort()
          .at(-1) || '';
      return last(b.id).localeCompare(last(a.id));
    });
    return wrap(
      pageTitle(
        'صندوق المحادثات',
        'سياق واحد لكل عميل.',
        'تواصل تجريبي مشترك بين العميل والمندوب والإدارة.',
      ) +
        `<section class="card">${search('messages', 'ابحث باسم العميل')}<div data-collection="messages">${clientsWithMessages
          .map((client) => {
            const rows = list(s, 'messages')
              .filter((message) => message.clientId === client.id)
              .sort((a, b) => String(a.at).localeCompare(String(b.at)));
            const unread = rows.filter(
              (message) => message.from === 'client' && !message.read,
            ).length;
            return `<article class="list-item" ${searchable(client.name)}><div class="row-between"><div><h3>${E(client.name)}</h3><p class="small muted">${E(rows.at(-1)?.text || 'لا رسائل بعد')}</p></div>${unread ? badge(`${unread} جديدة`, 'good') : ''}</div>${action('open-conversation', 'فتح المحادثة', 'message', idAttr(client.id), 'btn btn-secondary btn-sm')}</article>`;
          })
          .join('')}</div>${searchEmpty('messages')}</section>`,
    );
  }
  function conversation({ state: s, params }) {
    const client = find(s, 'clients', params.id);
    if (!client) return wrap(missing());
    const rows = list(s, 'messages')
      .filter((message) => message.clientId === client.id)
      .sort((a, b) => String(a.at).localeCompare(String(b.at)));
    return wrap(
      pageTitle(
        'المحادثة المشتركة',
        client.name,
        'تُحفظ الرسائل داخل العرض التجريبي فقط.',
        go('client-detail', 'ملف العميل', 'user', client.id),
      ) +
        `<section class="card">${messageBubbles(rows, false)}${client.doNotContact ? '<div class="notice notice-warn">العميل طلب عدم التواصل. أُوقف إنشاء رسالة جديدة حتى تُراجع تفضيلاته.</div>' : form('send-message', textarea('رسالة الإدارة', 'text', '', 'required minlength="2" maxlength="3000"'), client.id, 'إضافة الرسالة')}</section>`,
    );
  }
  function openConversation({ el }) {
    const s = A.state(),
      client = find(s, 'clients', el.dataset.id);
    if (!client) return fail('العميل غير موجود.');
    if (
      list(s, 'messages').some((m) => m.clientId === client.id && m.from === 'client' && !m.read)
    ) {
      if (
        A.update(
          (state) =>
            list(state, 'messages')
              .filter((m) => m.clientId === client.id && m.from === 'client')
              .forEach((m) => {
                m.read = true;
              }),
          'قراءة رسائل العميل',
        ) === false
      )
        return;
    }
    A.closeModal();
    A.go('conversation', {
      id: client.id,
    });
  }
  function sendMessage({ form: node, data }) {
    const client = find(A.state(), 'clients', node.dataset.id),
      text = String(data.text || '').trim();
    if (!client || text.length < 2) return fail('اكتب رسالة مفيدة قبل الحفظ.');
    if (client.doNotContact) return fail('العميل طلب عدم التواصل.');
    persist(
      'إضافة رسالة من الإدارة إلى المحادثة المشتركة',
      (s) => {
        A.assert(
          find(s, 'clients', client.id) && !find(s, 'clients', client.id).doNotContact,
          'تغيّرت رغبة العميل؛ طلب عدم التواصل ولم تُحفظ الرسالة.',
        );
        s.messages.push({
          id: A.id('message'),
          clientId: client.id,
          from: 'admin',
          text,
          at: stamp(),
          read: false,
        });
        notify(
          s,
          'client',
          'رسالة جديدة في مساحة العميل',
          `رسالة من الإدارة بخصوص ${client.name}`,
          {
            clientId: client.id,
          },
        );
      },
      'أُضيفت الرسالة إلى المحادثة التجريبية.',
    );
  }
  return {
    id: 'messages',
    routes: {
      messages: {
        nav: 'more',
        title: 'المحادثات',
        render: messages,
      },
      conversation: {
        nav: 'more',
        title: 'المحادثة',
        render: conversation,
      },
    },
    actions: {
      'open-conversation': openConversation,
      'send-message': sendMessage,
    },
    api: {
      messageBubbles,
    },
  };
}
