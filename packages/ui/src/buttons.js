/** v1.1 markup variants. Keep DOM shape and attribute order stable. */
export function createRepButtons({ e, ic }) {
  const go = (route, text, icon, attrs = '', cls = 'btn btn-secondary') =>
    `<button type="button" class="${cls}" data-go="${e(route)}" ${attrs}>${icon ? ic(icon) : ''}<span>${e(text)}</span></button>`;
  const act = (name, text, icon, attrs = '', cls = 'btn btn-secondary') =>
    `<button type="button" class="${cls}" data-action="${e(name)}" ${attrs}>${icon ? ic(icon) : ''}<span>${e(text)}</span></button>`;
  const iconGo = (route, text, icon, attrs = '') =>
    `<button type="button" class="icon-btn" data-go="${e(route)}" ${attrs} aria-label="${e(text)}" title="${e(text)}">${ic(icon)}</button>`;
  return {
    go,
    act,
    iconGo,
  };
}
export function createClientButtons({ A, E }) {
  const attrs = (values) =>
    Object.entries(values)
      .map(([key, value]) => (value == null ? '' : ` data-${key}="${E(value)}"`))
      .join('');
  const go = (text, route, params = {}, kind = 'btn-secondary', icon = 'arrow-left') =>
    `<button type="button" class="btn ${kind}"${attrs({
      go: route,
      ...params,
    })}>${icon ? A.icon(icon) : ''}<span>${E(text)}</span></button>`;
  const act = (text, action, params = {}, kind = 'btn-primary', icon = '') =>
    `<button type="button" class="btn ${kind}"${attrs({
      action,
      ...params,
    })}>${icon ? A.icon(icon) : ''}<span>${E(text)}</span></button>`;
  return {
    attrs,
    go,
    act,
  };
}
export function createAdminButtons({ E, icon }) {
  const go = (route, label, ico, id, cls) =>
    `<button type="button" class="${cls || 'btn btn-secondary'}" data-go="${E(route)}"${id ? ` data-id="${E(id)}"` : ''}>${ico ? icon(ico) : ''}<span>${E(label)}</span></button>`;
  const action = (name, label, ico, attrs, cls) =>
    `<button type="button" class="${cls || 'btn btn-secondary'}" data-action="${E(name)}" ${attrs || ''}>${ico ? icon(ico) : ''}<span>${E(label)}</span></button>`;
  const iconAction = (name, label, ico, attrs) =>
    `<button type="button" class="icon-btn" data-action="${E(name)}" aria-label="${E(label)}" title="${E(label)}" ${attrs || ''}>${icon(ico)}</button>`;
  const idAttr = (id) => `data-id="${E(id)}"`;
  return {
    go,
    action,
    iconAction,
    idAttr,
  };
}
