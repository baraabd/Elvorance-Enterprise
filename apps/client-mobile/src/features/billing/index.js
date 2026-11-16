/** client / billing: original v1.1 views and local demo actions. */
export function createBillingFeature(context, { state }) {
  const {
    A,
    E,
    act,
    badge,
    cents,
    customer,
    date,
    error,
    field,
    go,
    heading,
    invoiceLabels,
    label,
    mine,
    missing,
    money,
    notify,
    num,
    owned,
    paragraph,
    select,
    wrap,
  } = context;
  const commit = (...args) => state.commit(...args);
  function renderInvoices({ state, params }) {
    const invoices = mine(state, 'invoices').filter(
      (item) => (!params.contract || item.contractId === params.contract) && (params.open !== '1' || num(item.total)>num(item.paid)),
    );
    const total = invoices.reduce((sum, item) => sum + num(item.total), 0);
    const paid = invoices.reduce((sum, item) => sum + num(item.paid), 0);
    return wrap(
      `${heading('الفواتير',params.open==='1'?'الرصيد المتبقي على الفواتير':'دفعات واضحة، بلا مفاجآت','سجل مالي تجريبي مرتبط بعقودك.')}<div class="row wrap">${go('كل الفواتير','invoices',{},'btn-secondary btn-sm')}${go('الرئيسية','home',{},'btn-ghost btn-sm')}</div><div class="metric-grid"><div class="stat"><span class="stat-label">إجمالي الفواتير</span><strong class="stat-value num">${money(total)}</strong></div><div class="stat"><span class="stat-label">مسجل كمدفوع</span><strong class="stat-value num">${money(paid)}</strong></div><div class="stat"><span class="stat-label">المتبقي</span><strong class="stat-value num">${money(Math.max(0, total - paid))}</strong></div></div><div class="stack-sm">${
        invoices
          .map(
            (invoice) =>
              `<article class="card row-between"><div class="row"><span class="icon-box">${A.icon('receipt')}</span><div><h3>${E(invoice.title)}</h3><p class="muted small">الاستحقاق ${E(date(invoice.dueDate))} · ${E(invoice.id)}</p></div></div><div class="row wrap">${badge(label(invoiceLabels, invoice.status), invoice.status)}<strong class="num">${money(invoice.total)}</strong>${go(
                'التفاصيل',
                'invoice-detail',
                {
                  id: invoice.id,
                },
                'btn-secondary btn-sm',
              )}</div></article>`,
          )
          .join('') || A.empty('لا توجد فواتير بعد', 'ستظهر فواتير عقودك هنا عندما يجهزها الفريق.')
      }</div>`,
    );
  }
  function renderInvoice({ state, params }) {
    const invoice = owned(state, 'invoices', params.id);
    if (!invoice) return missing();
    const remaining = Math.max(0, num(invoice.total) - num(invoice.paid));
    return wrap(
      `${heading('تفاصيل الفاتورة', invoice.title, `${invoice.id} · تاريخ الاستحقاق ${date(invoice.dueDate)}`, badge(label(invoiceLabels, invoice.status), invoice.status))}<div class="dashboard-grid"><section class="card stack"><div class="row-between"><strong>${E(state.settings?.company || 'أطلس')}</strong><span class="icon-box">${A.icon('receipt')}</span></div><p class="muted">إلى ${E(customer(state)?.name)}</p><div class="divider"></div><div class="row-between"><span>القيمة الإجمالية</span><strong class="num">${money(invoice.total)}</strong></div><div class="row-between"><span>المسجل كمدفوع</span><strong class="num text-good">${money(invoice.paid)}</strong></div><div class="row-between"><strong>الرصيد المتبقي</strong><strong class="stat-value num">${money(remaining)}</strong></div>${A.progress(num(invoice.total) ? (num(invoice.paid) / num(invoice.total)) * 100 : 0)}${invoice.notes ? `<p class="small muted">${paragraph(invoice.notes)}</p>` : ''}${invoice.paymentMethod ? `<p class="small">طريقة التسجيل: ${E(invoice.paymentMethod)}</p>` : ''}</section><aside class="stack"><section class="card card-dark"><h3>سجل دفعتك التجريبية</h3><p class="small">لا اتصال بمصرف أو بوابة دفع. لن تُطلب منك بيانات بطاقة ولن يُحصّل أي مبلغ.</p>${
        remaining
          ? act(
              'تسجيل دفعة تجريبية',
              'payment-modal',
              {
                id: invoice.id,
              },
              'btn-lime btn-block',
              'wallet',
            )
          : '<p class="text-good">الرصيد مسدد في السجل التجريبي.</p>'
      }</section>${act(
        'طباعة الفاتورة التجريبية',
        'print-invoice',
        {
          id: invoice.id,
        },
        'btn-secondary btn-block',
        'download',
      )}${
        invoice.contractId
          ? go(
              'العقد المرتبط',
              'contract-detail',
              {
                id: invoice.contractId,
              },
              'btn-ghost btn-block',
              'file',
            )
          : ''
      }</aside></div>`,
    );
  }
  function paymentModal({ el }) {
    const invoice = owned(A.state(), 'invoices', el.dataset.id);
    if (!invoice) return error('الفاتورة غير موجودة.');
    const remaining = Math.max(0, num(invoice.total) - num(invoice.paid));
    if (!remaining) return error('لا يوجد رصيد متبقٍ في هذه الفاتورة.');
    A.modal(
      'تسجيل دفعة تجريبية',
      `<form class="stack" data-submit="record-payment"><input type="hidden" name="invoiceId" value="${E(invoice.id)}"><input type="hidden" name="requestId" value="${E(A.id('payment'))}"><div class="notice notice-warn"><p>لا يتم تحصيل مال أو الاتصال بمصرف. هذا إدخال في سجل العرض التجريبي فقط.</p></div>${field(
        'قيمة الدفعة بالدولار',
        'amount',
        remaining.toFixed(2),
        {
          type: 'number',
          min: '.01',
          max: remaining.toFixed(2),
          step: '.01',
        },
      )}${select(
        'طريقة التسجيل',
        'method',
        [
          ['حوالة بنكية تجريبية', 'حوالة بنكية تجريبية'],
          ['نقد تجريبي', 'نقد تجريبي'],
        ],
        'حوالة بنكية تجريبية',
      )}${field('مرجع أو ملاحظة — اختياري', 'reference', '', {
        required: false,
        maxlength: 120,
      })}<label class="checkbox-row"><input type="checkbox" name="demoPayment" required><span>أفهم أن هذا تسجيل تجريبي ولا يمثل دفعًا فعليًا.</span></label><button type="submit" class="btn btn-primary">${A.icon('check')}حفظ الدفعة التجريبية</button></form>`,
    );
  }
  function recordPayment({ data }) {
    const invoice = owned(A.state(), 'invoices', data.invoiceId);
    const amount = Number(data.amount);
    if (!invoice || !data.demoPayment) return error('أكد أن هذه دفعة تجريبية.');
    if (!['حوالة بنكية تجريبية', 'نقد تجريبي'].includes(data.method))
      return error('اختر طريقة تسجيل متاحة.');
    if (
      !Number.isFinite(amount) ||
      cents(amount) <= 0 ||
      cents(amount) > cents(num(invoice.total) - num(invoice.paid))
    )
      return error('قيمة الدفعة يجب ألا تتجاوز الرصيد المتبقي.');
    if (!String(data.requestId || '').trim()) return error('أعد فتح نموذج الدفع قبل التسجيل.');
    commit(
      (next) => {
        A.assert(owned(next, 'invoices', invoice.id), 'الفاتورة غير متاحة لهذا العميل.');
        A.recordInvoicePayment(next, {
          invoiceId: invoice.id,
          amount,
          requestId: data.requestId,
          method: data.method,
          reference: String(data.reference || '').trim(),
          actor: 'client',
        });
        notify(
          next,
          'سجل العميل دفعة تجريبية',
          `${customer(next)?.name}: ${amount} USD على ${invoice.title}. لا يوجد تحصيل فعلي.`,
        );
      },
      `سجل العميل دفعة تجريبية ${amount} USD`,
      {
        message: 'حُدثت الفاتورة والعقد في السجل التجريبي. لم يتم تحصيل أي مبلغ.',
      },
    );
  }
  function printInvoice({ el }) {
    const state = A.state();
    const invoice = owned(state, 'invoices', el.dataset.id);
    if (!invoice) return error('الفاتورة غير موجودة.');
    A.printDocument(
      `فاتورة تجريبية — ${invoice.title}`,
      `<p>${E(customer(state)?.name)}</p><p>مرجع: ${E(invoice.id)} · الاستحقاق: ${E(date(invoice.dueDate))}</p><table class="data-table"><tbody><tr><th>الإجمالي</th><td>${money(invoice.total)}</td></tr><tr><th>المدفوع المسجل</th><td>${money(invoice.paid)}</td></tr><tr><th>المتبقي</th><td>${money(Math.max(0, num(invoice.total) - num(invoice.paid)))}</td></tr></tbody></table><p>${paragraph(invoice.notes || '')}</p><p><strong>سجل تجريبي فقط؛ لا يثبت دفعًا أو تحصيلًا فعليًا.</strong></p>`,
    );
  }
  return {
    id: 'billing',
    routes: {
      invoices: {
        title: 'الفواتير',
        nav: 'contracts',
        render: renderInvoices,
      },
      'invoice-detail': {
        title: 'تفاصيل الفاتورة',
        nav: 'contracts',
        render: renderInvoice,
      },
    },
    actions: {
      'payment-modal': paymentModal,
      'record-payment': recordPayment,
      'print-invoice': printInvoice,
    },
    api: {},
  };
}
