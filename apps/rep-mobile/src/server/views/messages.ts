import { idPath, type RecordValue } from '../api.ts';
import type { ViewContext } from '../context.ts';
import { button, card, dateText, detail, el, heading, rows, words } from '../ui/dom.ts';
import { commandForm, editorButton } from '../ui/forms.ts';
import { choices } from './common.ts';

interface Thread {
  conversation: RecordValue;
  items: RecordValue[];
  nextCursor?: string;
  receipt: RecordValue | null;
}
async function openThread(
  context: ViewContext,
  conversation: RecordValue,
  host: HTMLElement,
): Promise<void> {
  const path = `/v1/communications/conversations/${idPath(conversation.id)}`;
  let current = await context.api.get<Thread>(path + '/messages', { signal: context.signal });
  if (context.signal.aborted) return;
  host.replaceChildren();
  const messages = el('div', '', 'message-list');
  messages.setAttribute('role', 'log');
  const show = (items: RecordValue[]) => {
    for (const message of items) {
      const node = card(
        message.senderId === context.principal.sub ? 'أنت' : 'العميل',
        dateText(message.createdAt),
      );
      node.append(el('p', words(message.body), 'message-body'));
      messages.append(node);
    }
  };
  show(current.items);
  host.append(messages);
  let lastDisplayed = current.items.at(-1);
  const load = button(
    'تحميل رسائل أخرى',
    async () => {
      if (!current.nextCursor) return;
      current = await context.api.get<Thread>(path + '/messages', {
        signal: context.signal,
        query: { cursor: current.nextCursor },
      });
      if (context.signal.aborted) return;
      show(current.items);
      lastDisplayed = current.items.at(-1) ?? lastDisplayed;
      load.hidden = !current.nextCursor;
    },
    context.signal,
  );
  load.hidden = !current.nextCursor;
  host.append(load);
  host.append(
    button('تحديث المحادثة', () => openThread(context, conversation, host), context.signal),
  );
  host.append(
    commandForm({
      title: 'رسالة جديدة',
      fields: [{ name: 'body', label: 'الرسالة', type: 'textarea', required: true, max: 4000 }],
      signal: context.signal,
      submit: async (values) => {
        await context.api.mutate(
          'POST',
          path + '/messages',
          { ...values, expectedVersion: current.conversation.version },
          context.signal,
        );
        await openThread(context, conversation, host);
      },
    }),
  );
  // A read receipt is explicit and belongs to this signed-in actor.
  if (lastDisplayed)
    host.append(
      button(
        'تعليم الرسائل المعروضة كمقروءة',
        async () => {
          await context.api.mutate(
            'POST',
            path + '/read',
            { expectedVersion: current.conversation.version, lastMessageId: lastDisplayed!.id },
            context.signal,
          );
          context.notify('تم تسجيل القراءة.');
          await openThread(context, conversation, host);
        },
        context.signal,
      ),
    );
}
export async function messages(context: ViewContext): Promise<void> {
  const [items, clients] = await Promise.all([
    context.api.list('conversations', context.signal),
    choices(context, 'customers', 'name', (value) => !value.doNotContact),
  ]);
  if (context.signal.aborted) return;
  context.root.append(heading('المحادثات', 'التواصل مع العملاء المسندين إليك.'));
  const create = el('section');
  create.append(
    editorButton(
      'بدء محادثة',
      create,
      () =>
        commandForm({
          title: 'اختيار العميل',
          fields: [
            { name: 'clientId', label: 'العميل', type: 'select', required: true, options: clients },
          ],
          signal: context.signal,
          submit: async (values) => {
            await context.api.mutate(
              'POST',
              '/v1/communications/conversations',
              values,
              context.signal,
            );
            await context.refresh();
          },
        }),
      context.signal,
    ),
  );
  context.root.append(create);
  rows(context.root, items, (value) => {
    const node = card(words(value.customerName, words(value.title, 'محادثة العميل')));
    detail(node, 'آخر تحديث', dateText(value.updatedAt));
    const thread = el('section');
    node.append(
      button('فتح المحادثة', () => openThread(context, value, thread), context.signal),
      thread,
    );
    return node;
  });
}
