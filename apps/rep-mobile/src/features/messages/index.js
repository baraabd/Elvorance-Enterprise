/** rep / messages: original v1.1 views and local demo actions. */
export function createMessagesFeature(context, { state }) {
  const { A, client, e, go, head, ic, notify, now, ownClients, time } = context;
  const commit = (...args) => state.commit(...args);
  function messages({ state: s, params }) {
    const clients = ownClients(s),
      selected = client(s, params.id) || clients[0],
      rows = selected
        ? s.messages
            .filter((m) => m.clientId === selected.id)
            .sort((a, b) => new Date(a.at) - new Date(b.at))
        : [];
    return `${head('محادثات مرتبطة بالعمل', 'رسائل داخل العرض المحلي، مشتركة بين العميل والفريق.')}<div class="rep-messages-layout"><aside class="card rep-conversations">${clients.map((c) => `<button class="rep-conversation ${selected?.id === c.id ? 'active' : ''}" data-action="open-conversation" data-id="${c.id}">${A.avatar(c.name)}<span><strong>${e(c.name)}</strong><small class="muted">${s.messages.filter((m) => m.clientId === c.id && m.from === 'client' && !m.read).length} رسائل غير مقروءة</small></span></button>`).join('')}</aside><div class="card rep-thread">${selected ? `<div class="row-between"><h2>${e(selected.name)}</h2>${go('client-detail', 'ملف العميل', 'user', `data-id="${selected.id}"`, 'btn btn-ghost btn-sm')}</div><div class="rep-message-log" aria-live="polite">${rows.map((m) => `<div class="message-bubble ${m.from === 'rep' ? 'message-bubble-own' : ''}"><span class="tiny strong">${m.from === 'client' ? 'العميل' : m.from === 'admin' ? 'فريق الإدارة' : 'أنت'}</span><p>${e(m.text)}</p><time class="tiny muted">${e(time(m.at))}</time></div>`).join('') || '<p class="muted">ابدأ محادثة واضحة حول الخطوة التالية.</p>'}</div>${selected.doNotContact ? '<div class="notice notice-warn">الإرسال موقوف احترامًا لطلب العميل بعدم التواصل.</div>' : `<form data-submit="send-message" data-id="${selected.id}" class="rep-message-compose"><label class="field rep-grow"><span class="small">رسالتك للعميل</span><textarea class="textarea" name="text" required minlength="2" maxlength="1200" rows="2" placeholder="اكتب ما يساعد العميل في اتخاذ الخطوة التالية"></textarea></label><button type="submit" class="btn btn-primary" aria-label="إرسال الرسالة داخل العرض المحلي">${ic('send')}</button></form>`}` : A.empty('لا محادثات', 'أضف عميلًا للبدء.')}</div></div>`;
  }
  return {
    id: 'messages',
    routes: {
      messages: {
        title: 'المحادثات',
        render: messages,
        nav: 'more',
      },
    },
    actions: {
      'open-conversation'({ el, state }) {
        if (!client(state, el.dataset.id)) return;
        if (
          commit((s) => {
            A.assert(client(s, el.dataset.id), 'تغيّر إسناد العميل.');
            s.messages
              .filter((m) => m.clientId === el.dataset.id && m.from === 'client')
              .forEach((m) => {
                m.read = true;
              });
          }, 'قراءة محادثة العميل') !== false
        )
          A.go('messages', {
            id: el.dataset.id,
          });
      },
      'send-message'({ form, data, state }) {
        const c = client(state, form.dataset.id),
          text = String(data.text || '').trim();
        if (!c || text.length < 2 || text.length > 1200)
          return A.toast('اكتب رسالة واضحة بين حرفين و1200 حرف لعميل من حسابك.', 'error');
        if (
          commit((s) => {
            const current = client(s, c.id);
            A.assert(
              current && !current.doNotContact,
              'لا يمكن التواصل مع هذا العميل؛ تغيّر إذنه أو إسناده.',
            );
            A.assert(!s.session.offline, 'أنه وضع دون اتصال قبل الإرسال.');
            s.messages.push({
              id: A.id('msg'),
              clientId: c.id,
              from: 'rep',
              text,
              at: now(),
              read: false,
            });
            notify(s, 'client', 'رسالة من مندوبك', text.slice(0, 100), {
              clientId: c.id,
            });
          }, 'إرسال رسالة داخل العرض المحلي') !== false
        )
          A.toast('حُفظت الرسالة وظهرت في تطبيق العميل.', 'success');
      },
    },
    api: {},
  };
}
