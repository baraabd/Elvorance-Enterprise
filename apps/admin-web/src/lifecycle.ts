// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Per-render hooks. Styles are loaded once from styles.css after shared CSS. */
export function createLifecycle(context, { state }) {
  const { ui } = context;
  const applySearch = (...args) => state.applySearch(...args);
  return () => {
    Object.entries(ui.search).forEach(([collection, query]) => applySearch(collection, query));
  };
}
