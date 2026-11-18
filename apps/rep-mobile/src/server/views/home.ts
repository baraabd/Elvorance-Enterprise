import type { ViewContext } from '../context.ts';
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
        (v) => words(v.scheduledAt, '').slice(0, 10) === new Date().toISOString().slice(0, 10),
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
  sales.append(
    el(
      'p',
      amount(
        quotes!
          .filter((q) => q.status === 'accepted' && q.currency === 'SAR')
          .reduce((sum, q) => sum + Number(q.totalMinor ?? 0), 0),
      ),
    ),
    button('متابعة العروض والعقود', () => context.navigate('quotes'), context.signal),
  );
  context.root.append(next, sales);
}
