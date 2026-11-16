// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** rep / customers: original v1.1 views and local demo actions. */
export function createCustomersFeature(context, { quotes, state }) {
  const {
    A,
    act,
    badge,
    cash,
    chipLink,
    client,
    date,
    e,
    go,
    head,
    ic,
    iconGo,
    labels,
    missing,
    needsChips,
    now,
    outcomes,
    ownClients,
    ownOpps,
    ownQuotes,
    ownVisits,
    rep,
    section,
    servicesText,
    time,
  } = context;
  const commit = (...args) => state.commit(...args);
  const quoteStatus = (...args) => quotes.quoteStatus(...args);
  function clientCard(s, c) {
    const zone = s.zones.find((z) => z.id === c.zoneId);
    return `<article class="card card-link rep-client-card" data-search="${e([c.name, c.contact, c.phone, c.sector, ...servicesText(c.needs)].join(' ').toLowerCase())}"><div class="row-between"><div class="row">${A.avatar(c.name)}<div><h3>${e(c.name)}</h3><p class="muted small">${e(c.sector)} · ${e(zone?.name || '')}</p></div></div>${iconGo('client-detail', 'فتح ملف ' + c.name, 'chevron-left', `data-id="${e(c.id)}"`)}</div><div class="chips rep-client-needs">${needsChips((c.needs || []).slice(0, 2))}</div><div class="row-between small"><span>${e(c.contact || 'بيانات التواصل قيد الاستكمال')}</span>${c.doNotContact ? A.badge('عدم التواصل', 'bad') : badge(c.status)}</div></article>`;
  }
  function clients({ state: s, params }) {
    const filter = params.filter || 'all',
      all = ownClients(s),
      rows = all.filter(
        (c) =>
          filter === 'all' || (filter === 'do_not_contact' ? c.doNotContact : c.status === filter),
      );
    return `${head('علاقات تُبنى على الفهم', 'ملف واحد للاحتياج، التواصل، والفرص التالية.', go('client-form', 'إضافة عميل', 'plus', '', 'btn btn-primary'))}<div class="filter-bar"><label class="search-box">${ic('search')}<input type="search" aria-label="البحث في العملاء" placeholder="اسم العميل، النشاط أو الهاتف" data-input="client-search"></label><span class="badge" id="rep-client-count">${rows.length} عميل</span></div><div class="chips">${[
      ['all', 'الكل'],
      ['new', 'جدد'],
      ['qualified', 'مؤهّلون'],
      ['customer', 'عملاء حاليون'],
      ['do_not_contact', 'عدم التواصل'],
    ]
      .map(([key, label]) => chipLink('clients', key, label, key === filter))
      .join(
        '',
      )}</div><div class="grid-2" id="rep-client-grid">${rows.map((c) => clientCard(s, c)).join('')}</div><div id="rep-search-empty" hidden>${A.empty('لا نتائج لهذا البحث', 'جرّب اسمًا أقصر أو رقم هاتف آخر.')}</div>${!rows.length ? A.empty('لا عملاء في هذه القائمة', 'أضف بيانات أول عميل لتبدأ.', go('client-form', 'إضافة عميل', 'plus')) : ''}`;
  }
  function clientForm({ state: s, params }) {
    const c = params.id ? client(s, params.id) : null;
    if (params.id && !c) return missing('ملف العميل غير متاح');
    const r = rep(s),
      value = (key) => e(c?.[key] || '');
    return `${head(c ? 'تحديث ملف العميل' : 'تعرّف إلى عميلك التالي', 'احفظ معلومات مفيدة تساعدك في تقديم خدمة مناسبة.')}<form data-submit="save-client" data-id="${e(c?.id || '')}" class="stack"><div class="card"><h2>معلومات النشاط</h2><div class="form-grid"><label class="field">اسم النشاط<input class="input" name="name" required minlength="2" maxlength="100" value="${value('name')}" autocomplete="organization"></label><label class="field">الشخص المسؤول<input class="input" name="contact" required minlength="2" maxlength="80" value="${value('contact')}"></label><label class="field">رقم التواصل<input class="input num" dir="ltr" type="tel" name="phone" required minlength="7" maxlength="25" value="${value('phone')}"></label><label class="field">البريد الإلكتروني<input class="input" dir="ltr" type="email" name="email" value="${value('email')}" maxlength="150"></label><label class="field">النشاط<input class="input" name="sector" required value="${value('sector')}" placeholder="مثل: مقهى، متجر، عيادة" maxlength="70"></label><label class="field">المنطقة<select class="select" name="zoneId" required>${s.zones
      .filter((z) => (r.zoneIds || []).includes(z.id))
      .map(
        (z) =>
          `<option value="${z.id}" ${c?.zoneId === z.id ? 'selected' : ''}>${e(z.name)}</option>`,
      )
      .join(
        '',
      )}</select></label><label class="field">العنوان<input class="input" name="address" required minlength="5" value="${value('address')}" maxlength="200"></label><label class="field">مرحلة العلاقة<select class="select" name="status">${['new', 'qualified', 'customer', 'lost'].map((st) => `<option value="${st}" ${c?.status === st ? 'selected' : ''}>${labels[st]}</option>`).join('')}</select></label></div></div><div class="card"><h2>الاحتياج والتفضيلات</h2><p class="muted small">هذه البيانات داخلية لفريق العمل، ويمكن تحديثها بعد كل زيارة.</p><div class="feature-grid">${s.catalog.map((svc) => `<label class="checkbox-row"><input type="checkbox" name="needs" value="${svc.id}" ${(c?.needs || []).some((v) => v === svc.id || v === svc.title) ? 'checked' : ''}>${ic(svc.icon || 'layers')}<span>${e(svc.title)}</span></label>`).join('')}</div><div class="form-grid"><label class="field">ميزانية تقديرية بالدولار<input class="input num" name="budget" type="number" min="0" max="10000000" step="0.01" value="${Number(c?.budget) || 0}"></label><label class="field">صاحب القرار<input class="input" name="decisionMaker" value="${value('decisionMaker')}" maxlength="100"></label><label class="field">وسيلة التواصل المفضلة<select class="select" name="preferredContact">${['رسائل التطبيق', 'داخل المنصة', 'هاتف', 'واتساب', 'بريد إلكتروني'].map((v) => `<option ${c?.preferredContact === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="field">الوقت الأنسب للتواصل<input class="input" name="bestTime" value="${value('bestTime')}" placeholder="مثل: أيام العمل بعد الظهر" maxlength="100"></label><label class="field">المشكلة الحالية<textarea class="textarea" name="painPoints" rows="3" maxlength="1000">${value('painPoints')}</textarea></label><label class="field">ما الذي يتمنى تحقيقه؟<textarea class="textarea" name="wishes" rows="3" maxlength="1000">${value('wishes')}</textarea></label></div><label class="field">ملاحظات داخلية<textarea class="textarea" name="notes" rows="3" maxlength="1500">${value('notes')}</textarea></label><label class="field">وسوم مفصولة بفاصلة<input class="input" name="tags" value="${e((c?.tags || []).join('، '))}" maxlength="200"></label></div><div class="form-actions"><button class="btn btn-primary" type="submit">${ic('check')}حفظ ملف العميل</button>${go(c ? 'client-detail' : 'clients', 'إلغاء', 'x', c ? `data-id="${c.id}"` : '')}</div></form>`;
  }
  function clientDetail({ state: s, params }) {
    const c = client(s, params.id);
    if (!c) return missing('العميل غير متاح');
    const visits = ownVisits(s)
      .filter((v) => v.clientId === c.id)
      .sort(
        (a, b) => new Date(b.startedAt || b.scheduledAt) - new Date(a.startedAt || a.scheduledAt),
      );
    const opps = ownOpps(s).filter((o) => o.clientId === c.id),
      quotes = ownQuotes(s).filter((q) => q.clientId === c.id);
    return `${head(c.name, c.sector + ' · ' + (s.zones.find((z) => z.id === c.zoneId)?.name || ''), iconGo('client-form', 'تعديل ملف العميل', 'edit', `data-id="${c.id}"`))}${c.doNotContact ? '<div class="notice notice-warn">' + ic('shield') + 'طلب هذا العميل عدم التواصل. أُوقفت الزيارات الجديدة والرسائل وإرسال العروض.</div>' : ''}<div class="dashboard-grid"><div class="main-column"><section class="card rep-customer-hero"><div class="row-between"><div class="row">${A.avatar(c.name, '#e4efdc')}<div><h2>${e(c.contact)}</h2><p class="muted">${e(c.decisionMaker ? 'صاحب القرار: ' + c.decisionMaker : 'صاحب القرار لم يُحدد بعد')}</p></div></div>${badge(c.status)}</div><div class="rep-contact-grid"><div>${ic('phone')}<span dir="ltr">${e(c.phone)}</span>${act('copy-contact', 'نسخ', 'copy', `data-id="${c.id}"`, 'btn btn-ghost btn-sm')}</div><div>${ic('pin')}<span>${e(c.address)}</span></div><div>${ic('clock')}<span>${e(c.bestTime || 'وقت التواصل غير محدد')}</span></div><div>${ic('message')}<span>${e(c.preferredContact || 'داخل المنصة')}</span></div></div><div class="row wrap">${go('visit-checkin', 'تسجيل زيارة', 'pin', `data-id="${c.id}" ${c.doNotContact ? 'disabled title="العميل طلب عدم التواصل"' : ''}`, 'btn btn-primary')}${act('schedule-visit', 'تحديد موعد', 'calendar', `data-id="${c.id}" ${c.doNotContact ? 'disabled' : ''}`)}${go('messages', 'المحادثة', 'message', `data-id="${c.id}"`)}${act('quote-new', 'عرض سعر', 'file', `data-id="${c.id}"`)}</div></section><div class="card">${section('فهم الاحتياج', 'آخر معلومات سجّلها فريق المبيعات')}<div class="chips">${needsChips(c.needs) || '<span class="muted small">لم تُحدد الخدمات المطلوبة بعد.</span>'}</div><div class="rep-insight-grid"><div><span class="small muted">التحدي الحالي</span><p>${e(c.painPoints || 'لم يسجّل بعد')}</p></div><div><span class="small muted">النتيجة التي يريدها</span><p>${e(c.wishes || 'لم تسجّل بعد')}</p></div></div><div class="row-between"><span>الميزانية التقديرية</span><strong class="num">${cash(c.budget)}</strong></div><div class="divider"></div><p class="small muted">ملاحظات الفريق</p><p>${e(c.notes || 'لا ملاحظات إضافية.')}</p></div><div class="card">${section('سجل الزيارات', visits.length + ' زيارة')}<div class="timeline">${
      visits
        .slice(0, 8)
        .map(
          (v) =>
            `<div class="timeline-item"><span class="timeline-dot"></span><div class="row-between"><strong>${e(outcomes.find((x) => x[0] === v.outcome)?.[1] || labels[v.status])}</strong>${go(v.status === 'active' ? 'visit-active' : 'visit-detail', 'التفاصيل', 'chevron-left', `data-id="${v.id}"`, 'btn btn-ghost btn-sm')}</div><span class="tiny muted">${e(date(v.startedAt || v.scheduledAt))} · ${e(time(v.startedAt || v.scheduledAt))}</span><p class="small">${e(v.notes || 'موعد مسجّل في الجدول')}</p></div>`,
        )
        .join('') || '<p class="muted">لم تُسجل زيارة لهذا العميل بعد.</p>'
    }</div></div></div><aside class="side-column"><div class="card card-accent"><div class="row-between"><h3>وضوح الفرصة</h3><strong class="num">${Number(c.score) || 0}%</strong></div>${A.progress(Number(c.score) || 0)}<p class="tiny muted">مؤشر مبني على اكتمال بيانات التأهيل المسجلة.</p></div><div class="card">${section('الفرص', '', act('opportunity-new', 'إضافة', 'plus', `data-id="${c.id}"`, 'btn btn-ghost btn-sm'))}${opps.map((o) => `<button class="rep-block-link" data-go="opportunity-detail" data-id="${o.id}"><strong>${e(o.title)}</strong><span class="row-between small">${badge(o.stage)}<span class="num">${cash(o.value)}</span></span></button>`).join('') || '<p class="muted small">لا فرص مسجّلة بعد.</p>'}</div><div class="card">${section('العروض')}<div class="stack-sm">${quotes.map((q) => `<button class="rep-block-link" data-go="quote-detail" data-id="${q.id}"><strong>${e(q.title)}</strong><span class="row-between small">${quoteStatus(s, q)}<span class="num">${cash(q.total)}</span></span></button>`).join('') || '<p class="muted small">لم يُنشأ عرض سعر بعد.</p>'}</div></div>${act('contact-preference', c.doNotContact ? 'إعادة السماح بالتواصل' : 'تسجيل طلب عدم التواصل', 'shield', `data-id="${c.id}"`, 'btn btn-ghost btn-block')}</aside></div>`;
  }
  function cancelContactWork(s, clientId, reason) {
    s.visits
      .filter((v) => v.clientId === clientId && v.status === 'scheduled')
      .forEach((v) => {
        v.status = 'cancelled';
        v.cancellationReason = reason;
      });
    s.tasks
      .filter((t) => t.clientId === clientId && t.status === 'open' && t.type === 'follow_up')
      .forEach((t) => {
        t.status = 'cancelled';
        t.cancellationReason = reason;
      });
  }
  return {
    id: 'customers',
    routes: {
      clients: {
        title: 'العملاء',
        render: clients,
      },
      'client-form': {
        title: 'ملف العميل',
        render: clientForm,
        nav: 'clients',
      },
      'client-detail': {
        title: 'تفاصيل العميل',
        render: clientDetail,
        nav: 'clients',
      },
    },
    actions: {
      'client-search'({ el }) {
        const q = el.value.trim().toLowerCase();
        let count = 0;
        document.querySelectorAll('.rep-client-card').forEach((card) => {
          const visible = card.dataset.search.includes(q);
          card.hidden = !visible;
          if (visible) count++;
        });
        const n = document.getElementById('rep-client-count');
        if (n) n.textContent = count + ' عميل';
        const empty = document.getElementById('rep-search-empty');
        if (empty) empty.hidden = count > 0;
      },
      'save-client'({ form, data, state: s }) {
        const id = form.dataset.id || A.id('client'),
          old = client(s, id),
          phone = String(data.phone || '').trim(),
          name = String(data.name || '').trim(),
          r = rep(s);
        if (
          name.length < 2 ||
          phone.length < 7 ||
          !s.zones.some((z) => z.id === data.zoneId && r.zoneIds.includes(z.id))
        )
          return A.toast('أكمل الاسم والهاتف ومنطقة ضمن مسؤوليتك.', 'error');
        if (
          ownClients(s).some(
            (c) =>
              c.id !== id &&
              (c.phone.replace(/\D/g, '') === phone.replace(/\D/g, '') ||
                c.name.trim().toLowerCase() === name.toLowerCase()),
          )
        )
          return A.toast('يوجد عميل بالاسم أو الهاتف نفسه. راجع السجل الحالي أولًا.', 'error');
        const selectedNeeds = [...form.querySelectorAll('input[name="needs"]:checked')].map(
            (x) => x.value,
          ),
          zone = s.zones.find((z) => z.id === data.zoneId),
          budget = Number(data.budget);
        if (!Number.isFinite(budget) || budget < 0)
          return A.toast('أدخل ميزانية صحيحة غير سالبة.', 'error');
        const record = {
          ...(old || {}),
          id,
          name,
          contact: String(data.contact || '').trim(),
          phone,
          email: String(data.email || '').trim(),
          sector: String(data.sector || '').trim(),
          zoneId: data.zoneId,
          repId: r.id,
          address: String(data.address || '').trim(),
          location: old?.location || {
            x: zone.center.x,
            y: zone.center.y,
            lat: null,
            lng: null,
          },
          status: ['new', 'qualified', 'customer', 'lost'].includes(data.status)
            ? data.status
            : 'new',
          needs: selectedNeeds,
          budget,
          preferredContact: data.preferredContact,
          bestTime: String(data.bestTime || '').trim(),
          decisionMaker: String(data.decisionMaker || '').trim(),
          painPoints: String(data.painPoints || '').trim(),
          wishes: String(data.wishes || '').trim(),
          notes: String(data.notes || '').trim(),
          score: Math.min(
            100,
            20 +
              (selectedNeeds.length ? 25 : 0) +
              (budget > 0 ? 20 : 0) +
              (String(data.decisionMaker || '').trim() ? 20 : 0) +
              (String(data.painPoints || '').trim() ? 15 : 0),
          ),
          tags: String(data.tags || '')
            .split(/[,،]/)
            .map((x) => x.trim())
            .filter(Boolean)
            .slice(0, 8),
          doNotContact: old?.doNotContact || false,
          createdAt: old?.createdAt || now(),
        };
        if (
          commit(
            (st) => {
              const current = client(st, id),
                currentRep = rep(st);
              A.assert(
                !form.dataset.id || current,
                'تغيّر إسناد العميل؛ لا يمكن حفظ تعديلك على هذا السجل.',
              );
              A.assert(
                (currentRep.zoneIds || []).includes(data.zoneId),
                'المنطقة لم تعد ضمن مسؤوليتك.',
              );
              A.assert(
                !ownClients(st).some(
                  (c) =>
                    c.id !== id &&
                    (c.phone.replace(/\D/g, '') === phone.replace(/\D/g, '') ||
                      c.name.trim().toLowerCase() === name.toLowerCase()),
                ),
                'يوجد عميل بالاسم أو الهاتف نفسه.',
              );
              const i = st.clients.findIndex((x) => x.id === id);
              if (i < 0) st.clients.unshift(record);
              else
                st.clients[i] = {
                  ...current,
                  ...record,
                  repId: currentRep.id,
                  doNotContact: current.doNotContact,
                };
            },
            old ? 'تحديث ملف العميل واحتياجاته' : 'إضافة عميل جديد',
          ) === false
        )
          return;
        A.go('client-detail', {
          id,
        });
        A.toast('حُفظ ملف العميل.', 'success');
      },
      'copy-contact'({ state, el }) {
        const c = client(state, el.dataset.id);
        if (!c) return;
        if (navigator.clipboard?.writeText)
          navigator.clipboard
            .writeText(c.phone)
            .then(() => A.toast('نُسخ الرقم. لم تُجرَ أي مكالمة.', 'success'))
            .catch(() => A.modal('رقم التواصل', `<p class="num" dir="ltr">${e(c.phone)}</p>`));
        else A.modal('رقم التواصل', `<p class="num" dir="ltr">${e(c.phone)}</p>`);
      },
      'contact-preference'({ state, el }) {
        const c = client(state, el.dataset.id);
        if (!c) return;
        A.modal(
          c.doNotContact ? 'تحديث إذن التواصل' : 'تسجيل طلب عدم التواصل',
          `<form data-submit="save-contact-preference" data-id="${c.id}" data-value="${c.doNotContact ? 'allow' : 'block'}" class="stack"><p>${c.doNotContact ? 'لا تُعد التواصل إلا إذا طلب العميل ذلك بوضوح.' : 'سيوقف هذا الإجراء الرسائل والعروض والزيارات الجديدة ويلغي المواعيد ومهام المتابعة القادمة.'}</p><label class="field">توثيق طلب العميل<textarea class="textarea" name="reason" required minlength="10" maxlength="600" rows="4"></textarea></label><button type="submit" class="btn ${c.doNotContact ? 'btn-primary' : 'btn-danger'}">حفظ التفضيل</button></form>`,
        );
      },
      'save-contact-preference'({ form, data }) {
        const reason = String(data.reason || '').trim(),
          blocked = form.dataset.value === 'block';
        if (reason.length < 10 || !['block', 'allow'].includes(form.dataset.value))
          return A.toast('وثّق طلب العميل بوضوح.', 'error');
        if (
          commit((s) => {
            const c = client(s, form.dataset.id);
            A.assert(c, 'تغيّر إسناد العميل.');
            const changed = !!c.doNotContact !== blocked;
            c.doNotContact = blocked;
            if (changed)
              c.notes = [
                c.notes,
                (blocked ? 'طلب إيقاف التواصل: ' : 'طلب إعادة التواصل: ') + reason,
              ]
                .filter(Boolean)
                .join('\n');
            if (blocked) cancelContactWork(s, c.id, reason);
          }, 'تحديث تفضيل التواصل للعميل') !== false
        )
          A.closeModal();
      },
    },
    api: {
      cancelContactWork,
    },
  };
}
