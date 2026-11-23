import type { ViewContext } from '../context.ts';
import { amount, card, dateText, detail, el, heading, rows, statusText, words } from '../ui/dom.ts';
import { editorButton } from '../ui/forms.ts';
import { actionForm } from './common.ts';
import { quoteEditor } from './quote-editor.ts';

export async function quotes(context: ViewContext): Promise<void> {
  const items = await context.api.list('quotes', context.signal);
  if (context.signal.aborted) return;
  context.root.append(
    heading('عروض الأسعار', 'المسودة والإرسال وقرار العميل، مع توثيق الموافقات.'),
  );
  const create = el('section');
  create.append(editorButton('إعداد عرض', create, () => quoteEditor(context), context.signal));
  context.root.append(create);
  rows(context.root, items, (value) => {
    const node = card(words(value.customerName), statusText(value.status));
    detail(node, 'الإجمالي', amount(value.totalMinor, value.currency));
    detail(node, 'صلاحية العرض', dateText(value.validUntil));
    const breakdown = el('details');
    breakdown.append(el('summary', 'بنود العرض والدفعات'));
    for (const line of Array.isArray(value.items) ? (value.items as Record<string, unknown>[]) : [])
      breakdown.append(
        el(
          'p',
          `${words(line.title)} × ${Number(line.quantity)} · ${amount(Number(line.quantity) * Number(line.unitPriceMinor), value.currency)}`,
        ),
      );
    detail(breakdown, 'الخصم', amount(value.discountMinor, value.currency));
    detail(breakdown, 'الشروط', value.terms);
    for (const payment of Array.isArray(value.paymentPlan)
      ? (value.paymentPlan as Record<string, unknown>[])
      : [])
      breakdown.append(
        el(
          'p',
          `${words(payment.label)} · ${amount(payment.amountMinor, value.currency)} · ${dateText(payment.dueOn)}`,
        ),
      );
    node.append(breakdown);
    if (value.customerResponse) detail(node, 'رد العميل', value.customerResponse);
    if (value.status === 'draft') {
      node.append(editorButton('تعديل', node, () => quoteEditor(context, value), context.signal));
      node.append(
        editorButton(
          'إرسال للعميل',
          node,
          () => actionForm(context, 'quotes', value, 'send', 'تأكيد إرسال العرض', []),
          context.signal,
        ),
      );
      if (
        value.customPricing === true ||
        Number(value.discountMinor) > Number(value.subtotalMinor) * 0.15
      )
        node.append(
          editorButton(
            'طلب موافقة التسعير',
            node,
            () =>
              actionForm(context, 'quotes', value, 'discount-approval', 'طلب موافقة الإدارة', [
                {
                  name: 'reason',
                  label: 'مبرر الخصم أو التسعير الخاص',
                  type: 'textarea',
                  required: true,
                  max: 2000,
                },
              ]),
            context.signal,
          ),
        );
    }
    if (['sent', 'changes_requested', 'rejected'].includes(String(value.status)))
      node.append(
        editorButton(
          'إنشاء مراجعة',
          node,
          () => actionForm(context, 'quotes', value, 'revise', 'إنشاء نسخة للمراجعة', []),
          context.signal,
        ),
      );
    node.append(
      editorButton('نسخ لعرض جديد', node, () => quoteEditor(context, value, true), context.signal),
    );
    return node;
  });
}
