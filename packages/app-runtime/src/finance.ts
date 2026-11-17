/** Shared deterministic USD quote/instalment calculations. Amounts are stored in whole cents internally. */
export interface QuoteItem {
  price: number | string;
  qty: number | string;
}
export interface PaymentPart {
  id?: string;
  label?: string;
  due?: string;
  amount: number | string;
}
export interface QuoteFinancialInput {
  items?: QuoteItem[];
  discountMode?: string;
  discountValue?: number | string;
  discount?: number | string;
  paymentPlanEdited?: boolean;
  paymentPlan?: PaymentPart[];
}

export const cents = (value: unknown): number => Math.round(Number(value) * 100);
export const dollars = (minor: number): number => Math.round(minor) / 100;
const finiteNonNegative = (n: unknown): boolean => Number.isFinite(Number(n)) && Number(n) >= 0;

export function quoteSubtotal(items: QuoteItem[] = []): number {
  if (
    !Array.isArray(items) ||
    items.some(
      (i) => !finiteNonNegative(i.price) || !Number.isInteger(Number(i.qty)) || Number(i.qty) < 1,
    )
  )
    return NaN;
  return items.reduce((sum, row) => sum + Math.round(cents(row.price) * Number(row.qty)), 0);
}
export function quoteDiscount(
  subtotalCents: number,
  mode: 'amount' | 'percent' = 'amount',
  value: unknown = 0,
): number {
  const n = Number(value);
  if (
    !Number.isFinite(subtotalCents) ||
    !Number.isFinite(n) ||
    n < 0 ||
    !['amount', 'percent'].includes(mode)
  )
    return NaN;
  if (mode === 'percent' && n > 100) return NaN;
  const discount = mode === 'percent' ? Math.round((subtotalCents * n) / 100) : cents(n);
  return discount <= subtotalCents ? discount : NaN;
}
export function suggestedPlan(totalCents: number): PaymentPart[] {
  if (!Number.isFinite(totalCents) || totalCents <= 0) return [];
  const first = Math.round(totalCents * 0.3),
    second = Math.round(totalCents * 0.4);
  const values = [first, second, totalCents - first - second];
  return values.map((n, i) => ({
    id: 'instalment-' + (i + 1),
    label: ['دفعة أولى', 'اعتماد مرحلة التنفيذ', 'عند التسليم'][i],
    amount: dollars(n),
    due: '',
  }));
}
export function planAudit(plan: PaymentPart[], totalCents: number, minFirst = 0.2) {
  if (!Array.isArray(plan) || !plan.length)
    return {
      valid: false,
      kind: 'missing',
      remainingCents: totalCents,
      sumCents: 0,
      minFirstCents: Math.ceil(totalCents * minFirst),
    };
  if (plan.some((p) => !finiteNonNegative(p.amount) || cents(p.amount) <= 0))
    return {
      valid: false,
      kind: 'invalid',
      remainingCents: totalCents,
      sumCents: NaN,
      minFirstCents: Math.ceil(totalCents * minFirst),
    };
  const sumCents = plan.reduce((n, p) => n + cents(p.amount), 0);
  const remainingCents = totalCents - sumCents;
  const minFirstCents = Math.ceil(totalCents * minFirst);
  return {
    valid: remainingCents === 0 && cents(plan[0]!.amount) >= minFirstCents && totalCents > 0,
    kind:
      cents(plan[0]!.amount) < minFirstCents
        ? 'first_low'
        : remainingCents > 0
          ? 'short'
          : remainingCents < 0
            ? 'excess'
            : 'balanced',
    remainingCents,
    sumCents,
    minFirstCents,
  };
}
export function normalizedFinancials(q: QuoteFinancialInput) {
  const subtotalCents = quoteSubtotal(q.items || []);
  const mode = q.discountMode === 'percent' ? 'percent' : 'amount';
  const value = q.discountValue ?? q.discount ?? 0;
  const discountCents = quoteDiscount(subtotalCents, mode, value);
  const totalCents = subtotalCents - discountCents;
  const plan = q.paymentPlanEdited ? q.paymentPlan || [] : suggestedPlan(totalCents);
  return {
    mode,
    value,
    subtotalCents,
    discountCents,
    totalCents,
    plan,
    audit: planAudit(plan, totalCents),
    percent: subtotalCents > 0 ? (discountCents / subtotalCents) * 100 : 0,
  };
}
