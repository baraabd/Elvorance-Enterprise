// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** client / quotes: original v1.1 views and local demo actions. */
export function createQuotesFeature(context, { contracts, state }) {
  const {
    A,
    E,
    act,
    addMessage,
    area,
    badge,
    cents,
    copy,
    customer,
    date,
    error,
    go,
    heading,
    idFrom,
    label,
    mine,
    missing,
    money,
    notice,
    notify,
    now,
    num,
    owned,
    paragraph,
    quoteLabels,
    reviewToken,
    section,
    wrap,
  } = context;
  const attachContractSnapshot = (...args) => contracts.attachContractSnapshot(...args);
  const commit = (...args) => state.commit(...args);
  const normalizedPlan = (...args) => contracts.normalizedPlan(...args);
  const quoteTotal = (quote) =>
    Array.isArray(quote.items)
      ? Math.max(
          0,
          quote.items.reduce((sum, item) => sum + cents(num(item.qty) * num(item.price)), 0) -
            cents(num(quote.discount)),
        ) / 100
      : num(quote.total);
  const scopedQuote = (state, id) => {
    const quote = owned(state, 'quotes', id);
    return quote && quote.status !== 'draft' ? quote : null;
  };
  function quoteScope(quote) {
    const saved = Array.isArray(quote?.scopeSnapshot)
      ? quote.scopeSnapshot
      : quote?.scopeSnapshot?.items;
    return (quote?.items || []).map((item, index) => {
      const scope =
        (saved || []).find(
          (entry) => entry.serviceId === item.serviceId && entry.title === item.title,
        ) ||
        (saved || [])[index] ||
        item;
      return {
        serviceId: item.serviceId || '',
        title: String(item.title || ''),
        qty: num(item.qty),
        price: num(item.price),
        features: Array.isArray(scope.features) ? copy(scope.features) : [],
        deliverables: Array.isArray(scope.deliverables) ? copy(scope.deliverables) : [],
        duration: String(scope.duration || ''),
        unit: String(scope.unit || ''),
      };
    });
  }
  function reviewedQuote(quote) {
    return {
      id: quote.id,
      title: quote.title,
      clientId: quote.clientId,
      repId: quote.repId,
      opportunityId: quote.opportunityId || '',
      visitId: quote.visitId || '',
      items: copy(quote.items || []),
      scopeSnapshot: quoteScope(quote),
      discount: num(quote.discount),
      total: quoteTotal(quote),
      terms: String(quote.terms || ''),
      baseTerms: String(quote.baseTerms || quote.terms || ''),
      validUntil: quote.validUntil || '',
      proposedDuration: quote.proposedDuration || '',
      paymentWishes: quote.paymentWishes || '',
      paymentPlan: Array.isArray(quote.paymentPlan) ? copy(quote.paymentPlan) : null,
      startDate: quote.startDate || null,
      endDate: quote.endDate || null,
    };
  }
  function quoteIsValid(quote) {
    return (
      Array.isArray(quote.items) &&
      quote.items.length > 0 &&
      quote.items.every(
        (item) =>
          String(item.title || '').trim() &&
          Number.isFinite(Number(item.qty)) &&
          Number(item.qty) > 0 &&
          Number.isFinite(Number(item.price)) &&
          Number(item.price) >= 0,
      ) &&
      Number.isFinite(Number(quote.discount || 0)) &&
      num(quote.discount) >= 0 &&
      quoteTotal(quote) > 0 &&
      (!('total' in quote) || cents(quote.total) === cents(quoteTotal(quote)))
    );
  }
  function quoteCard(quote) {
    return `<article class="card"><div class="row-between">${badge(label(quoteLabels, quote.status), quote.status)}<span class="muted tiny num">${E(quote.id)}</span></div><h3>${E(quote.title)}</h3><p class="muted small">${(quote.items || []).length} بنود · صالح حتى ${E(date(quote.validUntil))}</p><div class="row-between"><strong class="stat-value num">${money(quoteTotal(quote))}</strong>${go(
      'مراجعة العرض',
      'quote-detail',
      {
        id: quote.id,
      },
      'btn-secondary btn-sm',
    )}</div></article>`;
  }
  function renderQuotes({ state, params }) {
    const status = params.status || '';
    const quotes = mine(state, 'quotes').filter(
      (item) => item.status !== 'draft' && (!status || item.status === status),
    );
    return wrap(
      `${heading('عروض الأسعار', 'اعرف التفاصيل قبل القرار', 'النطاق، البنود والدفعات. كل شيء قابل للمراجعة.', go('طلب خدمة', 'services', {}, 'btn-primary', 'plus'))}<div class="chips">${[
        ['', 'الكل'],
        ['sent', 'بانتظارك'],
        ['accepted', 'مقبولة'],
        ['revision_requested', 'تحتاج تعديل'],
      ]
        .map(([value, text]) =>
          go(
            text,
            'quotes',
            {
              'param-status': value,
            },
            `chip ${status === value ? 'active' : ''}`,
            '',
          ),
        )
        .join(
          '',
        )}</div><div class="grid-2">${quotes.map(quoteCard).join('') || A.empty('لا توجد عروض في هذا التصنيف', 'ستظهر عروض الفريق هنا فور إرسالها إلى حسابك.', go('الكل', 'quotes'))}</div>`,
    );
  }
  function renderQuote({ state, params }) {
    const quote = scopedQuote(state, params.id);
    if (!quote) return missing('عرض السعر غير متاح');
    const expired = quote.validUntil && quote.validUntil < A.today();
    const contract = mine(state, 'contracts').find((item) => item.quoteId === quote.id);
    return wrap(
      `${heading('مراجعة العرض', quote.title, `مرجع ${quote.id} · صالح حتى ${date(quote.validUntil)}`, badge(label(quoteLabels, quote.status), quote.status))}<div class="dashboard-grid"><div class="main-column stack"><section class="card">${section('بنود العرض')}<div class="client-line-items">${(quote.items || []).map((item) => `<div class="row-between"><div><strong>${E(item.title)}</strong><p class="muted small">${num(item.qty)} × ${money(item.price)}</p></div><strong class="num">${money(num(item.qty) * num(item.price))}</strong></div>`).join('')}</div><div class="divider"></div><div class="row-between muted"><span>الخصم</span><span class="num">− ${money(quote.discount)}</span></div><div class="row-between"><strong>الإجمالي</strong><strong class="stat-value num">${money(quoteTotal(quote))}</strong></div></section><section class="card">${section('ما الذي يشمله الاتفاق؟')}<div class="stack-sm">${quoteScope(
        quote,
      )
        .map(
          (item) =>
            `<div><strong>${E(item.title)}</strong>${item.deliverables.length ? `<ul class="client-bullet-list">${item.deliverables.map((text) => `<li>${E(text)}</li>`).join('')}</ul>` : '<p class="small muted">النطاق المثبت هو بند العرض وشروطه؛ لا تضاف تسليمات من الكتالوج الحالي.</p>'}</div>`,
        )
        .join(
          '',
        )}</div></section><section class="card">${section('الشروط والملاحظات')}<p>${paragraph(quote.terms || 'تُثبت مدة التنفيذ ونطاق التسليم وجدول الدفعات في العقد قبل البدء.')}</p>${quote.notes ? `<div class="divider"></div><p class="small muted">${paragraph(quote.notes)}</p>` : ''}${quote.revisionRequest ? `<div class="notice notice-warn"><div><strong>طلبك الأخير للتعديل</strong><p>${paragraph(quote.revisionRequest)}</p></div></div>` : ''}</section></div><aside class="side-column stack"><section class="card card-dark"><p class="eyebrow">قرار مدروس</p><h2 class="num">${money(quoteTotal(quote))}</h2><p class="small">القبول يفتح عقدًا للمراجعة. لا تُحصّل أي دفعة عند قبول العرض.</p>${
        quote.status === 'sent' && !expired
          ? `<div class="stack-sm">${act(
              'قبول العرض',
              'accept-quote-modal',
              {
                id: quote.id,
              },
              'btn-lime btn-block',
              'check',
            )}${act(
              'أطلب تعديلًا',
              'revise-quote-modal',
              {
                id: quote.id,
              },
              'btn-secondary btn-block',
              'edit',
            )}${act(
              'رفض العرض',
              'reject-quote-modal',
              {
                id: quote.id,
              },
              'btn-ghost btn-block',
              'x',
            )}</div>`
          : contract
            ? go(
                'فتح العقد',
                'contract-detail',
                {
                  id: contract.id,
                },
                'btn-lime btn-block',
                'file',
              )
            : `<p class="small">${expired && quote.status === 'sent' ? 'انتهت صلاحية العرض. اطلب تحديثه قبل القبول.' : quote.status === 'revision_requested' ? 'وصل طلب التعديل إلى مساحة الفريق. انتظر النسخة المحدثة.' : 'تم تسجيل قرارك في هذا العرض.'}</p>${go(
                'تحدث مع الفريق',
                'messages',
                {
                  'param-topic': quote.title,
                },
                'btn-lime btn-block',
                'message',
              )}`
      }</section>${notice('رغبات الدفع محل نقاش', 'شارك الفريق الدفعات التي تناسبك. تبقى الخطة المثبتة في العقد مرجع الاتفاق.', 'wallet')}</aside></div>`,
    );
  }
  function quoteDecisionModal(kind, id) {
    const state = A.state();
    const quote = scopedQuote(state, id);
    if (!quote || quote.status !== 'sent')
      return error('لا يمكن تغيير القرار على هذه النسخة من العرض.');
    if (kind === 'accept') {
      if (quote.validUntil && quote.validUntil < A.today())
        return error('انتهت صلاحية العرض. اطلب نسخة محدثة من الفريق.');
      A.modal(
        'قبول العرض ومراجعة العقد',
        `<form class="stack" data-submit="accept-quote"><input type="hidden" name="quoteId" value="${E(id)}"><input type="hidden" name="reviewToken" value="${E(reviewToken(reviewedQuote(quote)))}"><div class="notice notice-good"><div><strong>${E(quote.title)} · ${money(quoteTotal(quote))}</strong><p class="small">سيُنشأ عقد للمراجعة؛ لا يتم دفع أي مبلغ أو إنشاء توقيع قانوني.</p></div></div>${area(
          'رغباتك في خطة الدفع — اختياري',
          'paymentWishes',
          '',
          {
            required: false,
            rows: 3,
            placeholder: 'مثلًا: أفضل ثلاث دفعات مرتبطة بالتسليمات.',
          },
        )}<p class="tiny muted">تُسجّل هذه الرغبات للفريق ولا تعدّل شروط الدفع تلقائيًا.</p><label class="checkbox-row"><input type="checkbox" name="acceptTerms" required><span>راجعت البنود والشروط والسعر وأريد قبول العرض في التجربة.</span></label><button type="submit" class="btn btn-primary">${A.icon('check')}قبول وفتح العقد</button></form>`,
      );
    } else {
      const revision = kind === 'revise';
      A.modal(
        revision ? 'ما التعديل الذي يناسبك؟' : 'رفض العرض',
        `<form class="stack" data-submit="${revision ? 'revise-quote' : 'reject-quote'}"><input type="hidden" name="quoteId" value="${E(id)}"><input type="hidden" name="reviewToken" value="${E(reviewToken(reviewedQuote(quote)))}"><p class="muted small">${E(quote.title)}</p>${area(
          revision ? 'التعديل المطلوب' : 'سبب الرفض',
          'reason',
          '',
          {
            minlength: revision ? 10 : 5,
            placeholder: revision
              ? 'اذكر التغييرات في النطاق أو التسليم أو السعر.'
              : 'يساعد السبب الفريق على فهم قرارك.',
          },
        )}${
          revision
            ? area('رغباتك في الدفع — اختياري', 'paymentWishes', '', {
                required: false,
                rows: 2,
              })
            : ''
        }<button type="submit" class="btn ${revision ? 'btn-primary' : 'btn-danger'}">${A.icon(revision ? 'edit' : 'x')}${revision ? 'حفظ طلب التعديل' : 'تأكيد رفض العرض'}</button></form>`,
      );
    }
  }
  function paymentPlanFor(quote) {
    if (Array.isArray(quote.paymentPlan) && quote.paymentPlan.length)
      return copy(quote.paymentPlan);
    const totalCents = cents(quoteTotal(quote));
    const terms = String(quote.baseTerms || quote.terms || '');
    const percentages = [...terms.matchAll(/(\d+(?:\.\d+)?)\s*%/g)].map((item) => Number(item[1]));
    if (
      percentages.length &&
      percentages.length <= 6 &&
      percentages.every((value) => value > 0) &&
      Math.abs(percentages.reduce((sum, item) => sum + item, 0) - 100) < 0.01
    ) {
      let allocated = 0;
      return percentages.map((percentage, i) => {
        const amount =
          i === percentages.length - 1
            ? totalCents - allocated
            : Math.round((totalCents * percentage) / 100);
        allocated += amount;
        return {
          label: `الدفعة ${i + 1} · ${percentage}% حسب الشروط`,
          amount: amount / 100,
          due: null,
          status: 'due',
        };
      });
    }
    const months = Math.max(1, Math.min(12, Math.floor(num(quote.items?.[0]?.qty) || 1)));
    if (/شهر/.test(terms) && months > 1 && totalCents >= months) {
      let allocated = 0;
      return Array.from(
        {
          length: months,
        },
        (_, i) => {
          const amount =
            i === months - 1 ? totalCents - allocated : Math.floor(totalCents / months);
          allocated += amount;
          return {
            label: `الدفعة الشهرية ${i + 1} حسب الشروط`,
            amount: amount / 100,
            due: null,
            status: 'due',
          };
        },
      );
    }
    return [
      {
        label: 'قيمة العقد — موعد الدفع يحتاج تأكيد الفريق',
        amount: totalCents / 100,
        due: null,
        status: 'due',
      },
    ];
  }
  function acceptQuote({ data }) {
    const quote = scopedQuote(A.state(), data.quoteId);
    if (!quote || quote.status !== 'sent')
      return error('تم تغيير حالة العرض. أعد فتحه قبل المتابعة.');
    if (!data.acceptTerms) return error('أكد مراجعة الشروط قبل المتابعة.');
    if (quote.validUntil && quote.validUntil < A.today()) return error('انتهت صلاحية هذا العرض.');
    if (!quoteIsValid(quote))
      return error('بنود العرض أو مجموعها غير متوافق. اطلب من المندوب مراجعتها.');
    if (data.reviewToken !== reviewToken(reviewedQuote(quote)))
      return error('تغير العرض بعد فتح المراجعة. أغلق النافذة واقرأ النسخة الحالية.');
    let contractId;
    const preference = String(data.paymentWishes || '')
      .trim()
      .slice(0, 1500);
    const saved = commit(
      (next) => {
        const current = scopedQuote(next, quote.id);
        A.assert(
          current &&
            current.status === 'sent' &&
            (!current.validUntil || current.validUntil >= A.today()),
          'العرض تغير أو انتهت صلاحيته. راجع النسخة الحالية.',
        );
        A.assert(
          quoteIsValid(current) && data.reviewToken === reviewToken(reviewedQuote(current)),
          'تغيرت بنود العرض بعد فتح المراجعة. اقرأ النسخة الحالية قبل القبول.',
        );
        let contract = mine(next, 'contracts').find((item) => item.quoteId === current.id);
        if (!contract) {
          contractId = A.id('contract');
          contract = {
            id: contractId,
            clientId: current.clientId,
            quoteId: current.id,
            projectId: null,
            title: current.title,
            total: quoteTotal(current),
            paid: 0,
            status: 'pending',
            signedAt: null,
            signer: '',
            terms: String(current.terms || ''),
            paymentWishes: preference || current.paymentWishes || '',
            startDate: current.startDate || null,
            endDate: current.endDate || null,
            paymentPlan: paymentPlanFor(current),
            createdAt: now(),
          };
          contract.paymentPlan = normalizedPlan(contract);
          attachContractSnapshot(contract, current);
          next.contracts.push(contract);
        } else {
          A.assert(
            cents(contract.total) === cents(quoteTotal(current)),
            'العقد المرتبط لا يطابق قيمة العرض. راجع الفريق قبل قبول نسخة مختلفة.',
          );
          attachContractSnapshot(contract, current);
          if (preference) contract.paymentWishes = preference;
        }
        current.status = 'accepted';
        current.acceptedAt = now();
        current.total = quoteTotal(current);
        if (preference) current.clientPaymentWishes = preference;
        contractId = contract.id;
        const opportunity = owned(next, 'opportunities', current.opportunityId);
        if (opportunity) {
          opportunity.stage = 'won';
          opportunity.probability = 100;
          opportunity.value = current.total;
        }
        addMessage(
          next,
          `قبلت عرض «${current.title}» في التجربة. ${preference ? `رغبتي في الدفع، للمراجعة: ${preference}` : 'أنتظر مراجعة العقد.'}`,
        );
        notify(
          next,
          'العميل قبل عرض السعر',
          `${customer(next)?.name}: ${current.title}. عقد المراجعة جاهز.`,
        );
      },
      `قبل العميل عرض ${quote.title}`,
      {
        message: 'حُفظ قبول العرض ونسخة بنوده. راجع العقد قبل الموافقة.',
      },
    );
    if (saved && contractId)
      A.go('contract-detail', {
        id: contractId,
      });
  }
  function changeQuote({ data }, revision) {
    const quote = scopedQuote(A.state(), data.quoteId);
    const reason = String(data.reason || '').trim();
    if (!quote || quote.status !== 'sent') return error('العرض لم يعد متاحًا لهذا القرار.');
    if (data.reviewToken !== reviewToken(reviewedQuote(quote)))
      return error('تغير العرض أثناء المراجعة. اقرأ النسخة الحالية قبل اتخاذ القرار.');
    if (reason.length < (revision ? 10 : 5)) return error('أضف تفاصيل كافية لقرارك.');
    const request = `${reason}${data.paymentWishes ? `\nرغبة في الدفع: ${String(data.paymentWishes).trim()}` : ''}`;
    commit(
      (next) => {
        const current = scopedQuote(next, quote.id);
        A.assert(
          current &&
            current.status === 'sent' &&
            data.reviewToken === reviewToken(reviewedQuote(current)),
          'تغير العرض أثناء المراجعة. راجع النسخة الحالية.',
        );
        current.status = revision ? 'revision_requested' : 'rejected';
        if (revision) current.revisionRequest = request;
        else current.notes = `${current.notes || ''}\nسبب رفض العميل: ${reason}`.trim();
        const opportunity = owned(next, 'opportunities', current.opportunityId);
        if (opportunity && revision) opportunity.stage = 'negotiation';
        addMessage(
          next,
          `${revision ? 'أطلب تعديل عرض' : 'رفضت عرض'} «${current.title}»: ${request}`,
        );
        notify(
          next,
          revision ? 'طلب تعديل على العرض' : 'رفض العميل العرض',
          `${customer(next)?.name}: ${request}`,
        );
      },
      `${revision ? 'طلب العميل تعديل' : 'رفض العميل'} عرض ${quote.title}`,
      {
        message: revision ? 'حُفظ طلب التعديل في مساحة الفريق.' : 'حُفظ قرارك وسبب الرفض.',
      },
    );
  }
  return {
    id: 'quotes',
    routes: {
      quotes: {
        title: 'عروض الأسعار',
        nav: 'contracts',
        render: renderQuotes,
      },
      'quote-detail': {
        title: 'مراجعة العرض',
        nav: 'contracts',
        render: renderQuote,
      },
    },
    actions: {
      'accept-quote-modal': (ctx) => quoteDecisionModal('accept', idFrom(ctx)),
      'revise-quote-modal': (ctx) => quoteDecisionModal('revise', idFrom(ctx)),
      'reject-quote-modal': (ctx) => quoteDecisionModal('reject', idFrom(ctx)),
      'accept-quote': acceptQuote,
      'revise-quote': (ctx) => changeQuote(ctx, true),
      'reject-quote': (ctx) => changeQuote(ctx, false),
    },
    api: {
      quoteTotal,
      reviewedQuote,
    },
  };
}
