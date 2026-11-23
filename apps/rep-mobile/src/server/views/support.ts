import type { ViewContext } from '../context.ts';
import { card, dateText, detail, el, heading, rows, statusText, words } from '../ui/dom.ts';
import { editorButton } from '../ui/forms.ts';
import { actionForm, editForm } from './common.ts';

export async function support(context: ViewContext): Promise<void> {
  const items = await context.api.list('tickets', context.signal);
  if (context.signal.aborted) return;
  context.root.append(heading('الدعم', 'طلبات الدعم وتاريخ الردود.'));
  const create = el('section');
  create.append(
    editorButton(
      'طلب دعم',
      create,
      () =>
        editForm(context, 'tickets', 'طلب جديد', [
          { name: 'subject', label: 'الموضوع', required: true },
          {
            name: 'category',
            label: 'التصنيف',
            type: 'select',
            required: true,
            options: [
              { value: 'general', label: 'عام' },
              { value: 'account', label: 'الحساب' },
              { value: 'billing', label: 'الفوترة' },
              { value: 'delivery', label: 'التنفيذ' },
            ],
          },
          { name: 'message', label: 'تفاصيل الطلب', type: 'textarea', required: true },
        ]),
      context.signal,
    ),
  );
  context.root.append(create);
  rows(context.root, items, (value) => {
    const node = card(words(value.subject), statusText(value.status));
    for (const message of Array.isArray(value.messages)
      ? (value.messages as Record<string, unknown>[])
      : []) {
      const reply = el('blockquote', words(message.body));
      reply.append(el('small', dateText(message.createdAt)));
      node.append(reply);
    }
    if (value.status === 'open')
      node.append(
        editorButton(
          'إضافة رد',
          node,
          () =>
            actionForm(context, 'tickets', value, 'replies', 'رد على الطلب', [
              { name: 'message', label: 'الرد', type: 'textarea', required: true },
            ]),
          context.signal,
        ),
      );
    node.append(
      editorButton(
        value.status === 'open' ? 'إغلاق الطلب' : 'إعادة فتح الطلب',
        node,
        () =>
          actionForm(context, 'tickets', value, 'status', 'حالة طلب الدعم', [], () => ({
            status: value.status === 'open' ? 'resolved' : 'open',
          })),
        context.signal,
      ),
    );
    detail(node, 'آخر تحديث', dateText(value.updatedAt));
    return node;
  });
}
