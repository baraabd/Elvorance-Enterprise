import type { ViewContext } from '../context.ts';
import { localInputDate } from './common.ts';
import { amount, button, card, dateText, el, heading, words } from '../ui/dom.ts';

export async function home(context: ViewContext): Promise<void> {
  const [customers, visits, tasks, quotes] = await Promise.all(
    ['customers', 'visits', 'tasks', 'quotes'].map((name) =>
      context.api.list(name as 'customers' | 'visits' | 'tasks' | 'quotes', context.signal),
    ),
  );
  if (context.signal.aborted) return;
  context.root.append(heading('يومك الميداني', 'بيانات فريقك الحالية، وخطوتك التالية مع كل عميل.'));
  const metrics = el('div', '', 'metrics');
  for (const [label, value] of [
    ['عملاؤك', customers!.length],
    [
      'زيارات اليوم',
      visits!.filter(
        (v) =>
          localInputDate(v.scheduledAt).slice(0, 10) ===
          localInputDate(new Date().toISOString()).slice(0, 10),
      ).length,
    ],
    ['مهام مفتوحة', tasks!.filter((t) => t.status === 'open').length],
    ['عروض مرسلة', quotes!.filter((q) => q.status === 'sent').length],
  ] as const) {
    const metric = card(label);
    metric.append(el('strong', String(value), 'metric-value'));
    metrics.append(metric);
  }
  context.root.append(metrics);
  const next = card('الزيارة التالية');
  const upcoming = visits!
    .filter((v) => v.status === 'scheduled' || v.status === 'active')
    .sort((a, b) => words(a.scheduledAt).localeCompare(words(b.scheduledAt)))[0];
  next.append(
    el(
      'p',
      upcoming
        ? `${words(upcoming.customerName)} · ${dateText(upcoming.scheduledAt)}`
        : 'لا توجد زيارة مجدولة.',
    ),
    button('إدارة الزيارات', () => context.navigate('visits'), context.signal),
  );
  const sales = card('العروض المقبولة');
  const totals = new Map<string, number>();
  for (const quote of quotes!.filter((value) => value.status === 'accepted')) {
    const currency = words(quote.currency, 'SAR');
    totals.set(currency, (totals.get(currency) ?? 0) + Number(quote.totalMinor ?? 0));
  }
  for (const [currency, total] of totals) sales.append(el('p', amount(total, currency)));
  if (!totals.size) sales.append(el('p', 'لا توجد عروض مقبولة بعد.'));
  sales.append(button('متابعة العروض والعقود', () => context.navigate('quotes'), context.signal));
  context.root.append(next, sales);
}
