import type { FieldType, QuestionSection } from './types.ts';

export const QUESTION_SECTIONS: Record<QuestionSection, string> = {
  challenge: 'اكتشاف التحديات',
  goal: 'النتائج المطلوبة',
  solution: 'اختيار الحلول',
};
export const FIELD_TYPES: Record<FieldType, string> = {
  single: 'اختيار واحد',
  multi: 'اختيارات متعددة',
  text: 'نص',
  number: 'رقم',
};
