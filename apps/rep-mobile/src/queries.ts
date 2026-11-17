// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
/** Scoped read selectors retained from v1.1. */
export function createQueries({}) {
  const rep = (s) => s.reps.find((r) => r.id === (s.session.repId || 'rep-1')) || s.reps[0];
  const ownClients = (s) => s.clients.filter((c) => c.repId === rep(s).id);
  const client = (s, id) => ownClients(s).find((c) => c.id === id);
  const ownVisits = (s) => s.visits.filter((v) => v.repId === rep(s).id);
  const ownQuotes = (s) => s.quotes.filter((q) => q.repId === rep(s).id);
  const ownOpps = (s) => s.opportunities.filter((o) => o.repId === rep(s).id);
  const activeVisit = (s) => ownVisits(s).find((v) => v.status === 'active');
  const getVisit = (s, id) => ownVisits(s).find((v) => v.id === id);
  return {
    rep,
    ownClients,
    client,
    ownVisits,
    ownQuotes,
    ownOpps,
    activeVisit,
    getVisit,
  };
}
