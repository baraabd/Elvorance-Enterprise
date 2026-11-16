/** client / catalog: original v1.1 views and local demo actions. */
export function createCatalogFeature(context, { state }) {
  const {
    A,
    E,
    addMessage,
    area,
    badge,
    customer,
    date,
    error,
    field,
    findService,
    go,
    heading,
    label,
    list,
    mine,
    missing,
    money,
    notice,
    notify,
    now,
    num,
    opportunityLabels,
    paragraph,
    section,
    select,
    serviceCategories,
    wrap,
  } = context;
  const commit = (...args) => state.commit(...args);
  function serviceArt(service, large = false) {
    const palette = ['#d9f99d', '#d7e5f0', '#f2dec9', '#e7e1f6'];
    const index = Math.max(
      0,
      [
        'svc-web',
        'svc-store',
        'svc-brand',
        'svc-social',
        'svc-seo',
        'svc-app',
        'svc-crm',
        'svc-cloud',
        'svc-security',
        'svc-book',
      ].indexOf(service.id),
    );
    const color = /^#[\da-f]{3,8}$/i.test(service.color || '')
      ? service.color
      : palette[index % palette.length];
    return `<div class="client-service-art ${large ? 'client-service-art-large' : ''}" style="--service-color:${E(color)}" aria-hidden="true"><div class="client-art-orbit"></div><div class="client-art-sheet"><span class="client-art-dots">•••</span><div class="client-art-icon">${A.icon(service.icon || 'monitor')}</div><div class="client-art-line"></div><div class="client-art-line short"></div></div><span class="client-art-spark">${A.icon('sparkles')}</span></div>`;
  }
  function serviceCard(service) {
    return `<article class="service-card client-service-card">${serviceArt(service)}<div class="stack-sm"><p class="eyebrow">${E(label(serviceCategories, service.category))}</p><h3>${E(service.title)}</h3><p class="muted small">${E(service.short)}</p><div class="row-between"><strong class="num">${money(service.price)}<span class="muted tiny"> ${E(service.unit || 'للمشروع')}</span></strong><span class="small muted">${E(service.duration)}</span></div>${go(
      'اكتشف الخدمة',
      'service-detail',
      {
        id: service.id,
      },
      'btn-secondary btn-block',
      'arrow-left',
    )}</div></article>`;
  }
  function renderServices({ state, params }) {
    const categories = [...new Set(list(state, 'catalog').map((item) => item.category))];
    const category = params.category || '';
    const services = list(state, 'catalog').filter(
      (item) => !category || item.category === category,
    );
    return wrap(
      `${heading('خدمات أطلس', 'ما الخطوة التالية لعملك؟', 'اختر خدمة. افهم ما ستستلمه. ثم شاركنا احتياجك.', go('طلباتي', 'requests', {}, 'btn-secondary', 'list'))}<section class="card card-accent"><div class="row-between"><div><h3>أخبرنا عن نشاطك</h3><p class="small muted">نفس الأسئلة والخدمات التي تعتمدها الإدارة ويستخدمها المندوب.</p></div>${go('فتح استبيان الاحتياج','needs-survey',{},'btn-primary','arrow-left')}</div></section><div class="search-box">${A.icon('search')}<input aria-label="ابحث في الخدمات" placeholder="موقع، متجر، هوية، تطبيق…" data-input="filter-services"></div><div class="chips">${go('الكل', 'services', {}, `chip ${!category ? 'active' : ''}`, '')}${categories
        .map((item) =>
          go(
            label(serviceCategories, item),
            'services',
            {
              'param-category': item,
            },
            `chip ${item === category ? 'active' : ''}`,
            '',
          ),
        )
        .join(
          '',
        )}</div><div class="grid-3" id="client-service-grid">${services.map((service) => `<div data-service-search="${E(`${service.title} ${service.short} ${service.category}`)}">${serviceCard(service)}</div>`).join('')}</div><div id="client-service-search-empty" hidden>${A.empty('لا توجد نتيجة مطابقة', 'جرب كلمة أخرى أو اختر تصنيفًا مختلفًا.')}</div>`,
    );
  }
  function renderService({ state, params }) {
    const service = findService(state, params.id);
    if (!service) return missing('الخدمة غير موجودة');
    return wrap(
      `${heading(label(serviceCategories, service.category), service.title, service.short, go('كل الخدمات', 'services', {}, 'btn-ghost', 'arrow-right'))}<div class="dashboard-grid"><div class="main-column stack">${serviceArt(service, true)}<section class="card">${section('قيمة واضحة لعملك')}<div class="feature-grid">${(service.features || []).map((text) => `<div class="row"><span class="icon-box icon-box-lime">${A.icon('check')}</span><span>${E(text)}</span></div>`).join('')}</div></section><section class="card">${section('ماذا ستستلم؟')}<ol class="client-delivery-list">${(service.deliverables || []).map((text, i) => `<li><span class="num">${String(i + 1).padStart(2, '0')}</span><div><strong>${E(text)}</strong><p class="muted small">موثق ضمن نطاق الاتفاق قبل التنفيذ.</p></div></li>`).join('')}</ol></section></div><aside class="side-column stack"><section class="card card-dark"><p class="eyebrow">سعر استرشادي</p><strong class="hero-number num">${money(service.price)}</strong><span class="small">${E(service.unit || 'للمشروع')}</span><div class="divider"></div><p class="row">${A.icon('clock')} ${E(service.duration)}</p><p class="small">يحدد عرض السعر النهائي النطاق والمدة والدفعات بعد مراجعة متطلباتك.</p>${go(
        'اطلب هذه الخدمة',
        'request-service',
        {
          id: service.id,
        },
        'btn-lime btn-block',
        'plus',
      )}</section>${notice('ابدأ بما تحتاجه فعلًا', 'طلب الخدمة يفتح سجلًا مشتركًا مع فريقك. يمكنك متابعة حالته قبل وصول عرض السعر.', 'shield')}</aside></div>`,
    );
  }
  function renderRequestForm({ state, params }) {
    const service = findService(state, params.id);
    const client = customer(state);
    if (!service || !client) return missing();
    return wrap(
      `${heading('طلب خدمة', `لنخطط لـ ${service.title}`, 'الاحتياج الجيد بداية تنفيذ جيد. أخبرنا بما يهمك.')}<form class="card stack" data-submit="submit-service-request"><input type="hidden" name="requestId" value="${E(A.id('opp'))}"><input type="hidden" name="serviceId" value="${E(service.id)}"><div class="row"><span class="icon-box icon-box-lime">${A.icon(service.icon || 'briefcase')}</span><div><strong>${E(service.title)}</strong><p class="muted small">${money(service.price)} استرشاديًا · ${E(service.duration)}</p></div></div>${field(
        'عنوان طلبك',
        'title',
        `${service.title} — ${client.name}`,
        {
          minlength: 5,
        },
      )}${area('ما الذي تريد تحقيقه؟', 'brief', '', {
        minlength: 20,
        placeholder: 'صف نشاطك، جمهورك، المشكلة الحالية والنتيجة التي تريد الوصول إليها.',
      })}<div class="form-grid">${field('ميزانيتك التقريبية بالدولار', 'budget', service.price, {
        type: 'number',
        min: 1,
        max: 1000000,
        step: '0.01',
      })}${field('الموعد المستهدف', 'deadline', A.addDays(30), {
        type: 'date',
        min: A.today(),
      })}${select(
        'التواصل المفضل',
        'contact',
        [
          ['messages', 'رسائل المنصة'],
          ['phone', 'الهاتف'],
          ['email', 'البريد الإلكتروني'],
        ],
        {
          'رسائل التطبيق': 'messages',
          الهاتف: 'phone',
          'البريد الإلكتروني': 'email',
        }[client.preferredContact] ||
          client.preferredContact ||
          'messages',
      )}${field('الوقت الأنسب للتواصل', 'bestTime', client.bestTime || '', {
        required: false,
        placeholder: 'مثلًا: من 10 صباحًا إلى 2 ظهرًا',
      })}</div>${area('رغباتك وأمثلة تلهمك', 'wishes', '', {
        required: false,
        placeholder: 'الألوان، اللغات، وظائف أساسية، روابط أمثلة أو احتياج في خطة الدفع.',
      })}<div class="notice small">${A.icon('help')}هذا طلب مبدئي تجريبي؛ لا ينشئ التزامًا ماليًا أو دفعًا تلقائيًا.</div><div class="form-actions"><button class="btn btn-primary" type="submit">${A.icon('send')}إرسال الطلب إلى مساحة الفريق</button>${go(
        'رجوع للخدمة',
        'service-detail',
        {
          id: service.id,
        },
        'btn-ghost',
        'arrow-right',
      )}</div></form>`,
    );
  }
  function renderRequests({ state }) {
    const opportunities = mine(state, 'opportunities');
    const cards = opportunities
      .map((item) => {
        const quotes = mine(state, 'quotes').filter(
          (quote) => quote.opportunityId === item.id && quote.status !== 'draft',
        );
        const contracts = mine(state, 'contracts').filter((contract) =>
          quotes.some((quote) => quote.id === contract.quoteId),
        );
        return `<article class="card"><div class="row-between">${badge(label(opportunityLabels, item.stage), item.stage)}<span class="muted tiny">${E(date(item.expectedClose))}</span></div><h3>${E(item.title)}</h3><div class="chips">${(item.serviceIds || []).map((id) => `<span class="chip">${E(findService(state, id)?.title || id)}</span>`).join('')}</div><p class="muted small">ميزانية مستهدفة: <strong class="num">${money(item.value)}</strong></p><p class="client-clamp muted small">${paragraph(item.notes || 'سيحدّث الفريق تفاصيل الطلب هنا.')}</p>${item.lossReason ? `<p class="small muted">سبب الإغلاق: ${E(item.lossReason)}</p>` : ''}<div class="stack-sm">${quotes
          .map((quote) =>
            go(
              `العرض: ${quote.title}`,
              'quote-detail',
              {
                id: quote.id,
              },
              'btn-secondary btn-block',
              'file',
            ),
          )
          .join('')}${contracts
          .map((contract) =>
            go(
              'العقد وخطوة التنفيذ',
              'contract-detail',
              {
                id: contract.id,
              },
              'btn-primary btn-block',
              'signature',
            ),
          )
          .join('')}${go(
          'التحدث عن الطلب',
          'messages',
          {
            'param-topic': item.title,
          },
          'btn-secondary btn-block',
          'message',
        )}</div></article>`;
      })
      .join('');
    return wrap(
      `${heading('طلبات الخدمات', 'من الاحتياج إلى خطة واضحة', 'تابع طلبك، ثم العرض والعقد المرتبطين به في السجل نفسه.', go('طلب جديد', 'services', {}, 'btn-primary', 'plus'))}<div class="grid-2">${cards || A.empty('لا توجد طلبات بعد', 'اكتشف الخدمات التي تناسب المرحلة التالية لعملك.', go('الخدمات', 'services', {}, 'btn-primary'))}</div>`,
    );
  }
  function submitServiceRequest({ data }) {
    const state = A.state();
    const service = findService(state, data.serviceId);
    const client = customer(state);
    const budget = num(data.budget);
    if (!service || !client) return error('اختر خدمة متاحة.');
    if (String(data.title || '').trim().length < 5 || String(data.brief || '').trim().length < 20)
      return error('أضف عنوانًا ووصفًا أوضح لاحتياجك.');
    if (budget <= 0 || budget > 1000000 || !data.deadline || data.deadline < A.today())
      return error('راجع الميزانية والموعد المستهدف.');
    const requestId = String(data.requestId || A.id('opp'));
    if (mine(state, 'opportunities').some((item) => item.id === requestId))
      return error('هذا الطلب محفوظ بالفعل. افتح طلباتك لمتابعته.');
    const notes = `وصف الاحتياج: ${String(data.brief).trim()}\nالتواصل المفضل: ${label(
      {
        messages: 'رسائل المنصة',
        phone: 'الهاتف',
        email: 'البريد الإلكتروني',
      },
      data.contact,
    )}\nالوقت المناسب: ${data.bestTime || 'لم يحدد'}\nالرغبات: ${data.wishes || 'لم تضاف رغبات أخرى'}`;
    commit(
      (next) => {
        const current = customer(next);
        A.assert(
          current && findService(next, service.id),
          'الخدمة أو العميل غير متاح الآن. راجع الطلب.',
        );
        A.assert(
          !list(next, 'opportunities').some((item) => item.id === requestId),
          'هذا الطلب محفوظ بالفعل.',
        );
        next.opportunities.push({
          id: requestId,
          clientId: current.id,
          repId: current.repId,
          title: String(data.title).trim(),
          stage: 'new',
          value: budget,
          probability: 20,
          expectedClose: data.deadline,
          serviceIds: [service.id],
          notes,
          source: 'client_request',
          createdAt: now(),
          brief: String(data.brief).trim(),
          wishes: String(data.wishes || '').trim(),
          preferredContact: data.contact,
          bestTime: String(data.bestTime || '').trim(),
        });
        current.needs ||= [];
        if (!current.needs.includes(service.id)) current.needs.push(service.id);
        addMessage(
          next,
          `طلب خدمة جديد: ${data.title}\n${notes}\nالميزانية: ${budget} USD، الموعد المستهدف: ${data.deadline}`,
        );
        notify(next, 'طلب خدمة جديد من العميل', `${current.name}: ${data.title}`);
      },
      `طلب العميل خدمة ${service.title}`,
      {
        route: 'requests',
        message: 'حُفظ الطلب. يظهر الآن لدى مندوبك والإدارة.',
      },
    );
  }
  return {
    id: 'catalog',
    routes: {
      services: {
        title: 'الخدمات',
        nav: 'services',
        render: renderServices,
      },
      'service-detail': {
        title: 'تفاصيل الخدمة',
        nav: 'services',
        render: renderService,
      },
      'request-service': {
        title: 'طلب خدمة',
        nav: 'services',
        render: renderRequestForm,
      },
      requests: {
        title: 'طلبات الخدمات',
        nav: 'services',
        render: renderRequests,
      },
    },
    actions: {
      'filter-services': ({ el }) => {
        const query = String(el.value || '')
          .trim()
          .toLocaleLowerCase();
        let count = 0;
        document.querySelectorAll('[data-service-search]').forEach((card) => {
          const visible = card.dataset.serviceSearch.toLocaleLowerCase().includes(query);
          card.hidden = !visible;
          if (visible) count++;
        });
        const empty = document.getElementById('client-service-search-empty');
        if (empty) empty.hidden = count > 0;
      },
      'submit-service-request': submitServiceRequest,
    },
    api: {},
  };
}
