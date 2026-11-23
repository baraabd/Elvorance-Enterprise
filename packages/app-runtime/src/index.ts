// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import { validateFormFields } from './form-validation.ts';
import { createDemoData } from '@elvorance/demo-data';
import { createDemoRepository } from '@elvorance/demo-data/repository';
import { icons } from '@elvorance/design-system/icons';
import { esc, icon, badge, avatar, progress, empty } from '@elvorance/ui/primitives';
import { clone, id, today, addDays, date, assert } from './utilities.ts';
import { createDemoPayments, quoteFingerprint } from './demo-workflows.ts';

/* Elvorance runtime: routing, accessible shell, persistence and reusable components.
 * Replace Store with an API adapter for production; role authorization belongs on that API.
 */
export function installRuntime(options = {}) {
  if (window.Elvorance) return window.Elvorance;
  const seed = options.seed || createDemoData;
  const STORE_KEY = options.storageKey || 'atlas.crm.2027.v1';
  window.ElvoranceSeed = seed;
  window.ElvoranceIcons = icons;
  const apps = new Map();
  let app,
    state,
    routeName,
    routeParams = {},
    storageAvailable = true;
  let modalTrigger = null,
    confirmCallback = null,
    printContent = null,
    channel = null;
  let dirtyRoute = null,
    externalNoticeShown = false;
  function money(value) {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: state?.settings?.currency || 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    }).format(Number(value) || 0);
  }
  const repository = createDemoRepository({
    storage: {
      getItem: (key) => window.localStorage.getItem(key),
      setItem: (key, value) => window.localStorage.setItem(key, value),
    },
    key: STORE_KEY,
    seed,
    onUnavailable: () => {
      storageAvailable = false;
    },
  });
  const readState = () => repository.read();
  function actor() {
    return app?.id === 'rep'
      ? state.reps.find((x) => x.id === state.session.repId)?.name || 'المندوب'
      : app?.id === 'client'
        ? state.clients.find((x) => x.id === state.session.clientId)?.contact || 'العميل'
        : 'إدارة إلفورانس';
  }
  function persist(next) {
    if (!storageAvailable) {
      state = next;
      return true;
    }
    try {
      repository.write(next);
      state = next;
      return true;
    } catch {
      toast(
        'تعذر حفظ التغيير. قد تكون مساحة المتصفح ممتلئة؛ أزل مرفقًا كبيرًا أو صدّر بياناتك أولًا.',
        'error',
      );
      return false;
    }
  }
  function update(mutator, label = '') {
    let base = state;
    if (storageAvailable) base = repository.latest(state);
    const next = clone(base);
    try {
      mutator(next);
    } catch (error) {
      state = base;
      if (!error.userMessage) console.error('Elvorance state update failed', error);
      toast(error.userMessage || 'لم يُحفظ التغيير. راجع البيانات وحاول مجددًا.', 'error');
      return false;
    }
    next._revision = (base._revision || 0) + 1;
    next._updatedAt = new Date().toISOString();
    if (label) {
      next.activities.unshift({
        id: id('activity'),
        text: String(label),
        actor: actor(),
        at: new Date().toISOString(),
        type: app?.id || 'system',
      });
      next.activities = next.activities.slice(0, 300);
      if (next.session.offline) next._queue.push({ id: id('local'), label, at: next._updatedAt });
    }
    if (!persist(next)) {
      state = base;
      return false;
    }
    try {
      channel?.postMessage({ revision: next._revision });
    } catch {}
    refresh();
    return true;
  }
  const recordInvoicePayment = createDemoPayments({ assert, today, getAppId: () => app?.id });
  function parseRoute() {
    const raw = location.hash.replace(/^#/, '');
    const parts = raw.split('?');
    routeName = parts[0] || app.home || 'home';
    routeParams = Object.fromEntries(new URLSearchParams(parts.slice(1).join('?')));
  }
  function go(name, params = {}) {
    const q = new URLSearchParams(
      Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => [k, String(v)]),
    );
    const hash = '#' + name + (q.size ? '?' + q.toString() : '');
    closeModal();
    if (location.hash === hash) {
      parseRoute();
      refresh();
    } else location.hash = hash;
  }
  function headerName() {
    return app.id === 'rep'
      ? state.reps.find((x) => x.id === state.session.repId)?.name || 'يزن'
      : app.id === 'client'
        ? state.clients.find((x) => x.id === state.session.clientId)?.name || 'العميل'
        : 'إدارة المبيعات';
  }
  function logo() {
    return '<span class="elvorance-mark" aria-hidden="true"><i></i><i></i><i></i></span><span class="brand-type">إلفورانس<span>ELVORANCE</span></span>';
  }
  function notificationItems() {
    return state.notifications.filter(
      (n) =>
        n.audience === app.id &&
        (!n.repId || n.repId === state.session.repId) &&
        (!n.clientId || n.clientId === state.session.clientId),
    );
  }
  function shell() {
    document.body.dataset.app = app.id;
    const navigation = (where) =>
      app.nav
        .map(
          (n) =>
            `<button class="${where === 'bottom' ? 'bottom-nav-item' : 'side-nav-item'}" data-go="${esc(n.id)}" data-nav="${esc(n.id)}" aria-label="${esc(n.label)}">${icon(n.icon)}<span>${esc(n.label)}</span></button>`,
        )
        .join('');
    document.getElementById('app').innerHTML =
      `<a class="skip-link" href="#main-content" data-action="skip-content">انتقل إلى المحتوى</a><div class="app-shell"><aside class="sidebar" aria-label="القائمة الرئيسية"><div class="brand">${logo()}</div><div class="workspace-card"><span class="workspace-dot"></span><div><strong>${esc(app.name)}</strong><span>${esc(app.subtitle)}</span></div></div><nav class="side-nav">${navigation('side')}</nav><div class="sidebar-bottom"><div class="side-promo"><span class="eyebrow">WORK, IN SYNC.</span><p>خطوة أقرب.<br>علاقة أقوى.</p><div class="side-orbit" aria-hidden="true"></div></div><span class="demo-tag">بيانات توضيحية · تجربة تفاعلية</span><button class="side-user" data-action="workspace-info">${avatar(headerName())}<span>${esc(headerName())}<small>مساحة إلفورانس</small></span>${icon('chevron-left')}</button></div></aside><div class="workspace"><header class="topbar"><div class="mobile-brand">${logo()}</div><div class="desktop-breadcrumb"><span>${esc(app.name)}</span>${icon('chevron-left')}<strong id="breadcrumb-current">الرئيسية</strong></div><div class="topbar-actions"><button class="connection-pill" data-action="connection-info" aria-label="حالة حفظ البيانات"><span class="status-dot"></span><span id="connection-text">محفوظ محليًا</span></button><button class="icon-btn notification-btn" data-action="notifications" aria-label="الإشعارات">${icon('bell')}<span id="notification-dot"></span></button><button class="user-top" data-action="workspace-info" aria-label="معلومات الحساب">${avatar(headerName())}</button></div></header><div id="offline-banner"></div><main id="main-content" class="main-content" tabindex="-1"></main><footer class="page-footer"><span>إلفورانس · كل علاقة تصنع فرقًا</span><span>تجربة محلية ببيانات توضيحية</span></footer></div><nav class="bottom-nav" aria-label="تنقل التطبيق">${navigation('bottom')}</nav></div><dialog id="app-modal" class="modal" aria-labelledby="modal-title"></dialog><div id="toasts" class="toasts" aria-live="polite" aria-atomic="false"></div><div id="print-area"></div>`;
  }
  function refresh() {
    if (!app) return;
    dirtyRoute = null;
    externalNoticeShown = false;
    const definition = app.routes[routeName];
    const main = document.getElementById('main-content');
    if (!main) return;
    try {
      main.innerHTML = definition
        ? definition.render({ state, params: routeParams, route: routeName })
        : empty(
            'هذه الصفحة غير موجودة',
            'يمكنك العودة إلى الرئيسية.',
            `<button class="btn btn-primary" data-go="${esc(app.home || 'home')}">الرئيسية</button>`,
          );
    } catch (error) {
      console.error('Elvorance route render failed', routeName, error);
      main.innerHTML = empty(
        'تعذر عرض هذه الصفحة',
        'حاول إعادة فتح الصفحة. بياناتك المحفوظة باقية.',
        `<button class="btn btn-primary" data-action="refresh-view">إعادة المحاولة</button>`,
      );
    }
    document.title = `${definition?.title || app.name} · ${app.name} | إلفورانس`;
    const breadcrumb = document.getElementById('breadcrumb-current');
    if (breadcrumb) breadcrumb.textContent = definition?.title || app.name;
    document.querySelectorAll('[data-nav]').forEach((el) => {
      const active = el.dataset.nav === routeName || definition?.nav === el.dataset.nav;
      el.classList.toggle('active', active);
      if (active) el.setAttribute('aria-current', 'page');
      else el.removeAttribute('aria-current');
    });
    const offline = state.session.offline;
    document.getElementById('connection-text').textContent = offline
      ? 'وضع دون اتصال'
      : storageAvailable
        ? 'محفوظ محليًا'
        : 'حفظ لهذه الجلسة';
    document.querySelector('.connection-pill')?.classList.toggle('is-offline', offline);
    document.getElementById('offline-banner').innerHTML = offline
      ? `<div class="offline-banner">${icon('wifi-off')}<span>وضع التجربة دون اتصال · ${state._queue.length} تغييرات محلية محفوظة</span><button data-action="toggle-offline">إنهاء المحاكاة</button></div>`
      : '';
    document.getElementById('notification-dot').className = notificationItems().some((n) => !n.read)
      ? 'notification-dot'
      : '';
    if (app.afterRender)
      try {
        app.afterRender({ state, params: routeParams, route: routeName });
      } catch (error) {
        console.error('Elvorance afterRender failed', error);
      }
    window.dispatchEvent(
      new CustomEvent('elvorance:render', { detail: { appId: app.id, route: routeName } }),
    );
  }
  function modal(title, body, options = {}) {
    const el = document.getElementById('app-modal');
    modalTrigger = document.activeElement;
    el.classList.toggle('modal-wide', !!options.wide);
    el.innerHTML = `<div class="modal-head"><h2 id="modal-title">${esc(title)}</h2><button class="icon-btn" data-action="close-modal" aria-label="إغلاق النافذة">${icon('x')}</button></div><div class="modal-body">${body}</div>${options.footer ? `<div class="modal-footer">${options.footer}</div>` : ''}`;
    if (!el.open) {
      if (typeof el.showModal === 'function') el.showModal();
      else el.setAttribute('open', '');
    }
    requestAnimationFrame(() =>
      el.querySelector('input:not([type=hidden]),textarea,select,button')?.focus(),
    );
  }
  function closeModal() {
    const el = document.getElementById('app-modal');
    if (el?.open) {
      if (typeof el.close === 'function') el.close();
      else el.removeAttribute('open');
      if (modalTrigger?.isConnected && !modalTrigger.disabled) modalTrigger.focus?.();
      else document.getElementById('main-content')?.focus();
    }
    confirmCallback = null;
  }
  function confirm(title, body, callback) {
    modal(
      title,
      `<p>${esc(body)}</p><div class="form-actions"><button class="btn btn-primary" data-action="confirm-action">تأكيد</button><button class="btn btn-secondary" data-action="close-modal">إلغاء</button></div>`,
    );
    confirmCallback = callback;
  }
  function toast(text, type = 'success') {
    const container = document.getElementById('toasts');
    if (!container) return;
    const node = document.createElement('div');
    node.className = 'toast toast-' + type;
    node.setAttribute('role', type === 'error' ? 'alert' : 'status');
    node.innerHTML =
      icon(type === 'error' ? 'alert' : 'check-circle') + '<span>' + esc(text) + '</span>';
    container.append(node);
    setTimeout(() => node.remove(), 5000);
  }
  function download(filename, text, mime = 'text/plain') {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  function exportCSV(filename, rows) {
    if (!rows.length) {
      toast('لا توجد سجلات ضمن هذا الفلتر.', 'info');
      return;
    }
    const keys = Object.keys(rows[0]);
    const cell = (v) => {
      let s = String(v ?? '');
      if (/^[=+@\-\t\r]/.test(s)) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    download(
      filename,
      '\ufeff' +
        [keys, ...rows.map((r) => keys.map((k) => r[k]))]
          .map((r) => r.map(cell).join(','))
          .join('\r\n'),
      'text/csv',
    );
  }
  function printDocument(title, html) {
    printContent = `<article class="print-document" dir="rtl"><header><strong>إلفورانس للحلول الرقمية</strong><span>نسخة توضيحية · ${date(new Date())}</span></header><h1>${esc(title)}</h1>${html}<footer>مستند من تجربة إلفورانس؛ لا يمثل عقدًا أو دفعة فعلية.</footer></article>`;
    modal(title, `<div class="document">${html}</div>`, {
      wide: true,
      footer: `<button class="btn btn-primary" data-action="print-document">${icon('download')} طباعة / حفظ PDF</button>`,
    });
  }
  function map(options = {}) {
    const filtered = options.repId
      ? state.clients.filter((c) => c.repId === options.repId)
      : state.clients;
    const zoneMarkup = state.zones
      .map(
        (z) =>
          `<polygon points="${esc(z.polygon)}" fill="${esc(z.color)}" fill-opacity="${!options.selectedZone || options.selectedZone === z.id ? '.55' : '.18'}" stroke="#fff" stroke-width="1"/><text x="${z.center.x}" y="${z.center.y + 7}" text-anchor="middle" class="map-label">${esc(z.name)}</text>`,
      )
      .join('');
    const markers = filtered
      .map(
        (c, i) =>
          `<g class="map-marker" ${options.interactive !== false ? `role="button" tabindex="0" aria-label="${esc(c.name)}" data-go="client-detail" data-id="${esc(c.id)}"` : ''}><circle cx="${c.location.x}" cy="${c.location.y}" r="3.3" fill="${c.repId === state.session.repId ? '#14241d' : '#fff'}" stroke="#176b55" stroke-width=".5"/><text x="${c.location.x}" y="${c.location.y + 1}" fill="${c.repId === state.session.repId ? '#fff' : '#14241d'}" text-anchor="middle" class="map-marker-number">${i + 1}</text></g>`,
      )
      .join('');
    return `<div class="map-panel" style="height:${Math.max(180, Math.min(500, Number(options.height) || 260))}px"><svg viewBox="0 0 100 100" preserveAspectRatio="xMidYMid meet" role="img" aria-label="خريطة توضيحية لمناطق حلب ومواقع العملاء"><defs><pattern id="map-grid" width="7" height="7" patternUnits="userSpaceOnUse"><rect width="7" height="7" fill="#f1f4ee"/><path d="M7 0H0V7" fill="none" stroke="#dce2d9" stroke-width=".3"/></pattern></defs><rect width="100" height="100" fill="url(#map-grid)"/>${zoneMarkup}<path d="M0 51C25 44 32 50 49 49S78 45 100 37M48 0c3 23 3 36 4 48s8 34 9 52" fill="none" stroke="#fff" stroke-width="2.4"/><path d="M29 29 23 37 37 23 33 40" fill="none" stroke="#176b55" stroke-width=".75" stroke-dasharray="1.3 1.2"/>${markers}</svg><span class="map-disclaimer">مخطط مناطق توضيحي · حلب</span><span class="map-compass">${icon('compass')}</span></div>`;
  }
  const coreActions = {
    'close-modal': closeModal,
    'refresh-view': refresh,
    'skip-content': () => document.getElementById('main-content')?.focus(),
    'confirm-action': () => {
      const fn = confirmCallback;
      closeModal();
      if (fn) fn();
    },
    notifications: () => {
      const items = notificationItems();
      modal(
        'الإشعارات',
        items.length
          ? `<div class="list">${items.map((n) => `<article class="list-item"><span class="icon-box ${n.read ? '' : 'icon-box-lime'}">${icon('bell')}</span><div class="grow"><strong>${esc(n.title)}</strong><p class="small muted">${esc(n.body)}</p><span class="tiny muted">${date(n.createdAt, { time: true })}</span></div>${n.read ? '' : badge('جديد', 'good')}</article>`).join('')}</div>`
          : empty('لا توجد إشعارات', 'أنت على اطلاع بكل جديد.'),
        {
          footer:
            '<button class="btn btn-secondary" data-action="read-notifications">تحديد الكل كمقروء</button>',
        },
      );
    },
    'read-notifications': () => {
      const ids = notificationItems().map((n) => n.id);
      if (
        update((s) =>
          s.notifications.forEach((n) => {
            if (ids.includes(n.id)) n.read = true;
          }),
        )
      ) {
        closeModal();
        toast('تم تحديث الإشعارات.');
      }
    },
    'connection-info': () =>
      modal(
        'بيئة التجربة',
        `<div class="notice notice-good">${icon('shield')}<p>هذه تجربة تفاعلية ببيانات توضيحية. تُحفظ التغييرات في هذا المتصفح، وتظهر في التطبيقات الثلاثة عند فتحها من العنوان نفسه.</p></div><p>يمكنك تجربة العمل دون اتصال، أو تنزيل نسخة من بياناتك المحلية. لا توجد رسائل خارجية أو دفعات مالية فعلية.</p><div class="stack-sm"><button class="btn btn-secondary" data-action="toggle-offline">${icon(state.session.offline ? 'wifi' : 'wifi-off')}${state.session.offline ? 'إنهاء تجربة عدم الاتصال' : 'تجربة وضع دون اتصال'}</button><button class="btn btn-secondary" data-action="download-data">${icon('download')} تنزيل البيانات المحلية</button><button class="btn btn-ghost" data-action="reset-demo">${icon('refresh')} إعادة بيانات البداية</button></div>`,
      ),
    'toggle-offline': () => {
      const next = !state.session.offline;
      if (
        update((s) => {
          s.session.offline = next;
          if (!next) s._queue = [];
        })
      ) {
        closeModal();
        toast(
          next ? 'تم تفعيل تجربة العمل دون اتصال.' : 'انتهت المحاكاة؛ بقيت تغييراتك محفوظة محليًا.',
          'info',
        );
      }
    },
    'download-data': () =>
      download('elvorance-demo-data.json', JSON.stringify(state, null, 2), 'application/json'),
    'reset-demo': () =>
      confirm(
        'إعادة بيانات التجربة؟',
        'ستُحذف التعديلات التي أجريتها في التطبيقات الثلاثة على هذا المتصفح، وتعود البيانات التوضيحية الأصلية.',
        () => {
          const fresh = seed();
          fresh._revision = (state._revision || 0) + 1;
          if (persist(fresh)) {
            refresh();
            toast('عادت بيانات البداية.');
            try {
              channel?.postMessage({ revision: fresh._revision });
            } catch {}
          }
        },
      ),
    'workspace-info': () =>
      modal(
        'مساحة العمل',
        `<div class="row">${avatar(headerName())}<div><h3>${esc(headerName())}</h3><p class="muted">${esc(app.name)} · ${esc(state.settings.city)}</p></div></div><div class="divider"></div><p class="small muted">واجهة مستقلة ضمن تجربة إلفورانس. البيانات توضيحية وتُحفظ على هذا المتصفح.</p><button class="btn btn-secondary btn-block" data-action="connection-info">${icon('settings')} إعدادات التجربة</button>`,
      ),
    'print-document': () => {
      document.getElementById('print-area').innerHTML = printContent || '';
      window.print();
    },
  };
  const pendingActions = new WeakSet();
  function dispatch(name, event, el, form = null) {
    const target = form || el;
    if (pendingActions.has(target)) return;
    const handler = app.actions?.[name] || coreActions[name];
    if (!handler) {
      console.warn('Unknown Elvorance action', name);
      toast('تعذر فتح هذا الإجراء.', 'error');
      return;
    }
    const data = form ? Object.fromEntries(new FormData(form)) : {};
    // Capture before invoking handlers: attachment handlers also manage their own controls.
    const previousBusy = target.getAttribute('aria-busy');
    const controls = form
      ? [
          ...form.querySelectorAll(
            'button:not([type]),button[type="submit"],input[type="submit"],input[type="image"]',
          ),
        ]
      : 'disabled' in el
        ? [el]
        : [];
    const disabled = controls.map((control) => control.disabled);
    try {
      const result = handler({ event, el, form, data, state, params: routeParams });
      if (result?.then) {
        pendingActions.add(target);
        target.setAttribute('aria-busy', 'true');
        controls.forEach((control) => {
          control.disabled = true;
        });
        Promise.resolve(result)
          .catch((e) => {
            console.error(e);
            toast('تعذر إكمال الإجراء. حاول مجددًا.', 'error');
          })
          .finally(() => {
            pendingActions.delete(target);
            if (previousBusy === null) target.removeAttribute('aria-busy');
            else target.setAttribute('aria-busy', previousBusy);
            controls.forEach((control, index) => {
              control.disabled = disabled[index];
            });
          });
      }
    } catch (e) {
      console.error('Elvorance action failed', name, e);
      toast('تعذر إكمال الإجراء. راجع البيانات وحاول مجددًا.', 'error');
    }
  }
  function bindEvents() {
    const markDraft = (event) => {
      if (
        event.target.closest('#main-content form') &&
        event.target.matches('input,textarea,select')
      )
        dirtyRoute = routeName;
    };
    document.addEventListener('input', markDraft);
    document.addEventListener('change', markDraft);
    document.addEventListener('click', (event) => {
      const el = event.target.closest('[data-action],[data-go]');
      if (!el || el.disabled) return;
      if (el.dataset.go) {
        event.preventDefault();
        const p = {};
        if (el.dataset.id) p.id = el.dataset.id;
        Object.entries(el.dataset).forEach(([key, value]) => {
          if (key.startsWith('param'))
            p[key.slice(5).replace(/^./, (s) => s.toLowerCase())] = value;
        });
        go(el.dataset.go, p);
      } else if (el.dataset.action) {
        event.preventDefault();
        dispatch(el.dataset.action, event, el);
      }
    });
    document.addEventListener('submit', (event) => {
      const form = event.target.closest('form[data-submit]');
      if (!form) return;
      event.preventDefault();
      if (!validateFormFields(form) || !form.checkValidity()) {
        form.reportValidity();
        return;
      }
      dispatch(form.dataset.submit, event, form, form);
    });
    document.addEventListener('change', (event) => {
      const el = event.target.closest('[data-change]');
      if (el) dispatch(el.dataset.change, event, el);
    });
    document.addEventListener('input', (event) => {
      const el = event.target.closest('[data-input]');
      if (el) dispatch(el.dataset.input, event, el);
    });
    document.addEventListener('keydown', (event) => {
      const dlg = document.getElementById('app-modal');
      if (event.key === 'Escape' && dlg?.open) closeModal();
      if (event.key === 'Tab' && dlg?.open) {
        const focus = [
          ...dlg.querySelectorAll('button,input,select,textarea,a[href],[tabindex="0"]'),
        ].filter(
          (x) =>
            !x.disabled &&
            x.type !== 'hidden' &&
            !x.closest('[hidden],[inert],[aria-hidden="true"]') &&
            getComputedStyle(x).display !== 'none' &&
            getComputedStyle(x).visibility !== 'hidden',
        );
        if (focus.length) {
          if (event.shiftKey && document.activeElement === focus[0]) {
            event.preventDefault();
            focus.at(-1).focus();
          } else if (!event.shiftKey && document.activeElement === focus.at(-1)) {
            event.preventDefault();
            focus[0].focus();
          }
        }
      }
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        event.target.matches('[role="button"][data-go]')
      ) {
        event.preventDefault();
        event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      }
    });
    document.getElementById('app-modal').addEventListener('click', (event) => {
      if (event.target.id === 'app-modal') {
        const r = event.target.getBoundingClientRect();
        if (
          event.clientX < r.left ||
          event.clientX > r.right ||
          event.clientY < r.top ||
          event.clientY > r.bottom
        )
          closeModal();
      }
    });
    window.addEventListener('hashchange', () => {
      parseRoute();
      refresh();
      window.scrollTo?.({ top: 0, behavior: 'instant' });
    });
    window.addEventListener('storage', (event) => {
      if (event.key === STORE_KEY && event.newValue) {
        try {
          const next = JSON.parse(event.newValue);
          if (next._revision > state._revision) applyExternal(next);
        } catch {}
      }
    });
    if ('BroadcastChannel' in window)
      try {
        channel = new BroadcastChannel('elvorance-2027');
        channel.onmessage = () => {
          const next = readState();
          if (next._revision > state._revision) applyExternal(next);
        };
      } catch {}
  }
  function applyExternal(next) {
    state = next;
    if (dirtyRoute === routeName) {
      if (!externalNoticeShown) {
        toast('وصل تحديث من تطبيق آخر. احتفظنا بمدخلاتك؛ يُراجع الحفظ أحدث البيانات.', 'info');
        externalNoticeShown = true;
      }
      return;
    }
    refresh();
  }
  function start(appId) {
    app = apps.get(appId);
    if (!app) throw Error('Unknown Elvorance application');
    state = readState();
    if (storageAvailable) {
      try {
        if (!localStorage.getItem(STORE_KEY))
          localStorage.setItem(STORE_KEY, JSON.stringify(state));
      } catch {
        storageAvailable = false;
      }
    }
    shell();
    parseRoute();
    bindEvents();
    refresh();
    document.documentElement.dataset.ready = 'true';
  }
  window.Elvorance = {
    assert,
    quoteFingerprint,
    recordInvoicePayment,
    register: (definition) => apps.set(definition.id, definition),
    start,
    state: () => state,
    update,
    id,
    esc,
    icon,
    money,
    date,
    today,
    addDays,
    badge,
    avatar,
    progress,
    empty,
    go,
    route: () => routeName,
    params: () => routeParams,
    refresh,
    modal,
    closeModal,
    confirm,
    toast,
    download,
    exportCSV,
    printDocument,
    map,
    client: (id) => state.clients.find((c) => c.id === id),
    rep: (id) => state.reps.find((r) => r.id === id),
    service: (id) => state.catalog.find((s) => s.id === id),
  };
  return window.Elvorance;
}
