/** rep / catalog: original v1.1 views and local demo actions. */
export function createCatalogFeature(context) {
  const { A, act, cash, categoryNames, chipLink, e, go, head, ic, missing } = context;
  function catalog({ state: s, params }) {
    const cats = [...new Set(s.catalog.map((x) => x.category))],
      filter = params.filter || 'all',
      rows = s.catalog.filter((x) => filter === 'all' || x.category === filter);
    return `${head('حلول تصنع فرقًا', 'استعرض ما نقدّمه، وافهم المخرجات قبل اقتراح الخدمة.')}<section class="hero hero-lime"><div class="hero-grid"><div><p class="eyebrow">من الاحتياج إلى نتيجة قابلة للتسليم</p><h2>خدمة مناسبة.<br>وعد واضح.</h2><p>نطاق العمل، المدة، والسعر في مكان واحد. أضف الخدمات إلى عرض مُخصص لعميلك.</p></div><div class="hero-art">${ic('layers')}</div></div></section><div class="chips">${chipLink('catalog', 'all', 'كل الخدمات', filter === 'all')}${cats.map((cat) => chipLink('catalog', cat, categoryNames[cat] || cat, filter === cat)).join('')}</div><div class="grid-3">${rows.map((svc) => `<article class="service-card card"><div class="row-between"><span class="icon-box icon-box-lime">${ic(svc.icon || 'layers')}</span><span class="badge">${e(categoryNames[svc.category] || svc.category)}</span></div><h2>${e(svc.title)}</h2><p class="muted">${e(svc.short)}</p><div class="row-between"><strong class="num">${cash(svc.price)}</strong><span class="small muted">${e(svc.unit || '')}</span></div><div class="divider"></div>${go('service-detail', 'التفاصيل والمخرجات', 'chevron-left', `data-id="${svc.id}" data-param-client="${e(params.client || '')}" data-param-visit="${e(params.visit || '')}"`, 'btn btn-secondary btn-block')}</article>`).join('')}</div>`;
  }
  function serviceDetail({ state: s, params }) {
    const svc = s.catalog.find((x) => x.id === params.id);
    if (!svc) return missing('الخدمة غير متاحة');
    return `${head(svc.title, svc.short, go('catalog', 'كل الخدمات', 'arrow-right'))}<section class="hero hero-dark"><div class="hero-grid"><div><span class="icon-box icon-box-lime">${ic(svc.icon || 'layers')}</span><h2>${e(svc.title)}</h2><p>${e(svc.short)}</p><div class="row wrap">${act('quote-new', 'إضافة إلى عرض سعر', 'plus', `data-id="${e(params.client || '')}" data-service="${svc.id}" data-visit="${e(params.visit || '')}"`, 'btn btn-lime')}${A.badge(categoryNames[svc.category] || svc.category, 'neutral')}</div></div><div class="rep-hero-summary"><span class="hero-number num">${cash(svc.price)}</span><span>${e(svc.unit || 'للخدمة')}</span><p class="small">المدة التقديرية: ${e(svc.duration)}</p></div></div></section><div class="grid-2"><div class="card"><h2>ما الذي تشمله؟</h2><div class="stack">${(svc.features || []).map((f) => `<div class="row">${ic('check-circle')}<span>${e(f)}</span></div>`).join('')}</div></div><div class="card"><h2>ما الذي يستلمه العميل؟</h2><div class="stack">${(svc.deliverables || []).map((f) => `<div class="row">${ic('file')}<span>${e(f)}</span></div>`).join('')}</div></div></div><div class="notice">${ic('help')}تُراجع المدة والنطاق النهائيان مع العميل ضمن العرض والعقد. الأسعار هنا بيانات هذا العرض التجريبي.</div>`;
  }
  return {
    id: 'catalog',
    routes: {
      catalog: {
        title: 'الخدمات',
        render: catalog,
        nav: 'more',
      },
      'service-detail': {
        title: 'تفاصيل الخدمة',
        render: serviceDetail,
        nav: 'more',
      },
    },
    actions: {},
    api: {},
  };
}
