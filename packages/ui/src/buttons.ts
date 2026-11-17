/** v1.1 markup variants. Keep DOM shape and attribute order stable. */
type Escaper = (value: unknown) => string;
type IconRenderer = (name: string) => string;

export function createRepButtons({ e, ic }: { e: Escaper; ic: IconRenderer }) {
  const go = (route: string, text: string, icon?: string, attrs = '', cls = 'btn btn-secondary') =>
    `<button type="button" class="${cls}" data-go="${e(route)}" ${attrs}>${icon ? ic(icon) : ''}<span>${e(text)}</span></button>`;
  const act = (name: string, text: string, icon?: string, attrs = '', cls = 'btn btn-secondary') =>
    `<button type="button" class="${cls}" data-action="${e(name)}" ${attrs}>${icon ? ic(icon) : ''}<span>${e(text)}</span></button>`;
  const iconGo = (route: string, text: string, icon: string, attrs = '') =>
    `<button type="button" class="icon-btn" data-go="${e(route)}" ${attrs} aria-label="${e(text)}" title="${e(text)}">${ic(icon)}</button>`;
  return {
    go,
    act,
    iconGo,
  };
}
export function createClientButtons({ A, E }: { A: { icon: IconRenderer }; E: Escaper }) {
  const attrs = (values: Record<string, unknown>) =>
    Object.entries(values)
      .map(([key, value]) => (value == null ? '' : ` data-${key}="${E(value)}"`))
      .join('');
  const go = (
    text: string,
    route: string,
    params: Record<string, unknown> = {},
    kind = 'btn-secondary',
    icon = 'arrow-left',
  ) =>
    `<button type="button" class="btn ${kind}"${attrs({
      go: route,
      ...params,
    })}>${icon ? A.icon(icon) : ''}<span>${E(text)}</span></button>`;
  const act = (
    text: string,
    action: string,
    params: Record<string, unknown> = {},
    kind = 'btn-primary',
    icon = '',
  ) =>
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
export function createAdminButtons({ E, icon }: { E: Escaper; icon: IconRenderer }) {
  const go = (route: string, label: string, ico?: string, id?: string, cls?: string) =>
    `<button type="button" class="${cls || 'btn btn-secondary'}" data-go="${E(route)}"${id ? ` data-id="${E(id)}"` : ''}>${ico ? icon(ico) : ''}<span>${E(label)}</span></button>`;
  const action = (name: string, label: string, ico?: string | null, attrs?: string, cls?: string) =>
    `<button type="button" class="${cls || 'btn btn-secondary'}" data-action="${E(name)}" ${attrs || ''}>${ico ? icon(ico) : ''}<span>${E(label)}</span></button>`;
  const iconAction = (name: string, label: string, ico: string, attrs?: string) =>
    `<button type="button" class="icon-btn" data-action="${E(name)}" aria-label="${E(label)}" title="${E(label)}" ${attrs || ''}>${icon(ico)}</button>`;
  const idAttr = (id: string) => `data-id="${E(id)}"`;
  return {
    go,
    action,
    iconAction,
    idAttr,
  };
}
