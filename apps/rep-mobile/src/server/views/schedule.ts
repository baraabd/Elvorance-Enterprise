import type { ViewContext } from '../context.ts';
import { button, card, dateText, detail, el, heading, rows, statusText, words } from '../ui/dom.ts';
import { dailyAgenda, dayInZone, shiftDay, validDay } from './schedule-model.ts';

export async function schedule(context: ViewContext): Promise<void> {
  const [visits, tasks] = await Promise.all([
    context.api.list('visits', context.signal),
    context.api.list('tasks', context.signal),
  ]);
  if (context.signal.aborted) return;
  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const today = () => dayInZone(new Date().toISOString(), timeZone);
  context.root.append(
    heading(
      'جدول العمل',
      `مواعيد الزيارات بتوقيت الجهاز (${timeZone}). المهام حسب تاريخ استحقاقها دون تحويل زمني.`,
    ),
  );
  const label = el('label', '', 'field');
  label.append(el('span', 'يوم العمل'));
  const day = el('input');
  day.type = 'date';
  day.name = 'workDay';
  day.required = true;
  day.value = today();
  label.append(day);
  const controls = el('div', '', 'actions');
  const output = el('section');
  output.setAttribute('aria-live', 'polite');
  const render = () => {
    if (!validDay(day.value)) {
      output.replaceChildren(el('p', 'اختر تاريخًا صالحًا لجدول العمل.', 'notice'));
      return;
    }
    const agenda = dailyAgenda(visits, tasks, day.value, timeZone);
    output.dataset.day = day.value;
    output.replaceChildren(el('h2', 'الزيارات'));
    rows(output, agenda.visits, (visit) => {
      const node = card(words(visit.customerName, 'زيارة'));
      detail(node, 'الموعد', dateText(visit.scheduledAt));
      detail(node, 'الحالة', statusText(visit.status));
      detail(node, 'الغرض', visit.purpose);
      return node;
    });
    output.append(el('h2', 'المهام المستحقة'));
    rows(output, agenda.tasks, (task) => {
      const node = card(words(task.title, 'مهمة'));
      detail(node, 'الحالة', statusText(task.status));
      detail(node, 'التفاصيل', task.notes);
      return node;
    });
  };
  const select = (value: string) => {
    day.value = value;
    render();
  };
  controls.append(
    button('اليوم السابق', () => select(shiftDay(day.value || today(), -1)), context.signal),
    button('اليوم', () => select(today()), context.signal),
    button('اليوم التالي', () => select(shiftDay(day.value || today(), 1)), context.signal),
    button('إدارة الزيارات', () => context.navigate('visits'), context.signal),
    button('إدارة المهام', () => context.navigate('tasks'), context.signal),
  );
  day.addEventListener('change', render, { signal: context.signal });
  context.root.append(label, controls, output);
  render();
}
