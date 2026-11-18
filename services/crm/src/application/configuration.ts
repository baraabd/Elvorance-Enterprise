import {
  defaultConfiguration,
  defaultCatalog,
  validateConfiguration,
  type Configuration,
} from '@elvorance/questionnaire';
import type { Principal, Entity } from '@elvorance/contracts';
import {
  assert,
  hasRole,
  object,
  requireRole,
  integer,
  text,
  type Transaction,
} from '@elvorance/service-kit';

type ServiceCatalogItem = {
  id: string;
  title: string;
  price: number;
  category: string;
  active?: boolean;
  short?: string;
  duration?: string;
  unit?: string;
  features?: string[];
  deliverables?: string[];
  recommendationTags?: string[];
};
interface StoredConfiguration extends Entity {
  definition: Configuration;
  catalog: ServiceCatalogItem[];
  updatedBy: string;
  currency: string;
}
const LOCKED_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
function cleanCatalog(input: unknown): ServiceCatalogItem[] {
  assert(
    Array.isArray(input) && input.length <= 250,
    'INVALID_CATALOG',
    'catalog must be an array of up to 250 services',
  );
  const ids = new Set<string>();
  return (input as Record<string, unknown>[]).map((entry) => {
    assert(
      entry && typeof entry === 'object' && !Array.isArray(entry),
      'INVALID_CATALOG',
      'Service must be an object',
    );
    const id = String(entry.id || '');
    assert(
      /^[a-z0-9_-]{2,60}$/i.test(id) && !ids.has(id),
      'INVALID_CATALOG',
      'Duplicate or invalid service ID',
    );
    ids.add(id);
    assert(
      typeof entry.title === 'string' &&
        entry.title.trim().length >= 2 &&
        entry.title.length <= 150,
      'INVALID_CATALOG',
      'Invalid service title',
    );
    assert(
      typeof entry.price === 'number' &&
        Number.isFinite(entry.price) &&
        Number(entry.price.toFixed(2)) === entry.price &&
        entry.price >= 0 &&
        entry.price <= 100000000,
      'INVALID_CATALOG',
      'Service price must be nonnegative and have at most two decimal places',
    );
    assert(
      typeof entry.category === 'string' && /^[a-z0-9_-]{2,60}$/i.test(entry.category),
      'INVALID_CATALOG',
      'Invalid service category',
    );
    const list = (name: 'features' | 'deliverables' | 'recommendationTags') => {
      const values = entry[name];
      assert(
        values === undefined ||
          (Array.isArray(values) &&
            values.length <= 30 &&
            values.every((v) => typeof v === 'string' && v.length <= 200)),
        'INVALID_CATALOG',
        `Invalid ${name}`,
      );
      return values as string[] | undefined;
    };
    return {
      id,
      title: entry.title.trim(),
      price: entry.price,
      category: entry.category,
      active: entry.active !== false,
      short: typeof entry.short === 'string' ? entry.short.slice(0, 300) : '',
      duration: typeof entry.duration === 'string' ? entry.duration.slice(0, 100) : '',
      unit: typeof entry.unit === 'string' ? entry.unit.slice(0, 100) : '',
      features: list('features') || [],
      deliverables: list('deliverables') || [],
      recommendationTags: list('recommendationTags') || [],
    };
  });
}
export async function readConfiguration(tx: Transaction): Promise<{
  recordVersion: number;
  definition: Configuration;
  catalog: ServiceCatalogItem[];
  source: 'tenant' | 'default';
  currency: string;
}> {
  const rows = await tx.list<StoredConfiguration>('configuration');
  const current = rows[0];
  if (current)
    return {
      recordVersion: current.version,
      definition: current.definition,
      catalog: current.catalog,
      source: 'tenant',
      currency: current.currency ?? 'SAR',
    };
  return {
    recordVersion: 0,
    definition: defaultConfiguration(),
    catalog: defaultCatalog(),
    source: 'default',
    currency: 'SAR',
  };
}
export async function publishConfiguration(tx: Transaction, principal: Principal, input: unknown) {
  requireRole(principal, 'admin');
  const body = object(input);
  const expected = integer(body.expectedVersion, 'expectedVersion', 0);
  const definition = body.definition;
  const catalog = cleanCatalog(body.catalog);
  const validation = validateConfiguration(definition, catalog);
  assert(!validation.length, 'CONFIG_VALIDATION', validation.slice(0, 8).join('؛ '));
  // Create a fresh, bounded JSON object with no prototype inheritance from user input.
  const sanitized = JSON.parse(JSON.stringify(definition)) as Configuration;
  assert(
    Object.keys(sanitized).every((k) => !LOCKED_KEYS.has(k)),
    'CONFIG_VALIDATION',
    'Invalid configuration fields',
  );
  const rows = await tx.list<StoredConfiguration>('configuration');
  const current = rows[0];
  assert(
    (current?.version || 0) === expected,
    'VERSION_CONFLICT',
    'Configuration changed. Reload before publishing.',
    409,
  );
  const content = {
    currency: text(body.currency ?? current?.currency ?? 'SAR', 'currency', 3, 3).toUpperCase(),
    definition: {
      ...sanitized,
      revision: (current?.definition?.revision || 0) + 1,
      updatedAt: new Date().toISOString(),
    },
    catalog,
    updatedBy: principal.sub,
  };
  assert(
    /^[A-Z]{3}$/.test(content.currency),
    'INVALID_CURRENCY',
    'Currency must be a three-letter code',
  );
  const record = current
    ? await tx.replace<StoredConfiguration>('configuration', { ...current, ...content }, expected)
    : await tx.insert<StoredConfiguration>('configuration', content);
  await tx.emit('crm.configuration_published.v1', record.id, record.version, {
    revision: record.definition.revision,
    updatedBy: principal.sub,
  });
  return {
    recordVersion: record.version,
    definition: record.definition,
    catalog: record.catalog,
    source: 'tenant',
    currency: record.currency,
  };
}
