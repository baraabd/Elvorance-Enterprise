import { visibleQuestions } from './configuration.ts';
import type { AnswerErrors, CatalogSelection, Configuration, Question } from './types.ts';
import { isRecord } from './validation-values.ts';

function numberError(question: Question, value: unknown): boolean {
  // Number(object), Number(symbol), and Number([value]) are not valid field conversions.
  if (typeof value !== 'string' && typeof value !== 'number') return true;
  if (typeof value === 'string' && !value.trim()) return true;
  const number = Number(value);
  return (
    !Number.isFinite(number) ||
    (question.min !== null && number < question.min) ||
    (question.max !== null && number > question.max)
  );
}

export function validateAnswers(
  config: Configuration,
  activityId: string,
  answers: Readonly<Record<string, unknown>> = {},
  catalog: readonly CatalogSelection[] = [],
): AnswerErrors {
  if (!isRecord(answers)) return { _form: 'الإجابات يجب أن تكون كائنًا.' };
  const errors = new Map<string, string>();
  const questions = (['challenge', 'goal', 'solution'] as const).flatMap((section) =>
    visibleQuestions(config, activityId, section),
  );
  for (const question of questions) {
    const value = Object.hasOwn(answers, question.id) ? answers[question.id] : undefined;
    const selected: unknown[] = Array.isArray(value)
      ? Array.from(value)
      : value == null || value === ''
        ? []
        : [value];
    if (question.required && !selected.length) {
      errors.set(question.id, 'هذا السؤال مطلوب.');
      continue;
    }
    if (question.type === 'single' && selected.length > 1) {
      errors.set(question.id, 'اختر إجابة واحدة فقط.');
      continue;
    }
    if (question.type === 'single' || question.type === 'multi') {
      const valid =
        question.id === 'solutions'
          ? new Set(
              catalog.filter((service) => service.active !== false).map((service) => service.id),
            )
          : new Set(question.options.map((option) => option.id));
      if (selected.some((entry) => typeof entry !== 'string' || !valid.has(entry)))
        errors.set(question.id, 'توجد خيارات غير معتمدة.');
      if (selected.includes('other') && question.otherAllowed) {
        const key = question.id + '__other';
        const explanation = Object.hasOwn(answers, key) ? answers[key] : undefined;
        if (
          typeof explanation !== 'string' ||
          explanation.trim().length < 3 ||
          explanation.length > 2000
        )
          errors.set(question.id, 'اشرح خيار «أخرى» بثلاثة أحرف على الأقل وحتى 2000 حرف.');
      }
    }
    if (question.type === 'number' && selected.length && numberError(question, value))
      errors.set(question.id, 'أدخل رقمًا صالحًا ضمن المجال.');
    if (
      question.type === 'text' &&
      selected.length &&
      (typeof value !== 'string' ||
        value.trim().length < (question.required ? 2 : 1) ||
        value.length > 2000)
    )
      errors.set(question.id, 'أدخل نصًا صالحًا، حتى 2000 حرف.');
  }
  return Object.fromEntries(errors);
}
