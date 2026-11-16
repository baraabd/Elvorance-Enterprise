// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** admin / pipeline: original v1.1 views and local demo actions. */
export function createPipelineFeature(context, { state }) {
  const {
    A,
    E,
    N,
    action,
    badge,
    choices,
    clientOptions,
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
    list,
    metric,
    missing,
    money,
    pageTitle,
    person,
    repOptions,
    sectionTitle,
    select,
    selectedChecks,
    stages,
    stamp,
    sum,
    textarea,
    ui,
    wrap,
  } = context;
  const persist = (...args) => state.persist(...args);
  function opportunityRows(s, opportunities) {
    return opportunities.length
      ? `<div class="list">${opportunities.map((o) => `<article class="list-item"><div class="row-between"><strong>${E(o.title)}</strong>${badge(stages[o.stage] || o.stage, o.stage === 'won' ? 'good' : o.stage === 'lost' ? 'bad' : 'info')}</div><p class="small muted">${E(customer(s, o.clientId))} · ${E(money(o.value))}</p>${go('opportunity', 'تفاصيل الفرصة', 'arrow-left', o.id, 'btn btn-ghost btn-sm')}</article>`).join('')}</div>`
      : empty('لا توجد فرص مرتبطة', 'أضف فرصة من مسار المبيعات عند وجود حاجة واضحة.');
  }
  function pipeline({ state: s }) {
    const rows = list(s, 'opportunities').filter(
      (o) =>
        (ui.pipelineRep === 'all' || o.repId === ui.pipelineRep) &&
        (ui.pipelineStage === 'all' || o.stage === ui.pipelineStage),
    );
    const open = rows.filter((o) => !['won', 'lost'].includes(o.stage));
    return wrap(
      pageTitle(
        'مسار المبيعات',
        'حوّل الاهتمام إلى قرار.',
        'تابع المرحلة والاحتمال والخطوة القادمة لكل فرصة.',
        action('new-opportunity', 'فرصة جديدة', 'plus', '', 'btn btn-primary'),
      ) +
        `<section class="grid-3">${metric('الفرص المفتوحة', open.length, 'بحسب الفلاتر الحالية', 'briefcase')}${metric('قيمة المسار', money(sum(open, (o) => o.value)), 'مجموع الفرص المفتوحة', 'wallet')}${metric('القيمة المرجحة', money(sum(open, (o) => (N(o.value) * N(o.probability)) / 100)), 'القيمة × احتمال الإغلاق', 'trend')}</section><div class="filter-bar">${filter(
          'المرحلة',
          'pipelineStage',
          {
            all: 'كل المراحل',
            ...stages,
          },
        )}${filter('المندوب', 'pipelineRep', {
          all: 'كل المندوبين',
          ...repOptions(s),
        })}</div><div class="admin-pipeline">${Object.entries(stages)
          .filter(([stage]) => ui.pipelineStage === 'all' || stage === ui.pipelineStage)
          .map(([stage, label]) => {
            const group = rows.filter((o) => o.stage === stage);
            return `<section class="admin-pipeline-col"><div class="row-between"><h2>${E(label)}</h2>${badge(group.length)}</div><p class="tiny muted">${E(money(sum(group, (o) => o.value)))}</p>${group.map((o) => `<button type="button" class="admin-pipeline-card" data-go="opportunity" data-id="${E(o.id)}"><strong>${E(o.title)}</strong><p class="small muted">${E(customer(s, o.clientId))}</p><div class="row-between"><span class="num strong">${E(money(o.value))}</span>${badge(`${N(o.probability)}%`)}</div><p class="tiny muted">${E(person(s, o.repId))} · ${E(date(o.expectedClose))}</p>${o.stage === 'lost' ? `<p class="small text-bad">${E(o.lossReason || 'سبب الخسارة غير مسجل')}</p>` : ''}</button>`).join('') || '<p class="small muted">لا فرص في هذه المرحلة.</p>'}</section>`;
          })
          .join('')}</div>`,
    );
  }
  function opportunity({ state: s, params }) {
    const item = find(s, 'opportunities', params.id);
    if (!item) return wrap(missing());
    const quotes = list(s, 'quotes').filter((q) => q.opportunityId === item.id);
    return wrap(
      pageTitle(
        'تفاصيل الفرصة',
        item.title,
        `${customer(s, item.clientId)} · ${person(s, item.repId)}`,
        action('edit-opportunity', 'تعديل الفرصة', 'edit', idAttr(item.id), 'btn btn-primary'),
      ) +
        `<section class="grid-3">${metric('القيمة المتوقعة', money(item.value), stages[item.stage] || item.stage, 'wallet')}${metric('احتمال الإغلاق', `${N(item.probability)}%`, 'تقدير مسجل قابل للمراجعة', 'target')}${metric('موعد الإغلاق', date(item.expectedClose), 'الموعد المحدد للمتابعة', 'calendar')}</section><section class="card">${sectionTitle('مرحلة الفرصة', badge(stages[item.stage], item.stage === 'lost' ? 'bad' : item.stage === 'won' ? 'good' : 'info'))}<div class="admin-choice-row">${Object.entries(
          stages,
        )
          .map(([stage, label]) =>
            action(
              'change-stage',
              label,
              stage === 'won' ? 'check-circle' : stage === 'lost' ? 'x' : 'arrow-left',
              `${idAttr(item.id)} data-stage="${E(stage)}"`,
              `btn ${item.stage === stage ? 'btn-primary' : 'btn-secondary'} btn-sm`,
            ),
          )
          .join(
            '',
          )}</div>${item.lossReason ? `<p class="notice notice-warn"><strong>سبب الخسارة:</strong> ${E(item.lossReason)}</p>` : ''}<p>${E(item.notes || 'لا توجد ملاحظات إضافية.')}</p><div class="chips">${(item.serviceIds || []).map((id) => badge(find(s, 'catalog', id)?.title || id)).join('')}</div></section><section class="card">${sectionTitle('عروض السعر المرتبطة')}${
          quotes.length
            ? quotes
                .map(
                  (quote) =>
                    `<article class="list-item"><div class="row-between"><strong>${E(quote.title)}</strong>${badge(
                      {
                        draft: 'مسودة',
                        sent: 'أرسل داخل العرض',
                        accepted: 'مقبول',
                        rejected: 'مرفوض',
                        revision_requested: 'طلب تعديل',
                      }[quote.status] || quote.status,
                    )}</div><p class="small muted">${E(money(quote.total))} · صالح حتى ${E(date(quote.validUntil))}</p>${action('view-quote', 'عرض التفاصيل', 'file', idAttr(quote.id), 'btn btn-secondary btn-sm')}</article>`,
                )
                .join('')
            : empty('لا عروض مرتبطة', 'يمكن للمندوب إعداد عرض من تطبيقه.')
        }</section>`,
    );
  }
  function acceptedOffer(s, opportunityId) {
    const opportunity = find(s, 'opportunities', opportunityId);
    return list(s, 'quotes').find(
      (q) =>
        q.opportunityId === opportunityId &&
        q.clientId === opportunity?.clientId &&
        q.status === 'accepted',
    );
  }
  function guardOpportunity(s, item, nextStage) {
    const offer = acceptedOffer(s, item?.id);
    A.assert(
      !(offer || item?.stage === 'won') || nextStage === 'won',
      'هذه الفرصة مكتسبة أو لها عرض مقبول؛ لا يمكن إعادتها للتفاوض أو الخسارة دون معالجة الاتفاق المرتبط.',
    );
    A.assert(
      nextStage !== 'won' || item?.stage === 'won' || offer,
      'يلزم عرض مقبول مرتبط بالفرصة قبل إعلان نجاحها.',
    );
    return offer;
  }
  function opportunityModal(id) {
    const s = A.state(),
      item = id ? find(s, 'opportunities', id) : null;
    if (id && !item) return fail('الفرصة غير موجودة.');
    A.modal(
      item ? 'تعديل الفرصة' : 'إضافة فرصة',
      form(
        'save-opportunity',
        `<div class="form-grid">${input('عنوان الفرصة', 'title', item?.title || '', 'text', 'required minlength="3" maxlength="150"')}${select('العميل', 'clientId', clientOptions(s), item?.clientId || list(s, 'clients')[0]?.id, 'required')}${select('المندوب', 'repId', repOptions(s), item?.repId || list(s, 'reps')[0]?.id, 'required')}${select('المرحلة', 'stage', stages, item?.stage || 'new')}${input('القيمة المتوقعة', 'value', item?.value || 0, 'number', 'required min="0" max="100000000" step="0.01"')}${input('احتمال الإغلاق %', 'probability', item?.probability ?? 20, 'number', 'required min="0" max="100" step="1"')}${input('موعد الإغلاق المتوقع', 'expectedClose', item?.expectedClose || A.addDays(14), 'date', 'required')}</div><h3>الخدمات المرتبطة</h3>${choices(list(s, 'catalog'), item?.serviceIds || [], 'serviceIds', (service) => service.title)}${textarea('الملاحظات والخطوة التالية', 'notes', item?.notes || '', 'maxlength="2000"')}${textarea('سبب الخسارة، مطلوب عند اختيار خاسرة', 'lossReason', item?.lossReason || '', 'maxlength="1500"')}`,
        item?.id,
      ),
      {
        wide: true,
      },
    );
  }
  function saveOpportunity({ form: node, data }) {
    const s = A.state(),
      id = node.dataset.id,
      title = String(data.title || '').trim(),
      value = Number(data.value),
      probability = Number(data.probability);
    if (id && !find(s, 'opportunities', id)) return fail('الفرصة غير موجودة.');
    if (
      !find(s, 'clients', data.clientId) ||
      !find(s, 'reps', data.repId) ||
      !stages[data.stage] ||
      title.length < 3 ||
      !Number.isFinite(value) ||
      value < 0 ||
      !Number.isFinite(probability) ||
      probability < 0 ||
      probability > 100
    )
      return fail('راجع العميل والمندوب وقيمة الفرصة واحتمالها.');
    if (data.stage === 'lost' && String(data.lossReason || '').trim().length < 6)
      return fail('اكتب سببًا واضحًا للخسارة، ستة أحرف على الأقل.');
    const serviceIds = selectedChecks(node, 'serviceIds').filter((serviceId) =>
      find(s, 'catalog', serviceId),
    );
    persist(
      'تحديث مسار المبيعات',
      (state) => {
        A.assert(
          find(state, 'clients', data.clientId) && find(state, 'reps', data.repId),
          'تغيّر العميل أو المندوب؛ أعد اختيار بيانات الفرصة.',
        );
        let item = id ? find(state, 'opportunities', id) : null;
        A.assert(!id || item, 'تغيّرت الفرصة؛ أعد فتحها.');
        const accepted = guardOpportunity(state, item, data.stage);
        A.assert(
          !accepted ||
            (accepted.clientId === data.clientId &&
              accepted.repId === data.repId &&
              Math.round(N(accepted.total) * 100) === Math.round(value * 100)),
          'لا تغيّر صاحب الفرصة أو قيمتها عن العرض المقبول.',
        );
        if (!item) {
          item = {
            id: A.id('opp'),
            createdAt: stamp(),
          };
          state.opportunities.push(item);
        }
        Object.assign(item, {
          title,
          clientId: data.clientId,
          repId: data.repId,
          stage: data.stage,
          value,
          probability: data.stage === 'won' ? 100 : data.stage === 'lost' ? 0 : probability,
          expectedClose: data.expectedClose,
          serviceIds,
          notes: String(data.notes || '').trim(),
          lossReason: data.stage === 'lost' ? String(data.lossReason).trim() : '',
          closedAt: ['won', 'lost'].includes(data.stage) ? item.closedAt || stamp() : null,
        });
      },
      'حُفظت الفرصة.',
    );
  }
  function changeStage({ el }) {
    const item = find(A.state(), 'opportunities', el.dataset.id),
      stage = el.dataset.stage;
    if (!item || !stages[stage]) return fail('الفرصة أو المرحلة غير موجودة.');
    if (item.stage === stage) return A.toast('الفرصة في هذه المرحلة بالفعل.', 'info');
    if (stage === 'lost') {
      return A.modal(
        'تسجيل سبب خسارة الفرصة',
        form(
          'lose-opportunity',
          textarea(
            'ما السبب؟',
            'reason',
            item.lossReason || '',
            'required minlength="6" maxlength="1500"',
          ),
          item.id,
          'تسجيل الخسارة',
        ),
      );
    }
    A.confirm(
      `نقل الفرصة إلى ${stages[stage]}؟`,
      `${item.title} — سيتم تحديث المرحلة في السجل المشترك.`,
      () => {
        persist(
          'تغيير مرحلة فرصة مبيعات',
          (s) => {
            const record = find(s, 'opportunities', item.id);
            A.assert(record, 'الفرصة لم تعد موجودة.');
            const offer = guardOpportunity(s, record, stage);
            record.stage = stage;
            if (stage === 'won' && offer) record.value = offer.total;
            record.probability = {
              new: 10,
              qualified: 30,
              proposal: 60,
              negotiation: 80,
              won: 100,
            }[stage];
            record.lossReason = '';
            record.closedAt = stage === 'won' ? stamp() : null;
          },
          'تحدثت مرحلة الفرصة.',
        );
      },
    );
  }
  function loseOpportunity({ form: node, data }) {
    if (!find(A.state(), 'opportunities', node.dataset.id)) return fail('الفرصة غير موجودة.');
    const reason = String(data.reason || '').trim();
    if (reason.length < 6) return fail('اكتب سببًا واضحًا للخسارة.');
    persist(
      'تسجيل خسارة فرصة وسببها',
      (s) => {
        const item = find(s, 'opportunities', node.dataset.id);
        A.assert(item, 'الفرصة لم تعد موجودة.');
        guardOpportunity(s, item, 'lost');
        item.stage = 'lost';
        item.probability = 0;
        item.lossReason = reason;
        item.closedAt = stamp();
      },
      'حُفظ السبب وأُغلقت الفرصة.',
    );
  }
  function viewQuote({ el }) {
    const s = A.state(),
      quote = find(s, 'quotes', el.dataset.id);
    if (!quote) return fail('عرض السعر غير موجود.');
    A.modal(
      'تفاصيل عرض السعر',
      `<h3>${E(quote.title)}</h3><p class="muted">${E(customer(s, quote.clientId))} · ${E(person(s, quote.repId))}</p><div class="table-wrap"><table class="data-table"><thead><tr><th>الخدمة</th><th>الكمية</th><th>سعر الوحدة</th><th>المجموع</th></tr></thead><tbody>${(quote.items || []).map((item) => `<tr><td>${E(item.title)}</td><td>${N(item.qty)}</td><td>${E(money(item.price))}</td><td>${E(money(N(item.qty) * N(item.price)))}</td></tr>`).join('')}</tbody></table></div><p>الخصم: ${E(money(quote.discount))}</p><h3>الإجمالي: ${E(money(quote.total))}</h3><p class="small muted">${E(quote.terms || '')}</p>${quote.revisionRequest ? `<p class="admin-note">طلب تعديل العميل: ${E(quote.revisionRequest)}</p>` : ''}`,
      {
        wide: true,
      },
    );
  }
  return {
    id: 'pipeline',
    routes: {
      pipeline: {
        title: 'مسار المبيعات',
        render: pipeline,
      },
      opportunity: {
        nav: 'pipeline',
        title: 'تفاصيل الفرصة',
        render: opportunity,
      },
    },
    actions: {
      'new-opportunity': () => opportunityModal(),
      'edit-opportunity': ({ el }) => opportunityModal(el.dataset.id),
      'save-opportunity': saveOpportunity,
      'change-stage': changeStage,
      'lose-opportunity': loseOpportunity,
      'view-quote': viewQuote,
    },
    api: {
      opportunityRows,
    },
  };
}
