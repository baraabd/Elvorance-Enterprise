import { icons } from '@atlas/design-system/icons';
/** Shared v1.1 primitives used by the runtime and all three app facades. */
export const esc = (value) =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (ch) =>
      ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
      })[ch],
  );
export const icon = (name) =>
  `<svg class="icon" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name] || icons.grid}</svg>`;
export const badge = (text, tone = 'neutral') =>
  `<span class="badge badge-${['neutral', 'good', 'warn', 'bad', 'info'].includes(tone) ? tone : 'neutral'}">${esc(text)}</span>`;
export const avatar = (name, color = '#e4efdc') =>
  `<span class="avatar" style="--avatar-color:${/^#[0-9a-f]{3,8}$/i.test(color) ? color : '#e4efdc'}" aria-hidden="true">${esc(
    String(name || 'أ')
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((x) => x[0])
      .join(''),
  )}</span>`;
export const progress = (value) => {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="progress" role="progressbar" aria-label="نسبة الإنجاز" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${v}" style="--progress:${v}%"><span></span></div>`;
};
export const empty = (title, detail, actionHtml = '') =>
  `<div class="empty-state"><span class="icon-box">${icon('layers')}</span><h3>${esc(title)}</h3><p>${esc(detail)}</p>${actionHtml}</div>`;

/** App facades accept an injected runtime so formatting follows its state. */
export function createPrimitives(A) {
  return {
    escapeValue: (value) => A.esc(value == null ? '' : value),
    escapeString: (value) => A.esc(value == null ? '' : String(value)),
    icon: (name) => A.icon(name),
    badge: (text, tone) => A.badge(text, tone || 'neutral'),
    empty: (title, detail, action) => A.empty(title, detail, action || ''),
  };
}
