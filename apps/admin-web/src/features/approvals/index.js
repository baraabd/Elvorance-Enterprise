/** admin / approvals: original v1.1 views and local demo actions. */
export function createApprovalsFeature(context, { state }) {
  const {
    A,
    E,
    N,
    action,
    approvalTypes,
    badge,
    customer,
    date,
    empty,
    fail,
    filter,
    find,
    form,
    idAttr,
    list,
    money,
    notify,
    pageTitle,
    person,
    select,
    stamp,
    sum,
    textarea,
    ui,
    wrap,
  } = context;
  const persist = (...args) => state.persist(...args);
  function approvals({ state: s }) {
    const rows = list(s, 'approvals').filter(
      (item) => ui.approvalStatus === 'all' || item.status === ui.approvalStatus,
    );
    return wrap(
      pageTitle(
        'صندوق القرار',
        'قرارات واضحة، بسياق كامل.',
        'راجع الخصومات وتغييرات النطاق والمواعيد مع تسجيل سبب القرار.',
      ) +
        `<div class="filter-bar">${filter('الحالة', 'approvalStatus', {
          pending: 'بانتظار القرار',
          approved: 'موافق عليها',
          rejected: 'مرفوضة',
          all: 'كل الطلبات',
        })}</div><div class="grid-2">${rows.map((item) => `<article class="card"><div class="row-between">${badge(approvalTypes[item.type] || item.type, 'info')}${badge(item.status === 'pending' ? 'بانتظارك' : item.status === 'approved' ? 'موافق عليه' : 'مرفوض', item.status === 'pending' ? 'warn' : item.status === 'approved' ? 'good' : 'bad')}</div><h2>${E(item.title)}</h2><p class="small muted">${E(person(s, item.repId))} · ${E(customer(s, item.clientId))}</p><p class="admin-approval-detail">${E(item.details || 'لا تفاصيل إضافية')}</p>${item.amount ? `<p class="strong num">${E(money(item.amount))}</p>` : ''}${item.decisionNote ? `<div class="admin-note"><strong>ملاحظة القرار:</strong> ${E(item.decisionNote)}</div>` : ''}<p class="tiny muted">${E(date(item.createdAt))}</p>${action('review-approval', item.status === 'pending' ? 'مراجعة واتخاذ قرار' : 'تفاصيل القرار', 'shield', idAttr(item.id), item.status === 'pending' ? 'btn btn-primary' : 'btn btn-secondary')}</article>`).join('')}</div>${!rows.length ? empty('لا طلبات بهذه الحالة', 'تظهر طلبات المندوبين والعملاء هنا عند إنشائها.') : ''}`,
    );
  }
  function reviewApproval({ el }) {
    const s = A.state(),
      item = find(s, 'approvals', el.dataset.id);
    if (!item) return fail('طلب الموافقة غير موجود.');
    const quote = item.quoteId ? find(s, 'quotes', item.quoteId) : null;
    let details = `<p>${badge(approvalTypes[item.type] || item.type, 'info')}</p><h3>${E(item.title)}</h3><p class="admin-approval-detail">${E(item.details || '')}</p><p class="small muted">${E(person(s, item.repId))} · ${E(customer(s, item.clientId))}</p>${quote ? `<p class="admin-note">عرض مرتبط: ${E(quote.title)}. الموافقة لا ترسل العرض؛ يراجعه المندوب ثم يرسله داخل مساحة العميل.</p>` : ''}`;
    if (item.status === 'pending')
      details += form(
        'decide-approval',
        select(
          'القرار',
          'decision',
          {
            approved: 'الموافقة على الطلب',
            rejected: 'رفض الطلب',
          },
          'approved',
        ) + textarea('سبب القرار أو شروطه', 'note', '', 'required minlength="6" maxlength="2000"'),
        item.id,
        'تسجيل القرار',
      );
    else
      details += `<p>${badge(item.status === 'approved' ? 'تمت الموافقة' : 'تم الرفض', item.status === 'approved' ? 'good' : 'bad')}</p><p class="admin-note">${E(item.decisionNote || 'لم تسجل ملاحظة')}</p>`;
    A.modal('مراجعة الموافقة', details);
  }
  function decideApproval({ form: node, data }) {
    const item = find(A.state(), 'approvals', node.dataset.id),
      note = String(data.note || '').trim();
    if (!item || item.status !== 'pending') return fail('هذا الطلب غير موجود أو سبق حسمه.');
    if (!['approved', 'rejected'].includes(data.decision) || note.length < 6)
      return fail('اختر قرارًا واكتب سببه بوضوح.');
    persist(
      'تسجيل قرار إداري على طلب موافقة',
      (s) => {
        const record = find(s, 'approvals', item.id);
        A.assert(
          record?.status === 'pending',
          'حُسم هذا الطلب في نافذة أخرى؛ لم يتغير القرار المحفوظ.',
        );
        if (record.type === 'discount' && record.quoteId) {
          const quote = find(s, 'quotes', record.quoteId);
          const subtotal = sum(quote?.items || [], (entry) => N(entry.qty) * N(entry.price));
          A.assert(
            !record.quoteFingerprint || record.quoteFingerprint === A.quoteFingerprint(quote || {}),
            'تغيّر نطاق العرض أو العميل منذ طلب الموافقة.',
          );
          A.assert(
            !quote?.validUntil || quote.validUntil >= A.today(),
            'انتهت صلاحية العرض؛ حدّثه واطلب موافقة جديدة.',
          );
          A.assert(
            quote &&
              ['draft', 'revision_requested'].includes(quote.status) &&
              N(record.amount) === N(quote.discount) &&
              N(record.subtotal) === subtotal,
            'تغيّر العرض منذ طلب الموافقة؛ يلزم طلب مطابق للقيم الحالية.',
          );
        }
        record.status = data.decision;
        record.decisionNote = note;
        record.decidedAt = stamp();
        notify(
          s,
          'rep',
          data.decision === 'approved' ? 'تمت الموافقة على الطلب' : 'قرار بخصوص طلبك',
          `${record.title}: ${note}`,
          {
            repId: record.repId,
          },
        );
        if (record.type === 'scope_change')
          notify(s, 'client', 'تحديث طلب تغيير النطاق', note, {
            clientId: record.clientId,
          });
      },
      'حُفظ القرار وسببه في السجل المشترك.',
    );
  }
  return {
    id: 'approvals',
    routes: {
      approvals: {
        nav: 'more',
        title: 'الموافقات',
        render: approvals,
      },
    },
    actions: {
      'review-approval': reviewApproval,
      'decide-approval': decideApproval,
    },
    api: {},
  };
}
