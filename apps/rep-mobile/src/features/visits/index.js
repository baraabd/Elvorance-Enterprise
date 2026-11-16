/** rep / visits: original v1.1 views and local demo actions. */
export function createVisitsFeature(context, { customers, quotes, state }) {
  const {
    A,
    act,
    activeVisit,
    badge,
    cash,
    client,
    clone,
    date,
    draftKey,
    e,
    elapsed,
    getVisit,
    go,
    head,
    ic,
    labels,
    localDay,
    localInput,
    missing,
    needsChips,
    needsFollowup,
    notify,
    now,
    outcomes,
    ownClients,
    ownOpps,
    ownQuotes,
    rep,
    reviewLabels,
    section,
    time,
    ui,
  } = context;
  const cancelContactWork = (...args) => customers.cancelContactWork(...args);
  const commit = (...args) => state.commit(...args);
  const composedTerms = (...args) => quotes.composedTerms(...args);
  const ensureQuote = (...args) => quotes.ensureQuote(...args);
  const quoteDraftSlot = (...args) => quotes.quoteDraftSlot(...args);
  const quoteFingerprint = (...args) => quotes.quoteFingerprint(...args);
  const quoteMath = (...args) => quotes.quoteMath(...args);
  const quoteSnapshot = (...args) => quotes.quoteSnapshot(...args);
  const quoteStatus = (...args) => quotes.quoteStatus(...args);
  const readDraft = (...args) => state.readDraft(...args);
  const readForm = (...args) => state.readForm(...args);
  const removeDraft = (...args) => state.removeDraft(...args);
  const saveQuote = (...args) => quotes.saveQuote(...args);
  const writeDraft = (...args) => state.writeDraft(...args);
  function currentVisitFor(s, clientId, explicit) {
    const named = explicit && getVisit(s, explicit);
    if (named && named.clientId === clientId) return named;
    const active = activeVisit(s);
    return active?.clientId === clientId ? active : null;
  }
  function visitWorking(s, v) {
    const c = s.clients.find((x) => x.id === v.clientId) || {};
    const saved = readDraft(draftKey('form:save-visit-draft', v.id));
    const fields = {
      needs: clone(c.needs || []),
      painPoints: c.painPoints || '',
      wishes: c.wishes || '',
      proposedDuration: '',
      paymentWishes: '',
      notes: v.notes || '',
      ...(v.workingDraft || {}),
      ...(saved || {}),
    };
    fields.needs = Array.isArray(fields.needs) ? fields.needs : [];
    return fields;
  }
  function visitQuotes(s, v) {
    return ownQuotes(s).filter(
      (q) => q.clientId === v.clientId && (q.visitId === v.id || (v.quoteIds || []).includes(q.id)),
    );
  }
  function primaryQuote(quotes, selectedId) {
    return (
      quotes.find((q) => q.id === selectedId) ||
      [...quotes].sort(
        (a, b) =>
          (({
            accepted: 5,
            sent: 4,
            revision_requested: 3,
            draft: 2,
            rejected: 1,
          })[b.status] || 0) -
            ({
              accepted: 5,
              sent: 4,
              revision_requested: 3,
              draft: 2,
              rejected: 1,
            }[a.status] || 0) ||
          new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt),
      )[0] ||
      null
    );
  }
  function bindQuoteToVisit(state, quote) {
    const v = quote.visitId && getVisit(state, quote.visitId);
    if (!v || v.clientId !== quote.clientId || v.status !== 'active') return;
    v.quoteIds = [...new Set([...(v.quoteIds || []), quote.id])];
    if (quote.opportunityId)
      v.opportunityIds = [...new Set([...(v.opportunityIds || []), quote.opportunityId])];
    const opportunity = state.opportunities.find((o) => o.id === quote.opportunityId);
    if (opportunity) {
      opportunity.visitId = opportunity.visitId || v.id;
      opportunity.visitIds = [...new Set([...(opportunity.visitIds || []), v.id])];
    }
  }
  function agreementMarkup(snapshot, { saved = false } = {}) {
    const q = snapshot.quotes?.find((x) => x.id === snapshot.primaryQuoteId) || null;
    const sourceStatus = q?.status || 'no_quote';
    return `<section class="card rep-agreement-summary"><div class="row-between"><h2>${saved ? 'ملخص محفوظ وقت إنهاء الزيارة' : 'ملخص ما نوقش في الزيارة'}</h2>${A.badge(reviewLabels[sourceStatus], sourceStatus === 'accepted' ? 'good' : sourceStatus === 'rejected' ? 'bad' : 'info')}</div><div class="notice ${sourceStatus === 'accepted' ? 'notice-good' : ''}">${sourceStatus === 'accepted' ? 'حالة العرض تفيد بأن العميل قبله داخل المنصة. هذا لا يعني توقيع عقد أو دفع فاتورة؛ تُراجع تلك السجلات بشكل مستقل.' : sourceStatus === 'sent' ? 'هذه بنود اقترحها المندوب وأرسلها. لم يسجّل العميل قبوله لها بعد.' : sourceStatus === 'revision_requested' ? 'العميل طلب تعديلًا؛ النسخة الحالية ليست اتفاقًا نهائيًا مقبولًا.' : sourceStatus === 'rejected' ? 'هذا العرض مرفوض من العميل؛ يُعرض هنا لتوثيق ما نوقش، ولا يمثل اتفاقًا.' : 'هذه احتياجات ومقترحات عمل. لا يُنسب قبول للعميل دون تسجيله في تطبيقه.'}</div>${q ? `<h3>${e(q.title)}</h3><div class="table-wrap"><table class="data-table"><thead><tr><th>الخدمة</th><th>الكمية</th><th>السعر</th><th>الإجمالي</th></tr></thead><tbody>${q.items.map((it) => `<tr><td>${e(it.title)}${it.deliverables?.length ? `<p class="tiny muted">${e(it.deliverables.join(' · '))}</p>` : ''}</td><td class="num">${Number(it.qty)}</td><td class="num">${cash(it.price)}</td><td class="num">${cash(Number(it.qty) * Number(it.price))}</td></tr>`).join('')}</tbody></table></div><div class="rep-totals"><div><span>الخدمات</span><strong>${cash(q.subtotal)}</strong></div><div><span>الخصم</span><strong>${cash(q.discount)}</strong></div><div class="rep-total"><span>الإجمالي</span><strong>${cash(q.total)}</strong></div></div><h3>النطاق والشروط المعروضة</h3><p class="rep-preline">${e(q.terms)}</p>${q.revisionRequest ? `<div class="notice notice-warn">طلب العميل: ${e(q.revisionRequest)}</div>` : ''}` : '<p class="muted">لم يُحفظ عرض مرتبط بهذه الزيارة بعد.</p>'}<div class="rep-insight-grid"><div><span class="small muted">المدة المقترحة</span><p>${e(q?.proposedDuration || snapshot.needs?.proposedDuration || 'لم تُحدد؛ تحتاج اتفاقًا لاحقًا.')}</p></div><div><span class="small muted">رغبات الدفع</span><p>${e(q?.paymentWishes || snapshot.needs?.paymentWishes || 'لم تُسجل تفضيلات دفع.')}</p></div></div><h3>الاحتياج الذي سُجّل</h3><div class="chips">${snapshot.needs?.services ? snapshot.needs.services.map((item) => `<span class="chip">${e(item.title)}</span>`).join('') : needsChips(snapshot.needs?.needs || [])}</div><p><strong>التحدي:</strong> ${e(snapshot.needs?.painPoints || 'لم يسجل')}</p><p><strong>النتيجة المطلوبة:</strong> ${e(snapshot.needs?.wishes || 'لم تسجل')}</p><p><strong>الملاحظات:</strong> ${e(snapshot.notes || snapshot.needs?.notes || q?.notes || 'لا ملاحظات إضافية.')}</p>${snapshot.nextAction ? `<p><strong>الخطوة التالية:</strong> ${e(snapshot.nextAction)}</p>` : ''}<div class="row wrap">${(
      snapshot.quotes || []
    )
      .filter((item) => item.id)
      .map((item) =>
        go(
          'quote-detail',
          (saved ? 'العرض الحالي: ' : 'فتح العرض: ') + item.title,
          'file',
          `data-id="${item.id}" data-param-visit="${snapshot.visitId}"`,
          'btn btn-secondary btn-sm',
        ),
      )
      .join(
        '',
      )}${(snapshot.opportunityIds || []).map((id) => go('opportunity-detail', 'الفرصة المرتبطة', 'briefcase', `data-id="${id}"`, 'btn btn-ghost btn-sm')).join('')}${saved ? act('print-agreement', 'نسخة الملخص', 'download', `data-id="${snapshot.visitId}"`, 'btn btn-ghost btn-sm') : ''}</div>${saved ? `<p class="tiny muted">هذه نسخة ثابتة بتاريخ ${e(date(snapshot.capturedAt))} ${e(time(snapshot.capturedAt))}. قد تعرض روابط المستندات أعلاه تحديثات لاحقة.</p>` : ''}</section>`;
  }
  function buildAgreement(s, v, review = {}) {
    const quotes = visitQuotes(s, v),
      q = primaryQuote(quotes, review.quoteId),
      working = visitWorking(s, v);
    return {
      schemaVersion: 1,
      visitId: v.id,
      clientId: v.clientId,
      repId: v.repId,
      capturedAt: now(),
      reviewResult: q?.status || 'no_quote',
      outcome: review.outcome || 'interested',
      primaryQuoteId: q?.id || null,
      quotes: quotes.map(quoteSnapshot),
      quoteIds: quotes.map((x) => x.id),
      opportunityIds: [
        ...new Set([
          ...(v.opportunityIds || []),
          ...quotes.map((x) => x.opportunityId).filter(Boolean),
        ]),
      ],
      needs: clone(working),
      discovery: v.discovery ? clone(v.discovery) : null,
      notes: review.notes || working.notes || q?.notes || '',
      nextAction: review.nextAction || '',
      followUpAt: review.followUpAt || null,
      clientAcceptance: {
        status: q?.status === 'accepted' ? 'accepted' : 'not_accepted',
        quoteId: q?.id || null,
        recordedAt: q?.status === 'accepted' ? q.acceptedAt || null : null,
        source: 'client_quote_status',
        contractSigned: null,
        paymentRecorded: null,
        downstreamStatus: 'review_separate_records',
      },
    };
  }
  function checkin({ state: s, params }) {
    const c = client(s, params.id);
    if (!c) return missing('العميل غير متاح');
    const active = activeVisit(s);
    if (active)
      return (
        head('هناك زيارة جارية', 'أنهِ الزيارة الحالية قبل بدء زيارة جديدة.') +
        A.empty(
          'زيارة مفتوحة',
          s.clients.find((x) => x.id === active.clientId)?.name || '',
          go(
            'visit-active',
            'العودة إلى الزيارة',
            'play',
            `data-id="${active.id}"`,
            'btn btn-primary',
          ),
        )
      );
    if (c.doNotContact)
      return (
        head('التواصل موقوف', c.name) +
        A.empty(
          'احترام رغبة العميل',
          'سُجّل طلب بعدم التواصل؛ لا يمكن بدء زيارة جديدة.',
          go('client-detail', 'ملف العميل', 'user', `data-id="${c.id}"`),
        )
      );
    const proof = ui.gps?.clientId === c.id ? ui.gps : null;
    return `${head('وصلت إلى العميل؟', 'سجّل وصولك بطريقة واضحة قبل بدء الزيارة.')}<div class="rep-narrow"><div class="card"><div class="row">${A.avatar(c.name)}<div><h2>${e(c.name)}</h2><p class="muted small">${e(c.address)}</p></div></div></div><form data-submit="start-visit" data-id="${c.id}" data-visit="${e(params.visit || '')}" class="stack"><div class="card"><h2>توثيق الوصول</h2><p class="muted small">الموقع يُطلب فقط عند الضغط. يمكنك اختيار تسجيل يدوي مع توضيح السبب.</p><div class="segmented"><button type="button" class="${ui.proofMode === 'gps' ? 'active' : ''}" data-action="proof-mode" data-value="gps">${ic('pin')}موقع الجهاز</button><button type="button" class="${ui.proofMode === 'manual' ? 'active' : ''}" data-action="proof-mode" data-value="manual">${ic('edit')}توثيق يدوي</button></div>${ui.proofMode === 'gps' ? `<div class="rep-proof-box">${proof ? `<span class="icon-box icon-box-lime">${ic('check-circle')}</span><h3>تم استلام الموقع بإذنك</h3><p class="num small" dir="ltr">${proof.lat.toFixed(5)}, ${proof.lng.toFixed(5)}</p><p class="tiny muted">الدقة التقريبية: ${Math.round(proof.accuracy)} م · ${e(time(proof.recordedAt))}</p>` : `<span class="icon-box">${ic('compass')}</span><h3>لم يُطلب موقعك بعد</h3>`}${act('request-gps', ui.gpsBusy ? 'جارٍ طلب الموقع…' : proof ? 'تحديث الموقع' : 'السماح بطلب الموقع', 'pin', `data-id="${c.id}" ${ui.gpsBusy ? 'disabled' : ''}`, 'btn btn-secondary')}${ui.gpsError ? `<p class="text-bad small" role="alert">${e(ui.gpsError)}</p>` : ''}</div>` : `<label class="field">سبب التوثيق اليدوي<textarea class="textarea" name="manualReason" required minlength="10" maxlength="400" rows="3" placeholder="مثال: الزيارة داخل المبنى وتعذر الحصول على إشارة دقيقة"></textarea></label>`}<div class="notice small">${ic('shield')}هذا الإجراء يوثّق نقطة الوصول فقط. مشاركة الموقع مع الإدارة تُفعّل اختياريًا من «موقعي أثناء العمل».</div></div><div class="card"><label class="field">ملاحظة عند الوصول<textarea class="textarea" name="notes" rows="3" maxlength="1000" placeholder="الغرض من الزيارة أو ما تحتاج تذكّره"></textarea></label><label class="field">صورة اختيارية للزيارة<input class="input" type="file" name="photo" accept="image/jpeg,image/png,image/webp"><span class="tiny muted">تُحفظ محليًا. صورة حتى 1 ميغابايت، دون بيانات حساسة.</span></label></div><div class="form-actions"><button class="btn btn-primary btn-block" type="submit">${ic('play')}بدء الزيارة</button>${go('client-detail', 'العودة للعميل', 'arrow-right', `data-id="${c.id}"`)}</div></form></div>`;
  }
  function visitActive({ state: s, params }) {
    const v = getVisit(s, params.id) || activeVisit(s);
    if (!v) return missing('لا توجد زيارة جارية');
    if (v.status !== 'active')
      return visitDetail({
        state: s,
        params: {
          id: v.id,
        },
      });
    const c = s.clients.find((x) => x.id === v.clientId),
      working = visitWorking(s, v),
      quotes = visitQuotes(s, v),
      editable = [...quotes]
        .reverse()
        .find((q) => ['draft', 'revision_requested'].includes(q.status));
    const pendingDraft = readDraft(
      quoteDraftSlot({
        visit: v.id,
        client: v.clientId,
      }),
    );
    return `${head('الزيارة جارية', c?.name || '', go('client-detail', 'ملف العميل', 'user', `data-id="${v.clientId}"`))}<section class="hero hero-dark rep-live-hero"><div class="row-between"><span class="badge badge-good">${ic('play')}تم بدء الزيارة</span><span class="small">${e(time(v.startedAt))}</span></div><div id="rep-visit-time" data-started="${e(v.startedAt)}" class="rep-live-timer num" aria-label="المدة المنقضية">${elapsed(v.startedAt)}</div><p>كل احتياج وعرض في هذه الصفحة مرتبط بهذه الزيارة. يبقى ما تكتبه محفوظًا كمسودة عند التنقل.</p><div class="row wrap">${go('visit-outcome', 'مراجعة ملخص الزيارة وإنهاؤها', 'check-circle', `data-id="${v.id}"`, 'btn btn-lime')}${go('catalog', 'استعراض الخدمات', 'layers', `data-param-client="${v.clientId}" data-param-visit="${v.id}"`, 'btn btn-ghost')}</div></section><div data-atlas-tracking-control></div><section class="card card-accent"><h2>استبيان الاحتياج من الإدارة</h2><p class="muted">${v.discovery ? 'مكتمل، محفوظ بإصدار '+e(v.discovery.configRevision) : 'ابدأ بنوع النشاط ثم التحديات والنتائج والخدمات. يعتمد عليه إعداد العرض.'}</p>${go('visit-questionnaire',v.discovery?'مراجعة الإجابات وتعديلها':'بدء الاستبيان خطوة بخطوة','checklist',`data-id="${v.id}"`,'btn btn-primary')}</section><div class="dashboard-grid"><div class="main-column"><section class="card"><h2>ملخص احتياج العميل المعتمد</h2>${v.discovery?`<div class="notice notice-good">استبيان مكتمل · الإصدار ${e(v.discovery.configRevision)} · ${e(v.discovery.savedAt||'')}</div><p class="rep-preline">${e(v.workingDraft?.painPoints||'')}</p><p><strong>النتائج:</strong> ${e(v.workingDraft?.wishes||'')}</p><div class="chips">${needsChips(v.workingDraft?.needs||[])}</div>`:'<div class="notice notice-warn">لم تكتمل إجابات الاستبيان بعد؛ أكملها قبل إعداد عرض مرتبط بالزيارة.</div>'}${go('visit-questionnaire','إدارة إجابات الاستبيان','edit',`data-id="${v.id}"`,'btn btn-secondary')}</section><div class="card">${section('العروض المرتبطة بالزيارة', 'يُستخدم محتواها مباشرة في ملخص الختام.')}${quotes.map((q) => `<div class="list-item"><div class="rep-grow"><strong>${e(q.title)}</strong><p>${quoteStatus(s, q)} · ${cash(q.total)}</p></div>${go('quote-detail', 'فتح العرض', 'file', `data-id="${q.id}" data-param-visit="${v.id}"`, 'btn btn-secondary btn-sm')}</div>`).join('') || '<p class="muted">لم يُحفظ عرض مرتبط بعد.</p>'}${pendingDraft?.items?.length ? '<p class="notice">لديك مسودة عرض غير مكتملة محفوظة. يمكنك استكمالها دون إعادة اختيار الخدمات.</p>' : ''}<div class="row wrap">${editable ? go('quote-builder', 'استكمال العرض المرتبط', 'edit', `data-id="${editable.id}" data-param-visit="${v.id}"`, 'btn btn-primary') : act('quote-new', pendingDraft?.items?.length ? 'استكمال مسودة العرض' : 'إعداد عرض لهذه الزيارة', 'file', `data-id="${v.clientId}" data-visit="${v.id}"`, 'btn btn-primary')}${act('link-existing-quote', 'ربط عرض سابق نوقش اليوم', 'link', `data-id="${v.id}"`)}</div></div></div><aside class="side-column"><div class="card card-accent"><h3>مراجعة واحدة عند الختام</h3><p>سيظهر ملخص الخدمات والكميات والأسعار والخصم والشروط والمدة ورغبات الدفع، مع تمييز المقترح عن قبول العميل الفعلي.</p>${go('visit-outcome', 'مراجعة الملخص', 'checklist', `data-id="${v.id}"`, 'btn btn-primary btn-block')}${act('opportunity-new', 'إنشاء فرصة مرتبطة', 'briefcase', `data-id="${v.clientId}" data-visit="${v.id}"`, 'btn btn-secondary btn-block')}</div><div class="card"><h3>توثيق الوصول</h3><p>${v.locationProof?.method === 'gps' ? 'موقع الجهاز بإذن المستخدم' : 'توثيق يدوي'}</p><p class="small muted">${e(v.locationProof?.reason || 'نقطة وصول مسجلة عند بدء الزيارة فقط.')}</p>${v.photo ? `<img class="rep-proof-photo" src="${e(v.photo)}" alt="صورة الزيارة المحفوظة محليًا">` : ''}</div></aside></div>`;
  }
  function outcome({ state: s, params }) {
    const v = getVisit(s, params.id);
    if (!v) return missing('الزيارة غير متاحة');
    if (v.status !== 'active')
      return visitDetail({
        state: s,
        params,
      });
    const quotes = visitQuotes(s, v),
      stored = readDraft(draftKey('outcome', v.id));
    const draft = ui.outcome[v.id] ||
      stored || {
        step: quotes.length ? 'summary' : 1,
      };
    ui.outcome[v.id] = draft;
    const q = primaryQuote(quotes, draft.quoteId),
      working = visitWorking(s, v),
      selected = outcomes.find((x) => x[0] === draft.outcome);
    const loose = readDraft(
      quoteDraftSlot({
        visit: v.id,
        client: v.clientId,
      }),
    );
    if (!quotes.length && loose?.items?.length && draft.step !== 2 && draft.step !== 3) {
      const preview = buildAgreement(s, v);
      const proposal = {
        ...loose,
        id: null,
        status: 'draft',
        terms: composedTerms(loose),
        ...quoteMath(loose),
      };
      preview.quotes = [quoteSnapshot(proposal)];
      preview.primaryQuoteId = null;
      return `${head('مسودة العرض جزء من الزيارة', 'اختياراتك محفوظة. احفظ العرض كسجل لمراجعته في الختام.', go('visit-active', 'العودة إلى الزيارة', 'arrow-right', `data-id="${v.id}"`))}${agreementMarkup(preview)}<div class="form-actions">${act('commit-visit-quote', 'حفظ المسودة والانتقال لملخص الختام', 'check', `data-id="${v.id}"`, 'btn btn-primary')}${go('quote-builder', 'استكمال بيانات العرض', 'edit', `data-param-client="${v.clientId}" data-param-visit="${v.id}"`)}</div>`;
    }
    if (
      draft.step === 'summary' ||
      (!stored && !ui.outcome[v.id]?.outcome && quotes.length && draft.step !== 1)
    ) {
      const summary = buildAgreement(s, v, draft),
        accepted = q?.status === 'accepted';
      const next =
        draft.nextAction !== undefined
          ? draft.nextAction
          : accepted
            ? 'متابعة العقد وتسليم نطاق العمل المعتمد للفريق'
            : q?.status === 'sent'
              ? 'انتظار قرار العميل على العرض المرسل'
              : q?.status === 'revision_requested'
                ? 'مراجعة طلب التعديل وإعداد نسخة مناسبة'
                : q?.status === 'rejected'
                  ? 'توثيق سبب الرفض ومراجعة البدائل داخليًا'
                  : 'استكمال مسودة العرض قبل إرسالها';
      return `${head('ملخص الزيارة قبل الإغلاق', 'راجع مرة واحدة ما سجّلته وما قبله العميل فعلًا.', go('visit-active', 'العودة إلى الزيارة', 'arrow-right', `data-id="${v.id}"`))}${agreementMarkup(summary)}<form class="card stack rep-narrow" data-submit="finish-review" data-id="${v.id}">${quotes.length > 1 ? `<label class="field">العرض الأساسي في الملخص<select class="select" name="quoteId" data-change="review-quote" data-id="${v.id}">${quotes.map((item) => `<option value="${item.id}" ${q?.id === item.id ? 'selected' : ''}>${e(item.title)} · ${e(labels[item.status])}</option>`).join('')}</select></label>` : `<input type="hidden" name="quoteId" value="${e(q?.id || '')}">`}<label class="field">ملاحظات ختام الزيارة<textarea name="notes" class="textarea" rows="3" maxlength="2500">${e(draft.notes !== undefined ? draft.notes : working.notes || q?.notes || '')}</textarea></label><label class="field">الخطوة التالية المسجّلة<input class="input" name="nextAction" maxlength="400" value="${e(next)}"></label><label class="checkbox-row"><input type="checkbox" name="createFollowup" value="yes" data-change="review-followup">إنشاء مهمة متابعة جديدة لهذه الزيارة</label><div id="rep-review-followup" hidden><label class="field">موعد المتابعة<input class="input" type="datetime-local" name="followUpAt" min="${localInput()}" value="${e(draft.followUpAt || '')}"></label></div><p class="tiny muted">المتابعة اختيارية هنا. لن ننشئ فرصة أو مهمة مكررة بسبب إنهاء الزيارة.</p><label class="checkbox-row"><input type="checkbox" name="reviewed" value="yes" required>راجعت الملخص وحالة العرض، وأريد حفظ نسخة الختام.</label><div class="form-actions"><button type="submit" class="btn btn-primary">${ic('check-circle')}حفظ الملخص وإنهاء الزيارة</button>${act('exception-outcome', 'تسجيل نتيجة استثنائية بدلًا من ذلك', 'edit', `data-id="${v.id}"`, 'btn btn-ghost')}</div></form>`;
    }
    const needsDate =
      needsFollowup(draft.outcome) &&
      !(
        draft.outcome === 'interested' &&
        quotes.some((item) => ['sent', 'accepted'].includes(item.status))
      );
    const steps = `<div class="stepper"><span class="step ${draft.step === 1 ? 'active' : ''}">1 · النتيجة</span><span class="step ${draft.step === 2 ? 'active' : ''}">2 · التوثيق</span><span class="step ${draft.step === 3 ? 'active' : ''}">3 · المراجعة</span></div>`;
    let content = '';
    if (draft.step === 1)
      content = `<div class="grid-2 rep-outcomes">${outcomes.map(([value, label, icon, detail]) => `<button type="button" class="card rep-outcome-option" data-action="choose-outcome" data-id="${v.id}" data-value="${value}"><span class="icon-box">${ic(icon)}</span><span><strong>${label}</strong><small class="muted">${detail}</small></span>${ic('chevron-left')}</button>`).join('')}</div>`;
    if (draft.step === 2 && selected)
      content = `${draft.outcome === 'ready_to_contract' ? '<div class="notice notice-good"><strong>إتمام الصفقة أثناء الزيارة</strong><p>هذه النتيجة تسجل استعداد العميل فقط. افتح العرض من تطبيق العميل ليؤكد العميل الموافقة بنفسه، ثم يعتمد العقد. لا يُعلن استلام الدفعة أو بدء المشروع إلا بعد تحقق المالية والإدارة.</p></div>' : ''}<form class="card stack" data-submit="prepare-outcome" data-id="${v.id}"><h2>${selected[1]}</h2><label class="field">ماذا حدث؟<textarea name="notes" class="textarea" rows="4" required minlength="10" maxlength="2500">${e(draft.notes || working.notes || '')}</textarea></label><label class="field">الخطوة التالية<input class="input" name="nextAction" required minlength="5" maxlength="400" value="${e(draft.nextAction || (draft.outcome === 'do_not_contact' ? 'إيقاف التواصل بناءً على طلب العميل' : draft.outcome === 'ready_to_contract' ? 'مراجعة العرض واعتماد العقد من العميل، ثم تأكيد الدفعة الأولى وتعيين الفريق' : ''))}"></label>${needsDate ? `<label class="field">الموعد التالي<input type="datetime-local" name="followUpAt" class="input" required min="${localInput()}" value="${e(draft.followUpAt || '')}"></label>` : '<div class="notice">لن يُنشأ موعد تواصل جديد تلقائيًا لهذه النتيجة.</div>'}${draft.outcome === 'interested' && !quotes.length ? `<label class="field">الخدمة الأقرب للاحتياج<select class="select" name="serviceId" required><option value="">اختر خدمة</option>${s.catalog.map((svc) => `<option value="${svc.id}" ${draft.serviceId === svc.id ? 'selected' : ''}>${e(svc.title)}</option>`).join('')}</select></label>` : ''}<div class="form-actions"><button type="submit" class="btn btn-primary">${ic('check')}مراجعة الختام</button>${act('outcome-back', 'تغيير النتيجة', 'arrow-right', `data-id="${v.id}" data-value="1"`)}</div></form>`;
    if (draft.step === 3 && selected)
      content = `${agreementMarkup(buildAgreement(s, v, draft))}<div class="card stack"><h2>${selected[1]}</h2><p>${e(draft.notes)}</p><div class="notice"><strong>الخطوة التالية</strong><p>${e(draft.nextAction)}</p>${draft.followUpAt ? `<span>${e(date(draft.followUpAt))} · ${e(time(draft.followUpAt))}</span>` : ''}</div><div class="form-actions">${act('complete-visit', 'تأكيد وحفظ ملخص الزيارة', 'check-circle', `data-id="${v.id}"`, 'btn btn-primary')}${act('outcome-back', 'تعديل', 'edit', `data-id="${v.id}" data-value="2"`)}</div></div>`;
    return `${head('توثيق نتيجة الزيارة', s.clients.find((c) => c.id === v.clientId)?.name || '', go('visit-active', 'العودة إلى الزيارة', 'arrow-right', `data-id="${v.id}"`))}${quotes.length ? act('back-to-summary', 'العودة إلى ملخص العروض دون إعادة التأهيل', 'file', `data-id="${v.id}"`, 'btn btn-secondary') : ''}${steps}<div class="rep-narrow">${content}</div>`;
  }
  function visitDetail({ state: s, params }) {
    const v = getVisit(s, params.id);
    if (!v) return missing('الزيارة غير متاحة');
    const c = s.clients.find((x) => x.id === v.clientId),
      outcomeLabel = v.agreementSnapshot
        ? reviewLabels[v.agreementSnapshot.reviewResult]
        : outcomes.find((x) => x[0] === v.outcome)?.[1];
    const relatedTasks = s.tasks.filter((t) => t.visitId === v.id);
    return `${head(v.status === 'completed' ? 'انتهت الزيارة، وبقي الاتفاق واضحًا' : 'سجل الزيارة', c?.name || '', go('client-detail', 'ملف العميل', 'user', `data-id="${v.clientId}"`))}<div class="card"><div class="row-between"><h2>${e(outcomeLabel || labels[v.status])}</h2>${badge(v.status)}</div><div class="rep-insight-grid"><div><span class="muted small">البداية</span><p>${e(date(v.startedAt || v.scheduledAt))} · ${e(time(v.startedAt || v.scheduledAt))}</p></div><div><span class="muted small">الانتهاء</span><p>${v.endedAt ? e(time(v.endedAt)) : 'لم تنتهِ بعد'}</p></div></div>${v.agreementSnapshot ? '<p class="notice notice-good">حُفظت النتيجة ونسخة الملخص. لن يتغير الملخص عند تعديل عرض أو كتالوج لاحقًا.</p>' : ''}</div>${
      v.agreementSnapshot
        ? agreementMarkup(v.agreementSnapshot, {
            saved: true,
          })
        : `<div class="card"><h3>الملاحظات</h3><p>${e(v.notes || 'لا ملاحظات مسجّلة.')}</p><h3>الخطوة التالية</h3><p>${e(v.nextAction || 'لم تُحدد بعد.')}</p>${v.status === 'scheduled' ? go('visit-checkin', 'بدء الزيارة', 'play', `data-id="${v.clientId}" data-param-visit="${v.id}"`, 'btn btn-primary') + act('cancel-visit', 'إلغاء الموعد', 'x', `data-id="${v.id}"`, 'btn btn-ghost') : ''}</div>`
    }${relatedTasks.length ? `<div class="card"><h2>المتابعات التي نتجت عن الزيارة</h2>${relatedTasks.map((t) => `<div class="row-between"><span>${e(t.title)}</span>${A.badge(t.status === 'done' ? 'مكتملة' : t.status === 'cancelled' ? 'ملغاة' : 'مفتوحة', t.status === 'cancelled' ? 'warn' : 'info')}</div>`).join('')}${go('tasks', 'فتح المهام', 'checklist')}</div>` : ''}<div class="form-actions">${go('territory', 'العودة إلى المسار', 'route', '', 'btn btn-primary')}${go('home', 'الرئيسية', 'home')}</div>`;
  }
  function scheduleModal(s, id) {
    const available = ownClients(s).filter((c) => !c.doNotContact);
    if (!available.length) return A.toast('لا يوجد عميل متاح للتواصل في منطقتك.', 'info');
    A.modal(
      'موعد جديد',
      `<form data-submit="save-schedule" class="stack"><label class="field">العميل<select class="select" name="clientId" required>${available.map((c) => `<option value="${c.id}" ${id === c.id ? 'selected' : ''}>${e(c.name)}</option>`).join('')}</select></label><label class="field">التاريخ والوقت<input class="input" type="datetime-local" name="scheduledAt" required min="${localInput()}"></label><label class="field">هدف الزيارة<textarea class="textarea" name="notes" required minlength="5" maxlength="500" rows="3"></textarea></label><button type="submit" class="btn btn-primary">${ic('calendar')}حفظ الموعد</button></form>`,
    );
  }
  function readPhoto(file) {
    return new Promise((resolve, reject) => {
      if (!file || !file.size) return resolve(null);
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 1024 * 1024)
        return reject(new Error('اختر صورة JPG أو PNG أو WebP لا تتجاوز 1 ميغابايت.'));
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error('تعذر قراءة الصورة.'));
      reader.readAsDataURL(file);
    });
  }
  function saveOutcomeDraft(id, value) {
    ui.outcome[id] = value;
    return writeDraft(draftKey('outcome', id), value);
  }
  function reviewSignature(s, v, quoteId) {
    return JSON.stringify({
      visitId: v.id,
      clientId: v.clientId,
      repId: v.repId,
      quoteId: quoteId || '',
      doNotContact: !!client(s, v.clientId)?.doNotContact,
      quotes: visitQuotes(s, v).map((q) => ({
        id: q.id,
        status: q.status,
        fingerprint: quoteFingerprint(q),
        acceptedAt: q.acceptedAt || '',
        revisionRequest: q.revisionRequest || '',
      })),
    });
  }
  function completeVisit(s, id, draft) {
    const initial = getVisit(s, id);
    if (initial?.status === 'completed' && initial.agreementSnapshot) {
      A.go('visit-detail', {
        id,
      });
      return true;
    }
    if (!initial || initial.status !== 'active' || !draft || draft.step !== 3)
      return A.toast('راجع الزيارة الحالية قبل تأكيدها.', 'error');
    let finished = false,
      changed = false;
    const ok = commit((st) => {
      const v = getVisit(st, id),
        c = v && client(st, v.clientId);
      A.assert(v && c, 'تغيّر إسناد الزيارة أو العميل؛ أعد فتح السجل.');
      if (v.status === 'completed' && v.agreementSnapshot) {
        finished = true;
        return;
      }
      A.assert(
        v.status === 'active' && !v.agreementSnapshot,
        'هذه الزيارة لم تعد جارية؛ لا يمكن تعديل نسخة الختام.',
      );
      if (draft.reviewSignature !== reviewSignature(st, v, draft.quoteId)) {
        changed = true;
        A.assert(
          false,
          'تغيّرت حالة العرض أو رغبة العميل أثناء المراجعة. افتح الملخص مرة أخرى قبل الإغلاق.',
        );
      }
      const quotes = visitQuotes(st, v),
        q = primaryQuote(quotes, draft.quoteId),
        working = visitWorking(st, v),
        follow =
          draft.createFollowup && draft.followUpAt
            ? new Date(draft.followUpAt).toISOString()
            : null;
      A.assert(
        !follow || (Number.isFinite(Date.parse(follow)) && Date.parse(follow) > Date.now()),
        'اختر موعد متابعة في المستقبل.',
      );
      A.assert(
        !follow || !c.doNotContact,
        'طلب العميل عدم التواصل؛ ألغِ المتابعة الجديدة قبل إنهاء الزيارة.',
      );
      if (draft.outcome === 'ready_to_contract')
        A.assert(quotes.some((item) => ['sent', 'accepted'].includes(item.status)), 'يجب إرسال العرض للعميل قبل توثيق الاستعداد للتعاقد.');
      if (!draft.fromSummary) {
        A.assert(
          outcomes.some((x) => x[0] === draft.outcome),
          'اختر نتيجة صحيحة للزيارة.',
        );
        A.assert(
          String(draft.notes || '').trim().length >= 10 &&
            String(draft.nextAction || '').trim().length >= 5,
          'أكمل توثيق النتيجة والخطوة التالية.',
        );
      }
      const stamp = now(),
        r = rep(st);
      const oppIds = [
        ...new Set([
          ...(v.opportunityIds || []),
          ...quotes.map((item) => item.opportunityId).filter(Boolean),
        ]),
      ];
      if (draft.outcome === 'interested' && !q && draft.serviceId && !c.doNotContact) {
        const svc = st.catalog.find((x) => x.id === draft.serviceId);
        A.assert(svc, 'الخدمة المختارة لم تعد متاحة.');
        const match = ownOpps(st).find(
          (o) =>
            o.clientId === c.id &&
            !['won', 'lost'].includes(o.stage) &&
            (o.serviceIds || []).includes(svc.id),
        );
        let opportunity = match;
        if (!opportunity) {
          opportunity = {
            id: A.id('opp'),
            clientId: c.id,
            repId: r.id,
            visitId: id,
            visitIds: [id],
            title: svc.title + ' · ' + c.name,
            stage: 'qualified',
            value: Number(svc.price),
            probability: 40,
            expectedClose: follow ? localDay(follow) : A.addDays(14),
            serviceIds: [svc.id],
            lossReason: '',
            notes: draft.notes,
          };
          st.opportunities.unshift(opportunity);
        }
        opportunity.visitId ||= id;
        opportunity.visitIds = [...new Set([...(opportunity.visitIds || []), id])];
        oppIds.push(opportunity.id);
        working.needs = [...new Set([...(working.needs || []), svc.id])];
      }
      v.opportunityIds = [...new Set(oppIds)];
      v.quoteIds = quotes.map((item) => item.id);
      v.workingDraft = clone(working);
      if (['interested', 'ready_to_contract'].includes(draft.outcome) && !c.doNotContact) {
        c.status = c.status === 'customer' ? 'customer' : 'qualified';
        c.needs = [
          ...new Set([
            ...(c.needs || []),
            ...(working.needs || []),
            ...quotes.flatMap((item) => item.items.map((it) => it.serviceId)),
          ]),
        ];
      }
      if (draft.outcome === 'not_interested' && !q)
        c.status = c.status === 'customer' ? 'customer' : 'lost';
      if (draft.outcome === 'do_not_contact') {
        c.doNotContact = true;
        cancelContactWork(st, c.id, 'أُلغي احترامًا لطلب العميل بعدم التواصل خلال الزيارة.');
      }
      if (follow || draft.outcome === 'wrong_contact') {
        const type = draft.outcome === 'wrong_contact' ? 'data_correction' : 'follow_up';
        A.assert(
          type === 'data_correction' || !c.doNotContact,
          'لا يمكن إنشاء متابعة لعميل طلب عدم التواصل.',
        );
        const sourceKey = id + ':' + type + ':' + (follow || A.today());
        if (
          !st.tasks.some((t) => t.sourceKey === sourceKey || (t.visitId === id && t.type === type))
        )
          st.tasks.unshift({
            id: A.id('task'),
            visitId: id,
            sourceKey,
            title: draft.nextAction,
            repId: r.id,
            clientId: c.id,
            dueDate: follow ? localDay(follow) : A.today(),
            followUpAt: follow,
            priority: ['needs_approval', 'wrong_contact'].includes(draft.outcome)
              ? 'high'
              : 'normal',
            status: 'open',
            type,
          });
      }
      if (
        ['reschedule', 'remote_meeting', 'closed', 'no_decision_maker'].includes(draft.outcome) &&
        follow &&
        !st.visits.some((row) => row.sourceVisitId === id && row.status === 'scheduled')
      )
        st.visits.push({
          id: A.id('visit'),
          sourceVisitId: id,
          clientId: c.id,
          repId: r.id,
          scheduledAt: follow,
          startedAt: null,
          endedAt: null,
          status: 'scheduled',
          outcome: null,
          notes: draft.nextAction,
          nextAction: '',
          followUpAt: null,
          locationProof: null,
          photo: null,
        });
      if (
        draft.outcome === 'needs_approval' &&
        !st.approvals.some(
          (a) => a.visitId === id && a.type === 'scope_change' && a.status === 'pending',
        )
      ) {
        st.approvals.unshift({
          id: A.id('approval'),
          type: 'scope_change',
          visitId: id,
          quoteId: q?.id || null,
          repId: r.id,
          clientId: c.id,
          title: 'قرار مطلوب بعد زيارة ' + c.name,
          details: draft.notes + '\nالقرار المطلوب: ' + draft.nextAction,
          amount: 0,
          status: 'pending',
          createdAt: stamp,
          decisionNote: '',
        });
        notify(st, 'admin', 'زيارة تحتاج قرارًا', c.name + ' · ' + draft.nextAction);
      }
      const summary = buildAgreement(st, v, {
        ...draft,
        followUpAt: follow,
      });
      summary.capturedAt = stamp;
      summary.needs = clone(working);
      summary.needs.services = (working.needs || []).map((serviceId) => {
        const svc = st.catalog.find((row) => row.id === serviceId);
        return {
          serviceId,
          title: svc?.title || serviceId,
        };
      });
      Object.assign(v, {
        status: 'completed',
        endedAt: stamp,
        outcome: draft.outcome,
        reviewResult: summary.reviewResult,
        notes: draft.notes || working.notes || '',
        nextAction: draft.nextAction || '',
        followUpAt: follow,
        agreementSnapshot: clone(summary),
      });
      r.visitsToday = st.visits.filter(
        (row) =>
          row.repId === r.id && row.status === 'completed' && localDay(row.endedAt) === A.today(),
      ).length;
      finished = true;
    }, 'حفظ ملخص الزيارة ونسخة الاتفاق وقت الختام');
    if (ok === false) {
      if (changed) {
        saveOutcomeDraft(id, {
          ...draft,
          step: 'summary',
          reviewSignature: null,
        });
        A.refresh();
      }
      return false;
    }
    if (!finished) return false;
    delete ui.outcome[id];
    removeDraft(draftKey('outcome', id));
    removeDraft(draftKey('form:finish-review', id));
    removeDraft(draftKey('form:prepare-outcome', id));
    removeDraft(draftKey('form:save-visit-draft', id));
    A.go('visit-detail', {
      id,
    });
    A.toast('انتهت الزيارة وحُفظت نسخة واضحة من الاحتياج والعروض وحالة قبول العميل.', 'success');
    return true;
  }
  return {
    id: 'visits',
    routes: {
      'visit-checkin': {
        title: 'تسجيل الوصول',
        render: checkin,
        nav: 'territory',
      },
      'visit-active': {
        title: 'الزيارة الجارية',
        render: visitActive,
        nav: 'territory',
      },
      'visit-outcome': {
        title: 'نتيجة الزيارة',
        render: outcome,
        nav: 'territory',
      },
      'visit-detail': {
        title: 'سجل الزيارة',
        render: visitDetail,
        nav: 'territory',
      },
    },
    actions: {
      'schedule-visit'({ state, el }) {
        scheduleModal(state, el.dataset.id);
      },
      'save-schedule'({ state, data }) {
        const c = client(state, data.clientId),
          scheduled = new Date(data.scheduledAt),
          notes = String(data.notes || '').trim();
        if (
          !c ||
          c.doNotContact ||
          !Number.isFinite(scheduled.getTime()) ||
          scheduled.getTime() < Date.now() - 60000 ||
          notes.length < 5
        )
          return A.toast('اختر عميلًا متاحًا وموعدًا قادمًا وهدفًا واضحًا.', 'error');
        if (
          commit((s) => {
            const current = client(s, c.id);
            A.assert(
              current && !current.doNotContact,
              'العميل طلب عدم التواصل أو لم يعد ضمن حسابك.',
            );
            s.visits.push({
              id: A.id('visit'),
              clientId: current.id,
              repId: rep(s).id,
              scheduledAt: scheduled.toISOString(),
              startedAt: null,
              endedAt: null,
              status: 'scheduled',
              outcome: null,
              notes,
              nextAction: '',
              followUpAt: null,
              locationProof: null,
              photo: null,
            });
          }, 'جدولة زيارة جديدة') === false
        )
          return;
        A.closeModal();
        A.go('territory', {
          day: localDay(scheduled),
        });
        A.toast('أُضيف الموعد إلى مسارك.', 'success');
      },
      'cancel-visit'({ el, state }) {
        const v = getVisit(state, el.dataset.id);
        if (v?.status !== 'scheduled') return;
        A.confirm('إلغاء هذا الموعد؟', 'يبقى السجل محفوظًا بحالة ملغاة.', () => {
          if (
            commit((s) => {
              const row = getVisit(s, v.id);
              A.assert(row?.status === 'scheduled', 'تغيّرت الزيارة أو إسنادها؛ أعد فتح الجدول.');
              row.status = 'cancelled';
              row.cancellationReason = 'ألغى المندوب الموعد من سجله.';
            }, 'إلغاء موعد زيارة') !== false
          )
            A.go('territory');
        });
      },
      'proof-mode'({ el }) {
        ui.proofMode = el.dataset.value === 'gps' ? 'gps' : 'manual';
        A.refresh();
      },
      'request-gps'({ el }) {
        if (ui.gpsBusy) return;
        const id = el.dataset.id;
        ui.gpsError = '';
        if (!navigator.geolocation) {
          ui.gpsError = 'الجهاز لا يتيح الموقع هنا. اختر التوثيق اليدوي مع السبب.';
          A.refresh();
          return;
        }
        ui.gpsBusy = true;
        A.refresh();
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            ui.gpsBusy = false;
            ui.gps = {
              clientId: id,
              method: 'gps',
              lat: pos.coords.latitude,
              lng: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              recordedAt: now(),
            };
            if (A.route() === 'visit-checkin') A.refresh();
          },
          () => {
            ui.gpsBusy = false;
            ui.gpsError =
              'تعذر الحصول على الموقع أو لم يُسمح به. يمكنك التوثيق اليدوي دون اختلاق موقع.';
            if (A.route() === 'visit-checkin') A.refresh();
          },
          {
            enableHighAccuracy: true,
            timeout: 12000,
            maximumAge: 0,
          },
        );
      },
      async 'start-visit'({ form, data, state: s }) {
        const c = client(s, form.dataset.id);
        if (!c || c.doNotContact || activeVisit(s))
          return A.toast('لا يمكن بدء هذه الزيارة. راجع العميل أو الزيارة الجارية.', 'error');
        let proof;
        if (ui.proofMode === 'gps') {
          if (
            !ui.gps ||
            ui.gps.clientId !== c.id ||
            Date.now() - new Date(ui.gps.recordedAt).getTime() > 10 * 60000
          )
            return A.toast('اطلب موقعًا حديثًا أو اختر توثيقًا يدويًا.', 'error');
          const { clientId, ...location } = ui.gps;
          proof = location;
        } else {
          const reason = String(data.manualReason || '').trim();
          if (reason.length < 10)
            return A.toast('وضّح سبب التوثيق اليدوي بعشر أحرف على الأقل.', 'error');
          proof = {
            method: 'manual',
            reason,
            recordedAt: now(),
          };
        }
        let photo;
        try {
          photo = await readPhoto(form.querySelector('input[name="photo"]')?.files?.[0]);
        } catch (error) {
          return A.toast(error.message, 'error');
        }
        const fresh = A.state();
        if (activeVisit(fresh)) return A.toast('بدأت زيارة أخرى. ارجع للزيارة الجارية.', 'error');
        const scheduled = getVisit(fresh, form.dataset.visit),
          id =
            scheduled?.status === 'scheduled' && scheduled.clientId === c.id
              ? scheduled.id
              : A.id('visit');
        if (
          commit((st) => {
            A.assert(!activeVisit(st), 'توجد زيارة جارية؛ ارجع إليها قبل بدء أخرى.');
            const currentClient = client(st, c.id);
            A.assert(
              currentClient && !currentClient.doNotContact,
              'العميل لم يعد متاحًا للتواصل أو تغيّر إسناده.',
            );
            const row = st.visits.find((x) => x.id === id);
            A.assert(
              !row || (row.status === 'scheduled' && row.repId === rep(st).id),
              'تغيّر موعد الزيارة أو إسنادها.',
            );
            const patch = {
              clientId: c.id,
              repId: rep(st).id,
              startedAt: now(),
              endedAt: null,
              status: 'active',
              outcome: null,
              notes: String(data.notes || '').trim(),
              nextAction: '',
              followUpAt: null,
              locationProof: proof,
              photo,
            };
            if (row) Object.assign(row, patch);
            else
              st.visits.push({
                id,
                scheduledAt: now(),
                ...patch,
              });
            rep(st).lastSeen = now();
          }, 'بدء زيارة موثّقة') === false
        )
          return;
        ui.gps = null;
        A.go('visit-active', {
          id,
        });
        A.toast('بدأت الزيارة وحُفظ وقت الوصول.', 'success');
      },
      'save-visit-draft'({ state, form }) {
        const id = form.dataset.id,
          fields = readForm(form);
        if (!getVisit(state, id)) return;
        fields.needs = Array.isArray(fields.needs) ? fields.needs : [];
        if (
          commit((s) => {
            const v = getVisit(s, id);
            A.assert(v?.status === 'active', 'لا يمكن تغيير مسودة زيارة انتهت أو تغيّر إسنادها.');
            v.workingDraft = clone(fields);
            v.notes = String(fields.notes || '').trim();
          }, 'حفظ الاحتياج ومسودة اتفاق الزيارة') === false
        )
          return;
        removeDraft(draftKey('form:save-visit-draft', id));
        A.toast('حُفظ الاحتياج في سجل الزيارة، ويبقى قابلًا للمراجعة حتى الختام.', 'success');
      },
      'save-visit-notes'({ state, form, data }) {
        const id = form.dataset.id;
        if (!getVisit(state, id)) return;
        if (
          commit((s) => {
            const v = getVisit(s, id);
            A.assert(v?.status === 'active', 'الزيارة لم تعد جارية.');
            v.notes = String(data.notes || '').trim();
            v.workingDraft = {
              ...visitWorking(s, v),
              notes: v.notes,
            };
          }, 'حفظ ملاحظات الزيارة') !== false
        )
          A.toast('حُفظت الملاحظات.', 'success');
      },
      'link-existing-quote'({ state, el }) {
        const v = getVisit(state, el.dataset.id);
        if (v?.status !== 'active') return;
        const rows = ownQuotes(state).filter(
          (q) =>
            q.clientId === v.clientId && !visitQuotes(state, v).some((item) => item.id === q.id),
        );
        if (!rows.length)
          return A.toast(
            'كل العروض المتاحة مرتبطة بالفعل، أو لم يُحفظ عرض لهذا العميل بعد.',
            'info',
          );
        A.modal(
          'ربط ما نوقش في الزيارة',
          `<form data-submit="save-link-quote" data-id="${v.id}" class="stack"><p>يُضاف مرجع العرض الحالي إلى هذه الزيارة دون تغيير محتواه أو قبول العميل له.</p><label class="field">العرض<select class="select" name="quoteId" required>${rows.map((q) => `<option value="${q.id}">${e(q.title)} · ${e(labels[q.status])}</option>`).join('')}</select></label><button type="submit" class="btn btn-primary">ربط العرض بالزيارة</button></form>`,
        );
      },
      'save-link-quote'({ form, data }) {
        const id = form.dataset.id;
        if (
          commit((s) => {
            const v = getVisit(s, id),
              q = ownQuotes(s).find((item) => item.id === data.quoteId);
            A.assert(
              v?.status === 'active' && q && q.clientId === v.clientId,
              'العرض أو الزيارة لم يعد متاحًا للربط.',
            );
            v.quoteIds = [...new Set([...(v.quoteIds || []), q.id])];
            q.visitId ||= v.id;
            if (q.opportunityId) {
              v.opportunityIds = [...new Set([...(v.opportunityIds || []), q.opportunityId])];
              const o = ownOpps(s).find((item) => item.id === q.opportunityId);
              if (o) {
                o.visitId ||= v.id;
                o.visitIds = [...new Set([...(o.visitIds || []), v.id])];
              }
            }
          }, 'ربط عرض نوقش في الزيارة') === false
        )
          return;
        A.closeModal();
        saveOutcomeDraft(id, {
          step: 'summary',
        });
        A.go('visit-active', {
          id,
        });
      },
      'commit-visit-quote'({ state, el }) {
        const v = getVisit(state, el.dataset.id);
        if (v?.status !== 'active') return;
        ui.quote = null;
        ensureQuote(state, {
          client: v.clientId,
          visit: v.id,
        });
        saveQuote(state, 'draft', null, 'visit-outcome');
      },
      'review-quote'({ state, el }) {
        const v = getVisit(state, el.dataset.id);
        if (!v || !visitQuotes(state, v).some((q) => q.id === el.value)) return;
        saveOutcomeDraft(v.id, {
          ...(ui.outcome[v.id] || {}),
          step: 'summary',
          quoteId: el.value,
        });
        A.refresh();
      },
      'review-followup'({ el }) {
        const panel = document.getElementById('rep-review-followup'),
          input = panel?.querySelector('input');
        if (panel) panel.hidden = !el.checked;
        if (input) input.required = el.checked;
      },
      'finish-review'({ state, form, data }) {
        const v = getVisit(state, form.dataset.id);
        if (v?.status !== 'active' || data.reviewed !== 'yes')
          return A.toast('راجع الملخص وأكّد حفظه أولًا.', 'error');
        const q = primaryQuote(visitQuotes(state, v), data.quoteId);
        if (!q) return A.toast('الملخص لم يعد يحتوي عرضًا مرتبطًا؛ أعد مراجعة الزيارة.', 'error');
        const createFollowup = data.createFollowup === 'yes',
          followUpAt = createFollowup ? data.followUpAt : null;
        if (
          createFollowup &&
          (!followUpAt ||
            !Number.isFinite(Date.parse(followUpAt)) ||
            Date.parse(followUpAt) <= Date.now() ||
            client(state, v.clientId)?.doNotContact)
        )
          return A.toast('المتابعة تحتاج موعدًا قادمًا وعميلًا يسمح بالتواصل.', 'error');
        const d = {
          step: 3,
          fromSummary: true,
          quoteId: q.id,
          outcome: q.status === 'rejected' ? 'not_interested' : 'interested',
          notes: String(data.notes || '').trim(),
          nextAction: String(data.nextAction || '').trim(),
          createFollowup,
          followUpAt,
          reviewSignature: reviewSignature(state, v, q.id),
        };
        if (createFollowup && d.nextAction.length < 5)
          return A.toast('اكتب عنوانًا واضحًا لمهمة المتابعة.', 'error');
        saveOutcomeDraft(v.id, d);
        completeVisit(state, v.id, d);
      },
      'exception-outcome'({ el }) {
        const id = el.dataset.id;
        saveOutcomeDraft(id, {
          ...(ui.outcome[id] || {}),
          step: 1,
          fromSummary: false,
          outcome: null,
        });
        A.refresh();
      },
      'back-to-summary'({ el }) {
        const id = el.dataset.id;
        saveOutcomeDraft(id, {
          ...(ui.outcome[id] || {}),
          step: 'summary',
          outcome: null,
          fromSummary: true,
        });
        A.refresh();
      },
      'choose-outcome'({ state, el }) {
        const id = el.dataset.id;
        if (
          !outcomes.some((item) => item[0] === el.dataset.value) ||
          getVisit(state, id)?.status !== 'active'
        )
          return;
        if (el.dataset.value === 'ready_to_contract') {
          const v = getVisit(state, id);
          const acceptable = v && visitQuotes(state, v).some((q) => ['sent', 'accepted'].includes(q.status));
          if (!acceptable) {
            A.toast('أرسل عرض سعر صالحًا أولًا؛ لا يمكن اعتبار كلام المندوب موافقة من العميل.', 'info');
            if (v) A.go('visit-active', { id: v.id });
            return;
          }
        }
        saveOutcomeDraft(id, {
          ...(ui.outcome[id] || {}),
          step: 2,
          outcome: el.dataset.value,
          followUpAt: null,
          createFollowup: false,
          fromSummary: false,
        });
        A.refresh();
      },
      'outcome-back'({ el }) {
        const id = el.dataset.id,
          draft = ui.outcome[id] || readDraft(draftKey('outcome', id));
        if (draft)
          saveOutcomeDraft(id, {
            ...draft,
            step: Number(el.dataset.value),
          });
        A.refresh();
      },
      'prepare-outcome'({ form, data, state }) {
        const v = getVisit(state, form.dataset.id),
          draft = ui.outcome[form.dataset.id];
        if (v?.status !== 'active' || !draft || !outcomes.some((x) => x[0] === draft.outcome))
          return;
        const quotes = visitQuotes(state, v),
          needsDate =
            needsFollowup(draft.outcome) &&
            !(
              draft.outcome === 'interested' &&
              quotes.some((q) => ['sent', 'accepted'].includes(q.status))
            );
        if (draft.outcome === 'ready_to_contract' && !quotes.some((q) => ['sent', 'accepted'].includes(q.status)))
          return A.toast('لا يمكن إتمام هذا المسار قبل إرسال العرض للعميل.', 'error');
        const notes = String(data.notes || '').trim(),
          nextAction = String(data.nextAction || '').trim();
        if (notes.length < 10 || nextAction.length < 5)
          return A.toast('أضف ملاحظات وخطوة تالية واضحتين.', 'error');
        if (
          needsDate &&
          (!data.followUpAt ||
            !Number.isFinite(Date.parse(data.followUpAt)) ||
            Date.parse(data.followUpAt) <= Date.now())
        )
          return A.toast('اختر موعد متابعة في المستقبل.', 'error');
        if (needsDate && client(state, v.clientId)?.doNotContact)
          return A.toast('العميل طلب عدم التواصل؛ اختر نتيجة دون متابعة تواصل.', 'error');
        if (
          draft.outcome === 'interested' &&
          !quotes.length &&
          !state.catalog.some((x) => x.id === data.serviceId)
        )
          return A.toast('اختر الخدمة الأقرب لاحتياج العميل.', 'error');
        const quoteId = primaryQuote(quotes, draft.quoteId)?.id || '';
        saveOutcomeDraft(v.id, {
          ...draft,
          notes,
          nextAction,
          followUpAt: needsDate ? data.followUpAt : null,
          createFollowup: needsDate,
          serviceId: data.serviceId || '',
          quoteId,
          step: 3,
          reviewSignature: reviewSignature(state, v, quoteId),
        });
        A.refresh();
      },
      'complete-visit'({ el, state }) {
        const id = el.dataset.id;
        completeVisit(state, id, ui.outcome[id] || readDraft(draftKey('outcome', id)));
      },
      'print-agreement'({ state, el }) {
        const v = getVisit(state, el.dataset.id);
        if (!v?.agreementSnapshot) return;
        A.printDocument(
          'ملخص ختام الزيارة',
          `<div class="document" dir="rtl"><h1>ملخص الزيارة المحفوظ</h1><p>نسخة ثابتة وقت الختام · ${e(date(v.endedAt))}</p>${agreementMarkup(v.agreementSnapshot)}</div>`,
        );
      },
    },
    api: {
      currentVisitFor,
      visitWorking,
      bindQuoteToVisit,
    },
  };
}
