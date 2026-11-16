// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Scoped read selectors retained from v1.1. */
export function createQueries({ N }) {
  const list = (s, key) => (Array.isArray(s[key]) ? s[key] : []);
  const sum = (items, get) => items.reduce((total, item) => total + N(get(item)), 0);
  const find = (s, key, id) => list(s, key).find((item) => item.id === id);
  const person = (s, id) => find(s, 'reps', id)?.name || 'غير معيّن';
  const customer = (s, id) => find(s, 'clients', id)?.name || 'عميل غير محدد';
  const needLabel = (s, value) => find(s, 'catalog', value)?.title || value;
  const repOptions = (s) => Object.fromEntries(list(s, 'reps').map((rep) => [rep.id, rep.name]));
  const clientOptions = (s) =>
    Object.fromEntries(list(s, 'clients').map((client) => [client.id, client.name]));
  const zoneOptions = (s) =>
    Object.fromEntries(list(s, 'zones').map((zone) => [zone.id, zone.name]));
  return {
    list,
    sum,
    find,
    person,
    customer,
    needLabel,
    repOptions,
    clientOptions,
    zoneOptions,
  };
}
