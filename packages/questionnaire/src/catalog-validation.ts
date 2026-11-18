import { isFiniteNumber, isIdentifier, isLabel, isRecord } from './validation-values.ts';

/** Validate untrusted catalog values without coercing objects into strings or numbers. */
export function validateCatalog(catalog: unknown): string[] {
  if (!Array.isArray(catalog) || catalog.length > 250)
    return ['الكتالوج يجب أن يكون قائمة لا تتجاوز 250 خدمة.'];
  const entries: unknown[] = Array.from(catalog);
  const errors: string[] = [];
  const ids = new Set<string>();
  entries.forEach((value, index) => {
    const position = index + 1;
    if (!isRecord(value)) {
      errors.push(`الخدمة ${position} يجب أن تكون كائنًا.`);
      return;
    }
    if (!isIdentifier(value.id, 2, 60) || ids.has(value.id))
      errors.push(`معرّف الخدمة ${position} غير صالح أو مكرر.`);
    else ids.add(value.id);
    if (!isLabel(value.title, 2, 150)) errors.push(`اسم الخدمة ${position} غير صالح.`);
    if (!isFiniteNumber(value.price) || value.price < 0 || value.price > 100000000)
      errors.push(`السعر ${position} يجب أن يكون رقمًا موجبًا أو صفرًا لخدمة بتقدير خاص.`);
    if (value.active !== undefined && typeof value.active !== 'boolean')
      errors.push(`حالة الخدمة ${position} غير صالحة.`);
    if (value.category !== undefined && !isIdentifier(value.category, 2, 60))
      errors.push(`تصنيف الخدمة ${position} غير صالح.`);
    for (const [key, max] of [
      ['short', 300],
      ['duration', 100],
      ['unit', 100],
    ] as const) {
      if (value[key] !== undefined && !isLabel(value[key], 0, max))
        errors.push(`وصف الخدمة ${position} غير صالح: ${key}.`);
    }
    for (const key of ['features', 'deliverables', 'recommendationTags'] as const) {
      const list = value[key];
      if (
        list !== undefined &&
        (!Array.isArray(list) ||
          list.length > 30 ||
          !Array.from(list).every((entry: unknown) => isLabel(entry, 0, 200)))
      )
        errors.push(`تفاصيل الخدمة ${position} غير صالحة: ${key}.`);
    }
  });
  return errors;
}
