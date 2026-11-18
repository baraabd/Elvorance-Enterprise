import type { ViewContext } from '../context.ts';
import { idPath, type RecordValue, type Resource } from '../api.ts';
import {
  amount,
  button,
  card,
  dateText,
  detail,
  el,
  heading,
  rows,
  statusText,
  words,
} from '../ui/dom.ts';
import type { CatalogResponse } from './quote-editor.ts';

export async function catalog(context: ViewContext): Promise<void> {
  const response = await context.api.get<CatalogResponse>('/v1/crm/catalog', {
    signal: context.signal,
  });
  if (context.signal.aborted) return;
  context.root.append(heading('دليل الخدمات', 'الخدمات والأسعار المنشورة من الإدارة.'));
  if (!response.configured) {
    context.root.append(el('p', 'لم يُنشر دليل خدمات معتمد بعد.', 'notice'));
    return;
  }
  const list = el('div', '', 'cards');
  context.root.append(list);
  for (const service of response.items) {
    const node = card(service.title, service.short);
    detail(node, 'السعر', amount(service.unitPriceMinor, response.currency));
    detail(node, 'المدة', service.duration);
    const deliverables = el('ul');
    for (const line of service.deliverables ?? []) deliverables.append(el('li', line));
    node.append(deliverables);
    list.append(node);
  }
}
async function readOnly(
  context: ViewContext,
  resource: Resource,
  title: string,
  render?: (node: HTMLElement, value: RecordValue) => void,
): Promise<void> {
  const items = await context.api.list(resource, context.signal);
  if (context.signal.aborted) return;
  context.root.append(heading(title));
  rows(context.root, items, (value) => {
    const node = card(
      words(value.title, words(value.customerName, title)),
      statusText(value.status),
    );
    if (typeof value.totalMinor === 'number')
      detail(node, 'الإجمالي', amount(value.totalMinor, value.currency));
    detail(node, 'آخر تحديث', dateText(value.updatedAt));
    if (render) render(node, value);
    return node;
  });
}
export async function contracts(context: ViewContext): Promise<void> {
  await readOnly(context, 'contracts', 'العقود', (node, value) => {
    detail(node, 'الشروط', value.terms);
    detail(node, 'تاريخ الاعتماد', dateText(value.approvedAt));
    node.append(
      button(
        'حالة التنفيذ والفوترة',
        async () => {
          const fulfillment = await context.api.get<Record<string, unknown>>(
            `/v1/sales/contracts/${idPath(value.id)}/fulfillment`,
            { signal: context.signal },
          );
          if (context.signal.aborted) return;
          const details = card('متابعة العقد');
          detail(
            details,
            'التنفيذ',
            fulfillment.projectStatus === 'ready' ? 'تم إنشاء المشروع' : 'قيد التجهيز',
          );
          detail(
            details,
            'الفوترة',
            fulfillment.invoicesStatus === 'ready' ? 'تم إنشاء الفواتير' : 'قيد التجهيز',
          );
          node.append(details);
        },
        context.signal,
      ),
    );
  });
}
export async function projects(context: ViewContext): Promise<void> {
  await readOnly(context, 'projects', 'مشاريع العملاء', (node, value) => {
    detail(node, 'موعد التسليم', dateText(value.dueOn));
    detail(node, 'التقدم', typeof value.progress === 'number' ? `${value.progress}%` : '—');
  });
}
export async function billing(context: ViewContext): Promise<void> {
  await readOnly(context, 'invoices', 'فواتير العملاء', (node, value) => {
    detail(node, 'عنوان الفاتورة', value.label);
    detail(node, 'المبلغ', amount(value.amountMinor, value.currency));
    detail(node, 'موعد الاستحقاق', dateText(value.dueOn));
    detail(
      node,
      'المتبقي',
      amount(Number(value.amountMinor ?? 0) - Number(value.paidMinor ?? 0), value.currency),
    );
    node.append(
      button(
        'سجل المدفوعات',
        async () => {
          const result = await context.api.get<{ items: Record<string, unknown>[] }>(
            `/v1/billing/invoices/${idPath(value.id)}/payments`,
            { signal: context.signal },
          );
          if (context.signal.aborted) return;
          const payments = card('المدفوعات المسجلة');
          for (const payment of result.items)
            payments.append(
              el(
                'p',
                `${amount(payment.amountMinor, payment.currency)} · ${dateText(payment.recordedAt)} · ${words(payment.reference)}`,
              ),
            );
          if (!result.items.length) payments.append(el('p', 'لا توجد مدفوعات مسجلة بعد.'));
          node.append(payments);
        },
        context.signal,
      ),
    );
  });
}
export async function notifications(context: ViewContext): Promise<void> {
  const items = await context.api.list('notifications', context.signal);
  if (context.signal.aborted) return;
  context.root.append(heading('الإشعارات', 'التنبيهات الواردة داخل التطبيق.'));
  rows(context.root, items, (value) => {
    const node = card(words(value.title), dateText(value.createdAt));
    const read = Array.isArray(value.readBy) && value.readBy.includes(context.principal.sub);
    if (!read)
      node.append(
        button(
          'تعليم كمقروء',
          async () => {
            await context.api.mutate(
              'POST',
              `/v1/communications/notifications/${idPath(value.id)}/read`,
              { expectedVersion: value.version },
              context.signal,
            );
            await context.refresh();
          },
          context.signal,
        ),
      );
    else node.append(el('p', 'مقروء', 'muted'));
    return node;
  });
}
