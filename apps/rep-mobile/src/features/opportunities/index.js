/* ATLAS_DASHBOARD_DRILLDOWN_2027 */
/** rep / opportunities: original v1.1 views and local demo actions. */
export function createOpportunitiesFeature(context, { quotes, state, visits }) {
  const {
    A,
    act,
    badge,
    cash,
    chipLink,
    client,
    date,
    drilldownSummary,
    e,
    go,
    head,
    ic,
    iconGo,
    labels,
    metric,
    missing,
    needsChips,
    ownClients,
    ownOpps,
    ownQuotes,
    rep,
    section,
    stageList,
  } = context;
  const commit = (...args) => state.commit(...args);
  const currentVisitFor = (...args) => visits.currentVisitFor(...args);
  const quoteStatus = (...args) => quotes.quoteStatus(...args);
  function opportunities({ state: s, params }) {
    const filter = ['all', 'open', ...stageList].includes(params.filter) ? params.filter : 'all',
      all = ownOpps(s),
      rows = all.filter((o) => filter === 'all' || (filter === 'open' ? !['won', 'lost'].includes(o.stage) : o.stage === filter));
    return `${head('كل فرصة لها خطوة', 'تابع مراحل البيع من التأهيل حتى القرار.', act('opportunity-new', 'فرصة جديدة', 'plus', '', 'btn btn-primary'))}${drilldownSummary(params, filter === 'won' ? 'قيمة الفرص المكتسبة' : filter === 'open' ? 'فرص قيد العمل' : 'الفرص', rows.length, filter === 'won' ? 'الإجمالي: ' + cash(rows.reduce((sum, o) => sum + Number(o.value), 0)) : 'اضغط على الفرصة لعرض التفاصيل')}<div class="metric-grid">${metric(cash(all.filter((o) => !['won', 'lost'].includes(o.stage)).reduce((v, o) => v + Number(o.value), 0)), 'قيمة الفرص المفتوحة', 'briefcase')}${metric(all.filter((o) => o.stage === 'negotiation').length, 'في التفاوض', 'message')}${metric(all.filter((o) => o.stage === 'won').length, 'فرص مكتسبة', 'check-circle')}</div><div class="chips">${chipLink('opportunities', 'all', 'الكل', filter === 'all')}${chipLink('opportunities', 'open', 'قيد العمل', filter === 'open')}${stageList.map((st) => chipLink('opportunities', st, labels[st], st === filter)).join('')}</div><div class="grid-2">${rows.map((o) => `<article class="card"><div class="row-between">${badge(o.stage)}${iconGo('opportunity-detail', 'فتح ' + o.title, 'chevron-left', `data-id="${o.id}"`)}</div><h2>${e(o.title)}</h2><p class="muted small">${e(s.clients.find((c) => c.id === o.clientId)?.name)}</p><div class="row-between"><strong class="stat-value num">${cash(o.value)}</strong><span class="small">${Number(o.probability) || 0}% احتمال مسجّل</span></div>${A.progress(Number(o.probability) || 0)}<div class="row-between tiny muted"><span>الموعد المتوقع</span><span>${e(date(o.expectedClose))}</span></div></article>`).join('') || A.empty('لا فرص في هذه المرحلة', 'يمكنك إنشاء فرصة لاحتياج حقيقي من ملف العميل.')}</div>${go('quotes', 'إدارة عروض الأسعار', 'file', '', 'btn btn-secondary btn-block')}`;
  }
  function opportunityDetail({ state: s, params }) {
    const o = ownOpps(s).find((x) => x.id === params.id);
    if (!o) return missing('الفرصة غير متاحة');
    const c = s.clients.find((x) => x.id === o.clientId),
      quotes = ownQuotes(s).filter((q) => q.opportunityId === o.id);
    return `${head(o.title, c?.name || '', go('client-detail', 'ملف العميل', 'user', `data-id="${o.clientId}"`))}<div class="dashboard-grid"><div class="main-column"><section class="card"><div class="row-between">${badge(o.stage)}<strong class="stat-value num">${cash(o.value)}</strong></div><label class="field">مرحلة الفرصة<select class="select" data-change="opportunity-stage" data-id="${o.id}">${stageList.map((st) => `<option value="${st}" ${o.stage === st ? 'selected' : ''}>${labels[st]}</option>`).join('')}</select></label><div class="rep-insight-grid"><div><span class="small muted">احتمال الإنجاز المسجّل</span><p class="strong num">${Number(o.probability) || 0}%</p></div><div><span class="small muted">التاريخ المتوقع</span><p>${e(date(o.expectedClose))}</p></div></div><div class="chips">${needsChips(o.serviceIds)}</div><p>${e(o.notes || 'لم تُضف ملاحظات بعد.')}</p>${o.lossReason ? `<div class="notice notice-warn">سبب عدم الاكتمال: ${e(o.lossReason)}</div>` : ''}</section><div class="card">${section('العروض المرتبطة', '', act('quote-new', 'عرض جديد', 'plus', `data-id="${o.clientId}" data-opportunity="${o.id}"`, 'btn btn-ghost btn-sm'))}${quotes.map((q) => `<div class="list-item"><div class="rep-grow"><strong>${e(q.title)}</strong><div class="row-between small">${quoteStatus(s, q)}<strong class="num">${cash(q.total)}</strong></div></div>${iconGo('quote-detail', 'عرض السعر', 'chevron-left', `data-id="${q.id}"`)}</div>`).join('') || '<p class="muted">لم يُرفق عرض بعد.</p>'}</div></div><aside class="side-column"><div class="card card-accent"><h2>حرّك الفرصة للأمام</h2><p class="muted small">الفرصة المكتسبة تتطلب عرضًا مقبولًا. يُحدّث القبول حالتها تلقائيًا من تطبيق العميل.</p>${act('quote-new', 'إعداد عرض مناسب', 'file', `data-id="${o.clientId}" data-opportunity="${o.id}"`, 'btn btn-primary btn-block')}${act('task-new', 'مهمة متابعة', 'checklist', `data-id="${o.clientId}"`, 'btn btn-secondary btn-block')}${go('messages', 'ناقش الاحتياج', 'message', `data-id="${o.clientId}"`, 'btn btn-ghost btn-block')}</div></aside></div>`;
  }
  function opportunityModal(s, id, visitId) {
    if (!ownClients(s).length) return A.go('client-form');
    A.modal(
      'فرصة تجارية جديدة',
      `<form data-submit="save-opportunity" data-visit="${e(visitId || currentVisitFor(s, id)?.id || '')}" data-client="${e(id || '')}" class="stack"><label class="field">عنوان الفرصة<input class="input" name="title" required minlength="4" maxlength="120"></label><label class="field">العميل<select class="select" name="clientId" required>${ownClients(
        s,
      )
        .filter((c) => !c.doNotContact)
        .map(
          (c) => `<option value="${c.id}" ${id === c.id ? 'selected' : ''}>${e(c.name)}</option>`,
        )
        .join(
          '',
        )}</select></label><label class="field">الخدمة الأساسية<select class="select" name="serviceId" required>${s.catalog.map((x) => `<option value="${x.id}">${e(x.title)} · ${cash(x.price)}</option>`).join('')}</select></label><label class="field">التاريخ المتوقع للقرار<input class="input" type="date" name="expectedClose" required min="${A.today()}" value="${A.addDays(14)}"></label><label class="field">ملاحظة التأهيل<textarea class="textarea" name="notes" rows="3" required minlength="10" maxlength="1200"></textarea></label><button type="submit" class="btn btn-primary">${ic('briefcase')}إنشاء الفرصة</button></form>`,
    );
  }
  return {
    id: 'opportunities',
    routes: {
      opportunities: {
        title: 'الفرص',
        render: opportunities,
      },
      'opportunity-detail': {
        title: 'تفاصيل الفرصة',
        render: opportunityDetail,
        nav: 'opportunities',
      },
    },
    actions: {
      'opportunity-new'({ state, el }) {
        opportunityModal(state, el.dataset.id, el.dataset.visit);
      },
      'save-opportunity'({ data, state, form }) {
        const c = client(state, data.clientId),
          svc = state.catalog.find((x) => x.id === data.serviceId);
        if (
          !c ||
          !svc ||
          String(data.title || '').trim().length < 4 ||
          String(data.notes || '').trim().length < 10 ||
          !data.expectedClose ||
          data.expectedClose < A.today()
        )
          return A.toast('أكمل بيانات فرصة مرتبطة باحتياج واضح.', 'error');
        const id = A.id('opp');
        if (
          commit((s) => {
            const current = client(s, c.id),
              service = s.catalog.find((x) => x.id === svc.id);
            A.assert(
              current && !current.doNotContact && service,
              'العميل أو الخدمة لم يعد متاحًا لهذه الفرصة.',
            );
            const v = currentVisitFor(s, c.id, form.dataset.visit);
            const row = {
              id,
              clientId: c.id,
              repId: rep(s).id,
              visitId: v?.status === 'active' ? v.id : '',
              visitIds: v?.status === 'active' ? [v.id] : [],
              title: String(data.title).trim(),
              stage: 'new',
              value: Number(service.price),
              probability: 20,
              expectedClose: data.expectedClose,
              serviceIds: [service.id],
              lossReason: '',
              notes: String(data.notes).trim(),
            };
            s.opportunities.unshift(row);
            if (v?.status === 'active')
              v.opportunityIds = [...new Set([...(v.opportunityIds || []), id])];
          }, 'إنشاء فرصة مرتبطة بالاحتياج') === false
        )
          return;
        A.closeModal();
        A.go('opportunity-detail', {
          id,
        });
      },
      'opportunity-stage'({ el, state }) {
        const o = ownOpps(state).find((x) => x.id === el.dataset.id),
          value = el.value;
        if (!o || !stageList.includes(value)) return;
        if (value === 'lost') {
          el.value = o.stage;
          return A.modal(
            'توثيق عدم اكتمال الفرصة',
            `<form data-submit="lose-opportunity" data-id="${o.id}" class="stack"><label class="field">السبب<textarea class="textarea" name="reason" required minlength="10" maxlength="1000" rows="4"></textarea></label><button class="btn btn-danger" type="submit">حفظ السبب وإغلاق الفرصة</button></form>`,
          );
        }
        const ok = commit((s) => {
          const row = ownOpps(s).find((x) => x.id === o.id);
          A.assert(row, 'الفرصة لم تعد ضمن حسابك.');
          A.assert(
            value !== 'won' ||
              ownQuotes(s).some((q) => q.opportunityId === row.id && q.status === 'accepted'),
            'هذه المرحلة تحتاج عرضًا مقبولًا من العميل.',
          );
          row.stage = value;
          row.probability = {
            new: 20,
            qualified: 40,
            proposal: 55,
            negotiation: 75,
            won: 100,
          }[value];
          row.lossReason = '';
        }, 'تحديث مرحلة الفرصة');
        if (ok === false) el.value = o.stage;
      },
      'lose-opportunity'({ form, data }) {
        if (String(data.reason || '').trim().length < 10)
          return A.toast('أضف سببًا واضحًا.', 'error');
        if (
          commit((s) => {
            const o = ownOpps(s).find((x) => x.id === form.dataset.id);
            A.assert(o, 'تغيّر إسناد الفرصة.');
            o.stage = 'lost';
            o.probability = 0;
            o.lossReason = String(data.reason).trim();
          }, 'إغلاق فرصة مع توثيق السبب') !== false
        )
          A.closeModal();
      },
    },
    api: {},
  };
}
