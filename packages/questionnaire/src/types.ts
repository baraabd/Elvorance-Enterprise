import type { DiscoveryAnswer, ServiceCatalogItem } from '@elvorance/contracts';

export type { DiscoveryAnswer, ServiceCatalogItem };

export type QuestionSection = 'challenge' | 'goal' | 'solution';
export type FieldType = 'single' | 'multi' | 'text' | 'number';
export type Option = { id: string; label: string };
export type Activity = { id: string; label: string; active: boolean };
export type Question = {
  id: string;
  label: string;
  section: QuestionSection;
  type: FieldType;
  required: boolean;
  active: boolean;
  activityIds: string[];
  order: number;
  options: Option[];
  otherAllowed: boolean;
  min: number | null;
  max: number | null;
};
export type Configuration = {
  schemaVersion: number;
  revision: number;
  activities: Activity[];
  questions: Question[];
  updatedAt: string | null;
};

/** Raw answers remain unknown until validation; persisted values use the wire contract. */
export type Answers = Record<string, DiscoveryAnswer>;
export type AnswerErrors = Record<string, string>;
export type CatalogSelection = Pick<ServiceCatalogItem, 'id' | 'active'>;
export type RecommendationService = Pick<ServiceCatalogItem, 'id' | 'title'> &
  Partial<Pick<ServiceCatalogItem, 'category' | 'active' | 'recommendationTags'>>;
export type Recommendation<T extends RecommendationService = ServiceCatalogItem> = T & {
  score: number;
  reasons: string[];
};
