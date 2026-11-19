import type {
  Configuration,
  DiscoveryAnswer,
  Recommendation,
  RecommendationService,
} from './types.ts';

type Rule = readonly [key: string, triggers: readonly string[]];
const rules: readonly Rule[] = [
  ['booking', ['appointments', 'booking', 'reminder', 'queues', 'double', 'cancel', 'svc-book']],
  ['web', ['online', 'visibility', 'maps', 'svc-web']],
  ['social', ['social', 'new_clients', 'loyalty', 'svc-social']],
  ['crm', ['records', 'followup', 'tracking', 'leads', 'svc-crm']],
  ['store', ['orders', 'delivery', 'stock', 'svc-store']],
  ['seo', ['maps', 'visibility', 'new_clients', 'svc-seo']],
];

function isAnswer(value: unknown): value is DiscoveryAnswer {
  return (
    typeof value === 'string' ||
    (typeof value === 'number' && Number.isFinite(value)) ||
    (Array.isArray(value) && value.every((entry: unknown) => typeof entry === 'string'))
  );
}

/** Explainable heuristics; no claim of AI prediction or guaranteed revenue. */
export function recommendServices<T extends RecommendationService>(
  _config: Configuration,
  _activity: string,
  answers: Readonly<Record<string, unknown>> | null | undefined,
  catalog: readonly T[],
): Recommendation<T>[] {
  const combined = Object.values(answers || {})
    .filter(isAnswer)
    .flat()
    .join(' ')
    .toLowerCase();
  return catalog
    .filter((service) => service.active !== false)
    .map((service): Recommendation<T> => {
      let score = 0;
      const reasons: string[] = [];
      const name = (service.id + ' ' + service.category + ' ' + service.title).toLowerCase();
      for (const [key, triggers] of rules) {
        if (name.includes(key) || service.id.includes(key)) {
          const hits = triggers.filter((word) => combined.includes(word));
          score += hits.length * 2;
          if (hits.length) reasons.push('يتوافق مع إجاباتك عن: ' + hits.join('، '));
        }
      }
      for (const tag of service.recommendationTags || []) {
        if (combined.includes(tag.toLowerCase())) {
          score += 3;
          reasons.push('مرتبط بهدف: ' + tag);
        }
      }
      return { ...service, score, reasons: reasons.slice(0, 2) };
    })
    .filter((service) => service.score > 0)
    .sort((first, second) => second.score - first.score);
}
