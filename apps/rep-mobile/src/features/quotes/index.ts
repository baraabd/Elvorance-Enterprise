// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/* ELVORANCE_DASHBOARD_DRILLDOWN_2027 */
import { normalizedFinancials, dollars, cents, suggestedPlan } from '@elvorance/app-runtime/finance';
/** rep / quotes: original v1.1 views and local demo actions. */
export function createQuotesFeature(context, { state, visits }) {
  const {
    A,
    act,
    badge,
    cash,
    chipLink,
    client,
    clone,
    date,
    draftKey,
    drilldownSummary,
    e,
    getVisit,
    go,
    head,
    ic,
    iconGo,
    missing,
    notify,
    now,
    ownClients,
    ownOpps,
    ownQuotes,
    rep,
    section,
    ui,
  } = context;
  const bindQuoteToVisit = (...args) => visits.bindQuoteToVisit(...args);
  const commit = (...args) => state.commit(...args);
  const currentVisitFor = (...args) => visits.currentVisitFor(...args);
  const readDraft = (...args) => state.readDraft(...args);
  const removeDraft = (...args) => state.removeDraft(...args);
  const visitWorking = (...args) => visits.visitWorking(...args);
  const writeDraft = (...args) => state.writeDraft(...args);
  const quoteMath = (q) => {
    const f=normalizedFinancials(q);
    return { subtotal:dollars(f.subtotalCents),discount:dollars(f.discountCents),total:dollars(f.totalCents),percent:f.percent, plan:f.plan, audit:f.audit, mode:f.mode, discountValue:f.value };
  };
  const quoteApproval = (s, q) => {
    const m = quoteMath(q),
      // Approval signatures must use the same persisted quote representation as admin.
      fingerprint = A.quoteFingerprint(q);
    return s.approvals.find(
      (a) =>
        a.type === 'discount' &&
        a.quoteId === q.id &&
        a.clientId === q.clientId &&
        a.quoteFingerprint === fingerprint &&
        Number(a.amount) === m.discount &&
        Number(a.subtotal) === m.subtotal &&
        a.status === 'approved',
    );
  };
  const pendingApproval = (s, q) =>
    s.approvals.find(
      (a) =>
        a.type === 'discount' &&
        a.quoteId === q.id &&
        a.status === 'pending' &&
        a.quoteFingerprint === A.quoteFingerprint(q),
    );
  const quoteStatus = (s, q) =>
    pendingApproval(s, q) ? A.badge('بانتظار اعتماد الخصم', 'warn') : badge(q.status);
  function scopeItems(items, state) {
    return items.map((it) => {
      const svc = state.catalog.find((x) => x.id === it.serviceId);
      return {
        ...clone(it),
        qty: Number(it.qty),
        price: Number(it.price),
        features: clone(it.features || svc?.features || []),
        deliverables: clone(it.deliverables || svc?.deliverables || []),
        duration: it.duration || svc?.duration || '',
        unit: it.unit || svc?.unit || '',
      };
    });
  }
  function composedTerms(q) {
    const base = String(q.baseTerms !== undefined ? q.baseTerms : q.terms || '').trim();
    return [
      base,
      q.proposedDuration ? 'مدة التنفيذ المقترحة: ' + q.proposedDuration : '',
      q.paymentWishes ? 'تفضيلات الدفع المقترحة، وتؤكد نهائيًا في العقد: ' + q.paymentWishes : '',
      quoteMath(q).plan.length ? 'الدفعات المقترحة: ' + quoteMath(q).plan.map(p=>p.label+': '+p.amount+' دولار').join('، ') : '',
    ]
      .filter(Boolean)
      .join('\n\n');
  }
  function quoteFingerprint(q) {
    return A.quoteFingerprint({
      ...q,
      repId: q.repId || rep(A.state()).id,
      terms: composedTerms(q),
    });
  }
  function quoteDraftSlot(params) {
    return draftKey(
      'quote',
      params.id
        ? 'edit:' + params.id
        : params.visit
          ? 'visit:' + params.visit
          : 'client:' + (params.client || 'new') + ':opp:' + (params.opportunity || ''),
    );
  }
  function persistQuoteDraft(q) {
    return writeDraft(q.key, q);
  }
  function quoteSnapshot(q) {
    const m = quoteMath(q);
    return {
      id: q.id,
      visitId: q.visitId || null,
      opportunityId: q.opportunityId || null,
      title: q.title,
      status: q.status,
      acceptedAt: q.acceptedAt || null,
      rejectedAt: q.rejectedAt || null,
      revisionRequest: q.revisionRequest || '',
      validUntil: q.validUntil,
      items: clone(q.items || []),
      subtotal: m.subtotal,
      discount: m.discount,
      total: m.total,
      terms: q.terms || '',
      proposedDuration: q.proposedDuration || '',
      paymentWishes: q.paymentWishes || '',
      paymentPlan: clone(q.paymentPlan || quoteMath(q).plan),
      discountMode: q.discountMode || 'amount',
      discountValue: q.discountValue ?? q.discount ?? 0,
      notes: q.notes || '',
      scopeSnapshot: q.scopeSnapshot ? clone(q.scopeSnapshot) : null,
      version: q.version || 1,
    };
  }
  function quoteReturn(s, q, visitParam) {
    const v = getVisit(s, visitParam || q?.visitId);
    return v
      ? go(
          v.status === 'active' ? 'visit-active' : 'visit-detail',
          'العودة إلى الزيارة',
          'arrow-right',
          `data-id="${v.id}"`,
          'btn btn-secondary',
        )
      : '';
  }
  function ensureQuote(s, params) {
    const existing = params.id && ownQuotes(s).find((q) => q.id === params.id);
    const requestedClient = existing?.clientId || params.client || '';
    const v = currentVisitFor(s, requestedClient, params.visit || existing?.visitId);
    const context = {
      ...params,
      client: requestedClient,
      visit: v?.id || params.visit || existing?.visitId || '',
    };
    const key = quoteDraftSlot(context);
    if (ui.quote?.key === key) return ui.quote;
    const persisted = readDraft(key);
    if (persisted) {
      ui.quote = {
        ...persisted,
        key,
        conflict:
          !!existing &&
          (persisted.baseVersion !== (existing.version || 1) ||
            persisted.sourceFingerprint !== quoteFingerprint(existing)),
        visitId: v?.id || persisted.visitId || '',
        baseTerms: persisted.baseTerms ?? persisted.terms ?? '',
        discountMode: persisted.discountMode || 'amount',
        discountValue: persisted.discountValue ?? persisted.discount ?? 0,
        paymentPlanEdited: persisted.paymentPlanEdited || false,
      };
      return ui.quote;
    }
    const working = v ? visitWorking(s, v) : {};
    ui.quote = {
      key,
      id: existing?.id || '',
      repId: rep(s).id,
      baseVersion: existing?.version || 1,
      sourceFingerprint: existing ? quoteFingerprint(existing) : '',
      clientId: requestedClient,
      visitId: v?.id || existing?.visitId || '',
      opportunityId: existing?.opportunityId || params.opportunity || '',
      title: existing?.title || 'عرض حلول رقمية',
      items: existing ? scopeItems(existing.items, s) : [],
      discount: Number(existing?.discount) || 0,
      discountMode: existing?.discountMode || 'amount',
      discountValue: existing?.discountValue ?? existing?.discount ?? 0,
      paymentPlan: clone(existing?.paymentPlan || []),
      paymentPlanEdited: !!existing?.paymentPlanEdited,
      validUntil: existing?.validUntil || A.addDays(14),
      terms:
        existing?.baseTerms ??
        existing?.terms ??
        'تُراجع التفاصيل النهائية والجدول الزمني قبل اعتماد العقد. يشمل السعر البنود الموضحة فقط.',
      baseTerms:
        existing?.baseTerms ??
        existing?.terms ??
        'تُراجع التفاصيل النهائية والجدول الزمني قبل اعتماد العقد. يشمل السعر البنود الموضحة فقط.',
      proposedDuration: existing?.proposedDuration || working.proposedDuration || '',
      paymentWishes: existing?.paymentWishes || working.paymentWishes || '',
      notes: existing?.notes || working.notes || '',
    };
    if (params.service) {
      const svc = s.catalog.find((x) => x.id === params.service);
      if (svc)
        ui.quote.items.push(
          scopeItems(
            [
              {
                serviceId: svc.id,
                title: svc.title,
                qty: 1,
                price: Number(svc.price),
              },
            ],
            s,
          )[0],
        );
    }
    return ui.quote;
  }
  function financialEditor(q,m) {
    const plan=m.plan||[];
    let distributed=0;
    const rows=plan.map((payment,i)=>{
      distributed += cents(payment.amount);
      const remainder=Math.round((m.total*100) - distributed);
      return `<div class="rep-pay-row"><div class="row-between"><strong>${i+1} · ${e(payment.label||('الدفعة '+(i+1)))}</strong><small class="muted" id="rep-payment-rest-${i}">${remainder<0?'زيادة '+cash(-remainder/100):'متبقٍ '+cash(remainder/100)}</small></div><label class="field">المبلغ بالدولار<input type="number" class="input num" inputmode="decimal" step="0.01" min="0.01" data-input="quote-payment-amount" data-index="${i}" value="${e(payment.amount)}" required></label><button class="btn btn-ghost btn-sm" type="button" data-action="quote-payment-fill" data-index="${i}">تخصيص المتبقي لهذه الدفعة</button></div>`;
    }).join('');
    const audit=m.audit;
    const balance = audit.remainingCents;
    const message = !Number.isFinite(m.total)||m.total<=0?'أضف خدمة بسعر صحيح لإعداد الدفعات.':audit.kind==='first_low'?`الدفعة الأولى أقل من 20%، يجب ألا تقل عن ${cash(audit.minFirstCents/100)}.`:balance>0?`متبقٍ للتوزيع: ${cash(balance/100)}.`:balance<0?`زيادة يجب تسويتها: ${cash(-balance/100)}.`:'جدول الدفعات متوازن.';
    return `<section class="card stack rep-financial-editor" aria-label="الخصم وتوزيع الدفعات"><h2>السعر والخصم أولًا</h2><p class="muted small">اختر الدولار أو النسبة، ثم راجع صافي العرض قبل الدفعات.</p><div class="rep-amount-summary"><span>قيمة الخدمات قبل الخصم</span><strong class="num" id="rep-quote-subtotal">${cash(m.subtotal)}</strong></div><div class="row wrap"><button type="button" class="btn ${m.mode==='amount'?'btn-primary':'btn-secondary'}" data-action="quote-discount-mode" data-value="amount" aria-pressed="${m.mode==='amount'}">خصم بالدولار</button><button type="button" class="btn ${m.mode==='percent'?'btn-primary':'btn-secondary'}" data-action="quote-discount-mode" data-value="percent" aria-pressed="${m.mode==='percent'}">خصم بالنسبة المئوية</button></div><label class="field">${m.mode==='percent'?'نسبة الخصم (%)':'قيمة الخصم ($)'}<input class="input num" type="number" inputmode="decimal" min="0" ${m.mode==='percent'?'max="100"':''} step="0.01" data-input="quote-discount-input" value="${e(m.discountValue)}"></label><div class="rep-amount-summary"><span>الخصم الفعلي</span><strong class="num" id="rep-quote-discount-value">${cash(m.discount)}</strong></div><div class="rep-net-total"><span>صافي العرض بعد الخصم</span><strong class="num" id="rep-quote-total">${cash(m.total)}</strong></div><p id="rep-discount-notice" class="notice notice-warn small" ${m.percent>15?'':'hidden'}>الخصم يتجاوز 15% ويحتاج اعتماد الإدارة قبل الإرسال.</p><h2>جدول الدفعات</h2><p class="small muted">الدفعة الأولى لا تقل عن 20% من صافي العرض. لا يُعد هذا الجدول إثباتًا لأي تحصيل.</p><div class="rep-distribution"><div><span>صافي العرض</span><strong id="rep-finance-net">${cash(m.total)}</strong></div><div><span>الموزع</span><strong id="rep-finance-distributed">${cash(audit.sumCents/100)}</strong></div><div><span>المتبقي</span><strong id="rep-finance-balance">${cash(Math.abs(balance)/100)}</strong></div></div><div id="rep-payment-rows" class="stack-sm">${rows}</div><div class="row wrap"><button class="btn btn-secondary" data-action="quote-payment-add" type="button">+ إضافة دفعة بالمتبقي</button><button class="btn btn-ghost" data-action="quote-payment-suggest" type="button">اقتراح 30% / 40% / الرصيد</button></div><div class="notice ${audit.valid?'notice-good':'notice-warn'}" id="rep-plan-status" role="status">${e(message)}</div></section>`;
  }
  function quoteBuilder({ state: s, params }) {
    const existing = params.id && ownQuotes(s).find((q) => q.id === params.id);
    if (params.id && (!existing || !['draft', 'revision_requested'].includes(existing.status)))
      return missing('لا يمكن تعديل هذا العرض؛ يمكنك نسخه كعرض جديد');
    const v = params.visit ? s.visits.find(x=>x.id===params.visit):existing?.visitId?s.visits.find(x=>x.id===existing.visitId):null;
    if(v?.status==='active'&&!v.discovery) return head('أكمل استبيان الاحتياج أولًا','حتى لا يُرسل عرض مبني على إجابات ناقصة.',go('visit-questionnaire','فتح الاستبيان','checklist',`data-id="${v.id}"`,'btn btn-primary'));
    const q = ensureQuote(s, params),
      m = quoteMath(q);
    return `${head(existing ? 'تعديل عرض السعر' : 'عرض واضح من أول سطر', 'اختياراتك محفوظة كمسودة عند التنقل وإعادة التحميل.', quoteReturn(s, q, q.visitId))}${q.visitId ? '<div class="notice notice-good">هذا العرض مرتبط بالزيارة، وستظهر بنوده تلقائيًا في ملخص الختام.</div>' : ''}${q.conflict ? `<div class="card notice notice-warn"><h3>تغيّرت النسخة المحفوظة أثناء عملك</h3><p>حافظنا على مدخلاتك أدناه. راجع التغيير في العرض الحالي، ثم اختر تطبيق مدخلاتك على النسخة الجديدة أو استخدام المحفوظ.</p><div class="row wrap">${go('quote-detail', 'مراجعة العرض الحالي', 'file', `data-id="${q.id}"`)}${act('quote-rebase', 'استخدام مدخلاتي بعد المراجعة', 'check')}${act('quote-discard', 'استخدام النسخة المحفوظة', 'refresh')}</div></div>` : ''}<form id="rep-quote-form" data-submit="save-quote" class="dashboard-grid"><div class="main-column"><div class="card"><div class="form-grid"><label class="field">العميل<select class="select" required name="clientId" data-change="quote-field" data-field="clientId" ${q.visitId ? 'disabled title="عميل العرض محدد بالزيارة المرتبطة"' : ''}><option value="">اختر العميل</option>${ownClients(
      s,
    )
      .map(
        (c) =>
          `<option value="${c.id}" ${q.clientId === c.id ? 'selected' : ''} ${c.doNotContact ? 'disabled' : ''}>${e(c.name)}</option>`,
      )
      .join(
        '',
      )}</select></label><label class="field">عنوان العرض<input class="input" name="title" value="${e(q.title)}" required minlength="3" maxlength="120" data-input="quote-field" data-field="title"></label><label class="field">صالح حتى<input class="input" type="date" name="validUntil" min="${A.today()}" required value="${e(q.validUntil)}" data-change="quote-field" data-field="validUntil"></label><label class="field">الفرصة المرتبطة<select class="select" name="opportunityId" data-change="quote-field" data-field="opportunityId"><option value="">دون ربط</option>${ownOpps(
      s,
    )
      .filter((o) => !q.clientId || o.clientId === q.clientId)
      .map(
        (o) =>
          `<option value="${o.id}" ${q.opportunityId === o.id ? 'selected' : ''}>${e(o.title)}</option>`,
      )
      .join(
        '',
      )}</select></label></div></div><div class="card">${section('بنود العرض', 'الأسعار أرقام فعلية؛ الكميات والخصم يدخلان في الحساب.')}<div class="stack">${q.items.map((it, i) => `<div class="rep-quote-item"><div class="rep-grow"><strong>${e(it.title)}</strong><p class="small muted num">${cash(it.price)} للوحدة</p></div><label class="field rep-qty">الكمية<input class="input num" type="number" min="1" max="100" step="1" required value="${it.qty}" data-input="quote-qty" data-index="${i}" aria-label="كمية ${e(it.title)}"></label><strong class="num" id="rep-line-${i}">${cash(it.qty * it.price)}</strong><button type="button" class="icon-btn" data-action="quote-remove" data-index="${i}" aria-label="حذف ${e(it.title)}">${ic('trash')}</button></div>`).join('') || A.empty('ابدأ بالخدمة المناسبة', 'أضف بندًا واحدًا على الأقل من القائمة أدناه.')}</div><div class="divider"></div><div class="rep-catalog-picker">${s.catalog
      .filter((svc) => !q.items.some((x) => x.serviceId === svc.id))
      .map(
        (svc) =>
          `<button class="rep-service-add" type="button" data-action="quote-add" data-id="${svc.id}"><span class="icon-box">${ic(svc.icon || 'layers')}</span><span class="rep-grow"><strong>${e(svc.title)}</strong><small class="muted num">${cash(svc.price)}</small></span>${ic('plus')}</button>`,
      )
      .join(
        '',
      )}</div></div>${financialEditor(q,m)}<div class="card stack"><div class="form-grid"><label class="field">مدة التنفيذ المقترحة<input class="input" name="proposedDuration" maxlength="200" value="${e(q.proposedDuration)}" data-input="quote-field" data-field="proposedDuration"></label><label class="field">رغبات الدفع المقترحة<input class="input" name="paymentWishes" maxlength="400" value="${e(q.paymentWishes)}" data-input="quote-field" data-field="paymentWishes"></label></div><label class="field">الشروط والنطاق<textarea class="textarea" name="terms" required minlength="10" maxlength="2000" rows="4" data-input="quote-field" data-field="terms">${e(q.terms)}</textarea></label><label class="field">ملاحظة للعميل<textarea class="textarea" name="notes" maxlength="1200" rows="3" data-input="quote-field" data-field="notes">${e(q.notes)}</textarea></label></div></div><aside class="side-column"><div class="card rep-quote-summary"><h2>ملخص العرض</h2><p class="muted small">يُحسب المبلغ النهائي بعد الخصم في القسم السابق.</p><div class="rep-net-total"><span>الإجمالي بعد الخصم</span><strong class="stat-value num" id="rep-quote-total-aside">${cash(m.total)}</strong></div><button class="btn btn-primary btn-block" type="button" data-action="save-send-quote">${ic('send')}<span id="rep-send-label">${m.percent > 15 ? 'طلب اعتماد الخصم' : 'إرسال إلى العميل'}</span></button><button class="btn btn-secondary btn-block" type="submit">${ic('file')}حفظ المسودة</button><p class="tiny muted">الإرسال يظهر العرض في تطبيق العميل ضمن هذا العرض المحلي، دون بريد أو رسالة خارجية.</p></div></aside></form>`;
  }
  function quotes({ state: s, params }) {
    const filter = params.filter || 'all',
      rows = ownQuotes(s)
        .filter((q) => filter === 'all' || q.status === filter)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    return `${head('عروض الأسعار', 'كل نسخة، قرار، وطلب تعديل في سجل واحد.', act('quote-new', 'عرض جديد', 'plus', '', 'btn btn-primary'))}${drilldownSummary(params, 'عروض تنتظر العميل', rows.length, 'افتح العرض لمراجعة التفاصيل وقرار العميل')}<div class="chips">${[
      ['all', 'الكل'],
      ['draft', 'المسودات'],
      ['sent', 'مرسلة'],
      ['revision_requested', 'تحتاج تعديلًا'],
      ['accepted', 'مقبولة'],
    ]
      .map(([k, l]) => chipLink('quotes', k, l, k === filter))
      .join(
        '',
      )}</div><div class="grid-2">${rows.map((q) => `<article class="card"><div class="row-between">${quoteStatus(s, q)}${iconGo('quote-detail', 'تفاصيل العرض', 'chevron-left', `data-id="${q.id}"`)}</div><h2>${e(q.title)}</h2><p class="muted small">${e(s.clients.find((c) => c.id === q.clientId)?.name)} · ${q.items.length} بنود</p><div class="row-between"><strong class="stat-value num">${cash(q.total)}</strong><span class="small muted">حتى ${e(date(q.validUntil))}</span></div></article>`).join('') || A.empty('لا عروض في هذه القائمة', 'ابدأ من احتياج العميل وأنشئ عرضًا واضحًا.')}</div>`;
  }
  function quoteDetail({ state: s, params }) {
    const q = ownQuotes(s).find((x) => x.id === params.id);
    if (!q) return missing('العرض غير متاح');
    const c = s.clients.find((x) => x.id === q.clientId),
      m = quoteMath(q),
      approvals = s.approvals.filter((a) => a.quoteId === q.id && a.type === 'discount'),
      editable = ['draft', 'revision_requested'].includes(q.status);
    return `${head(q.title, c?.name || '', `<div class="row wrap">${quoteReturn(s, q, params.visit)}${act('print-quote', 'عرض قابل للطباعة', 'download', `data-id="${q.id}"`)}</div>`)}<div class="dashboard-grid"><div class="main-column"><div class="card"><div class="row-between">${quoteStatus(s, q)}<span class="small muted">صالح حتى ${e(date(q.validUntil))}</span></div>${q.revisionRequest ? `<div class="notice notice-warn"><strong>طلب تعديل من العميل</strong><p>${e(q.revisionRequest)}</p></div>` : ''}<div class="table-wrap"><table class="data-table"><thead><tr><th>الخدمة</th><th>الكمية</th><th>السعر</th><th>المجموع</th></tr></thead><tbody>${q.items.map((it) => `<tr><td>${e(it.title)}</td><td class="num">${Number(it.qty)}</td><td class="num">${cash(it.price)}</td><td class="num">${cash(Number(it.qty) * Number(it.price))}</td></tr>`).join('')}</tbody></table></div><div class="rep-totals"><div><span>قبل الخصم</span><strong class="num">${cash(m.subtotal)}</strong></div><div><span>الخصم</span><strong class="num">${cash(m.discount)}</strong></div><div class="rep-total"><span>الإجمالي</span><strong class="num">${cash(m.total)}</strong></div></div><h3>الشروط</h3><p>${e(q.terms)}</p>${q.notes ? `<h3>ملاحظة</h3><p>${e(q.notes)}</p>` : ''}</div>${approvals.length ? `<div class="card"><h2>قرارات الخصم</h2>${approvals.map((a) => `<div class="list-item"><div class="rep-grow"><strong>${e(a.title)}</strong><p class="small muted">${e(a.decisionNote || a.details)}</p></div>${badge(a.status)}</div>`).join('')}</div>` : ''}</div><aside class="side-column"><div class="card card-accent"><h2>الخطوة التالية</h2>${editable ? act('send-quote', pendingApproval(s, q) ? 'بانتظار الإدارة' : 'إرسال إلى العميل', 'send', `data-id="${q.id}" ${pendingApproval(s, q) ? 'disabled' : ''}`, 'btn btn-primary btn-block') + go('quote-builder', 'تعديل العرض', 'edit', `data-id="${q.id}" data-param-visit="${e(q.visitId || params.visit || '')}"`, 'btn btn-secondary btn-block') : `<p>${q.status === 'accepted' ? 'وافق العميل على العرض. يمكنك متابعة العقد من ملف العميل والإدارة.' : q.status === 'sent' ? 'العرض ظاهر في تطبيق العميل ويستطيع قبوله أو طلب تعديله.' : 'سُجّل قرار العميل في العرض.'}</p>`}${act('duplicate-quote', 'نسخ كمسودة جديدة', 'copy', `data-id="${q.id}"`, 'btn btn-ghost btn-block')}${go('messages', 'المحادثة', 'message', `data-id="${q.clientId}"`, 'btn btn-ghost btn-block')}</div></aside></div>`;
  }
  function quoteValidation(s, q) {
    if (!client(s, q.clientId)) return 'اختر عميلًا من حسابك.';
    if (client(s, q.clientId).doNotContact)
      return 'العميل طلب عدم التواصل؛ لا يُنشأ أو يُرسل عرض جديد له.';
    if (q.title.trim().length < 3 || q.terms.trim().length < 10) return 'أكمل عنوان العرض وشروطه.';
    if (!q.items.length) return 'أضف خدمة واحدة على الأقل.';
    if (
      q.items.some(
        (it) =>
          !Number.isInteger(Number(it.qty)) ||
          Number(it.qty) < 1 ||
          Number(it.qty) > 100 ||
          !Number.isFinite(Number(it.price)) ||
          Number(it.price) < 0,
      )
    )
      return 'راجع الكميات والأسعار. الكمية من 1 إلى 100.';
    const m = quoteMath(q);
    if (
      !Number.isFinite(m.subtotal) ||
      !Number.isFinite(Number(q.discount)) ||
      Number(q.discount) < 0 ||
      Number(q.discount) >= m.subtotal
    )
      return 'يجب أن يكون الخصم أقل من إجمالي الخدمات، وألا يكون سالبًا.';
    if (q.paymentPlanEdited && !m.audit.valid) {
      if (m.audit.kind === 'first_low') return 'الدفعة الأولى يجب ألا تقل عن 20% من صافي العرض.';
      if (m.audit.kind === 'short') return 'الدفعات أقل من صافي العرض بقيمة ' + cash(m.audit.remainingCents/100) + '.';
      if (m.audit.kind === 'excess') return 'الدفعات تتجاوز صافي العرض بقيمة ' + cash(-m.audit.remainingCents/100) + '.';
      return 'أكمل مبالغ الدفعات بأرقام موجبة.';
    }
    if (!m.audit.valid) return 'أكمل جدول الدفعات بعد التسعير والخصم.';
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(q.validUntil || '') ||
      !Number.isFinite(new Date(q.validUntil).getTime()) ||
      q.validUntil < A.today()
    )
      return 'اختر تاريخ صلاحية اليوم أو لاحقًا.';
    if (
      q.opportunityId &&
      !ownOpps(s).some((o) => o.id === q.opportunityId && o.clientId === q.clientId)
    )
      return 'الفرصة المختارة لا تتبع هذا العميل.';
    return '';
  }
  function addDiscountApproval(s, q) {
    const m = quoteMath(q),
      // Admin verifies the fingerprint of this saved quote, not an editor-only projection.
      fingerprint = A.quoteFingerprint(q);
    const duplicate = s.approvals.find(
      (a) =>
        a.quoteId === q.id &&
        a.type === 'discount' &&
        a.status === 'pending' &&
        a.quoteFingerprint === fingerprint,
    );
    if (duplicate) return;
    s.approvals
      .filter(
        (a) =>
          a.quoteId === q.id &&
          a.type === 'discount' &&
          a.status === 'pending' &&
          a.quoteFingerprint !== fingerprint,
      )
      .forEach((a) => {
        a.status = 'rejected';
        a.superseded = true;
        a.decisionNote =
          'استُبدل هذا الطلب تلقائيًا بعد تغيير نسخة العرض؛ لا يمثل رفضًا تجاريًا من الإدارة.';
      });
    s.approvals.unshift({
      id: A.id('approval'),
      type: 'discount',
      quoteId: q.id,
      quoteVersion: q.version || 1,
      quoteFingerprint: fingerprint,
      subtotal: m.subtotal,
      repId: q.repId,
      clientId: q.clientId,
      title: 'اعتماد خصم على ' + q.title,
      details: `قيمة الخدمات ${cash(m.subtotal)}، خصم ${cash(m.discount)} بنسبة ${m.percent.toFixed(1)}%، والإجمالي ${cash(m.total)}. الاعتماد خاص بالعميل والنطاق والشروط في هذه النسخة.`,
      amount: m.discount,
      status: 'pending',
      createdAt: now(),
      decisionNote: '',
    });
    notify(
      s,
      'admin',
      'طلب اعتماد خصم',
      `${s.clients.find((c) => c.id === q.clientId)?.name}: خصم ${m.percent.toFixed(1)}% يحتاج قرارك.`,
    );
  }
  function saveQuote(s, requestedMode, form, destination) {
    const q = ui.quote;
    if (!q) return;
    if (form && !form.reportValidity()) return;
    const error = quoteValidation(s, q);
    if (error) return A.toast(error, 'error');
    const id = q.id || A.id('quote');
    q.id = id;
    persistQuoteDraft(q);
    let committed,
      needsApproval = false,
      wasOffline = false;
    const ok = commit(
      (state) => {
        const c = client(state, q.clientId);
        A.assert(c && !c.doNotContact, 'العميل لم يعد متاحًا للتواصل أو تغيّر إسناده.');
        A.assert(!quoteValidation(state, q), quoteValidation(state, q));
        const existing = state.quotes.find((x) => x.id === id);
        A.assert(
          !existing ||
            (existing.repId === rep(state).id &&
              ['draft', 'revision_requested'].includes(existing.status)),
          'العرض لم يعد مسودة قابلة للتعديل؛ افتح نسخته الحالية.',
        );
        if (
          existing &&
          q.sourceFingerprint &&
          (q.baseVersion !== (existing.version || 1) ||
            q.sourceFingerprint !== quoteFingerprint(existing))
        ) {
          q.conflict = true;
          persistQuoteDraft(q);
        }
        A.assert(
          !q.conflict,
          'تغيّر العرض في نافذة أخرى. مسودتك محفوظة؛ راجع النسخة الحالية قبل الحفظ.',
        );
        A.assert(
          !q.opportunityId ||
            ownOpps(state).some((o) => o.id === q.opportunityId && o.clientId === c.id),
          'الفرصة لم تعد تتبع هذا العميل.',
        );
        const items = scopeItems(q.items, state),
          m = quoteMath({
            ...q,
            items,
          });
        const visit = q.visitId && getVisit(state, q.visitId);
        A.assert(!q.visitId || (visit && visit.clientId === c.id), 'الزيارة لا تتبع هذا العميل.');
        const candidate = {
          id,
          clientId: c.id,
          repId: rep(state).id,
          visitId: q.visitId || '',
          opportunityId: q.opportunityId || existing?.opportunityId || '',
          title: q.title.trim(),
          items,
          discount: m.discount,
          discountMode: q.discountMode || 'amount',
          discountValue: q.discountValue ?? q.discount ?? 0,
          paymentPlan: clone(m.plan),
          paymentPlanEdited: !!q.paymentPlanEdited,
          total: m.total,
          status: 'draft',
          validUntil: q.validUntil,
          baseTerms: q.baseTerms ?? q.terms,
          terms: composedTerms(q),
          proposedDuration: String(q.proposedDuration || '').trim(),
          paymentWishes: String(q.paymentWishes || '').trim(),
          notes: q.notes.trim(),
          revisionRequest: existing?.revisionRequest || '',
          createdAt: existing?.createdAt || now(),
          updatedAt: now(),
          version: existing
            ? (existing.version || 1) +
              (quoteFingerprint({
                ...q,
                items,
              }) === quoteFingerprint(existing)
                ? 0
                : 1)
            : 1,
          draftKey: q.key,
        };
        wasOffline = requestedMode === 'sent' && state.session.offline;
        candidate.status = 'draft';
        candidate.scopeSnapshot = {
          version: candidate.version,
          capturedAt: now(),
          items: clone(items),
          terms: candidate.terms,
          proposedDuration: candidate.proposedDuration,
          paymentWishes: candidate.paymentWishes,
        };
        if (!candidate.opportunityId) {
          const serviceIds = items.map((it) => it.serviceId);
          const match = ownOpps(state).find(
            (o) =>
              o.clientId === c.id &&
              !['won', 'lost'].includes(o.stage) &&
              serviceIds.length &&
              serviceIds.every((svc) => (o.serviceIds || []).includes(svc)),
          );
          if (match) candidate.opportunityId = match.id;
          else {
            const oppId = A.id('opp');
            candidate.opportunityId = oppId;
            state.opportunities.unshift({
              id: oppId,
              clientId: c.id,
              repId: rep(state).id,
              visitId: candidate.visitId || '',
              visitIds: candidate.visitId ? [candidate.visitId] : [],
              title: candidate.title + ' · ' + c.name,
              stage: candidate.status === 'sent' ? 'proposal' : 'qualified',
              value: candidate.total,
              probability: candidate.status === 'sent' ? 55 : 40,
              expectedClose: candidate.validUntil,
              serviceIds,
              lossReason: '',
              notes: candidate.notes,
            });
          }
        }
        needsApproval =
          requestedMode === 'sent' &&
          !wasOffline &&
          m.percent > 15 &&
          !quoteApproval(state, candidate);
        if (requestedMode === 'sent' && !wasOffline && !needsApproval) {
          candidate.status = 'sent';
          candidate.sentAt = now();
          candidate.revisionRequest = '';
        }
        const index = state.quotes.findIndex((x) => x.id === id);
        if (index < 0) state.quotes.unshift(candidate);
        else state.quotes[index] = candidate;
        bindQuoteToVisit(state, candidate);
        if (needsApproval) addDiscountApproval(state, candidate);
        if (candidate.status === 'sent') {
          notify(state, 'client', 'عرض سعر جديد', candidate.title, {
            clientId: candidate.clientId,
          });
          const o = state.opportunities.find((x) => x.id === candidate.opportunityId);
          if (o && ['new', 'qualified'].includes(o.stage)) {
            o.stage = 'proposal';
            o.probability = 55;
          }
        }
        committed = candidate;
      },
      requestedMode === 'sent'
        ? 'مراجعة وإرسال عرض مرتبط بسجل الزيارة'
        : 'حفظ مسودة عرض مرتبطة بالاحتياج',
    );
    if (ok === false || !committed) {
      if (q.conflict) A.refresh();
      return false;
    }
    removeDraft(q.key);
    ui.quote = null;
    if (destination === 'visit-outcome' && committed.visitId) {
      ui.outcome[committed.visitId] = {
        step: 'summary',
      };
      removeDraft(draftKey('outcome', committed.visitId));
      A.go('visit-outcome', {
        id: committed.visitId,
      });
    } else
      A.go('quote-detail', {
        id,
        visit: committed.visitId || '',
      });
    A.toast(
      needsApproval
        ? 'حُفظ العرض وأُرسل طلب الخصم إلى الإدارة.'
        : committed.status === 'sent'
          ? 'ظهر العرض في تطبيق العميل، وربطناه بملخص الزيارة.'
          : wasOffline
            ? 'حُفظت مسودة؛ أعد الإرسال بعد إنهاء وضع دون اتصال.'
            : 'حُفظ العرض ويمكن العودة إلى الزيارة ومراجعة ملخصها.',
      'success',
    );
    return true;
  }
  function updateQuoteNumbers() {
    if (!ui.quote) return;
    const m = quoteMath(ui.quote);
    const set = (id, text) => {
      const node = document.getElementById(id);
      if (node) node.textContent = text;
    };
    set('rep-quote-subtotal', cash(m.subtotal));
    set('rep-quote-total', cash(m.total));
    set('rep-quote-percent', m.percent.toFixed(1) + '%');
    set('rep-quote-total-aside', cash(m.total));
    set('rep-quote-discount-value', cash(m.discount));
    set('rep-finance-net', cash(m.total));
    set('rep-finance-distributed', cash(m.audit.sumCents/100));
    set('rep-finance-balance', cash(Math.abs(m.audit.remainingCents)/100));
    const status=document.getElementById('rep-plan-status');
    if(status){const audit=m.audit;status.textContent=audit.kind==='first_low'?'الدفعة الأولى أقل من 20%: الحد الأدنى '+cash(audit.minFirstCents/100):audit.kind==='short'?'متبقٍ للتوزيع: '+cash(audit.remainingCents/100):audit.kind==='excess'?'زيادة يجب تسويتها: '+cash(-audit.remainingCents/100):audit.valid?'جدول الدفعات متوازن.':'راجع الأسعار والدفعات.';status.classList.toggle('notice-good',!!audit.valid);status.classList.toggle('notice-warn',!audit.valid);}
    let sum=0;
    m.plan.forEach((payment,i)=>{sum+=cents(payment.amount);const balance=Math.round(m.total*100)-sum;set('rep-payment-rest-'+i, balance<0?'زيادة '+cash(-balance/100):'متبقٍ '+cash(balance/100));});
    set('rep-send-label', m.percent > 15 ? 'طلب اعتماد الخصم' : 'إرسال إلى العميل');
    const warning = document.getElementById('rep-discount-notice');
    if (warning) warning.hidden = m.percent <= 15;
    ui.quote.items.forEach((it, i) => set('rep-line-' + i, cash(it.qty * it.price)));
  }
  return {
    id: 'quotes',
    routes: {
      'quote-builder': {
        title: 'إعداد عرض السعر',
        render: quoteBuilder,
        nav: 'opportunities',
      },
      quotes: {
        title: 'عروض الأسعار',
        render: quotes,
        nav: 'opportunities',
      },
      'quote-detail': {
        title: 'تفاصيل العرض',
        render: quoteDetail,
        nav: 'opportunities',
      },
    },
    actions: {
      'quote-new'({ el, state }) {
        const c = client(state, el.dataset.id);
        if (c?.doNotContact)
          return A.toast('العميل طلب عدم التواصل؛ لا يمكن إنشاء عرض جديد له.', 'error');
        if (ui.quote) persistQuoteDraft(ui.quote);
        ui.quote = null;
        const v = c ? currentVisitFor(state, c.id, el.dataset.visit) : null;
        if (v?.status === 'active' && !v.discovery) return A.go('visit-questionnaire',{id:v.id});
        const params = {
          client: c?.id || '',
          opportunity: el.dataset.opportunity || '',
          service: el.dataset.service || '',
          visit: v?.status === 'active' ? v.id : '',
        };
        const draft = ensureQuote(state, params);
        const svc = state.catalog.find((item) => item.id === params.service);
        if (svc && !draft.items.some((item) => item.serviceId === svc.id))
          draft.items.push(
            scopeItems(
              [
                {
                  serviceId: svc.id,
                  title: svc.title,
                  qty: 1,
                  price: Number(svc.price),
                },
              ],
              state,
            )[0],
          );
        if (!persistQuoteDraft(draft)) return;
        A.go('quote-builder', params);
      },
      'quote-rebase'({ state }) {
        const current = ui.quote && ownQuotes(state).find((q) => q.id === ui.quote.id);
        if (!current || !['draft', 'revision_requested'].includes(current.status))
          return A.toast('النسخة الحالية لم تعد قابلة للتعديل.', 'error');
        ui.quote.baseVersion = current.version || 1;
        ui.quote.sourceFingerprint = quoteFingerprint(current);
        ui.quote.conflict = false;
        persistQuoteDraft(ui.quote);
        A.refresh();
      },
      'quote-discard'() {
        if (!ui.quote) return;
        const key = ui.quote.key;
        A.confirm(
          'استخدام النسخة المحفوظة؟',
          'ستستبدل مدخلات المسودة الحالية بالنسخة المحفوظة بعد مراجعتها.',
          () => {
            removeDraft(key);
            ui.quote = null;
            A.refresh();
          },
        );
      },
      'quote-field'({ el, state }) {
        if (!ui.quote) return;
        const field = el.dataset.field;
        if (
          ![
            'clientId',
            'title',
            'validUntil',
            'opportunityId',
            'terms',
            'notes',
            'proposedDuration',
            'paymentWishes',
          ].includes(field)
        )
          return;
        if (field === 'clientId' && ui.quote.visitId && el.value !== ui.quote.clientId) {
          el.value = ui.quote.clientId;
          return A.toast('هذا العرض مرتبط بعميل الزيارة؛ أنشئ عرضًا مستقلًا لعميل آخر.', 'info');
        }
        if (field === 'clientId' && client(state, el.value)?.doNotContact) {
          el.value = ui.quote.clientId;
          return A.toast('هذا العميل طلب عدم التواصل.', 'error');
        }
        ui.quote[field] = el.value;
        if (field === 'terms') ui.quote.baseTerms = el.value;
        if (field === 'clientId') ui.quote.opportunityId = '';
        persistQuoteDraft(ui.quote);
        if (field === 'clientId') A.refresh();
      },
      'quote-qty'({ el }) {
        if (!ui.quote) return;
        const item = ui.quote.items[Number(el.dataset.index)];
        if (item) item.qty = Number(el.value);
        persistQuoteDraft(ui.quote);
        updateQuoteNumbers();
      },
      'quote-discount'({ el }) {
        if (ui.quote) {
          ui.quote.discount = Number(el.value);
          ui.quote.discountValue = Number(el.value);
          ui.quote.discountMode = 'amount';
          persistQuoteDraft(ui.quote);
        }
        updateQuoteNumbers();
      },
      'quote-discount-input'({el}) {
        if(!ui.quote)return;
        ui.quote.discountValue=el.value;
        const f=normalizedFinancials(ui.quote);
        ui.quote.discount=dollars(f.discountCents);
        persistQuoteDraft(ui.quote);updateQuoteNumbers();
      },
      'quote-payment-amount'({el}) {
        if(!ui.quote)return;
        const f=normalizedFinancials(ui.quote);
        const index=Number(el.dataset.index);
        if(index<0 || index>=f.plan.length)return;
        ui.quote.paymentPlan=f.plan.map((p,i)=>i===index?{...p,amount:el.value}:p);
        ui.quote.paymentPlanEdited=true;
        persistQuoteDraft(ui.quote);updateQuoteNumbers();
      },
      'quote-discount-mode'({el}) {
        if(!ui.quote)return;
        const mode=el.dataset.value;
        if(!['amount','percent'].includes(mode))return;
        const financials=normalizedFinancials(ui.quote);
        ui.quote.discountMode=mode;
        ui.quote.discountValue=mode==='amount'?dollars(financials.discountCents):Number(financials.percent.toFixed(2));
        ui.quote.discount=dollars(financials.discountCents);
        persistQuoteDraft(ui.quote);A.refresh();
      },
      'quote-payment-add'() {
        if(!ui.quote)return;
        const financials=normalizedFinancials(ui.quote);
        if(financials.audit.remainingCents<=0)return A.toast('لا يوجد رصيد موجب لإضافته.', 'info');
        ui.quote.paymentPlan=financials.plan.concat([{id:'instalment-'+Date.now(),label:'دفعة إضافية',amount:dollars(financials.audit.remainingCents),due:''}]);
        ui.quote.paymentPlanEdited=true;persistQuoteDraft(ui.quote);A.refresh();
      },
      'quote-payment-fill'({el}) {
        if(!ui.quote)return;
        const index=Number(el.dataset.index);const f=normalizedFinancials(ui.quote);
        if(index<0 || index>=f.plan.length)return;
        const other=f.plan.reduce((n,p,i)=>n+(i===index?0:cents(p.amount)),0);
        const remain=f.totalCents-other;
        if(remain<=0)return A.toast('لا يوجد مبلغ صالح لتوزيعه هنا.', 'error');
        ui.quote.paymentPlan=f.plan.map((p,i)=>i===index?{...p,amount:dollars(remain)}:p);
        ui.quote.paymentPlanEdited=true;persistQuoteDraft(ui.quote);A.refresh();
      },
      'quote-payment-suggest'() {
        if(!ui.quote)return;
        ui.quote.paymentPlanEdited=false;
        ui.quote.paymentPlan=[];
        persistQuoteDraft(ui.quote);A.refresh();
      },
      'quote-add'({ el, state }) {
        const svc = state.catalog.find((x) => x.id === el.dataset.id);
        if (!svc || !ui.quote) return;
        const item = ui.quote.items.find((x) => x.serviceId === svc.id);
        if (item) return;
        ui.quote.items.push(
          scopeItems(
            [
              {
                serviceId: svc.id,
                title: svc.title,
                qty: 1,
                price: Number(svc.price),
              },
            ],
            state,
          )[0],
        );
        persistQuoteDraft(ui.quote);
        A.refresh();
      },
      'quote-remove'({ el }) {
        if (!ui.quote) return;
        ui.quote.items.splice(Number(el.dataset.index), 1);
        persistQuoteDraft(ui.quote);
        A.refresh();
      },
      'save-quote'({ state, form }) {
        return saveQuote(state, 'draft', form);
      },
      'save-send-quote'({ state }) {
        return saveQuote(state, 'sent', document.getElementById('rep-quote-form'));
      },
      'send-quote'({ state: initial, el }) {
        const seen = ownQuotes(initial).find((x) => x.id === el.dataset.id);
        if (!seen || !['draft', 'revision_requested'].includes(seen.status)) return;
        let held = false,
          sent = false;
        if (
          commit((s) => {
            const q = ownQuotes(s).find((x) => x.id === el.dataset.id);
            A.assert(
              q && ['draft', 'revision_requested'].includes(q.status),
              'تغيّرت حالة العرض؛ افتح النسخة الحالية.',
            );
            A.assert(
              quoteFingerprint(q) === quoteFingerprint(seen),
              'تغيّر نطاق العرض في نافذة أخرى؛ راجعه قبل الإرسال.',
            );
            const error = quoteValidation(s, q);
            A.assert(!error, error);
            A.assert(!s.session.offline, 'العرض محفوظ؛ أنهِ وضع دون اتصال قبل إرساله.');
            if (!q.scopeSnapshot) {
              q.items = scopeItems(q.items, s);
              q.scopeSnapshot = {
                version: q.version || 1,
                capturedAt: now(),
                items: clone(q.items),
                terms: q.terms,
                proposedDuration: q.proposedDuration || '',
                paymentWishes: q.paymentWishes || '',
              };
            }
            if (quoteMath(q).percent > 15 && !quoteApproval(s, q)) {
              addDiscountApproval(s, q);
              held = true;
              return;
            }
            q.status = 'sent';
            q.revisionRequest = '';
            q.sentAt = now();
            q.updatedAt = now();
            bindQuoteToVisit(s, q);
            notify(s, 'client', 'عرض سعر بانتظارك', q.title, {
              clientId: q.clientId,
            });
            const o = ownOpps(s).find((row) => row.id === q.opportunityId);
            if (o && ['new', 'qualified'].includes(o.stage)) {
              o.stage = 'proposal';
              o.probability = 55;
            }
            sent = true;
          }, 'مراجعة نسخة العرض الحالية قبل الإرسال') === false
        )
          return;
        A.toast(
          held
            ? 'الخصم يحتاج اعتمادًا لهذه النسخة. أُرسل طلب جديد للإدارة عند الحاجة.'
            : sent
              ? 'أصبح العرض ظاهرًا للعميل.'
              : 'حُفظت المراجعة.',
          held ? 'info' : 'success',
        );
      },
      'duplicate-quote'({ state, el }) {
        const source = ownQuotes(state).find((x) => x.id === el.dataset.id);
        if (!source) return;
        const id = A.id('quote');
        if (
          commit((s) => {
            const q = ownQuotes(s).find((x) => x.id === source.id),
              c = q && client(s, q.clientId);
            A.assert(q && c && !c.doNotContact, 'لا يمكن إنشاء عرض لعميل غير متاح للتواصل.');
            const v = currentVisitFor(s, c.id),
              copy = {
                ...clone(q),
                id,
                title: q.title + ' — نسخة جديدة',
                status: 'draft',
                version: 1,
                visitId: v?.status === 'active' ? v.id : '',
                validUntil: A.addDays(14),
                revisionRequest: '',
                acceptedAt: null,
                rejectedAt: null,
                sentAt: null,
                createdAt: now(),
                updatedAt: now(),
                copiedFromQuoteId: q.id,
              };
            copy.items = scopeItems(q.items, s);
            copy.scopeSnapshot = {
              version: 1,
              capturedAt: now(),
              items: clone(copy.items),
              terms: copy.terms,
              proposedDuration: copy.proposedDuration || '',
              paymentWishes: copy.paymentWishes || '',
            };
            s.quotes.unshift(copy);
            bindQuoteToVisit(s, copy);
          }, 'نسخ نطاق العرض كمسودة جديدة دون نقل قبول العميل') === false
        )
          return;
        ui.quote = null;
        A.go('quote-builder', {
          id,
        });
      },
      'print-quote'({ state, el }) {
        const q = ownQuotes(state).find((x) => x.id === el.dataset.id);
        if (!q) return;
        const c = state.clients.find((x) => x.id === q.clientId),
          m = quoteMath(q);
        A.printDocument(
          q.title,
          `<div class="document" dir="rtl"><p>إلفورانس للحلول الرقمية · وثيقة من العرض التجريبي</p><h1>${e(q.title)}</h1><p>العميل: ${e(c?.name)} · صالح حتى ${e(date(q.validUntil))}</p><table class="data-table"><thead><tr><th>البند</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${q.items.map((it) => `<tr><td>${e(it.title)}</td><td>${Number(it.qty)}</td><td>${cash(it.price)}</td><td>${cash(Number(it.qty) * Number(it.price))}</td></tr>`).join('')}</tbody></table><p>قيمة الخدمات: ${cash(m.subtotal)} · الخصم: ${cash(m.discount)}</p><h2>الإجمالي: ${cash(m.total)}</h2><h3>الشروط</h3><p>${e(q.terms)}</p><p>${e(q.notes)}</p><small>هذه الوثيقة جزء من نموذج محلي تفاعلي، ولا تمثل فاتورة مدفوعة أو عقدًا موقّعًا.</small></div>`,
        );
      },
    },
    api: {
      quoteMath,
      quoteStatus,
      composedTerms,
      quoteFingerprint,
      quoteDraftSlot,
      persistQuoteDraft,
      quoteSnapshot,
      ensureQuote,
      saveQuote,
    },
  };
}
