/** admin / billing: original v1.1 views and local demo actions. */
export function createBillingFeature(context, { state }) {
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
    idAttr,
    input,
    invoiceLabels,
    list,
    metric,
    missing,
    money,
    notify,
    pageTitle,
    sectionTitle,
    select,
    sum,
    textarea,
    ui,
    wrap,
  } = context;
  const persist = (...args) => state.persist(...args);
  function invoiceState(invoice) {
    if (N(invoice.paid) >= N(invoice.total)) return 'paid';
    if (invoice.dueDate && invoice.dueDate < A.today()) return 'overdue';
    return N(invoice.paid) ? 'partial' : 'due';
  }
  function invoices({ state: s }) {
    const rows = list(s, 'invoices').filter(
      (invoice) => ui.invoiceStatus === 'all' || invoiceState(invoice) === ui.invoiceStatus,
    );
    return wrap(
      pageTitle(
        'المتابعة المالية',
        'الفواتير والتحصيل.',
        'سجل مالي تجريبي للمتابعة؛ لا ينفّذ مدفوعات حقيقية.',
        action('export-invoices', 'تصدير الفواتير', 'download', '', 'btn btn-primary'),
      ) +
        `<div class="grid-3">${metric('إجمالي الفواتير', money(sum(list(s, 'invoices'), (i) => i.total)), 'كل الفواتير المسجلة', 'receipt')}${metric('المسجل كمحصّل', money(sum(list(s, 'invoices'), (i) => i.paid)), 'مبالغ مسجلة محليًا', 'wallet')}${metric('الرصيد المتبقي', money(sum(list(s, 'invoices'), (i) => Math.max(0, N(i.total) - N(i.paid)))), 'من إجمالي الفواتير', 'clock')}</div><div class="filter-bar">${filter(
          'الحالة',
          'invoiceStatus',
          {
            all: 'كل الفواتير',
            ...invoiceLabels,
          },
        )}</div><section class="card"><div class="list">${rows.map((invoice) => `<article class="list-item"><div class="row-between"><div><h3>${E(invoice.title)}</h3><p class="small muted">${E(customer(s, invoice.clientId))} · ${E(date(invoice.dueDate))}</p></div>${badge(invoiceLabels[invoiceState(invoice)], invoiceState(invoice) === 'paid' ? 'good' : invoiceState(invoice) === 'overdue' ? 'bad' : 'warn')}</div><div class="row-between"><span class="num strong">${E(money(Math.max(0, N(invoice.total) - N(invoice.paid))))} متبقي</span>${go('invoice-detail', 'التفاصيل', 'arrow-left', invoice.id, 'btn btn-secondary btn-sm')}</div></article>`).join('') || empty('لا فواتير مطابقة', 'اختر حالة أخرى لاستعراض الفواتير.')}</div></section>`,
    );
  }
  function invoiceDetail({ state: s, params }) {
    const invoice = find(s, 'invoices', params.id);
    if (!invoice) return wrap(missing());
    return wrap(
      pageTitle(
        'تفاصيل الفاتورة',
        invoice.title,
        customer(s, invoice.clientId),
        action('print-invoice', 'عرض وطباعة', 'file', idAttr(invoice.id), 'btn btn-primary'),
      ) +
        `<section class="grid-3">${metric('الإجمالي', money(invoice.total), invoiceLabels[invoiceState(invoice)], 'receipt')}${metric('المحصّل المسجل', money(invoice.paid), 'سجل تجريبي', 'wallet')}${metric('المتبقي', money(Math.max(0, N(invoice.total) - N(invoice.paid))), `الاستحقاق ${date(invoice.dueDate)}`, 'calendar')}</section><section class="card">${sectionTitle('ملاحظات التحصيل')}<p>${E(invoice.notes || 'لا ملاحظات إضافية.')}</p><p class="small muted">طريقة التسجيل: ${E(invoice.paymentMethod || 'لم تحدد')}</p><div class="row wrap gap-sm">${N(invoice.paid) < N(invoice.total) ? action('record-payment', 'تسجيل تحصيل تجريبي', 'plus', idAttr(invoice.id), 'btn btn-primary') : badge('لا رصيد متبقٍ', 'good')}${action('open-conversation', 'محادثة العميل', 'message', idAttr(invoice.clientId))}</div><p class="admin-state-note">تحديث هذا السجل لا يحوّل أموالًا ولا يؤكد دفعًا عبر مزوّد خارجي.</p></section>`,
    );
  }
  function recordPayment({ el }) {
    const invoice = find(A.state(), 'invoices', el.dataset.id);
    if (!invoice) return fail('الفاتورة غير موجودة.');
    const remaining = Math.max(0, N(invoice.total) - N(invoice.paid));
    if (!remaining) return A.toast('الفاتورة مسددة في السجل.', 'info');
    A.modal(
      'تسجيل تحصيل تجريبي',
      form(
        'save-payment',
        `<input type="hidden" name="requestId" value="${E(A.id('payment'))}"><p class="notice notice-warn">هذا قيد في العرض المحلي؛ لا يحوّل أموالًا ولا يتصل بخدمة دفع.</p><p>المتبقي: <strong>${E(money(remaining))}</strong></p>${input('المبلغ المسجل', 'amount', remaining, 'number', `required min="0.01" max="${remaining}" step="0.01"`)}${select(
          'طريقة التحصيل المسجلة',
          'method',
          {
            'تحويل بنكي تجريبي': 'تحويل بنكي تجريبي',
            'نقد تجريبي': 'نقد تجريبي',
            'أخرى — سجل تجريبي': 'أخرى — سجل تجريبي',
          },
          'تحويل بنكي تجريبي',
        )}${textarea('مرجع أو ملاحظة', 'note', '', 'required minlength="3" maxlength="1000"')}`,
        invoice.id,
        'حفظ القيد التجريبي',
      ),
    );
  }
  function savePayment({ form: node, data }) {
    const invoice = find(A.state(), 'invoices', node.dataset.id),
      amount = Number(data.amount);
    if (!invoice || !Number.isFinite(amount) || amount <= 0)
      return fail('أدخل مبلغًا موجبًا صالحًا.');
    const note = String(data.note || '').trim();
    if (note.length < 3) return fail('أضف مرجعًا أو ملاحظة لهذا القيد.');
    const requestId =
      data.requestId ||
      node.dataset.paymentRequest ||
      (node.dataset.paymentRequest = A.id('payment'));
    persist(
      'تسجيل تحصيل تجريبي على فاتورة',
      (s) => {
        A.recordInvoicePayment(s, {
          invoiceId: invoice.id,
          amount,
          requestId,
          method: data.method || 'سجل تجريبي',
          reference: note,
          actor: 'admin',
        });
        notify(s, 'client', 'تحديث سجل الفاتورة التجريبية', invoice.title, {
          clientId: invoice.clientId,
        });
      },
      'حُفظ القيد مرة واحدة وتحدثت الفاتورة والعقد وخطة الدفعات.',
    );
  }
  function printInvoice({ el }) {
    const s = A.state(),
      invoice = find(s, 'invoices', el.dataset.id);
    if (!invoice) return fail('الفاتورة غير موجودة.');
    A.printDocument(
      'فاتورة تجريبية',
      `<article class="document" dir="rtl"><p>${E(s.settings?.company || 'أطلس')}</p><h1>${E(invoice.title)}</h1><p>العميل: ${E(customer(s, invoice.clientId))}</p><p>رقم السجل: ${E(invoice.id)} · الاستحقاق: ${E(date(invoice.dueDate))}</p><table class="data-table"><tbody><tr><th>الإجمالي</th><td>${E(money(invoice.total))}</td></tr><tr><th>المسجل كمحصّل</th><td>${E(money(invoice.paid))}</td></tr><tr><th>المتبقي</th><td>${E(money(Math.max(0, N(invoice.total) - N(invoice.paid))))}</td></tr></tbody></table><p>${E(invoice.notes || '')}</p><p>وثيقة عرض تجريبي؛ ليست إثبات دفع أو فاتورة ضريبية معتمدة.</p></article>`,
    );
  }
  function exportInvoices() {
    const s = A.state(),
      rows = list(s, 'invoices').filter(
        (i) => ui.invoiceStatus === 'all' || invoiceState(i) === ui.invoiceStatus,
      );
    if (!rows.length) return A.toast('لا فواتير تطابق الفلتر.', 'info');
    A.exportCSV(
      `Atlas-Invoices-${A.today()}.csv`,
      rows.map((i) => ({
        الفاتورة: i.title,
        العميل: customer(s, i.clientId),
        الإجمالي: N(i.total),
        'المسجل كمحصّل': N(i.paid),
        المتبقي: Math.max(0, N(i.total) - N(i.paid)),
        الاستحقاق: i.dueDate,
        الحالة: invoiceLabels[invoiceState(i)],
        ملاحظة: 'سجل تجريبي لا يؤكد دفعًا خارجيًا',
      })),
    );
  }
  return {
    id: 'billing',
    routes: {
      invoices: {
        nav: 'more',
        title: 'الفواتير',
        render: invoices,
      },
      'invoice-detail': {
        nav: 'more',
        title: 'تفاصيل الفاتورة',
        render: invoiceDetail,
      },
    },
    actions: {
      'record-payment': recordPayment,
      'save-payment': savePayment,
      'print-invoice': printInvoice,
      'export-invoices': exportInvoices,
    },
    api: {},
  };
}
