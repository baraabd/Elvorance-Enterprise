import { visibleQuestions, validateAnswers, type Configuration } from '@elvorance/questionnaire';
import { idPath, type RecordValue } from '../api.ts';
import type { ViewContext } from '../context.ts';
import { addField, commandForm, fieldValues, type Field } from '../ui/forms.ts';
import { el, words } from '../ui/dom.ts';

export async function discoveryForm(
  context: ViewContext,
  customer: RecordValue,
): Promise<HTMLFormElement> {
  const [configuration, saved] = await Promise.all([
    context.api.get<{
      definition: Configuration;
      catalog: { id: string; title: string; active?: boolean }[];
      source: string;
    }>('/v1/crm/configuration', { signal: context.signal }),
    context.api.get<{ record: RecordValue | null }>(
      `/v1/crm/customers/${idPath(customer.id)}/discovery`,
      { signal: context.signal },
    ),
  ]);
  if (configuration.source !== 'tenant')
    throw new Error('لم تُنشر استمارة احتياج معتمدة بعد. تواصل مع مدير النظام.');
  const previous = saved.record;
  const fixed: Field[] = [
    {
      name: 'activityId',
      label: 'النشاط',
      type: 'select',
      required: true,
      value: previous?.activityId,
      options: configuration.definition.activities
        .filter((activity) => activity.active)
        .map((activity) => ({ value: activity.id, label: activity.label })),
    },
    {
      name: 'status',
      label: 'حالة الاستمارة',
      type: 'select',
      value: previous?.status ?? 'draft',
      options: [
        { value: 'draft', label: 'حفظ مسودة' },
        { value: 'submitted', label: 'اعتماد الإجابات' },
      ],
    },
    { name: 'notes', label: 'ملاحظات', type: 'textarea', value: previous?.notes },
  ];
  let questions: Field[] = [];
  const form = commandForm({
    title: 'اكتشاف احتياج ' + words(customer.name),
    fields: fixed,
    signal: context.signal,
    submit: async (values, element) => {
      const answers = Object.fromEntries(
        Object.entries(fieldValues(element, questions)).filter(([, value]) => value !== null),
      );
      if (values.status === 'submitted') {
        const issues = validateAnswers(
          configuration.definition,
          String(values.activityId),
          answers,
          configuration.catalog,
        );
        if (Object.keys(issues).length)
          throw new Error('يرجى استكمال الإجابات المطلوبة: ' + Object.values(issues).join('، '));
      }
      await context.api.mutate(
        'PUT',
        `/v1/crm/customers/${idPath(customer.id)}/discovery`,
        {
          ...values,
          expectedVersion: previous?.version ?? 0,
          configurationRevision: configuration.definition.revision,
          answers,
        },
        context.signal,
      );
      context.notify('تم حفظ استمارة الاحتياج.');
      await context.refresh();
    },
  });
  const dynamic = el('fieldset');
  dynamic.append(el('legend', 'الاحتياج'));
  form.insertBefore(dynamic, form.querySelector('.form-status'));
  const activity = form.elements.namedItem('activityId') as HTMLSelectElement;
  const render = () => {
    dynamic.replaceChildren(el('legend', 'الاحتياج'));
    const answers =
      previous?.answers && typeof previous.answers === 'object'
        ? (previous.answers as Record<string, unknown>)
        : {};
    questions = (['challenge', 'goal', 'solution'] as const)
      .flatMap((section) => visibleQuestions(configuration.definition, activity.value, section))
      .flatMap((question): Field[] => [
        {
          name: question.id,
          label: question.label,
          required: false,
          value: answers[question.id],
          type:
            question.type === 'single'
              ? 'select'
              : question.type === 'multi'
                ? 'multiselect'
                : question.type === 'number'
                  ? 'number'
                  : 'textarea',
          options:
            question.id === 'solutions'
              ? configuration.catalog
                  .filter((service) => service.active !== false)
                  .map((service) => ({ value: service.id, label: service.title }))
              : question.options.map((option) => ({ value: option.id, label: option.label })),
          ...(question.min !== null ? { min: question.min } : {}),
          ...(question.max !== null ? { max: question.max } : {}),
          hint: question.required ? 'مطلوب عند اعتماد الإجابات' : '',
        },
        ...(question.otherAllowed
          ? [
              {
                name: question.id + '__other',
                label: 'توضيح «أخرى» — ' + question.label,
                type: 'textarea' as const,
                value: answers[question.id + '__other'],
                max: 2000,
              },
            ]
          : []),
      ]);
    for (const field of questions) addField(dynamic, field);
  };
  activity.addEventListener('change', render, { signal: context.signal });
  render();
  return form;
}
