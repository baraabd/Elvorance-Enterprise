/** Progressive presentation enhancement. Never owns data, routing or authorization. */
export interface NavigationGroup {
  label: string;
  items: ReadonlyArray<{ route: string; label: string; children?: readonly string[] }>;
}
export interface EnterpriseUxOptions {
  groups?: readonly NavigationGroup[];
  mode: 'demo' | 'server';
}
type Control = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
const installations = new WeakMap<HTMLElement, () => void>();
const controlSelector = 'input:not([type="hidden"]),textarea,select';
const isControl = (node: EventTarget | null): node is Control =>
  node instanceof HTMLInputElement ||
  node instanceof HTMLTextAreaElement ||
  node instanceof HTMLSelectElement;

/** Append, rather than overwrite, application-owned descriptions. */
export function describeWith(control: Element, id: string): void {
  const ids = new Set(
    (control.getAttribute('aria-describedby') ?? '').split(/\s+/).filter(Boolean),
  );
  ids.add(id);
  control.setAttribute('aria-describedby', [...ids].join(' '));
}
export function validationMessage(control: Control): string {
  const validity = control.validity;
  if (validity.customError) return control.validationMessage;
  if (validity.valueMissing) return 'هذا الحقل مطلوب.';
  if (validity.typeMismatch) return 'أدخل قيمة بالتنسيق الصحيح لهذا الحقل.';
  if (validity.rangeUnderflow) return `أدخل قيمة لا تقل عن ${control.getAttribute('min')}.`;
  if (validity.rangeOverflow) return `أدخل قيمة لا تزيد عن ${control.getAttribute('max')}.`;
  if (validity.tooShort) return `أدخل ${control.getAttribute('minlength')} أحرف على الأقل.`;
  if (validity.tooLong) return `لا تتجاوز ${control.getAttribute('maxlength')} حرفًا.`;
  if (validity.patternMismatch) return 'راجع التنسيق المطلوب والموضح بجوار الحقل.';
  if (validity.badInput || validity.stepMismatch) return 'أدخل رقمًا صالحًا وفق الخطوة المحددة.';
  return control.validationMessage || 'راجع قيمة هذا الحقل.';
}

/** Keep mixed-language record values isolated without interpreting them as HTML. */
export function isolatedText(value: unknown, direction: 'auto' | 'ltr' = 'auto'): HTMLElement {
  const node = document.createElement('bdi');
  node.dir = direction;
  node.textContent = String(value ?? '');
  return node;
}

export type UiState = 'loading' | 'empty' | 'success' | 'error' | 'offline';
/** A text-first state surface. Callers own retry behavior and business decisions. */
export function statePanel(state: UiState, message: string): HTMLElement {
  const panel = document.createElement('p');
  panel.className = 'elv-state';
  panel.dataset.uiState = state;
  panel.setAttribute('role', state === 'error' ? 'alert' : 'status');
  panel.textContent = message;
  return panel;
}

