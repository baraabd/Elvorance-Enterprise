/** Local demo persistence adapter; no remote API or distributed transaction is claimed. */
export function createLocalDemo(context) {
  const { A, ui } = context;
  function persist(label, change, success) {
    if (A.update(change, label) === false) return false;
    A.closeModal();
    if (success) A.toast(success, 'success');
    return true;
  }
  function applySearch(collection, query) {
    const container = document.querySelector(`[data-collection="${collection}"]:not(input)`);
    if (!container) return;
    const normalized = String(query || '')
      .trim()
      .toLocaleLowerCase('ar');
    const rows = Array.from(container.querySelectorAll('[data-search]'));
    let visible = 0;
    rows.forEach((row) => {
      row.hidden = !String(row.dataset.search || '').includes(normalized);
      if (!row.hidden) visible++;
    });
    document.querySelectorAll(`[data-search-empty="${collection}"]`).forEach((node) => {
      node.hidden = !normalized || visible > 0;
    });
  }
  return {
    actions: {
      filter: ({ el }) => {
        if (
          Object.prototype.hasOwnProperty.call(ui, el.dataset.key) &&
          el.dataset.key !== 'search'
        ) {
          ui[el.dataset.key] = el.value;
          A.refresh();
        }
      },
      'search-records': ({ el }) => {
        const name = el.dataset.collection;
        if (!['team', 'clients', 'projects', 'messages'].includes(name)) return;
        ui.search[name] = el.value;
        applySearch(name, el.value);
      },
    },
    api: {
      persist,
      applySearch,
    },
  };
}
