import { activities, questions } from './default-questions.ts';
import type { Configuration, Question, QuestionSection } from './types.ts';

export function defaultConfiguration(): Configuration {
  return {
    schemaVersion: 1,
    revision: 1,
    activities: structuredClone(activities),
    questions: structuredClone(questions),
    updatedAt: null,
  };
}

export function configured(
  state: { formConfig?: Configuration | null } | null | undefined,
): Configuration {
  return state?.formConfig || defaultConfiguration();
}

export function visibleQuestions(
  config: Configuration,
  activityId: string,
  section: QuestionSection,
): Question[] {
  return (config.questions || [])
    .filter(
      (question) =>
        question.active !== false &&
        question.section === section &&
        (question.activityIds || ['*']).some((id) => id === '*' || id === activityId),
    )
    .sort((first, second) => (first.order || 0) - (second.order || 0));
}