export function installEnterpriseUx(root: HTMLElement, options: EnterpriseUxOptions): () => void {
  installations.get(root)?.();
  const controller = new AbortController();
  const { signal } = controller;
  let sequence = 0;
  let queued = false;
  let focusPending = false;
  let currentRoute = location.hash;
  let disposed = false;
  let networkNotice: HTMLElement | undefined;
  let hadNetworkFailure = false;
  const upgraded = new WeakSet<Element>();
  const invalidControls = new Set<Control>();
  const ownedNodes = new Set<HTMLElement>();
  const identity = (prefix: string): string => {
    let id: string;
    do id = `elv-${prefix}-${++sequence}`;
    while (document.getElementById(id));
    return id;
  };
  const own = <T extends HTMLElement>(node: T): T => {
    ownedNodes.add(node);
    return node;
  };
  root.dataset.enterpriseUx = 'true';
  root.dir = 'rtl';
  root.lang = 'ar';
  // A whole application is not a live region. Dedicated status/error regions remain intact.
  root.removeAttribute('aria-live');

  function clearError(control: Control): void {
    const errorId = control.dataset.uxError;
    if (!errorId) return;
    document.getElementById(errorId)?.remove();
    const remaining = (control.getAttribute('aria-describedby') ?? '')
      .split(/\s+/)
      .filter((id) => id && id !== errorId);
    if (remaining.length) control.setAttribute('aria-describedby', remaining.join(' '));
    else control.removeAttribute('aria-describedby');
    control.removeAttribute('aria-invalid');
    delete control.dataset.uxError;
    invalidControls.delete(control);
  }
  function showError(control: Control): void {
    if (!control.id) control.id = identity('field');
    let error = document.getElementById(control.dataset.uxError ?? '');
    if (!error) {
      error = own(document.createElement('p'));
      error.id = identity('error');
      error.className = 'elv-field-error';
      // Do not include error text in the implicit label's accessible name.
      const label = control.closest('label');
      (label ?? control).insertAdjacentElement('afterend', error);
      control.dataset.uxError = error.id;
    }
    error.textContent = validationMessage(control);
    control.setAttribute('aria-invalid', 'true');
    describeWith(control, error.id);
    invalidControls.add(control);
  }
  function syncSummary(form: HTMLFormElement): void {
    const invalid = [...invalidControls].filter(
      (control) => control.isConnected && control.form === form,
    );
    let summary = form.querySelector<HTMLElement>(':scope > .elv-error-summary');
    if (!invalid.length) {
      summary?.remove();
      return;
    }
    if (!summary) {
      summary = own(document.createElement('div'));
      summary.className = 'elv-error-summary';
      summary.tabIndex = -1;
      summary.setAttribute('role', 'group');
      summary.setAttribute('aria-label', 'حقول تحتاج إلى مراجعة');
      form.prepend(summary);
    }
    summary.replaceChildren();
    const title = document.createElement('strong');
    title.textContent = 'لم تُرسل البيانات. راجع الحقول التالية:';
    summary.append(title);
    const list = document.createElement('ul');
    for (const control of invalid) {
      const item = document.createElement('li');
      const link = document.createElement('a');
      link.href = `#${control.id}`;
      link.textContent = `${control.labels?.[0]?.querySelector('span')?.textContent?.trim() || control.getAttribute('aria-label') || control.name || 'الحقل'}: ${validationMessage(control)}`;
      link.addEventListener(
        'click',
        (event) => {
          event.preventDefault();
          control.focus();
        },
        { signal },
      );
      item.append(link);
      list.append(item);
    }
    summary.append(list);
  }
  root.addEventListener(
    'invalid',
    (event) => {
      const control = event.target;
      if (!isControl(control)) return;
      showError(control);
      if (control.form) syncSummary(control.form);
    },
    { capture: true, signal },
  );
  root.addEventListener(
    'input',
    (event) => {
      const control = event.target;
      if (!isControl(control) || !control.dataset.uxError) return;
      if (control.validity.valid) clearError(control);
      else showError(control);
      if (control.form) syncSummary(control.form);
    },
    { signal },
  );
  root.addEventListener(
    'change',
    (event) => {
      const control = event.target;
      if (!isControl(control) || !control.dataset.uxError) return;
      if (control.validity.valid) clearError(control);
      else showError(control);
      if (control.form) syncSummary(control.form);
    },
    { signal },
  );

  function addSecondaryNavigation(): void {
    const sidebar = root.querySelector('.sidebar');
    if (!sidebar || !options.groups?.length || sidebar.querySelector('.elv-secondary-nav')) return;
    const nav = own(document.createElement('nav'));
    nav.className = 'elv-secondary-nav';
    nav.setAttribute('aria-label', 'مساحات العمل');
    for (const group of options.groups) {
      const heading = document.createElement('p');
      heading.className = 'elv-nav-heading';
      heading.textContent = group.label;
      nav.append(heading);
      for (const item of group.items) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'side-nav-item';
        button.dataset.go = item.route;
        button.dataset.uxRoutes = [item.route, ...(item.children ?? [])].join(' ');
        button.textContent = item.label;
        nav.append(button);
      }
    }
    sidebar.querySelector('.side-nav')?.insertAdjacentElement('afterend', nav);
  }
  function scan(): void {
    if (disposed) return;
    for (const control of root.querySelectorAll<Control>(controlSelector)) {
      if (upgraded.has(control)) continue;
      upgraded.add(control);
      if (!control.id) control.id = identity('field');
      const numeric =
        control instanceof HTMLInputElement &&
        ['email', 'tel', 'url', 'number', 'date', 'datetime-local', 'time'].includes(control.type);
      if (!control.hasAttribute('dir')) control.dir = numeric ? 'ltr' : 'auto';
      if (
        control instanceof HTMLInputElement &&
        control.type === 'search' &&
        !control.labels?.length &&
        !control.hasAttribute('aria-label')
      ) {
        control.setAttribute('aria-label', control.placeholder || 'بحث');
      }
      const label = control.closest('label');
      for (const hint of label?.querySelectorAll<HTMLElement>('small,.hint,.field-help') ?? []) {
        if (!hint.id) hint.id = identity('hint');
        describeWith(control, hint.id);
      }
    }
    for (const control of invalidControls)
      if (!control.isConnected) invalidControls.delete(control);
    // A fully labeled KPI button uses its visible contents as its native name.
    for (const metric of root.querySelectorAll('.metric-link[aria-label]'))
      metric.removeAttribute('aria-label');
    // Visible initials/numbers remain part of the accessible name (voice input).
    for (const target of root.querySelectorAll<HTMLElement>(
      '.user-top,.map-marker[role="button"]',
    )) {
      if (target.dataset.uxName) continue;
      const visible = target.textContent?.replace(/\s+/g, ' ').trim();
      const label = target.getAttribute('aria-label');
      if (visible && label && !label.includes(visible)) {
        target.setAttribute('aria-label', `${visible} — ${label}`);
        target.dataset.uxName = 'true';
      }
    }
    for (const map of root.querySelectorAll('svg[role="img"]:has(.map-marker[role="button"])')) {
      map.setAttribute('role', 'group');
    }
    // Timers have a nameable role and must not announce every second.
    for (const timer of root.querySelectorAll('.rep-live-timer[aria-label]:not([role])')) {
      timer.setAttribute('role', 'timer');
      timer.setAttribute('aria-live', 'off');
    }
    root.querySelector('.side-nav')?.setAttribute('aria-label', 'التنقل الرئيسي');
    addSecondaryNavigation();
    const route = location.hash.slice(1).split('?')[0] || 'home';
    for (const link of root.querySelectorAll<HTMLElement>('[data-ux-routes]')) {
      const active = link.dataset.uxRoutes?.split(' ').includes(route) ?? false;
      link.classList.toggle('active', active);
      if (active) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    }
    // A scrollable data table keeps its genuine table semantics and gains keyboard access.
    for (const table of root.querySelectorAll('table')) {
      const wrapper = table.parentElement;
      if (!wrapper || wrapper.tagName === 'MAIN') continue;
      if (wrapper.scrollWidth > wrapper.clientWidth + 1) {
        wrapper.tabIndex = 0;
        wrapper.setAttribute('role', 'region');
        if (!wrapper.hasAttribute('aria-label'))
          wrapper.setAttribute('aria-label', 'جدول بيانات قابل للتمرير');
      }
    }
    const main = root.querySelector<HTMLElement>('main');
    if (main && options.mode === 'server' && !root.querySelector('.app-status')) {
      if (!networkNotice) {
        networkNotice = own(statePanel('offline', ''));
        networkNotice.classList.add('elv-network-notice');
        networkNotice.hidden = true;
        updateNetwork();
      }
      if (!networkNotice.isConnected) main.before(networkNotice);
    }
    if (main) {
      if (!main.id) main.id = identity('content');
      if (!main.hasAttribute('tabindex')) main.tabIndex = -1;
      if (!root.querySelector('.skip-link')) {
        const skip = own(document.createElement('a'));
        skip.className = 'skip-link';
        skip.href = `#${main.id}`;
        skip.textContent = 'انتقل إلى المحتوى';
        skip.addEventListener(
          'click',
          (event) => {
            event.preventDefault();
            main.focus();
          },
          { signal },
        );
        root.prepend(skip);
      }
      const ready =
        main.getAttribute('aria-busy') !== 'true' && !main.querySelector('[aria-busy="true"]');
      if (focusPending && ready && main.textContent?.trim()) {
        focusPending = false;
        main.focus({ preventScroll: true });
      }
    }
  }
  function updateNetwork(): void {
    if (!networkNotice) return;
    if (!navigator.onLine) {
      hadNetworkFailure = true;
      networkNotice.hidden = false;
      networkNotice.dataset.uiState = 'offline';
      networkNotice.textContent =
        'يشير المتصفح إلى انقطاع الشبكة. احتفظ بالمدخلات وأعد المحاولة بعد عودة الاتصال؛ هذه الرسالة لا تؤكد وصول أي عملية.';
    } else if (hadNetworkFailure) {
      networkNotice.hidden = false;
      networkNotice.dataset.uiState = 'success';
      networkNotice.textContent =
        'عادت الشبكة. أعد المحاولة للتحقق من الخدمة؛ لا تُعاد عمليات الحفظ تلقائيًا.';
    }
  }
  window.addEventListener('online', updateNetwork, { signal });
  window.addEventListener('offline', updateNetwork, { signal });
  const observer = new MutationObserver(() => {
    if (queued || disposed) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      scan();
    });
  });
  observer.observe(root, { childList: true, subtree: true });
  const routeChanged = (): void => {
    if (currentRoute !== location.hash) {
      focusPending = true;
      currentRoute = location.hash;
    }
    scan();
  };
  window.addEventListener('elvorance:render', routeChanged, { signal });
  // Live workspaces have their own routers, not the demo hash router.
  root.addEventListener(
    'click',
    (event) => {
      if (options.mode !== 'server' || !(event.target instanceof Element)) return;
      const navigation = event.target.closest(
        '[data-page],[data-live-section],[data-live-review],[data-live-back]',
      );
      if (navigation && !navigation.hasAttribute('disabled')) focusPending = true;
    },
    { capture: true, signal },
  );
  scan();
  const dispose = (): void => {
    disposed = true;
    observer.disconnect();
    controller.abort();
    for (const control of invalidControls) clearError(control);
    for (const node of ownedNodes) node.remove();
    delete root.dataset.enterpriseUx;
    if (installations.get(root) === dispose) installations.delete(root);
  };
  installations.set(root, dispose);
  return dispose;
}
