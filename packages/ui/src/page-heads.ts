// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** v1.1 markup variants. Keep DOM shape and attribute order stable. */
export function createRepPageHeads({ e, ic }) {
  const head = (title, sub, action = '') =>
    `<div class="page-head row-between"><div><p class="eyebrow">إلفورانس / مساحة المندوب</p><h1>${e(title)}</h1>${sub ? `<p class="muted">${e(sub)}</p>` : ''}</div>${action}</div>`;
  const section = (title, sub = '', action = '') =>
    `<div class="section-head row-between"><div><h2>${e(title)}</h2>${sub ? `<p class="muted small">${e(sub)}</p>` : ''}</div>${action}</div>`;
  const metric = (value, label, icon, detail = '') =>
    `<div class="stat"><div class="row-between"><span class="stat-label">${e(label)}</span>${ic(icon)}</div><div class="stat-value num">${e(value)}</div>${detail ? `<span class="tiny muted">${e(detail)}</span>` : ''}</div>`;
  // ELVORANCE_DASHBOARD_DRILLDOWN_2027: accessible, reusable KPI drill-down control, not an inert statistic.
  const metricLink = (value, label, symbol, detail, route, filter) =>
    `<button type="button" class="stat rep-stat-link" data-go="${e(route)}" data-param-filter="${e(filter)}" data-param-source="dashboard" aria-label="${e('عرض ' + label + ': ' + value)}"><span class="row-between"><span class="stat-label">${e(label)}</span>${ic(symbol)}</span><strong class="stat-value num">${e(value)}</strong>${detail ? `<span class="tiny muted">${e(detail)}</span>` : ''}<span class="rep-stat-open" aria-hidden="true">${ic('chevron-left')}</span></button>`;
  // Context is shown only after entry from dashboard, preserving ordinary list navigation.
  const drilldownSummary = (params, label, count, detail) =>
    params?.source !== 'dashboard' ? '' :
    `<section class="rep-drilldown-context" aria-label="تفاصيل ${e(label)}"><div><span class="tiny muted">من ملخص لوحة التحكم</span><h2>${e(label)}</h2><p class="small muted">${e(String(count) + ' سجل مطابق')}${detail ? ' · ' + e(detail) : ''}</p></div><button type="button" class="btn btn-secondary btn-sm" data-go="home">${ic('arrow-right')}<span>العودة إلى لوحة التحكم</span></button></section>`;
  return {
    head,
    section,
    metric,
    metricLink,
    drilldownSummary,
  };
}
export function createClientPageHeads({ A, E }) {
  const section = (title, detail = '', action = '') =>
    `<div class="section-head"><div><h2>${E(title)}</h2>${detail ? `<p class="muted small">${E(detail)}</p>` : ''}</div>${action}</div>`;
  const heading = (eyebrow, title, detail = '', action = '') =>
    `<div class="page-head"><div><p class="eyebrow">${E(eyebrow)}</p><h1>${E(title)}</h1>${detail ? `<p class="muted">${E(detail)}</p>` : ''}</div>${action}</div>`;
  const notice = (title, detail, icon = 'info') =>
    `<div class="notice"><span class="icon-box">${A.icon(icon === 'info' ? 'help' : icon)}</span><div><strong>${E(title)}</strong><p class="small muted">${E(detail)}</p></div></div>`;
  return {
    section,
    heading,
    notice,
  };
}
export function createAdminPageHeads({ A, E, N, icon }) {
  const pageTitle = (eyebrow, title, description, controls) =>
    `<header class="page-head"><div><p class="eyebrow">${E(eyebrow)}</p><h1>${E(title)}</h1><p class="muted">${E(description)}</p></div>${controls ? `<div class="row wrap gap-sm">${controls}</div>` : ''}</header>`;
  const sectionTitle = (title, right) =>
    `<div class="section-head"><h2>${E(title)}</h2>${right || ''}</div>`;
  const progress = (value) => A.progress(Math.max(0, Math.min(100, N(value))));
  const metric = (label, value, detail, ico) =>
    `<article class="card stat"><div class="row-between"><span class="stat-label">${E(label)}</span><span class="icon-box">${icon(ico || 'chart')}</span></div><div class="stat-value num">${E(value)}</div><p class="small muted">${E(detail)}</p></article>`;
  return {
    pageTitle,
    sectionTitle,
    progress,
    metric,
  };
}
