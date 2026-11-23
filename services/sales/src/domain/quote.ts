import type { PaymentInstallment, ScopeItem } from '@elvorance/contracts';
import {
  array,
  assert,
  dateOnly,
  integer,
  newId,
  object,
  optionalText,
  text,
} from '@elvorance/service-kit';
export function quoteContent(input: unknown): {
  items: ScopeItem[];
  totalMinor: number;
  subtotalMinor: number;
  discountMinor: number;
  currency: string;
  terms: string;
  paymentPlan: PaymentInstallment[];
  validUntil: string;
} {
  const body = object(input);
  const items = array(body.items, 'items', 40, 1).map((input) => {
    const item = object(input);
    return {
      serviceId: text(item.serviceId, 'serviceId', 1, 100),
      title: text(item.title, 'title', 2, 200),
      quantity: integer(item.quantity, 'quantity', 1, 1000),
      unitPriceMinor: integer(item.unitPriceMinor, 'unitPriceMinor', 1, 10_000_000_000),
      deliverables: array(item.deliverables ?? [], 'deliverables', 30).map((value) =>
        text(value, 'deliverable', 1, 1000),
      ),
      duration: optionalText(item.duration, 'duration', 200),
    };
  });
  const subtotalMinor = items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
  assert(
    Number.isSafeInteger(subtotalMinor) && subtotalMinor <= 100_000_000_000,
    'INVALID_TOTAL',
    'Quote total is out of range',
  );
  const discountMinor = integer(body.discountMinor ?? 0, 'discountMinor', 0, subtotalMinor - 1);
  const totalMinor = subtotalMinor - discountMinor;
  const paymentPlan = array(body.paymentPlan, 'paymentPlan', 24, 1).map((input) => {
    const item = object(input);
    return {
      id: item.id ? text(item.id, 'paymentPlan.id', 1, 100) : newId(),
      label: text(item.label, 'paymentPlan.label', 2, 150),
      amountMinor: integer(item.amountMinor, 'paymentPlan.amountMinor', 1),
      dueOn: dateOnly(item.dueOn, 'paymentPlan.dueOn'),
    };
  });
  assert(
    new Set(paymentPlan.map((item) => item.id)).size === paymentPlan.length,
    'DUPLICATE_INSTALLMENT',
    'Each installment requires a distinct ID',
  );
  assert(
    paymentPlan.reduce((sum, item) => sum + item.amountMinor, 0) === totalMinor,
    'PAYMENT_PLAN_TOTAL',
    'Payment installments must exactly equal the quote total',
  );
  assert(
    paymentPlan[0]!.amountMinor >= Math.ceil(totalMinor / 5),
    'DOWN_PAYMENT_MINIMUM',
    'The first installment must be at least 20% of the net quote total',
  );
  const currency = text(body.currency, 'currency', 3, 3).toUpperCase();
  assert(/^[A-Z]{3}$/.test(currency), 'INVALID_CURRENCY', 'Currency must be a three-letter code');
  const validUntil = dateOnly(body.validUntil, 'validUntil');
  assert(
    validUntil && validUntil >= new Date().toISOString().slice(0, 10),
    'QUOTE_EXPIRED',
    'Quote expiry must be today or later',
  );
  return {
    items,
    totalMinor,
    subtotalMinor,
    discountMinor,
    currency,
    paymentPlan,
    terms: text(body.terms, 'terms', 3, 10_000),
    validUntil,
  };
}
