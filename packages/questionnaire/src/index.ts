/** Tenant-editable discovery schema, validation and explainable service recommendations. */
export type {
  Activity,
  AnswerErrors,
  Answers,
  CatalogSelection,
  Configuration,
  DiscoveryAnswer,
  FieldType,
  Option,
  Question,
  QuestionSection,
  Recommendation,
  RecommendationService,
  ServiceCatalogItem,
} from './types.ts';
export { FIELD_TYPES, QUESTION_SECTIONS } from './fields.ts';
export { defaultCatalog } from './default-catalog.ts';
export { configured, defaultConfiguration, visibleQuestions } from './configuration.ts';
export { validateConfiguration } from './configuration-validation.ts';
export { validateAnswers } from './answers.ts';
export { recommendServices } from './recommendations.ts';
