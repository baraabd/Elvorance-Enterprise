// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** client / contracts: original v1.1 views and local demo actions. */
export function createContractsFeature(context, { quotes, state }) {
  const {
    A,
    E,
    act,
    addMessage,
    badge,
    cents,
    contractLabels,
    copy,
    customer,
    date,
    error,
    field,
    go,
    heading,
    idFrom,
    label,
    mine,
    missing,
    money,
    notify,
    now,
    num,
    owned,
    paragraph,
    reviewToken,
    section,
    stageLabels,
    stages,
    textLines,
    wrap,
  } = context;
  const commit = (...args) => state.commit(...args);
  const reviewedQuote = (...args) => quotes.reviewedQuote(...args);
  function contractReview(contract) {
    return reviewToken({
      title: contract.title,
      total: contract.total,
      paid: contract.paid,
      terms: contract.terms,
      startDate: contract.startDate,
      endDate: contract.endDate,
      paymentPlan: contract.paymentPlan,
      itemsSnapshot: contract.itemsSnapshot,
      scopeSnapshot: contract.scopeSnapshot,
    });
  }
  function attachContractSnapshot(contract, quote) {
    if (contract.quoteSnapshot || !quote) return;
    contract.quoteSnapshot = {
      ...reviewedQuote(quote),
      capturedAt: now(),
    };
    contract.itemsSnapshot = copy(contract.quoteSnapshot.items);
    contract.scopeSnapshot = copy(contract.quoteSnapshot.scopeSnapshot);
  }
  function normalizedPlan(contract) {
    const plan = (contract.paymentPlan || []).map((payment, index) => ({
      ...copy(payment),
      id: payment.id || `${contract.id}-payment-${index + 1}`,
      amount: cents(payment.amount) / 100,
      due: payment.due || null,
      status: ['paid', 'partial'].includes(payment.status) ? payment.status : 'due',
    }));
    A.assert(
      Number.isFinite(cents(contract.total)) &&
        cents(contract.total) > 0 &&
        plan.length > 0 &&
        plan.every((payment) => Number.isFinite(payment.amount) && payment.amount > 0) &&
        new Set(plan.map((payment) => payment.id)).size === plan.length &&
        plan.reduce((sum, payment) => sum + cents(payment.amount), 0) === cents(contract.total),
      'راجع جدول الدفعات: يجب أن يساوي مجموع الدفعات قيمة العقد دون زيادة أو نقص.',
    );
    return plan;
  }
  function needsProvisioning(state, contract) {
    if (!['signed', 'active'].includes(contract.status)) return false;
    const project = mine(state, 'projects').find(
      (row) => row.contractId === contract.id || row.id === contract.projectId,
    );
    const invoices = mine(state, 'invoices').filter((row) => row.contractId === contract.id);
    return (
      !project ||
      !contract.provisioningVersion ||
      !invoices.length ||
      invoices.reduce((sum, row) => sum + cents(row.total), 0) !== cents(contract.total)
    );
  }
  function provisionContract(next, contract) {
    const plan = normalizedPlan(contract),
      totalCents = cents(contract.total);
    const invoices = mine(next, 'invoices').filter((invoice) => invoice.contractId === contract.id);
    const linkedProjects = mine(next, 'projects').filter(
      (project) => project.contractId === contract.id || project.id === contract.projectId,
    );
    A.assert(
      Number.isFinite(cents(contract.paid)) &&
        cents(contract.paid) >= 0 &&
        cents(contract.paid) <= totalCents &&
        invoices.every(
          (invoice) =>
            Number.isFinite(cents(invoice.total)) &&
            cents(invoice.total) > 0 &&
            cents(invoice.paid) >= 0 &&
            cents(invoice.paid) <= cents(invoice.total),
        ),
      'الرصيد التاريخي يحتاج مراجعة الإدارة قبل استكمال الفواتير.',
    );
    const mapped = new Map();
    for (const invoice of invoices) {
      const payment = invoice.paymentPlanId
        ? plan.find((row) => row.id === invoice.paymentPlanId)
        : plan.find((row) => !mapped.has(row.id) && cents(row.amount) === cents(invoice.total));
      A.assert(
        payment && !mapped.has(payment.id) && cents(payment.amount) === cents(invoice.total),
        'إحدى الفواتير السابقة لا تطابق دفعة في العقد. راجع الإدارة لتسوية الربط دون تكرار أو تغيير المبالغ.',
      );
      mapped.set(payment.id, invoice);
    }
    const invoicePaid = invoices.reduce((sum, invoice) => sum + cents(invoice.paid), 0);
    const historicalPaid = Math.max(cents(contract.paid), invoicePaid);
    A.assert(historicalPaid <= totalCents, 'إجمالي المدفوع التاريخي يتجاوز العقد. راجع الإدارة.');
    contract.paymentPlan = plan;
    const quote = owned(next, 'quotes', contract.quoteId);
    attachContractSnapshot(contract, quote);
    const scope = copy(contract.scopeSnapshot || []);
    const serviceIds = [
      ...new Set((contract.itemsSnapshot || scope).map((item) => item.serviceId).filter(Boolean)),
    ];
    // Older demo data can already contain multiple projects on one contract.
    // Keep those records; select the primary link and never add another.
    let project = linkedProjects.find((row) => row.id === contract.projectId) || linkedProjects[0];
    if (!project) {
      project = {
        id: A.id('project'),
        clientId: contract.clientId,
        contractId: contract.id,
        quoteId: contract.quoteId || '',
        title: contract.title,
        serviceId: serviceIds[0] || '',
        serviceIds,
        status: 'planning',
        stage: 'discovery',
        progress: 0,
        manager: '',
        dueDate: contract.endDate || null,
        milestones: stages.map((stage) => ({
          id: A.id('milestone'),
          stage,
          title: stageLabels[stage],
          status: 'pending',
          date: null,
        })),
        deliverables: [],
        scopeSnapshot: scope,
        termsSnapshot: String(contract.terms || ''),
        createdAt: now(),
      };
      next.projects.push(project);
    }
    contract.projectId = project.id;
    let unallocatedPaid = historicalPaid - invoicePaid;
    plan.forEach((payment) => {
      let invoice = mapped.get(payment.id);
      if (!invoice) {
        invoice = {
          id: A.id('invoice'),
          clientId: contract.clientId,
          contractId: contract.id,
          projectId: project.id,
          paymentPlanId: payment.id,
          title: `${contract.title} — ${payment.label}`,
          total: payment.amount,
          paid: 0,
          dueDate: payment.due,
          status: 'due',
          paymentMethod: '',
          payments: [],
          notes: 'فاتورة تجريبية مرتبطة بجدول العقد المعتمد. لا تثبت دفعًا فعليًا.',
          createdAt: now(),
        };
        next.invoices.push(invoice);
      }
      invoice.paymentPlanId = payment.id;
      invoice.projectId = project.id;
      const opening = Math.min(unallocatedPaid, cents(invoice.total) - cents(invoice.paid));
      if (opening > 0) {
        invoice.paid = (cents(invoice.paid) + opening) / 100;
        invoice.openingBalance = num(invoice.openingBalance) + opening / 100;
        invoice.notes =
          `${invoice.notes || ''}\nيتضمن رصيدًا مسجلًا سابقًا في العقد بقيمة ${opening / 100} USD؛ لا يمثل دفعة جديدة.`.trim();
        unallocatedPaid -= opening;
      }
      invoice.status =
        cents(invoice.paid) === cents(invoice.total)
          ? 'paid'
          : cents(invoice.paid) > 0
            ? 'partial'
            : invoice.dueDate && invoice.dueDate < A.today()
              ? 'overdue'
              : 'due';
      payment.paid = num(invoice.paid);
      payment.status =
        cents(invoice.paid) === cents(invoice.total)
          ? 'paid'
          : cents(invoice.paid) > 0
            ? 'partial'
            : 'due';
    });
    contract.paid = historicalPaid / 100;
    contract.provisionedAt ||= now();
    contract.provisioningVersion = 1;
    return project;
  }
  function contractCard(contract) {
    const ratio =
      num(contract.total) > 0 ? Math.round((num(contract.paid) / num(contract.total)) * 100) : 0;
    return `<article class="card client-contract-card"><div class="row-between"><span class="icon-box">${A.icon('file')}</span>${badge(label(contractLabels, contract.status), contract.status)}</div><h3>${E(contract.title)}</h3><p class="muted small">${E(date(contract.startDate))} — ${E(date(contract.endDate))}</p><div class="row-between"><span class="muted small">قيمة الاتفاق</span><strong class="num">${money(contract.total)}</strong></div><div class="row-between tiny muted"><span>المدفوع ${money(contract.paid)}</span><span class="num">${ratio}%</span></div>${A.progress(ratio)}${go(
      contract.status === 'pending' ? 'مراجعة العقد والموافقة' : 'تفاصيل الاتفاق',
      'contract-detail',
      {
        id: contract.id,
      },
      contract.status === 'pending' ? 'btn-primary btn-block' : 'btn-secondary btn-block',
    )}</article>`;
  }
  function renderContracts({ state }) {
    const contracts = mine(state, 'contracts');
    return wrap(
      `${heading('العقود', 'اتفاقات تعرف حدودها', 'نطاق واضح، ملفات متفق عليها ودفعات يمكنك تتبعها.')}<div class="metric-grid"><div class="stat"><span class="stat-label">عقودك</span><strong class="stat-value num">${contracts.length}</strong></div><div class="stat"><span class="stat-label">بانتظار الموافقة</span><strong class="stat-value num">${contracts.filter((item) => item.status === 'pending').length}</strong></div><div class="stat"><span class="stat-label">إجمالي الاتفاقات</span><strong class="stat-value num">${money(contracts.reduce((sum, item) => sum + num(item.total), 0))}</strong></div></div><div class="grid-2">${contracts.map(contractCard).join('') || A.empty('لا توجد عقود بعد', 'بعد قبول عرض، سيظهر عقده هنا للمراجعة.', go('عروض الأسعار', 'quotes'))}</div>`,
    );
  }
  function contractScope(state, contract) {
    const quote = mine(state, 'quotes').find((item) => item.id === contract.quoteId);
    const project = mine(state, 'projects').find(
      (item) => item.id === contract.projectId || item.contractId === contract.id,
    );
    const services = copy(contract.scopeSnapshot || contract.quoteSnapshot?.scopeSnapshot || []);
    return {
      quote,
      project,
      services,
    };
  }
  function renderContract({ state, params }) {
    const contract = owned(state, 'contracts', params.id);
    if (!contract) return missing('العقد غير موجود');
    const { quote, project, services } = contractScope(state, contract);
    return wrap(
      `${heading('ملف الاتفاق', contract.title, `${contract.id} · ${date(contract.startDate)} — ${date(contract.endDate)}`, badge(label(contractLabels, contract.status), contract.status))}<div class="dashboard-grid"><div class="main-column stack"><section class="card">${section('نطاق العمل والتسليم')}<div class="stack">${services.length ? services.map((service) => `<div><div class="row"><span class="icon-box icon-box-lime">${A.icon(service.icon || 'layers')}</span><h3>${E(service.title)}</h3></div><ul class="client-bullet-list">${(service.deliverables || []).map((text) => `<li>${E(text)}</li>`).join('')}</ul></div>`).join('') : `<p>${E(contract.title)}</p><p class="muted small">تعتمد تفاصيل النطاق على البنود والشروط الواردة في هذا الاتفاق.</p>`}</div></section><section class="card">${section('جدول الدفعات', 'حالة الدفعات من السجل التجريبي المشترك.')}<div class="stack-sm">${(contract.paymentPlan || []).map((payment, i) => `<div class="client-payment-step"><span class="client-step-number">${payment.status === 'paid' ? A.icon('check') : String(i + 1).padStart(2, '0')}</span><div><strong>${E(payment.label)}</strong><p class="small muted">${E(date(payment.due))}</p></div><div class="stack-sm"><strong class="num">${money(payment.amount)}</strong>${badge(payment.status === 'paid' ? 'مدفوعة' : payment.status === 'partial' ? 'مدفوعة جزئيًا' : 'مستحقة', payment.status)}${num(payment.paid) > 0 && payment.status !== 'paid' ? `<span class="tiny muted">المسجل ${money(payment.paid)}</span>` : ''}</div></div>`).join('') || '<p class="muted">لا يوجد جدول دفعات مفصل بعد. تواصل مع الفريق لتثبيته.</p>'}</div></section><section class="card">${section('الشروط والحدود')}${contract.paymentWishes ? `<div class="notice small">رغبات دفع تحتاج مراجعة منفصلة: ${E(contract.paymentWishes)}</div>` : ''}<div class="stack-sm">${textLines(
        contract.terms ||
          'المدة والنطاق وجدول الدفعات حسب البنود المعروضة أعلاه. أي تغيير إضافي يتطلب اتفاقًا واضحًا.',
      )
        .map((text) => `<p>${E(text)}</p>`)
        .join(
          '',
        )}</div></section>${contract.signedAt ? `<section class="card notice-good"><div class="row"><span class="icon-box">${A.icon('signature')}</span><div><h3>الموافقة المسجلة</h3><p class="small">${E(contract.signer || 'العميل')} · ${E(date(contract.signedAt))}</p><p class="tiny muted">سجل موافقة تجريبي، وليس توقيعًا قانونيًا موثقًا.</p></div></div></section>` : ''}</div><aside class="side-column stack"><section class="card card-dark"><p class="eyebrow">قيمة الاتفاق</p><h2 class="num">${money(contract.total)}</h2><div class="row-between small"><span>المدفوع</span><strong class="num">${money(contract.paid)}</strong></div><div class="row-between small"><span>المتبقي</span><strong class="num">${money(Math.max(0, num(contract.total) - num(contract.paid)))}</strong></div><div class="divider"></div><div class="stack-sm">${
        contract.status === 'pending'
          ? act(
              'مراجعة وتأكيد تجريبي',
              'sign-contract-modal',
              {
                id: contract.id,
              },
              'btn-lime btn-block',
              'signature',
            )
          : ''
      }${
        needsProvisioning(state, contract)
          ? act(
              'إعداد مساحة المشروع والفواتير',
              'provision-contract',
              {
                id: contract.id,
              },
              'btn-lime btn-block',
              'layers',
            )
          : ''
      }${
        project
          ? go(
              'المشروع المرتبط',
              'project-detail',
              {
                id: project.id,
              },
              'btn-lime btn-block',
              'monitor',
            )
          : ''
      }${act(
        'نسخة للطباعة',
        'print-contract',
        {
          id: contract.id,
        },
        'btn-secondary btn-block',
        'download',
      )}${go(
        'ناقش التفاصيل',
        'messages',
        {
          'param-topic': contract.title,
        },
        'btn-ghost btn-block',
        'message',
      )}</div></section>${
        quote
          ? go(
              'عرض السعر الأصلي',
              'quote-detail',
              {
                id: quote.id,
              },
              'btn-secondary btn-block',
              'file',
            )
          : ''
      }${go(
        'الفواتير',
        'invoices',
        {
          'param-contract': contract.id,
        },
        'btn-secondary btn-block',
        'receipt',
      )}</aside></div>`,
    );
  }
  function signModal(id) {
    const contract = owned(A.state(), 'contracts', id);
    if (!contract || contract.status !== 'pending')
      return error('لا يوجد اعتماد معلق على هذا العقد.');
    A.modal(
      'تأكيد موافقة تجريبية',
      `<form class="stack" data-submit="sign-contract"><input type="hidden" name="contractId" value="${E(id)}"><input type="hidden" name="reviewToken" value="${E(contractReview(contract))}"><div class="notice notice-warn"><div><strong>هذه محاكاة موافقة، وليست توقيعًا قانونيًا.</strong><p class="small">${E(contract.title)} · ${money(contract.total)}. لا يتم إرسال توقيع إلى أي جهة.</p></div></div>${field(
        'اسم صاحب الموافقة',
        'signer',
        customer(A.state())?.contact || '',
        {
          minlength: 3,
          maxlength: 120,
        },
      )}${field('اكتب «أوافق» للتأكيد', 'confirmation', '', {
        placeholder: 'أوافق',
      })}<label class="checkbox-row"><input type="checkbox" name="demoConsent" required><span>راجعت النطاق والدفعات والشروط، وأفهم أن هذا سجل تجريبي فقط.</span></label><button type="submit" class="btn btn-primary">${A.icon('signature')}حفظ الموافقة التجريبية</button></form>`,
    );
  }
  function signContract({ data }) {
    const contract = owned(A.state(), 'contracts', data.contractId);
    if (!contract || contract.status !== 'pending')
      return error('العقد ليس بانتظار موافقة؛ يمكنك فتح مشروعه وفواتيره من تفاصيل العقد.');
    if (
      String(data.signer || '').trim().length < 3 ||
      String(data.confirmation || '').trim() !== 'أوافق' ||
      !data.demoConsent
    )
      return error('أكمل الاسم وعبارة التأكيد وموافقة التجربة.');
    if (data.reviewToken !== contractReview(contract))
      return error('تغير العقد أثناء المراجعة. أعد فتحه قبل الموافقة.');
    commit(
      (next) => {
        const current = owned(next, 'contracts', contract.id);
        A.assert(current && current.status === 'pending', 'تغيرت حالة العقد. افتح السجل الحالي.');
        A.assert(
          data.reviewToken === contractReview(current),
          'تغيرت شروط العقد أو دفعاته. راجع النسخة الحالية قبل الموافقة.',
        );
        provisionContract(next, current);
        current.status = 'signed';
        current.signer = String(data.signer).trim();
        current.signedAt = now();
        notify(
          next,
          'اعتماد العقد وفتح خطة المشروع',
          `${customer(next)?.name} وافق على ${current.title}. المشروع ينتظر بدء الفريق والفواتير مرتبطة بجدول العقد.`,
        );
        addMessage(
          next,
          `سجلت موافقتي التجريبية على عقد «${current.title}». أُنشئت مساحة المشروع بانتظار خطة البدء، دون تسجيل تنفيذ أو دفع.`,
        );
      },
      `اعتمد العميل عقد ${contract.title} وفتح خطة المشروع`,
      {
        message: 'حُفظ الاعتماد وأُعد المشروع والفواتير. التنفيذ بانتظار الفريق، ولم تسجل أي دفعة.',
      },
    );
  }
  function provisionSignedContract({ el }) {
    const contract = owned(A.state(), 'contracts', el.dataset.id);
    if (!contract || !['signed', 'active'].includes(contract.status))
      return error('هذا الإجراء متاح للعقود المعتمدة أو النشطة فقط.');
    commit(
      (next) => {
        const current = owned(next, 'contracts', contract.id);
        A.assert(
          current && ['signed', 'active'].includes(current.status),
          'تغيرت حالة العقد. راجع السجل الحالي.',
        );
        provisionContract(next, current);
        notify(
          next,
          'مساحة عقد سابق جاهزة',
          `${customer(next)?.name}: ${current.title}. خطة المشروع وفواتيره جاهزة للمتابعة.`,
        );
      },
      `إعداد مشروع وفواتير العقد المعتمد ${contract.title}`,
      {
        message: 'أصبحت مساحة المشروع وفواتيره مرتبطة بالعقد، دون تكرار السجلات.',
      },
    );
  }
  function printContract({ el }) {
    const state = A.state();
    const contract = owned(state, 'contracts', el.dataset.id);
    if (!contract) return error('العقد غير موجود.');
    const { services } = contractScope(state, contract);
    A.printDocument(
      `نسخة تجريبية — ${contract.title}`,
      `<p><strong>العميل:</strong> ${E(customer(state)?.name)}</p><p><strong>المرجع:</strong> ${E(contract.id)}</p><p><strong>القيمة:</strong> ${money(contract.total)} · <strong>المدفوع:</strong> ${money(contract.paid)}</p><p><strong>المدة:</strong> ${E(date(contract.startDate))} — ${E(date(contract.endDate))}</p><h2>النطاق والتسليمات</h2>${services.map((service) => `<h3>${E(service.title)}</h3><ul>${(service.deliverables || []).map((text) => `<li>${E(text)}</li>`).join('')}</ul>`).join('')}<p>${paragraph(contract.terms)}</p><h2>جدول الدفعات</h2><table class="data-table"><thead><tr><th>الدفعة</th><th>المبلغ</th><th>التاريخ</th><th>الحالة</th></tr></thead><tbody>${(contract.paymentPlan || []).map((item) => `<tr><td>${E(item.label)}</td><td>${money(item.amount)}</td><td>${E(date(item.due))}</td><td>${item.status === 'paid' ? 'مدفوعة' : item.status === 'partial' ? 'مدفوعة جزئيًا' : 'مستحقة'}</td></tr>`).join('')}</tbody></table><p>الموافقة التجريبية: ${E(contract.signer || 'لم تسجل')} ${contract.signedAt ? `— ${E(date(contract.signedAt))}` : ''}</p><p><strong>نسخة توضيحية فقط؛ ليست عقدًا نافذًا أو توقيعًا قانونيًا.</strong></p>`,
    );
  }
  return {
    id: 'contracts',
    routes: {
      contracts: {
        title: 'العقود',
        nav: 'contracts',
        render: renderContracts,
      },
      'contract-detail': {
        title: 'تفاصيل العقد',
        nav: 'contracts',
        render: renderContract,
      },
    },
    actions: {
      'sign-contract-modal': (ctx) => signModal(idFrom(ctx)),
      'sign-contract': signContract,
      'provision-contract': provisionSignedContract,
      'print-contract': printContract,
    },
    api: {
      attachContractSnapshot,
      normalizedPlan,
    },
  };
}
