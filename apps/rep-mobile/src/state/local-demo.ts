// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Local demo persistence adapter; no remote API or distributed transaction is claimed. */
export function createLocalDemo(context, { quotes }) {
  const { A, clone, draftKey, now, ui } = context;
  const persistQuoteDraft = (...args) => quotes.persistQuoteDraft(...args);
  const DRAFT_STORE = 'atlas.crm.2027.rep-drafts.v2';
  const draftMemory = {};
  let successfulCommits = 0;
  function commit(mutator, label) {
    const saved = A.update(mutator, label);
    if (saved !== false) successfulCommits++;
    return saved;
  }
  const actionLocks = new Set();
  const committedActions = new Map();
  let draftListenersInstalled = false;
  let draftStorageFailed = false;
  function readDraft(key) {
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_STORE) || '{}');
      if (all[key]) return clone(all[key].value);
    } catch (_) {
      /* Keep this session's draft if storage cannot be read. */
    }
    return draftMemory[key] ? clone(draftMemory[key]) : null;
  }
  function writeDraft(key, value) {
    draftMemory[key] = clone(value);
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_STORE) || '{}');
      all[key] = {
        value: clone(value),
        updatedAt: now(),
      };
      localStorage.setItem(DRAFT_STORE, JSON.stringify(all));
      draftStorageFailed = false;
      return true;
    } catch (_) {
      if (!draftStorageFailed)
        A.toast('تعذر حفظ المسودة محليًا. أبقِ الصفحة مفتوحة وحاول الحفظ قبل المغادرة.', 'error');
      draftStorageFailed = true;
      return false;
    }
  }
  function removeDraft(key) {
    delete draftMemory[key];
    try {
      const all = JSON.parse(localStorage.getItem(DRAFT_STORE) || '{}');
      delete all[key];
      localStorage.setItem(DRAFT_STORE, JSON.stringify(all));
      return true;
    } catch (_) {
      return false;
    }
  }
  function formDraftKey(form) {
    const name = form?.dataset?.submit;
    if (!name || name === 'save-quote') return null;
    const id =
      form.dataset.id || form.dataset.client || A.params().id || A.params().client || 'new';
    return draftKey('form:' + name, id);
  }
  function readForm(form) {
    const values = {};
    for (const input of form.elements) {
      if (
        !input.name ||
        input.disabled ||
        ['file', 'password', 'submit', 'button'].includes(input.type)
      )
        continue;
      if (input.type === 'checkbox') {
        if (!Array.isArray(values[input.name])) values[input.name] = [];
        if (input.checked) values[input.name].push(input.value);
      } else if (input.type === 'radio') {
        if (input.checked) values[input.name] = input.value;
      } else values[input.name] = input.value;
    }
    return values;
  }
  function persistForm(form) {
    const key = formDraftKey(form);
    return !key || writeDraft(key, readForm(form));
  }
  function restoreForms() {
    document
      .querySelectorAll('#main-content form[data-submit],#app-modal form[data-submit]')
      .forEach((form) => {
        const values = readDraft(formDraftKey(form));
        if (!values) return;
        for (const input of form.elements) {
          if (!input.name || !(input.name in values) || ['file', 'password'].includes(input.type))
            continue;
          if (input.type === 'checkbox')
            input.checked =
              Array.isArray(values[input.name]) && values[input.name].includes(input.value);
          else if (input.type === 'radio') input.checked = input.value === values[input.name];
          else input.value = values[input.name];
        }
      });
  }
  function installDraftListeners() {
    if (draftListenersInstalled) return;
    draftListenersInstalled = true;
    const capture = (event) => {
      if (document.body.dataset.app !== 'rep') return;
      const form = event.target.closest?.('form[data-submit]');
      if (form) persistForm(form);
    };
    document.addEventListener('input', capture, true);
    document.addEventListener('change', capture, true);
    document.addEventListener(
      'click',
      (event) => {
        if (document.body.dataset.app !== 'rep') return;
        const target = event.target.closest?.(
          '[data-go],[data-action="quote-new"],[data-action="opportunity-new"]',
        );
        if (!target) return;
        let saved = true;
        document
          .querySelectorAll('#main-content form[data-submit],#app-modal form[data-submit]')
          .forEach((form) => {
            if (!persistForm(form)) saved = false;
          });
        if (ui.quote && A.route() === 'quote-builder' && !persistQuoteDraft(ui.quote))
          saved = false;
        if (!saved) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      },
      true,
    );
    window.addEventListener('beforeunload', (event) => {
      if (document.body.dataset.app === 'rep' && draftStorageFailed) {
        event.preventDefault();
        event.returnValue = '';
      }
    });
  }
  const creates = new Set([
    'save-client',
    'start-visit',
    'save-schedule',
    'save-task',
    'save-opportunity',
    'send-message',
    'duplicate-quote',
  ]);
  function decorateActions(actions) {
    Object.keys(actions).forEach((name) => {
      const original = actions[name];
      actions[name] = function (ctx) {
        const isInput = ctx.event?.type === 'input' || ctx.event?.type === 'change';
        const token =
          name +
          ':' +
          (ctx.form?.dataset.id || ctx.el?.dataset.id || '') +
          ':' +
          JSON.stringify(ctx.form ? readForm(ctx.form) : ctx.el?.dataset || {});
        if (
          !isInput &&
          (actionLocks.has(token) ||
            (creates.has(name) && Date.now() - (committedActions.get(token) || 0) < 1200))
        )
          return;
        if (!isInput) actionLocks.add(token);
        const key = ctx.form && formDraftKey(ctx.form),
          before = successfulCommits,
          route = A.route();
        if (ctx.form) persistForm(ctx.form);
        const finish = (result) => {
          actionLocks.delete(token);
          if (!isInput && successfulCommits > before) {
            if (key) removeDraft(key);
            if (creates.has(name)) committedActions.set(token, Date.now());
            if (ctx.form && A.route() === route) A.refresh();
          }
          restoreForms();
          return result;
        };
        try {
          const result = original(ctx);
          return result?.then
            ? result.then(finish, (error) => {
                actionLocks.delete(token);
                throw error;
              })
            : finish(result);
        } catch (error) {
          actionLocks.delete(token);
          throw error;
        }
      };
    });
    return actions;
  }
  return {
    actions: {},
    api: {
      commit,
      readDraft,
      writeDraft,
      removeDraft,
      readForm,
      restoreForms,
      installDraftListeners,
      decorateActions,
    },
  };
}
