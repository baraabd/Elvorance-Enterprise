/** Scoped read selectors retained from v1.1. */
export function createQueries({}) {
  const list = (state, key) => (Array.isArray(state[key]) ? state[key] : []);
  const clientId = (state) => state.session?.clientId || 'client-1';
  const customer = (state) => list(state, 'clients').find((item) => item.id === clientId(state));
  const mine = (state, key) => list(state, key).filter((item) => item.clientId === clientId(state));
  const owned = (state, key, id) => mine(state, key).find((item) => item.id === id);
  const findService = (state, id) => list(state, 'catalog').find((item) => item.id === id);
  return {
    list,
    clientId,
    customer,
    mine,
    owned,
    findService,
  };
}
