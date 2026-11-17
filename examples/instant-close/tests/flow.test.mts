// @ts-nocheck
// Elvorance TypeScript migration: refine legacy dynamic types before removing this directive.
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  initialState,
  transition,
  gateSummary,
  quoteValid,
  ROLES,
  OUTCOMES,
  WorkflowError,
} from '../src/domain.mts';
const run = (s, type, role, extra = {}) =>
  transition(s, { type, ...extra }, role, '2027-01-02T09:00:00Z');
const choose = (s) => run(s, 'SELECT_OUTCOME', ROLES.REP, { outcome: OUTCOMES.READY });
const sent = (s) => run(choose(s), 'SEND_QUOTE', ROLES.REP);
const accept = (s) => run(sent(s), 'ACCEPT_QUOTE', ROLES.CLIENT, { confirm: true });
const contract = (s) => run(accept(s), 'ACCEPT_CONTRACT', ROLES.CLIENT, { confirm: true });
const paid = (s) =>
  run(contract(s), 'VERIFY_FIRST_PAYMENT', ROLES.ADMIN, {
    method: 'cash',
    reference: 'RECEIPT-2027-22',
    checked: true,
  });
const mustFail = (fn, code = 'PRECONDITION') =>
  assert.throws(fn, (e) => e instanceof WorkflowError && e.code === code);
test('initial quote sums and 20 percent installment valid', () => {
  const s = initialState();
  assert.ok(quoteValid(s.quote));
  assert.equal(s.quote.totalCents, 95000);
  assert.equal(s.installment.amountCents, 28500);
});
test('cannot send quote without ready outcome', () =>
  mustFail(() => run(initialState(), 'SEND_QUOTE', ROLES.REP)));
test('cannot mark customer accepted from representative session', () =>
  mustFail(
    () => run(sent(initialState()), 'ACCEPT_QUOTE', ROLES.REP, { confirm: true }),
    'FORBIDDEN',
  ));
test('client acceptance requires explicit confirmation', () =>
  mustFail(() => run(sent(initialState()), 'ACCEPT_QUOTE', ROLES.CLIENT, { confirm: false })));
test('cannot approve contract before quote acceptance', () =>
  mustFail(() => run(sent(initialState()), 'ACCEPT_CONTRACT', ROLES.CLIENT, { confirm: true })));
test('cannot verify payment before approved contract', () =>
  mustFail(() =>
    run(accept(initialState()), 'VERIFY_FIRST_PAYMENT', ROLES.ADMIN, {
      method: 'cash',
      reference: 'cash-ref',
      checked: true,
    }),
  ));
test('cannot mark payment by representative', () =>
  mustFail(
    () =>
      run(contract(initialState()), 'VERIFY_FIRST_PAYMENT', ROLES.REP, {
        method: 'cash',
        reference: 'cash-ref',
        checked: true,
      }),
    'FORBIDDEN',
  ));
test('cannot mark payment with missing receipt reference', () =>
  mustFail(() =>
    run(contract(initialState()), 'VERIFY_FIRST_PAYMENT', ROLES.ADMIN, {
      method: 'cash',
      reference: '',
      checked: true,
    }),
  ));
test('cannot start project before verified first payment', () =>
  mustFail(() =>
    run(contract(initialState()), 'START_PROJECT', ROLES.ADMIN, { team: 'فريق الويب' }),
  ));
test('cannot start project without assigned team', () =>
  mustFail(() => run(paid(initialState()), 'START_PROJECT', ROLES.ADMIN, { team: '' })));
test('end to end immediate close: roles and independent stage gates', () => {
  let s = paid(initialState());
  s = run(s, 'START_PROJECT', ROLES.ADMIN, { team: 'فريق التنفيذ أ' });
  s = run(s, 'CLOSE_VISIT', ROLES.REP);
  assert.equal(s.visit.status, 'completed');
  assert.equal(s.project.status, 'active');
  assert.equal(gateSummary(s).complete, true);
  assert.ok(s.activity.length >= 7);
});
test('visit may close while awaiting acceptance, but project remains not started', () => {
  let s = sent(initialState());
  s = run(s, 'CLOSE_VISIT', ROLES.REP);
  assert.equal(s.visit.status, 'completed');
  assert.equal(s.project.status, 'not_started');
  assert.equal(gateSummary(s).current.key, 'client');
});
test('selecting ready-to-start does not claim quote was accepted or paid', () => {
  const s = choose(initialState());
  assert.equal(s.clientReview.status, 'not_started');
  assert.equal(s.installment.status, 'not_issued');
  assert.equal(s.project.status, 'not_started');
});
test('prevent duplicate acceptance, payment and project creation', () => {
  const s = accept(initialState());
  mustFail(() => run(s, 'ACCEPT_QUOTE', ROLES.CLIENT, { confirm: true }));
  const p = paid(initialState());
  mustFail(() =>
    run(p, 'VERIFY_FIRST_PAYMENT', ROLES.ADMIN, {
      method: 'cash',
      reference: 'cash-ref',
      checked: true,
    }),
  );
  const x = run(p, 'START_PROJECT', ROLES.ADMIN, { team: 'فريق الويب' });
  mustFail(() => run(x, 'START_PROJECT', ROLES.ADMIN, { team: 'فريق الويب' }));
});
test('first payment cannot be below 20% when sending quote', () => {
  let s = choose(initialState());
  s.installment.amountCents = 18999;
  mustFail(() => run(s, 'SEND_QUOTE', ROLES.REP));
});
test('client first payment intent is not payment confirmation', () => {
  const s = run(contract(initialState()), 'MARK_PAYMENT_INTENT', ROLES.CLIENT);
  assert.equal(s.installment.intent, true);
  assert.equal(s.installment.status, 'pending_payment');
});
test('wrong roles denied for each domain action', () => {
  mustFail(
    () => run(initialState(), 'SELECT_OUTCOME', ROLES.CLIENT, { outcome: OUTCOMES.READY }),
    'FORBIDDEN',
  );
  mustFail(
    () => run(sent(initialState()), 'ACCEPT_QUOTE', ROLES.ADMIN, { confirm: true }),
    'FORBIDDEN',
  );
  mustFail(
    () => run(accept(initialState()), 'ACCEPT_CONTRACT', ROLES.ADMIN, { confirm: true }),
    'FORBIDDEN',
  );
});
