import { validateCatalog } from './catalog-validation.ts';
import { FIELD_TYPES, QUESTION_SECTIONS } from './fields.ts';
import {
  hasOwnValue,
  isBound,
  isFiniteNumber,
  isIdentifier,
  isLabel,
  isRecord,
} from './validation-values.ts';

function validateActivities(input: unknown, errors: string[]): Set<string> {
  const ids = new Set<string>();
  if (!Array.isArray(input) || input.length < 1 || input.length > 100) {
    errors.push('يجب تعريف 1–100 نوع نشاط.');
    return ids;
  }
  const activities: unknown[] = Array.from(input);
  activities.forEach((value, index) => {
    const position = index + 1;
    if (!isRecord(value)) {
      errors.push(`النشاط ${position} يجب أن يكون كائنًا.`);
      return;
    }
    if (!isIdentifier(value.id, 2, 50) || ids.has(value.id))
      errors.push(`معرّف النشاط ${position} غير صالح أو مكرر.`);
    else ids.add(value.id);
    if (!isLabel(value.label, 2, 100)) errors.push(`اسم النشاط ${position} غير صالح.`);
    if (typeof value.active !== 'boolean') errors.push(`حالة النشاط ${position} غير صالحة.`);
  });
  return ids;
}

function validateOptions(question: Record<string, unknown>, position: number, errors: string[]) {
  const input = question.options;
  const required =
    question.id !== 'solutions' && (question.type === 'single' || question.type === 'multi');
  if (!Array.isArray(input) || input.length > 60 || (required && input.length < 1)) {
    errors.push(`خيارات السؤال ${position} غير صالحة${required ? ' (1–60)' : ' (0–60)'}.`);
    return;
  }
  const options: unknown[] = Array.from(input);
  const ids = new Set<string>();
  options.forEach((value, index) => {
    const choice = index + 1;
    if (!isRecord(value)) {
      errors.push(`الخيار ${choice} في السؤال ${position} يجب أن يكون كائنًا.`);
      return;
    }
    if (!isIdentifier(value.id, 1, 60) || ids.has(value.id))
      errors.push(`رمز الخيار ${choice} في السؤال ${position} غير صالح.`);
    else ids.add(value.id);
    if (!isLabel(value.label, 1, 150))
      errors.push(`نص الخيار ${choice} في السؤال ${position} غير صالح.`);
  });
}

function validateQuestions(input: unknown, activityIds: Set<string>, errors: string[]): void {
  if (!Array.isArray(input) || input.length < 1 || input.length > 250) {
    errors.push('يجب تعريف 1–250 سؤالًا.');
    return;
  }
  const questions: unknown[] = Array.from(input);
  const ids = new Set<string>();
  questions.forEach((value, index) => {
    const position = index + 1;
    if (!isRecord(value)) {
      errors.push(`السؤال ${position} يجب أن يكون كائنًا.`);
      return;
    }
    if (!isIdentifier(value.id, 2, 60) || ids.has(value.id))
      errors.push(`معرّف السؤال ${position} غير صالح أو مكرر.`);
    else ids.add(value.id);
    if (!isLabel(value.label, 8, 300))
      errors.push(`صياغة السؤال ${position} يجب أن تكون 8–300 حرف.`);
    if (!hasOwnValue(QUESTION_SECTIONS, value.section))
      errors.push(`قسم السؤال ${position} غير صالح.`);
    if (!hasOwnValue(FIELD_TYPES, value.type)) errors.push(`نوع السؤال ${position} غير صالح.`);
    if (typeof value.required !== 'boolean') errors.push(`إلزامية السؤال ${position} غير محددة.`);
    if (typeof value.active !== 'boolean') errors.push(`حالة السؤال ${position} غير صالحة.`);
    if (typeof value.otherAllowed !== 'boolean')
      errors.push(`إعداد خيار «أخرى» للسؤال ${position} غير صالح.`);
    if (!isFiniteNumber(value.order)) errors.push(`ترتيب السؤال ${position} غير صالح.`);
    if (
      !Array.isArray(value.activityIds) ||
      !value.activityIds.length ||
      value.activityIds.length > 100 ||
      Array.from(value.activityIds).some(
        (id: unknown) => typeof id !== 'string' || (id !== '*' && !activityIds.has(id)),
      )
    )
      errors.push(`أنشطة السؤال ${position} غير صالحة.`);
    validateOptions(value, position, errors);
    if (
      !isBound(value.min) ||
      !isBound(value.max) ||
      (value.type === 'number' && value.min !== null && value.max !== null && value.min > value.max)
    )
      errors.push(`حدود السؤال الرقمي ${position} غير صالحة.`);
  });
}

/** Unknown API payloads are checked before any nested property is used. */
export function validateConfiguration(value: unknown, catalog: unknown = []): string[] {
  if (!isRecord(value)) return ['التعريف يجب أن يكون كائنًا.'];
  const errors: string[] = [];
  for (const key of ['schemaVersion', 'revision'] as const) {
    const version = value[key];
    if (!isFiniteNumber(version) || !Number.isSafeInteger(version) || version < 1)
      errors.push(`إصدار التعريف غير صالح: ${key}.`);
  }
  if (
    value.updatedAt !== null &&
    (typeof value.updatedAt !== 'string' || !Number.isFinite(Date.parse(value.updatedAt)))
  )
    errors.push('تاريخ تحديث التعريف غير صالح.');
  const activityIds = validateActivities(value.activities, errors);
  validateQuestions(value.questions, activityIds, errors);
  errors.push(...validateCatalog(catalog));
  return errors;
}
